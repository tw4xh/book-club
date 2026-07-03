"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import {
  createSession,
  destroySession,
  getCurrentUser,
  setActiveGroup,
} from "@/lib/auth";
import { LOCALE_COOKIE } from "@/lib/i18n";
import { hashPassword, verifyPassword } from "@/lib/password";
import { normalizeZip } from "@/lib/geo";
import { cookies } from "next/headers";
import {
  addBookListItem,
  addBookReview,
  addMembership,
  canBorrow,
  claimBook,
  createPasswordResetToken,
  createBook,
  creditCostForBook,
  createBookList,
  createBookRequest,
  createGroup,
  getBookById,
  getBookList,
  getGroupByInviteCode,
  getUserByEmail,
  getMembership,
  notifyGroupMembers,
  postGroupMessage,
  rateBorrower,
  resetPasswordWithToken,
  returnToOwner,
  sendDirectMessage,
  setBookVisibleToOthers,
  setBookStatus,
  setGroupPolicy,
  setRequestStatus,
  setUserContactable,
  setUserPaymentHandles,
  setUserPasswordHash,
  toggleRequestInterest,
  upsertUserByEmail,
} from "@/lib/repo";
import type { BookShareMode, BookStatus } from "@/lib/types";

function str(form: FormData, key: string): string | null {
  const v = form.get(key);
  if (typeof v !== "string") return null;
  const trimmed = v.trim();
  return trimmed === "" ? null : trimmed;
}

// ---------------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------------

export async function loginAction(formData: FormData) {
  const email = str(formData, "email");
  const password = str(formData, "password");
  const next = str(formData, "next");
  if (!email || !password) {
    const params = new URLSearchParams({ error: "missing_required" });
    if (next) params.set("next", next);
    redirect(`/login?${params.toString()}`);
  }

  const existing = getUserByEmail(email);
  if (!existing) {
    const params = new URLSearchParams({ error: "invalid_credentials" });
    if (next) params.set("next", next);
    redirect(`/login?${params.toString()}`);
  }

  if (existing.password_hash) {
    if (!verifyPassword(password, existing.password_hash)) {
      const params = new URLSearchParams({ error: "invalid_credentials" });
      if (next) params.set("next", next);
      redirect(`/login?${params.toString()}`);
    }
  } else {
    // Legacy local users created before password support get a password on
    // first successful password login. New accounts must use /register.
    if (password.length < 6) {
      const params = new URLSearchParams({ error: "weak_password" });
      if (next) params.set("next", next);
      redirect(`/login?${params.toString()}`);
    }
    setUserPasswordHash(existing.id, hashPassword(password));
  }

  await createSession(existing.id);

  redirect(next ?? "/");
}

export async function registerAction(formData: FormData) {
  const email = str(formData, "email");
  const name = str(formData, "name");
  const password = str(formData, "password");
  const homeZip = normalizeZip(str(formData, "home_zip"));
  const next = str(formData, "next");
  if (!email || !name || !password || !homeZip) {
    const params = new URLSearchParams({ error: "missing_required" });
    if (next) params.set("next", next);
    redirect(`/register?${params.toString()}`);
  }
  if (password.length < 6) {
    const params = new URLSearchParams({ error: "weak_password" });
    if (next) params.set("next", next);
    redirect(`/register?${params.toString()}`);
  }
  if (getUserByEmail(email)) {
    const params = new URLSearchParams({ error: "email_exists" });
    if (next) params.set("next", next);
    redirect(`/register?${params.toString()}`);
  }

  const user = upsertUserByEmail({
    email,
    name,
    password_hash: hashPassword(password),
    wechat_nickname: str(formData, "wechat_nickname"),
    contact: str(formData, "contact"),
    home_area: str(formData, "home_area"),
    home_zip: homeZip,
  });

  await createSession(user.id);
  redirect(next ?? "/");
}

export async function logoutAction() {
  await destroySession();
  redirect("/");
}

export async function requestPasswordResetAction(formData: FormData) {
  const email = str(formData, "email");
  if (!email) redirect("/forgot-password?sent=1");
  const reset = createPasswordResetToken(email);
  const params = new URLSearchParams({ sent: "1" });
  // In production this token should be emailed; in the local prototype we show
  // it on the page so the flow can be tested without email infrastructure.
  if (reset) {
    params.set("token", reset.token);
  }
  redirect(`/forgot-password?${params.toString()}`);
}

