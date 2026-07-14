"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import {
  clearActiveGroup,
  clearDemoToken,
  createSession,
  destroySession,
  getCurrentUser,
  getDemoToken,
  setActiveGroup,
  setDemoToken,
} from "@/lib/auth";
import {
  cleanupExpiredDemoSessions,
  deleteDemoSession,
  provisionDemoSession,
} from "@/lib/demo";
import { LOCALE_COOKIE } from "@/lib/i18n";
import { hashPassword, verifyPassword } from "@/lib/password";
import { normalizeZip } from "@/lib/geo";
import { lookupIsbn } from "@/lib/books-api";
import { createAssistantWantedRequest } from "@/lib/assistant";
import { cookies } from "next/headers";
import {
  addBookListItem,
  addBookReview,
  addMembership,
  canBorrow,
  claimBook,
  closeGroup,
  createPasswordResetToken,
  createBook,
  createBookList,
  createBookRequest,
  createGroup,
  dismissOnboarding,
  getBookById,
  getBookList,
  getGroupById,
  getGroupByInviteCode,
  getGroupsForUser,
  getUserByEmail,
  getMembership,
  isLastGroupAdmin,
  notifyGroupMembers,
  postGroupMessage,
  rateBorrower,
  removeMembership,
  resetPasswordWithToken,
  returnToOwner,
  sendDirectMessage,
  setBookVisibleToOthers,
  setBookStatus,
  setGroupCreditMode,
  setGroupPolicy,
  setRequestStatus,
  setUserContactable,
  setUserPaymentHandles,
  setUserPasswordHash,
  setUserProfile,
  toggleRequestInterest,
  transferOwnedBooks,
  updateBook,
  upsertUserByEmail,
  withdrawOwnedBooks,
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

  const existing = await getUserByEmail(email);
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
    await setUserPasswordHash(existing.id, hashPassword(password));
  }

  await createSession(existing.id);

  redirect(next ?? "/");
}

export async function demoLoginAction() {
  // Best-effort: reap expired demo sandboxes before creating a new one.
  await cleanupExpiredDemoSessions().catch(() => {});

  let provisioned: Awaited<ReturnType<typeof provisionDemoSession>>;
  try {
    provisioned = await provisionDemoSession();
  } catch {
    redirect("/?demo=error");
  }

  await createSession(provisioned.loginUserId);
  await setActiveGroup(provisioned.groupId);
  await setDemoToken(provisioned.token);

  redirect("/");
}

export async function resetDemoAction() {
  const token = await getDemoToken();
  if (token) {
    await deleteDemoSession(token).catch(() => {});
  }
  await clearDemoToken();
  await destroySession();
  // Start a fresh copy so the visitor stays in the demo, back at the original.
  await demoLoginAction();
}