export async function resetPasswordAction(formData: FormData) {
  const token = str(formData, "token");
  const password = str(formData, "password");
  if (!token || !password) {
    redirect("/reset-password?error=missing_required");
  }
  if (password.length < 6) {
    redirect(`/reset-password?token=${encodeURIComponent(token)}&error=weak_password`);
  }
  const ok = resetPasswordWithToken(token, hashPassword(password));
  if (!ok) {
    redirect("/reset-password?error=invalid_token");
  }
  await destroySession();
  redirect("/login?reset=success");
}

/** Toggle whether other members can see your contact info. */
export async function setContactableAction(formData: FormData) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const contactable = str(formData, "contactable") === "1";
  setUserContactable(user.id, contactable);
  revalidatePath("/", "layout");
  redirect("/groups");
}

/** Save the payment handles others can use to thank you. */
export async function setPaymentHandlesAction(formData: FormData) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  setUserPaymentHandles(user.id, {
    paypal: str(formData, "pay_paypal"),
    venmo: str(formData, "pay_venmo"),
    wechat: str(formData, "pay_wechat"),
  });
  revalidatePath("/", "layout");
  redirect("/groups");
}

export async function setLocaleAction(formData: FormData) {
  const locale = str(formData, "locale") === "en" ? "en" : "zh";
  const store = await cookies();
  store.set(LOCALE_COOKIE, locale, { path: "/", maxAge: 60 * 60 * 24 * 365 });
  revalidatePath("/", "layout");
}

// ---------------------------------------------------------------------------
// Groups
// ---------------------------------------------------------------------------

export async function createGroupAction(formData: FormData) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const name = str(formData, "name");
  if (!name) return;
  const type = str(formData, "type");
  const policy = str(formData, "policy");

  const group = createGroup(name, type, policy);
  // The creator is the admin and implicitly accepts their own policy.
  addMembership(user.id, group.id, "admin", new Date().toISOString());
  await setActiveGroup(group.id);

  revalidatePath("/", "layout");
  redirect("/groups");
}

/** Owner-only: set or update the club's policy that members must agree to. */
export async function setGroupPolicyAction(formData: FormData) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const groupId = str(formData, "group_id");
  if (!groupId) return;
  const membership = getMembership(user.id, groupId);
  if (!membership || membership.role !== "admin") redirect("/groups");

  const policy = str(formData, "policy");
  setGroupPolicy(groupId, policy);
  // Let every other member know the rules changed, with the new text attached.
  notifyGroupMembers(groupId, user.id, "policy_changed", policy);
  revalidatePath("/", "layout");
  redirect("/groups");
}

/**
 * Entering an invite code doesn't join immediately — it sends the user to the
 * club's policy page so they can read and agree first.
 */
export async function joinGroupAction(formData: FormData) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const code = str(formData, "code");
  if (!code) return;

  const group = getGroupByInviteCode(code);
  if (!group) {
    redirect("/groups?error=notfound");
  }
  if (getMembership(user.id, group.id)) {
    // Already a member: just switch to it.
    await setActiveGroup(group.id);
    revalidatePath("/", "layout");
    redirect("/");
  }
  redirect(`/join/${group.invite_code}`);
}

/** Final step of joining: the user has read and agreed to the club policy. */
export async function confirmJoinAction(formData: FormData) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const code = str(formData, "code");
  if (!code) return;
  const group = getGroupByInviteCode(code);
  if (!group) redirect("/groups?error=notfound");

  if (!getMembership(user.id, group.id)) {
    // Must tick the agreement box when the club has a policy.
    if (group.policy && str(formData, "agree") !== "1") {
      redirect(`/join/${group.invite_code}?error=agree`);
    }
    addMembership(user.id, group.id, "member", new Date().toISOString());
  }
  await setActiveGroup(group.id);

  revalidatePath("/", "layout");
  redirect("/");
}

export async function switchGroupAction(formData: FormData) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const groupId = str(formData, "group_id");
  if (!groupId) return;
  if (!getMembership(user.id, groupId)) return;

  await setActiveGroup(groupId);
  revalidatePath("/", "layout");
  redirect("/");
}

// ---------------------------------------------------------------------------
// Books
// ---------------------------------------------------------------------------

const UPLOAD_DIR = path.join(process.cwd(), "public", "uploads");
const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;
const ALLOWED_IMAGE = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);

async function saveCover(formData: FormData): Promise<string | null> {
  const file = formData.get("cover");
  if (!(file instanceof File) || file.size === 0) return null;
  if (!ALLOWED_IMAGE.has(file.type)) return null;
  if (file.size > MAX_UPLOAD_BYTES) return null;

  const ext =
    file.type === "image/png"
      ? ".png"
      : file.type === "image/webp"
        ? ".webp"
        : file.type === "image/gif"
          ? ".gif"
          : ".jpg";
  const name = `${crypto.randomUUID()}${ext}`;
  await fs.mkdir(UPLOAD_DIR, { recursive: true });
  const bytes = Buffer.from(await file.arrayBuffer());
  await fs.writeFile(path.join(UPLOAD_DIR, name), bytes);
  return `/uploads/${name}`;
}