export async function exitDemoAction() {
  const token = await getDemoToken();
  if (token) {
    await deleteDemoSession(token).catch(() => {});
  }
  await clearDemoToken();
  await destroySession();
  redirect("/");
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
  if (!str(formData, "consent")) {
    const params = new URLSearchParams({ error: "consent_required" });
    if (next) params.set("next", next);
    redirect(`/register?${params.toString()}`);
  }
  if (await getUserByEmail(email)) {
    const params = new URLSearchParams({ error: "email_exists" });
    if (next) params.set("next", next);
    redirect(`/register?${params.toString()}`);
  }

  const user = await upsertUserByEmail({
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
  const demoToken = await getDemoToken();
  if (demoToken) {
    await deleteDemoSession(demoToken).catch(() => {});
    await clearDemoToken();
  }
  await destroySession();
  redirect("/");
}

export async function requestPasswordResetAction(formData: FormData) {
  const email = str(formData, "email");
  if (!email) redirect("/forgot-password?sent=1");
  const reset = await createPasswordResetToken(email);
  const params = new URLSearchParams({ sent: "1" });
  // In production this token should be emailed. Only expose it locally so the
  // reset flow can be tested without email infrastructure.
  if (reset && process.env.NODE_ENV !== "production") {
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
  const ok = await resetPasswordWithToken(token, hashPassword(password));
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
  await setUserContactable(user.id, contactable);
  revalidatePath("/", "layout");
  redirect("/groups");
}

export async function setProfileAction(formData: FormData) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const name = str(formData, "name");
  if (!name) redirect("/groups?profile=missing");
  await setUserProfile(user.id, {
    name,
    wechat_nickname: str(formData, "wechat_nickname"),
    contact: str(formData, "contact"),
    home_area: str(formData, "home_area"),
    home_zip: normalizeZip(str(formData, "home_zip")),
  });
  revalidatePath("/", "layout");
  redirect("/groups?profile=success");
}

/** Save the payment handles others can use to thank you. */
export async function setPaymentHandlesAction(formData: FormData) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  await setUserPaymentHandles(user.id, {
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

  const group = await createGroup(name, type, policy);
  // The creator is the admin and implicitly accepts their own policy.
  await addMembership(user.id, group.id, "admin", new Date().toISOString());
  await setActiveGroup(group.id);

  revalidatePath("/", "layout");
  // Drop the new founder into the guided setup flow instead of an empty catalog.
  redirect(`/groups/${group.id}/setup`);
}

/** Founder finishes (or skips) the club setup guide so it stops nudging them. */
export async function dismissOnboardingAction(formData: FormData) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const groupId = str(formData, "group_id");
  if (!groupId) redirect("/");
  const membership = await getMembership(user.id, groupId);
  if (membership) await dismissOnboarding(user.id, groupId);
  revalidatePath("/", "layout");
  redirect("/");
}

/** Owner-only: set or update the club's policy that members must agree to. */
export async function setGroupPolicyAction(formData: FormData) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const groupId = str(formData, "group_id");
  if (!groupId) return;
  const membership = await getMembership(user.id, groupId);
  if (!membership || membership.role !== "admin") redirect("/groups");

  const policy = str(formData, "policy");
  await setGroupPolicy(groupId, policy);
  // Let every other member know the rules changed, with the new text attached.
  await notifyGroupMembers(groupId, user.id, "policy_changed", policy);
  revalidatePath("/", "layout");
  redirect("/groups");
}

/** Owner-only: toggle the club's borrow gate between trust and credit mode. */
export async function setGroupCreditModeAction(formData: FormData) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const groupId = str(formData, "group_id");
  if (!groupId) return;
  const membership = await getMembership(user.id, groupId);
  if (!membership || membership.role !== "admin") redirect("/groups");

  await setGroupCreditMode(groupId, str(formData, "credit_mode") === "credit");
  revalidatePath("/", "layout");
  redirect("/groups");
}

export async function closeGroupAction(formData: FormData) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const groupId = str(formData, "group_id");
  const confirmName = str(formData, "confirm_name");
  if (!groupId) return;

  const group = await getGroupById(groupId);
  if (!group) redirect("/groups?close=missing");
  const membership = await getMembership(user.id, groupId);
  if (!membership || membership.role !== "admin") redirect("/groups");
  if (confirmName !== group.name) {
    redirect("/groups?close=confirm");
  }

  await closeGroup(groupId);
  const remainingGroups = await getGroupsForUser(user.id);
  if (remainingGroups.length > 0) {
    await setActiveGroup(remainingGroups[0].id);
  } else {
    await clearActiveGroup();
  }

  revalidatePath("/", "layout");
  redirect("/groups?close=success");
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

  const group = await getGroupByInviteCode(code);
  if (!group) {
    redirect("/groups?error=notfound");
  }
  if (await getMembership(user.id, group.id)) {
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
  const group = await getGroupByInviteCode(code);
  if (!group) redirect("/groups?error=notfound");

  if (!(await getMembership(user.id, group.id))) {
    // Must tick the agreement box when the club has a policy.
    if (group.policy && str(formData, "agree") !== "1") {
      redirect(`/join/${group.invite_code}?error=agree`);
    }
    await addMembership(user.id, group.id, "member", new Date().toISOString());
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
  if (!(await getMembership(user.id, groupId))) return;

  await setActiveGroup(groupId);
  revalidatePath("/", "layout");
  redirect("/");
}

export async function leaveGroupAction(formData: FormData) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const groupId = str(formData, "group_id");
  if (!groupId) return;
  if (!(await getMembership(user.id, groupId))) redirect("/groups");
  if (await isLastGroupAdmin(user.id, groupId)) {
    redirect("/groups?leave=last_admin");
  }

  await removeMembership(user.id, groupId);
  const remainingGroups = await getGroupsForUser(user.id);
  if (remainingGroups.length > 0) {
    await setActiveGroup(remainingGroups[0].id);
  } else {
    await clearActiveGroup();
  }

  revalidatePath("/", "layout");
  redirect("/groups?leave=success");
}

// ---------------------------------------------------------------------------
// Books
// ---------------------------------------------------------------------------

const UPLOAD_DIR = path.join(process.cwd(), "public", "uploads");
const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;
const ALLOWED_IMAGE = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);