export async function addBookAction(formData: FormData) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const groupId = str(formData, "group_id");
  const title = str(formData, "title");
  if (!groupId || !title) return;
  if (!getMembership(user.id, groupId)) return;

  const uploadedCover = await saveCover(formData);
  // Prefer an uploaded photo; otherwise fall back to a cover URL from ISBN lookup.
  const remoteCover = str(formData, "cover_url");
  const cover =
    uploadedCover ??
    (remoteCover && /^https:\/\//.test(remoteCover) ? remoteCover : null);
  const locationZip = normalizeZip(str(formData, "location_zip")) ?? user.home_zip;

  createBook({
    group_id: groupId,
    owner_user_id: user.id,
    isbn: str(formData, "isbn"),
    title,
    author: str(formData, "author"),
    language: str(formData, "language"),
    cover_image_url: cover,
    age_range: str(formData, "age_range"),
    category: str(formData, "category"),
    condition: str(formData, "condition"),
    notes: str(formData, "notes"),
    share_mode: str(formData, "share_mode") === "lend" ? "lend" : "flow",
    deposit: str(formData, "share_mode") === "lend" ? str(formData, "deposit") : null,
    visible_to_others:
      str(formData, "share_mode") !== "lend" ||
      formData.get("visible_to_others") === "on",
    current_location_area: str(formData, "current_location_area") ?? user.home_area,
    location_zip: locationZip,
  });

  revalidatePath("/");
  revalidatePath("/shelf");
  redirect("/");
}

export async function importBooksFromSheetAction(formData: FormData) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const groupId = str(formData, "group_id");
  const sheetUrl = str(formData, "sheet_url");
  if (!groupId || !sheetUrl) redirect("/books/new?import=missing");
  if (!getMembership(user.id, groupId)) redirect("/books/new?import=forbidden");

  const csvUrl = googleSheetCsvUrl(sheetUrl);
  if (!csvUrl) redirect("/books/new?import=bad_url");

  let csv = "";
  try {
    const res = await fetch(csvUrl, { cache: "no-store" });
    if (!res.ok) redirect("/books/new?import=fetch_failed");
    csv = await res.text();
  } catch {
    redirect("/books/new?import=fetch_failed");
  }

  const rows = parseCsv(csv);
  if (rows.length < 2) redirect("/books/new?import=empty");

  const headers = rows[0].map(normalizeHeader);
  let imported = 0;
  let skipped = 0;

  for (const row of rows.slice(1, 101)) {
    const value = (names: string[]) => cell(row, headers, names);
    const title = value(["title", "书名", "name", "book"]);
    if (!title) {
      skipped += 1;
      continue;
    }

    const shareMode = parseShareMode(
      value(["share_mode", "mode", "type", "分享方式", "类型"])
    );
    const locationZip =
      normalizeZip(value(["location_zip", "zip", "zipcode", "存放邮编", "邮编"])) ??
      user.home_zip;
    const remoteCover = value(["cover_image_url", "cover", "封面", "封面链接"]);

    createBook({
      group_id: groupId,
      owner_user_id: user.id,
      isbn: value(["isbn"]),
      title,
      author: value(["author", "作者"]),
      language: value(["language", "语言"]),
      cover_image_url:
        remoteCover && /^https:\/\//.test(remoteCover) ? remoteCover : null,
      age_range: value(["age_range", "age", "适读年龄"]),
      category: value(["category", "分类"]),
      condition: value(["condition", "成色"]),
      notes: value(["notes", "note", "备注"]),
      share_mode: shareMode,
      deposit: shareMode === "lend" ? value(["deposit", "押金"]) : null,
      visible_to_others:
        shareMode !== "lend" ||
        parseVisible(value(["visible_to_others", "visible", "可见", "是否可见"])),
      current_location_area:
        value(["current_location_area", "area", "location", "区域", "当前存放区域"]) ??
        user.home_area,
      location_zip: locationZip,
    });
    imported += 1;
  }

  revalidatePath("/");
  revalidatePath("/shelf");
  redirect(`/books/new?import=success&count=${imported}&skipped=${skipped}`);
}

function googleSheetCsvUrl(input: string): string | null {
  try {
    const url = new URL(input);
    if (url.hostname !== "docs.google.com") return input;

    const match = url.pathname.match(/\/spreadsheets\/d\/([^/]+)/);
    if (!match) return input;

    const gid = url.searchParams.get("gid") ?? url.hash.match(/gid=(\d+)/)?.[1] ?? "0";
    return `https://docs.google.com/spreadsheets/d/${match[1]}/export?format=csv&gid=${gid}`;
  } catch {
    return null;
  }
}

function parseCsv(csv: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cellValue = "";
  let quoted = false;

  for (let i = 0; i < csv.length; i += 1) {
    const ch = csv[i];
    const next = csv[i + 1];

    if (quoted) {
      if (ch === '"' && next === '"') {
        cellValue += '"';
        i += 1;
      } else if (ch === '"') {
        quoted = false;
      } else {
        cellValue += ch;
      }
      continue;
    }

    if (ch === '"') {
      quoted = true;
    } else if (ch === ",") {
      row.push(cellValue.trim());
      cellValue = "";
    } else if (ch === "\n") {
      row.push(cellValue.trim());
      rows.push(row);
      row = [];
      cellValue = "";
    } else if (ch !== "\r") {
      cellValue += ch;
    }
  }

  row.push(cellValue.trim());
  if (row.some(Boolean)) rows.push(row);
  return rows.filter((r) => r.some(Boolean));
}

function normalizeHeader(header: string): string {
  return header.trim().toLowerCase().replace(/\s+/g, "_");
}

function cell(row: string[], headers: string[], names: string[]): string | null {
  const normalizedNames = names.map(normalizeHeader);
  const index = headers.findIndex((h) => normalizedNames.includes(h));
  if (index < 0) return null;
  const value = row[index]?.trim();
  return value ? value : null;
}

function parseShareMode(value: string | null): BookShareMode {
  const normalized = normalizeHeader(value ?? "");
  return ["lend", "loan", "borrow", "借阅"].includes(normalized) ? "lend" : "flow";
}

function parseVisible(value: string | null): boolean {
  if (!value) return true;
  const normalized = normalizeHeader(value);
  return !["0", "false", "no", "n", "隐藏", "不可见", "否"].includes(normalized);
}

/** A member who has received the book becomes its new current holder. */
export async function claimBookAction(formData: FormData) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const bookId = str(formData, "book_id");
  if (!bookId) return;
  const book = getBookById(bookId);
  if (!book) redirect("/");
  if (!getMembership(user.id, book.group_id)) redirect("/");
  if (
    book.share_mode === "lend" &&
    book.visible_to_others === 0 &&
    book.owner_user_id !== user.id
  ) {
    redirect(`/books/${bookId}?error=hidden`);
  }
  // Give-to-get: you must have shared enough books before you can take one.
  if (
    book.owner_user_id !== user.id &&
    !canBorrow(user.id, book.group_id, creditCostForBook(bookId, book.share_mode))
  ) {
    redirect(`/books/${bookId}?error=needcredit`);
  }

  claimBook(bookId, user.id);
  revalidatePath(`/books/${bookId}`);
  revalidatePath("/shelf");
  revalidatePath("/");
}

export async function setBookVisibilityAction(formData: FormData) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const bookId = str(formData, "book_id");
  if (!bookId) return;
  const book = getBookById(bookId);
  if (!book) redirect("/");
  if (!getMembership(user.id, book.group_id)) redirect("/");
  if (book.owner_user_id !== user.id || book.share_mode !== "lend") redirect("/");

  setBookVisibleToOthers(bookId, user.id, formData.get("visible_to_others") === "on");
  revalidatePath(`/books/${bookId}`);
  revalidatePath("/");
  revalidatePath("/shelf");
}

/** For "lend" books: the current holder marks the book returned to its owner. */
export async function returnToOwnerAction(formData: FormData) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const bookId = str(formData, "book_id");
  if (!bookId) return;
  const book = getBookById(bookId);
  if (!book) redirect("/");
  if (!getMembership(user.id, book.group_id)) redirect("/");

  returnToOwner(bookId, user.id);
  revalidatePath(`/books/${bookId}`);
  revalidatePath("/shelf");
  revalidatePath("/");
}

/** The owner rates how a borrower treated the book (one rating per borrow). */
export async function rateBorrowerAction(formData: FormData) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const holdingId = str(formData, "holding_id");
  const bookId = str(formData, "book_id");
  const starsRaw = str(formData, "stars");
  if (!holdingId || !bookId || !starsRaw) return;
  const stars = Number.parseInt(starsRaw, 10);
  if (!Number.isFinite(stars)) return;

  rateBorrower(holdingId, user.id, stars, str(formData, "comment"));
  revalidatePath(`/books/${bookId}`);
}