// Covers are cropped/rotated in the browser and submitted as a small JPEG data
// URL. Storing the data URL directly (like generated covers) keeps uploads
// working on read-only/serverless filesystems. Reject anything oversized or not
// an image data URL.
const MAX_COVER_DATA_LENGTH = 2_000_000; // ~1.5MB image once base64-decoded
function coverDataUrl(value: string | null): string | null {
  if (!value) return null;
  if (!/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(value)) return null;
  if (value.length > MAX_COVER_DATA_LENGTH) return null;
  return value;
}

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

type BookDraft = {
  isbn: string | null;
  title: string | null;
  author: string | null;
  language: string | null;
  cover_image_url: string | null;
  age_range: string | null;
  category: string | null;
  condition: string | null;
  notes: string | null;
  share_mode: BookShareMode;
  deposit: string | null;
  visible_to_others: boolean;
  current_location_area: string | null;
  location_zip: string | null;
};

function languageLabel(language: string | null): string | null {
  if (!language) return null;
  const lower = language.toLowerCase();
  if (lower.startsWith("zh")) return "中文";
  if (lower.startsWith("en")) return "English";
  return language;
}

async function enrichBookDraftFromIsbn(draft: BookDraft): Promise<BookDraft> {
  if (!draft.isbn) return draft;
  const hasMissingApiField =
    !draft.title ||
    !draft.author ||
    !draft.language ||
    !draft.cover_image_url ||
    !draft.category;
  if (!hasMissingApiField) return draft;

  const meta = await lookupIsbn(draft.isbn).catch(() => null);
  if (!meta) return draft;

  return {
    ...draft,
    isbn: draft.isbn ?? meta.isbn,
    title: draft.title ?? meta.title,
    author: draft.author ?? (meta.authors.length > 0 ? meta.authors.join(", ") : null),
    language: draft.language ?? languageLabel(meta.language),
    cover_image_url: draft.cover_image_url ?? meta.cover_url,
    category: draft.category ?? meta.categories[0] ?? null,
  };
}

export async function addBookAction(formData: FormData) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const groupId = str(formData, "group_id");
  const title = str(formData, "title");
  const isbn = str(formData, "isbn");
  if (!groupId || (!title && !isbn)) return;
  if (!(await getMembership(user.id, groupId))) return;

  // Prefer a cropped photo (data URL), then a legacy uploaded file, then a
  // cover URL from ISBN lookup.
  const croppedCover = coverDataUrl(str(formData, "cover_data"));
  const uploadedCover = croppedCover ? null : await saveCover(formData);
  const remoteCover = str(formData, "cover_url");
  const cover =
    croppedCover ??
    uploadedCover ??
    (remoteCover && /^https:\/\//.test(remoteCover) ? remoteCover : null);
  const locationZip = normalizeZip(str(formData, "location_zip")) ?? user.home_zip;
  const shareMode = str(formData, "share_mode") === "lend" ? "lend" : "flow";

  const draft = await enrichBookDraftFromIsbn({
    isbn,
    title,
    author: str(formData, "author"),
    language: str(formData, "language"),
    cover_image_url: cover,
    age_range: str(formData, "age_range"),
    category: str(formData, "category"),
    condition: str(formData, "condition"),
    notes: str(formData, "notes"),
    share_mode: shareMode,
    deposit: shareMode === "lend" ? str(formData, "deposit") : null,
    visible_to_others:
      shareMode !== "lend" || formData.get("visible_to_others") === "on",
    current_location_area: str(formData, "current_location_area") ?? user.home_area,
    location_zip: locationZip,
  });
  if (!draft.title) return;

  await createBook({
    group_id: groupId,
    owner_user_id: user.id,
    ...draft,
    title: draft.title,
  });

  revalidatePath("/");
  revalidatePath("/shelf");
  redirect("/");
}

export async function updateBookAction(formData: FormData) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const bookId = str(formData, "book_id");
  if (!bookId) return;
  const book = await getBookById(bookId);
  if (!book) return;
  if (book.owner_user_id !== user.id) return;

  const title = str(formData, "title");
  if (!title) redirect(`/books/${bookId}/edit?error=title`);

  // Cover: a cropped photo wins; then a legacy uploaded file; then an https URL
  // (e.g. from ISBN lookup); otherwise leave the existing cover untouched.
  const croppedCover = coverDataUrl(str(formData, "cover_data"));
  const uploadedCover = croppedCover ? null : await saveCover(formData);
  const remoteCover = str(formData, "cover_url");
  let cover: string | null | undefined = undefined;
  if (croppedCover) cover = croppedCover;
  else if (uploadedCover) cover = uploadedCover;
  else if (remoteCover && /^https:\/\//.test(remoteCover)) cover = remoteCover;

  const shareMode = str(formData, "share_mode") === "lend" ? "lend" : "flow";

  await updateBook(bookId, user.id, {
    title,
    author: str(formData, "author"),
    language: str(formData, "language"),
    isbn: str(formData, "isbn"),
    condition: str(formData, "condition"),
    notes: str(formData, "notes"),
    share_mode: shareMode,
    deposit: shareMode === "lend" ? str(formData, "deposit") : null,
    visible_to_others:
      shareMode !== "lend" || formData.get("visible_to_others") === "on",
    cover_image_url: cover,
  });

  revalidatePath("/");
  revalidatePath("/shelf");
  revalidatePath(`/books/${bookId}`);
  redirect(`/books/${bookId}`);
}