// ---------------------------------------------------------------------------
// Book reviews
// ---------------------------------------------------------------------------

export async function addBookReviewAction(formData: FormData) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const bookId = str(formData, "book_id");
  if (!bookId) return;
  const book = getBookById(bookId);
  if (!book) redirect("/");
  if (!getMembership(user.id, book.group_id)) redirect("/");
  // You can't rate your own book — that would let owners inflate its value.
  if (book.owner_user_id === user.id) return;

  const comment = str(formData, "comment");
  const starsRaw = str(formData, "stars");
  const stars = starsRaw ? Number.parseInt(starsRaw, 10) : null;
  if (!comment && stars == null) return;

  addBookReview(bookId, user.id, stars, comment);
  revalidatePath(`/books/${bookId}`);
}

// ---------------------------------------------------------------------------
// Group chat & direct messages
// ---------------------------------------------------------------------------

export async function postGroupMessageAction(formData: FormData) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const groupId = str(formData, "group_id");
  const body = str(formData, "body");
  if (!groupId || !body) redirect("/chat");
  if (!getMembership(user.id, groupId)) redirect("/");

  postGroupMessage(groupId, user.id, body);
  revalidatePath("/chat");
}

export async function sendDmAction(formData: FormData) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const to = str(formData, "to");
  const body = str(formData, "body");
  if (!to || !body) redirect("/messages");
  if (to === user.id) redirect("/messages");

  sendDirectMessage(user.id, to, body);
  revalidatePath(`/messages/${to}`);
  revalidatePath("/messages");
  redirect(`/messages/${to}`);
}

// ---------------------------------------------------------------------------
// Book requests (wishlist)
// ---------------------------------------------------------------------------

export async function createRequestAction(formData: FormData) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const groupId = str(formData, "group_id");
  const title = str(formData, "title");
  if (!groupId || !title) redirect("/requests");
  if (!getMembership(user.id, groupId)) redirect("/");

  createBookRequest({
    group_id: groupId,
    requester_user_id: user.id,
    title,
    author: str(formData, "author"),
    isbn: str(formData, "isbn"),
    note: str(formData, "note"),
  });
  revalidatePath("/requests");
  redirect("/requests");
}

export async function toggleInterestAction(formData: FormData) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const requestId = str(formData, "request_id");
  const kind = str(formData, "kind");
  if (!requestId || (kind !== "want" && kind !== "buy")) redirect("/requests");

  toggleRequestInterest(requestId, user.id, kind);
  revalidatePath("/requests");
}

export async function setRequestStatusAction(formData: FormData) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const requestId = str(formData, "request_id");
  const status = str(formData, "status") === "fulfilled" ? "fulfilled" : "open";
  if (!requestId) redirect("/requests");

  setRequestStatus(requestId, user.id, status);
  revalidatePath("/requests");
}

// ---------------------------------------------------------------------------
// Recommended book lists
// ---------------------------------------------------------------------------

export async function createListAction(formData: FormData) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const groupId = str(formData, "group_id");
  const title = str(formData, "title");
  if (!groupId || !title) redirect("/lists");
  if (!getMembership(user.id, groupId)) redirect("/");

  const id = createBookList(groupId, user.id, title, str(formData, "description"));
  revalidatePath("/lists");
  redirect(`/lists/${id}`);
}

export async function addListItemAction(formData: FormData) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const listId = str(formData, "list_id");
  const title = str(formData, "title");
  if (!listId || !title) redirect("/lists");
  const list = getBookList(listId);
  if (!list) redirect("/lists");
  if (!getMembership(user.id, list.group_id)) redirect("/");

  addBookListItem(
    listId,
    title,
    str(formData, "author"),
    str(formData, "isbn"),
    str(formData, "note")
  );
  revalidatePath(`/lists/${listId}`);
  redirect(`/lists/${listId}`);
}

/** The current holder marks the book as being read or ready to pass on. */
export async function setStatusAction(formData: FormData) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const bookId = str(formData, "book_id");
  if (!bookId) return;
  const book = getBookById(bookId);
  if (!book) redirect("/");
  if (book.current_holder_user_id !== user.id) redirect(`/books/${bookId}`);

  const status: BookStatus =
    str(formData, "status") === "reading" ? "reading" : "available";
  setBookStatus(bookId, user.id, status);
  revalidatePath(`/books/${bookId}`);
  revalidatePath("/shelf");
  revalidatePath("/");
}