export async function importBooksFromSheetAction(formData: FormData) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const groupId = str(formData, "group_id");
  const sheetUrl = str(formData, "sheet_url");
  if (!groupId || !sheetUrl) redirect("/books/new?import=missing");
  if (!(await getMembership(user.id, groupId))) redirect("/books/new?import=forbidden");

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
    const isbn = value(["isbn"]);
    const title = value(["title", "书名", "name", "book"]);
    if (!title && !isbn) {
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
    const notes = buildImportedBookNotes(value);

    const draft = await enrichBookDraftFromIsbn({
      isbn,
      title,
      author: value(["author", "作者"]),
      language: value(["language", "语言", "图书语言"]),
      cover_image_url:
        remoteCover && /^https:\/\//.test(remoteCover) ? remoteCover : null,
      age_range: value(["age_range", "age", "适读年龄"]),
      category: value(["category", "分类"]),
      condition: value(["condition", "成色"]),
      notes,
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
    if (!draft.title) {
      skipped += 1;
      continue;
    }

    await createBook({
      group_id: groupId,
      owner_user_id: user.id,
      ...draft,
      title: draft.title,
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

function buildImportedBookNotes(
  value: (names: string[]) => string | null
): string | null {
  const explicitNotes = value(["notes", "note", "备注"]);
  const importedFields = [
    ["阅读状态", value(["阅读状态", "reading_status"])],
    ["字数/词汇量", value(["字数/词汇量", "字数", "词汇量", "word_count"])],
    ["页数", value(["页数", "pages", "page_count"])],
    ["AR", value(["ar"])],
    ["Lexile", value(["lexile"])],
    ["出版社", value(["出版社", "publisher"])],
    ["录入日期", value(["录入日期", "created_date", "imported_at"])],
  ];
  const importedNotes = importedFields
    .filter(([, v]) => Boolean(v))
    .map(([label, v]) => `${label}: ${v}`);
  const allNotes = [explicitNotes, ...importedNotes].filter(Boolean);
  return allNotes.length > 0 ? allNotes.join("\n") : null;
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
  const book = await getBookById(bookId);
  if (!book) redirect("/");
  if (!(await getMembership(user.id, book.group_id))) redirect("/");
  if (
    book.share_mode === "lend" &&
    book.visible_to_others === 0 &&
    book.owner_user_id !== user.id
  ) {
    redirect(`/books/${bookId}?error=hidden`);
  }
  // Give-to-get: you must have shared enough books before you can take one.
  // Borrowing always costs a flat 1 credit, so canBorrow's default applies.
  if (book.owner_user_id !== user.id && !(await canBorrow(user.id, book.group_id))) {
    redirect(`/books/${bookId}?error=needcredit`);
  }

  await claimBook(bookId, user.id);
  revalidatePath(`/books/${bookId}`);
  revalidatePath("/shelf");
  revalidatePath("/");
}

export async function setBookVisibilityAction(formData: FormData) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const bookId = str(formData, "book_id");
  if (!bookId) return;
  const book = await getBookById(bookId);
  if (!book) redirect("/");
  if (!(await getMembership(user.id, book.group_id))) redirect("/");
  if (book.owner_user_id !== user.id || book.share_mode !== "lend") redirect("/");

  await setBookVisibleToOthers(
    bookId,
    user.id,
    formData.get("visible_to_others") === "on"
  );
  revalidatePath(`/books/${bookId}`);
  revalidatePath("/");
  revalidatePath("/shelf");
}

export async function withdrawOwnedBooksAction(formData: FormData) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const groupId = str(formData, "group_id");
  if (!groupId) redirect("/shelf");
  if (!(await getMembership(user.id, groupId))) redirect("/");

  const bookIds = formData
    .getAll("book_id")
    .filter((value): value is string => typeof value === "string");
  const removed = await withdrawOwnedBooks(user.id, groupId, bookIds);

  revalidatePath("/shelf");
  revalidatePath("/");
  revalidatePath("/", "layout");
  redirect(`/shelf?withdrawn=${removed}`);
}

export async function transferOwnedBooksAction(formData: FormData) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const sourceGroupId = str(formData, "group_id");
  const targetGroupId = str(formData, "target_group_id");
  if (!sourceGroupId || !targetGroupId) redirect("/shelf?transferred=0");
  if (
    !(await getMembership(user.id, sourceGroupId)) ||
    !(await getMembership(user.id, targetGroupId))
  ) {
    redirect("/");
  }

  const bookIds = formData
    .getAll("book_id")
    .filter((value): value is string => typeof value === "string");
  const moved = await transferOwnedBooks(
    user.id,
    sourceGroupId,
    targetGroupId,
    bookIds
  );

  revalidatePath("/shelf");
  revalidatePath("/");
  revalidatePath("/", "layout");
  redirect(`/shelf?transferred=${moved}`);
}

/** For "lend" books: the current holder marks the book returned to its owner. */
export async function returnToOwnerAction(formData: FormData) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const bookId = str(formData, "book_id");
  if (!bookId) return;
  const book = await getBookById(bookId);
  if (!book) redirect("/");
  if (!(await getMembership(user.id, book.group_id))) redirect("/");

  await returnToOwner(bookId, user.id);
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

  await rateBorrower(holdingId, user.id, stars, str(formData, "comment"));
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
  const book = await getBookById(bookId);
  if (!book) redirect("/");
  if (!(await getMembership(user.id, book.group_id))) redirect("/");
  // You can't rate your own book — that would let owners inflate its value.
  if (book.owner_user_id === user.id) return;

  const comment = str(formData, "comment");
  const starsRaw = str(formData, "stars");
  const stars = starsRaw ? Number.parseInt(starsRaw, 10) : null;
  if (!comment && stars == null) return;

  await addBookReview(bookId, user.id, stars, comment);
  revalidatePath(`/books/${bookId}`);
  revalidatePath("/", "layout");
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
  if (!(await getMembership(user.id, groupId))) redirect("/");

  await postGroupMessage(groupId, user.id, body);
  revalidatePath("/chat");
  revalidatePath("/", "layout");
}

export async function sendDmAction(formData: FormData) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const to = str(formData, "to");
  const body = str(formData, "body");
  if (!to || !body) redirect("/messages");
  if (to === user.id) redirect("/messages");

  await sendDirectMessage(user.id, to, body);
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
  if (!(await getMembership(user.id, groupId))) redirect("/");

  await createBookRequest({
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

export async function createAssistantRequestAction(formData: FormData) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const groupId = str(formData, "group_id");
  const title = str(formData, "title");
  if (!groupId || !title) redirect("/assistant");
  if (!(await getMembership(user.id, groupId))) redirect("/");

  const id = await createAssistantWantedRequest({
    groupId,
    userId: user.id,
    title,
    question: str(formData, "question") ?? title,
  });
  revalidatePath("/assistant");
  revalidatePath("/requests");
  redirect(`/requests?created=${id}`);
}

export async function toggleInterestAction(formData: FormData) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const requestId = str(formData, "request_id");
  const kind = str(formData, "kind");
  if (!requestId || (kind !== "want" && kind !== "buy")) redirect("/requests");

  await toggleRequestInterest(requestId, user.id, kind);
  revalidatePath("/requests");
}

export async function setRequestStatusAction(formData: FormData) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const requestId = str(formData, "request_id");
  const status = str(formData, "status") === "fulfilled" ? "fulfilled" : "open";
  if (!requestId) redirect("/requests");

  await setRequestStatus(requestId, user.id, status);
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
  if (!(await getMembership(user.id, groupId))) redirect("/");

  const id = await createBookList(
    groupId,
    user.id,
    title,
    str(formData, "description")
  );
  revalidatePath("/lists");
  redirect(`/lists/${id}`);
}

export async function addListItemAction(formData: FormData) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const listId = str(formData, "list_id");
  const title = str(formData, "title");
  if (!listId || !title) redirect("/lists");
  const list = await getBookList(listId);
  if (!list) redirect("/lists");
  if (!(await getMembership(user.id, list.group_id))) redirect("/");

  await addBookListItem(
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
  const book = await getBookById(bookId);
  if (!book) redirect("/");
  if (book.current_holder_user_id !== user.id) redirect(`/books/${bookId}`);

  const status: BookStatus =
    str(formData, "status") === "reading" ? "reading" : "available";
  await setBookStatus(bookId, user.id, status);
  revalidatePath(`/books/${bookId}`);
  revalidatePath("/shelf");
  revalidatePath("/");
}
