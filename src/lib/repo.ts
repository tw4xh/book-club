import crypto from "node:crypto";
import { db, one, run, sql, withTransaction, type Executor } from "./db";
import type {
  Book,
  BookHolding,
  BookList,
  BookListItem,
  BookRequest,
  BookReview,
  BookShareMode,
  BookStatus,
  BookWithPeople,
  Contribution,
  ContributionLevel,
  CreditEvent,
  CreditReason,
  DirectMessage,
  DmConversation,
  Group,
  GroupMessage,
  GroupWithRole,
  LeaderboardEntry,
  Membership,
  MembershipRole,
  NotificationItem,
  User,
  UserRating,
} from "./types";

function nowIso(): string {
  return new Date().toISOString();
}

function newId(): string {
  return crypto.randomUUID();
}

function sha256(value: string): string {
  return crypto.createHash("sha256").update(value).digest("base64url");
}

function newInviteCode(): string {
  // Short, human-friendly, no ambiguous chars.
  const alphabet = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 6; i++) {
    code += alphabet[crypto.randomInt(0, alphabet.length)];
  }
  return code;
}

const BOOK_SELECT = `
  SELECT
    b.*,
    owner.name AS owner_name,
    owner.contact AS owner_contact,
    owner.wechat_nickname AS owner_wechat,
    owner.contactable AS owner_contactable,
    holder.name AS holder_name,
    holder.contact AS holder_contact,
    holder.wechat_nickname AS holder_wechat,
    holder.contactable AS holder_contactable
  FROM books b
  JOIN users owner ON owner.id = b.owner_user_id
  JOIN users holder ON holder.id = b.current_holder_user_id
`;

// ---------------------------------------------------------------------------
// Users
// ---------------------------------------------------------------------------

export async function getUserById(id: string): Promise<User | undefined> {
  return one<User>("SELECT * FROM users WHERE id = $1", [id]);
}

export async function getUserByEmail(email: string): Promise<User | undefined> {
  return one<User>("SELECT * FROM users WHERE email = $1", [
    email.toLowerCase().trim(),
  ]);
}

export interface UpsertUserInput {
  email: string;
  name: string;
  password_hash?: string | null;
  wechat_nickname?: string | null;
  contact?: string | null;
  home_area?: string | null;
  home_zip?: string | null;
}

/** Find a user by email or create one. Updates profile fields when provided. */
export async function upsertUserByEmail(input: UpsertUserInput): Promise<User> {
  const email = input.email.toLowerCase().trim();
  const existing = await getUserByEmail(email);
  if (existing) {
    await run(
      `UPDATE users SET
         name = $1,
         password_hash = COALESCE(password_hash, $2),
         wechat_nickname = COALESCE($3, wechat_nickname),
         contact = COALESCE($4, contact),
         home_area = COALESCE($5, home_area),
         home_zip = COALESCE($6, home_zip)
       WHERE id = $7`,
      [
        input.name.trim() || existing.name,
        input.password_hash ?? null,
        input.wechat_nickname ?? null,
        input.contact ?? null,
        input.home_area ?? null,
        input.home_zip ?? null,
        existing.id,
      ]
    );
    return (await getUserById(existing.id))!;
  }

  const id = newId();
  await run(
    `INSERT INTO users (
       id, name, email, password_hash, wechat_nickname, contact, home_area, home_zip, created_at
     )
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
    [
      id,
      input.name.trim() || email,
      email,
      input.password_hash ?? null,
      input.wechat_nickname ?? null,
      input.contact ?? null,
      input.home_area ?? null,
      input.home_zip ?? null,
      nowIso(),
    ]
  );
  return (await getUserById(id))!;
}

/** Opt in/out of letting other members see your contact info. */
export async function setUserContactable(
  userId: string,
  contactable: boolean
): Promise<void> {
  await run("UPDATE users SET contactable = $1 WHERE id = $2", [
    contactable ? 1 : 0,
    userId,
  ]);
}

export interface PaymentHandles {
  paypal?: string | null;
  venmo?: string | null;
  wechat?: string | null;
}

export interface UserProfileInput {
  name: string;
  wechat_nickname?: string | null;
  contact?: string | null;
  home_area?: string | null;
  home_zip?: string | null;
}

export async function setUserProfile(
  userId: string,
  input: UserProfileInput
): Promise<void> {
  const clean = (v: string | null | undefined) => {
    const s = (v ?? "").trim();
    return s.length > 0 ? s : null;
  };
  await run(
    `UPDATE users
       SET name = $1,
           wechat_nickname = $2,
           contact = $3,
           home_area = $4,
           home_zip = $5
       WHERE id = $6`,
    [
      input.name.trim(),
      clean(input.wechat_nickname),
      clean(input.contact),
      clean(input.home_area),
      clean(input.home_zip),
      userId,
    ]
  );
}

/** Set the payment handles a member exposes so others can thank them. */
export async function setUserPaymentHandles(
  userId: string,
  handles: PaymentHandles
): Promise<void> {
  const clean = (v: string | null | undefined) => {
    const s = (v ?? "").trim();
    return s.length > 0 ? s : null;
  };
  await run(
    "UPDATE users SET pay_paypal = $1, pay_venmo = $2, pay_wechat = $3 WHERE id = $4",
    [clean(handles.paypal), clean(handles.venmo), clean(handles.wechat), userId]
  );
}

export async function setUserPasswordHash(
  userId: string,
  passwordHash: string
): Promise<void> {
  await run("UPDATE users SET password_hash = $1 WHERE id = $2", [
    passwordHash,
    userId,
  ]);
}

export interface PasswordResetRequest {
  token: string;
  expires_at: string;
}

/** Create a one-time password reset token. Store only a hash in the DB. */
export async function createPasswordResetToken(
  email: string,
  ttlMinutes = 30
): Promise<PasswordResetRequest | null> {
  const user = await getUserByEmail(email);
  if (!user) return null;
  const token = crypto.randomBytes(32).toString("base64url");
  const now = new Date();
  const expiresAt = new Date(now.getTime() + ttlMinutes * 60 * 1000).toISOString();
  await withTransaction(async (tx) => {
    // Keep the latest request simple and prevent old unused tokens from piling up.
    await tx.run(
      "UPDATE password_reset_tokens SET used_at = $1 WHERE user_id = $2 AND used_at IS NULL",
      [now.toISOString(), user.id]
    );
    await tx.run(
      `INSERT INTO password_reset_tokens
         (id, user_id, token_hash, expires_at, used_at, created_at)
       VALUES ($1, $2, $3, $4, NULL, $5)`,
      [newId(), user.id, sha256(token), expiresAt, now.toISOString()]
    );
  });
  return { token, expires_at: expiresAt };
}

/** Consume a valid reset token and update the user's password hash atomically. */
export async function resetPasswordWithToken(
  token: string,
  passwordHash: string
): Promise<boolean> {
  const tokenHash = sha256(token);
  const now = new Date().toISOString();
  return withTransaction(async (tx) => {
    const row = await tx.one<{ id: string; user_id: string }>(
      `SELECT id, user_id
         FROM password_reset_tokens
         WHERE token_hash = $1
           AND used_at IS NULL
           AND expires_at > $2`,
      [tokenHash, now]
    );
    if (!row) return false;
    await tx.run("UPDATE users SET password_hash = $1 WHERE id = $2", [
      passwordHash,
      row.user_id,
    ]);
    await tx.run("UPDATE password_reset_tokens SET used_at = $1 WHERE id = $2", [
      now,
      row.id,
    ]);
    return true;
  });
}

// ---------------------------------------------------------------------------
// Groups & memberships
// ---------------------------------------------------------------------------

export async function createGroup(
  name: string,
  type: string | null,
  policy: string | null = null
): Promise<Group> {
  const id = newId();
  let code = newInviteCode();
  // Avoid the (astronomically unlikely) collision.
  while (await getGroupByInviteCode(code)) code = newInviteCode();
  await run(
    `INSERT INTO groups (id, name, type, policy, invite_code, created_at) VALUES ($1, $2, $3, $4, $5, $6)`,
    [id, name.trim(), type, policy, code, nowIso()]
  );
  return (await getGroupById(id))!;
}

/** Only a club admin should call this (enforced in the action layer). */
export async function setGroupPolicy(
  groupId: string,
  policy: string | null
): Promise<void> {
  await run("UPDATE groups SET policy = $1 WHERE id = $2", [policy, groupId]);
}

/** Whether a club enforces the "lend first, then borrow" credit gate. */
export async function isCreditModeOn(groupId: string): Promise<boolean> {
  const row = await one<{ credit_mode: string }>(
    "SELECT credit_mode FROM groups WHERE id = $1",
    [groupId]
  );
  return row?.credit_mode === "credit";
}

/** Owner control: turn the credit gate on ("credit") or off ("trust"). */
export async function setGroupCreditMode(groupId: string, on: boolean): Promise<void> {
  await run("UPDATE groups SET credit_mode = $1 WHERE id = $2", [
    on ? "credit" : "trust",
    groupId,
  ]);
}

export async function closeGroup(groupId: string): Promise<void> {
  await run("DELETE FROM groups WHERE id = $1", [groupId]);
}

export async function getGroupMemberIds(groupId: string): Promise<string[]> {
  const rows = await sql<{ user_id: string }>(
    "SELECT user_id FROM memberships WHERE group_id = $1",
    [groupId]
  );
  return rows.map((r) => r.user_id);
}

export async function getGroupById(id: string): Promise<Group | undefined> {
  return one<Group>("SELECT * FROM groups WHERE id = $1", [id]);
}

export async function getGroupByInviteCode(code: string): Promise<Group | undefined> {
  return one<Group>("SELECT * FROM groups WHERE invite_code = $1", [
    code.toUpperCase().trim(),
  ]);
}

export async function getMembership(
  userId: string,
  groupId: string
): Promise<Membership | undefined> {
  return one<Membership>(
    "SELECT * FROM memberships WHERE user_id = $1 AND group_id = $2",
    [userId, groupId]
  );
}

export async function addMembership(
  userId: string,
  groupId: string,
  role: MembershipRole = "member",
  policyAcceptedAt: string | null = null
): Promise<Membership> {
  const existing = await getMembership(userId, groupId);
  if (existing) return existing;
  const id = newId();
  await run(
    `INSERT INTO memberships (id, user_id, group_id, role, policy_accepted_at, created_at)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [id, userId, groupId, role, policyAcceptedAt, nowIso()]
  );
  // Every new member starts with initial credits so they can borrow right away.
  await grantInitialCredits(userId, groupId);
  return (await getMembership(userId, groupId))!;
}

export async function isLastGroupAdmin(
  userId: string,
  groupId: string
): Promise<boolean> {
  const membership = await getMembership(userId, groupId);
  if (membership?.role !== "admin") return false;
  const row = await one<{ admin_count: number; member_count: number }>(
    `SELECT
         SUM(CASE WHEN role = 'admin' THEN 1 ELSE 0 END)::int AS admin_count,
         COUNT(*)::int AS member_count
       FROM memberships
       WHERE group_id = $1`,
    [groupId]
  );
  if (!row) return false;
  return row.member_count > 1 && row.admin_count <= 1;
}

export async function removeMembership(userId: string, groupId: string): Promise<void> {
  await run("DELETE FROM memberships WHERE user_id = $1 AND group_id = $2", [
    userId,
    groupId,
  ]);
}

/** Number of books this member has added to a club (their own shelf in it). */
export async function countBooksOwnedByUser(
  userId: string,
  groupId: string
): Promise<number> {
  const row = await one<{ c: number }>(
    "SELECT COUNT(*)::int AS c FROM books WHERE owner_user_id = $1 AND group_id = $2",
    [userId, groupId]
  );
  return row?.c ?? 0;
}

/** Mark the founder's setup guide as finished so it stops nudging them. */
export async function dismissOnboarding(
  userId: string,
  groupId: string
): Promise<void> {
  await run(
    "UPDATE memberships SET onboarding_dismissed_at = $1 WHERE user_id = $2 AND group_id = $3",
    [nowIso(), userId, groupId]
  );
}

export async function getGroupsForUser(userId: string): Promise<GroupWithRole[]> {
  return sql<GroupWithRole>(
    `SELECT g.*, m.role AS role,
              (SELECT COUNT(*) FROM memberships m2 WHERE m2.group_id = g.id)::int AS member_count
       FROM groups g
       JOIN memberships m ON m.group_id = g.id
       WHERE m.user_id = $1
       ORDER BY g.created_at ASC`,
    [userId]
  );
}

// ---------------------------------------------------------------------------
// Books
// ---------------------------------------------------------------------------

export interface CreateBookInput {
  group_id: string;
  owner_user_id: string;
  isbn?: string | null;
  share_mode?: BookShareMode;
  title: string;
  author?: string | null;
  language?: string | null;
  cover_image_url?: string | null;
  age_range?: string | null;
  category?: string | null;
  condition?: string | null;
  notes?: string | null;
  current_location_area?: string | null;
  location_zip?: string | null;
  deposit?: string | null;
  visible_to_others?: boolean;
}

export async function createBook(input: CreateBookInput): Promise<Book> {
  const id = newId();
  const at = nowIso();
  await withTransaction(async (tx) => {
    await tx.run(
      `INSERT INTO books (
         id, group_id, owner_user_id, isbn, share_mode, title, author, language, cover_image_url,
         age_range, category, condition, notes, deposit,
         current_holder_user_id, current_location_area, location_zip, requested_by_user_id,
         status, visible_to_others, created_at
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, NULL, 'available', $18, $19)`,
      [
        id,
        input.group_id,
        input.owner_user_id,
        input.isbn ?? null,
        input.share_mode === "lend" ? "lend" : "flow",
        input.title.trim(),
        input.author ?? null,
        input.language ?? null,
        input.cover_image_url ?? null,
        input.age_range ?? null,
        input.category ?? null,
        input.condition ?? null,
        input.notes ?? null,
        input.deposit ?? null,
        input.owner_user_id,
        input.current_location_area ?? null,
        input.location_zip ?? null,
        input.share_mode === "lend" && input.visible_to_others === false ? 0 : 1,
        at,
      ]
    );
    // The owner is the first holder; open a holding so history starts with them.
    await openHolding(tx, id, input.owner_user_id, at);
  });
  return (await one<Book>("SELECT * FROM books WHERE id = $1", [id]))!;
}

export async function getBookById(id: string): Promise<BookWithPeople | undefined> {
  return one<BookWithPeople>(`${BOOK_SELECT} WHERE b.id = $1`, [id]);
}

export interface UpdateBookInput {
  title: string;
  author: string | null;
  language: string | null;
  isbn: string | null;
  condition: string | null;
  notes: string | null;
  share_mode: BookShareMode;
  deposit: string | null;
  visible_to_others: boolean;
  // undefined = keep existing cover; string/null = replace it.
  cover_image_url?: string | null;
}

/**
 * Let a book's owner correct its descriptive fields (title, condition, etc.).
 * Only metadata is editable here — holder/location/status are managed by the
 * borrow lifecycle, not this form.
 */
export async function updateBook(
  bookId: string,
  ownerId: string,
  input: UpdateBookInput
): Promise<void> {
  const book = await one<Book>("SELECT owner_user_id FROM books WHERE id = $1", [
    bookId,
  ]);
  if (!book) throw new Error("Book not found");
  if (book.owner_user_id !== ownerId)
    throw new Error("Only the owner can edit this book");

  const mode: BookShareMode = input.share_mode === "lend" ? "lend" : "flow";
  await run(
    `UPDATE books SET
       title = $1, author = $2, language = $3, isbn = $4, condition = $5,
       notes = $6, share_mode = $7, deposit = $8, visible_to_others = $9
     WHERE id = $10`,
    [
      input.title.trim(),
      input.author ?? null,
      input.language ?? null,
      input.isbn ?? null,
      input.condition ?? null,
      input.notes ?? null,
      mode,
      mode === "lend" ? (input.deposit ?? null) : null,
      mode === "lend" && input.visible_to_others === false ? 0 : 1,
      bookId,
    ]
  );

  if (input.cover_image_url !== undefined) {
    await run("UPDATE books SET cover_image_url = $1 WHERE id = $2", [
      input.cover_image_url,
      bookId,
    ]);
  }
}

export interface BookFilters {
  search?: string;
  language?: string;
  age_range?: string;
  status?: BookStatus;
  area?: string;
  viewerUserId?: string;
}

export async function listBooks(
  groupId: string,
  filters: BookFilters = {}
): Promise<BookWithPeople[]> {
  const params: unknown[] = [];
  const clauses: string[] = [];
  params.push(groupId);
  clauses.push(`b.group_id = $${params.length}`);

  if (filters.viewerUserId) {
    params.push(filters.viewerUserId);
    clauses.push(
      `(b.share_mode <> 'lend' OR b.visible_to_others = 1 OR b.owner_user_id = $${params.length})`
    );
  } else {
    clauses.push("(b.share_mode <> 'lend' OR b.visible_to_others = 1)");
  }

  if (filters.search) {
    const like = `%${filters.search.trim()}%`;
    params.push(like);
    const p1 = params.length;
    params.push(like);
    const p2 = params.length;
    clauses.push(`(b.title ILIKE $${p1} OR b.author ILIKE $${p2})`);
  }
  if (filters.language) {
    params.push(filters.language);
    clauses.push(`b.language = $${params.length}`);
  }
  if (filters.age_range) {
    params.push(filters.age_range);
    clauses.push(`b.age_range = $${params.length}`);
  }
  if (filters.status) {
    params.push(filters.status);
    clauses.push(`b.status = $${params.length}`);
  }
  if (filters.area) {
    params.push(filters.area);
    clauses.push(`b.current_location_area = $${params.length}`);
  }

  const sqlText = `${BOOK_SELECT} WHERE ${clauses.join(
    " AND "
  )} ORDER BY b.created_at DESC`;
  return sql<BookWithPeople>(sqlText, params);
}

/** Distinct values for building filter dropdowns. */
export async function getBookFacets(
  groupId: string,
  viewerUserId?: string
): Promise<{
  languages: string[];
  ageRanges: string[];
  areas: string[];
}> {
  const params = viewerUserId ? [groupId, viewerUserId] : [groupId];
  const visibilityClause = viewerUserId
    ? "AND (share_mode <> 'lend' OR visible_to_others = 1 OR owner_user_id = $2)"
    : "AND (share_mode <> 'lend' OR visible_to_others = 1)";
  const col = async (c: string) =>
    (
      await sql<{ v: string }>(
        `SELECT DISTINCT ${c} AS v
           FROM books
           WHERE group_id = $1
             AND ${c} IS NOT NULL
             AND ${c} <> ''
             ${visibilityClause}
           ORDER BY v`,
        params
      )
    ).map((r) => r.v);
  return {
    languages: await col("language"),
    ageRanges: await col("age_range"),
    areas: await col("current_location_area"),
  };
}

export async function setBookVisibleToOthers(
  bookId: string,
  ownerUserId: string,
  visible: boolean
): Promise<void> {
  await run(
    `UPDATE books
       SET visible_to_others = $1
       WHERE id = $2
         AND owner_user_id = $3
         AND share_mode = 'lend'`,
    [visible ? 1 : 0, bookId, ownerUserId]
  );
}

export async function withdrawOwnedBooks(
  ownerUserId: string,
  groupId: string,
  bookIds: string[]
): Promise<number> {
  const ids = [...new Set(bookIds.map((id) => id.trim()).filter(Boolean))];
  if (ids.length === 0) return 0;

  return withTransaction(async (tx) => {
    let removed = 0;
    for (const bookId of ids) {
      removed += await tx.run(
        "DELETE FROM books WHERE id = $1 AND owner_user_id = $2 AND group_id = $3",
        [bookId, ownerUserId, groupId]
      );
    }
    return removed;
  });
}

export async function transferOwnedBooks(
  ownerUserId: string,
  sourceGroupId: string,
  targetGroupId: string,
  bookIds: string[]
): Promise<number> {
  const ids = [...new Set(bookIds.map((id) => id.trim()).filter(Boolean))];
  if (ids.length === 0 || sourceGroupId === targetGroupId) return 0;

  const at = nowIso();
  return withTransaction(async (tx) => {
    let moved = 0;
    for (const bookId of ids) {
      const book = await tx.one<{ id: string }>(
        `SELECT id FROM books
           WHERE id = $1
             AND owner_user_id = $2
             AND current_holder_user_id = $3
             AND group_id = $4`,
        [bookId, ownerUserId, ownerUserId, sourceGroupId]
      );
      if (!book) continue;

      // Membership-specific interactions should not leak into the destination club.
      await tx.run("DELETE FROM ratings WHERE book_id = $1", [bookId]);
      await tx.run("DELETE FROM holdings WHERE book_id = $1", [bookId]);
      await tx.run("DELETE FROM book_reviews WHERE book_id = $1", [bookId]);
      await tx.run("UPDATE credit_events SET book_id = NULL WHERE book_id = $1", [
        bookId,
      ]);
      await tx.run(
        "UPDATE books SET group_id = $1, status = 'available' WHERE id = $2",
        [targetGroupId, bookId]
      );
      await openHolding(tx, bookId, ownerUserId, at);
      moved += 1;
    }
    return moved;
  });
}

/** Books this user added (origin), regardless of who holds them now. */
export async function getOwnedBooks(
  userId: string,
  groupId: string
): Promise<BookWithPeople[]> {
  return sql<BookWithPeople>(
    `${BOOK_SELECT} WHERE b.owner_user_id = $1 AND b.group_id = $2 ORDER BY b.created_at DESC`,
    [userId, groupId]
  );
}

/** Books this user currently holds (the books physically with them now). */
export async function getHeldBooks(
  userId: string,
  groupId: string
): Promise<BookWithPeople[]> {
  return sql<BookWithPeople>(
    `${BOOK_SELECT} WHERE b.current_holder_user_id = $1 AND b.group_id = $2 ORDER BY b.created_at DESC`,
    [userId, groupId]
  );
}

// ---------------------------------------------------------------------------
// Book flow (pass-it-on)
// ---------------------------------------------------------------------------

/**
 * A book just flows from person to person; it is never "returned" to whoever
 * added it. When a member receives a book from its current holder, they call
 * this to become the new current holder. The book's location follows the new
 * holder. Coordination (pickup, timing) happens directly between members.
 */
export async function claimBook(bookId: string, newHolderId: string): Promise<void> {
  const book = await one<Book>("SELECT * FROM books WHERE id = $1", [bookId]);
  if (!book) throw new Error("Book not found");
  if (book.current_holder_user_id === newHolderId)
    throw new Error("You already have this book");
  if (
    book.share_mode === "lend" &&
    book.visible_to_others === 0 &&
    book.owner_user_id !== newHolderId
  ) {
    throw new Error("This book is hidden by its owner");
  }
  const holder = await getUserById(newHolderId);
  const at = nowIso();
  await withTransaction(async (tx) => {
    await closeOpenHolding(tx, bookId, "passed_on", at);
    await openHolding(tx, bookId, newHolderId, at);
    await tx.run(
      `UPDATE books SET
         current_holder_user_id = $1,
         current_location_area = $2,
         location_zip = $3,
         status = 'reading'
       WHERE id = $4`,
      [
        newHolderId,
        holder?.home_area ?? book.current_location_area,
        holder?.home_zip ?? book.location_zip,
        bookId,
      ]
    );
    // Credit ledger: taking someone else's book always costs the taker 1, and
    // pays the owner +1 (lend, returns) or +2 (flow, kept). Flow nets +1 into
    // the club on purpose, to reward donating a book for good.
    if (newHolderId !== book.owner_user_id) {
      await addCreditEvent(
        tx,
        book.group_id,
        newHolderId,
        -BORROW_COST,
        "borrow",
        bookId,
        book.owner_user_id,
        at
      );
      await addCreditEvent(
        tx,
        book.group_id,
        book.owner_user_id,
        ownerRewardFor(book.share_mode),
        "lend",
        bookId,
        newHolderId,
        at
      );
    }
  });
}

/**
 * For "lend" books: the current holder (borrower) marks the book as returned to
 * its owner. The book and its location go back to the owner. Coordination of the
 * actual handoff happens directly between members.
 */
export async function returnToOwner(bookId: string, actorId: string): Promise<void> {
  const book = await one<Book>("SELECT * FROM books WHERE id = $1", [bookId]);
  if (!book) throw new Error("Book not found");
  if (book.current_holder_user_id !== actorId && book.owner_user_id !== actorId)
    throw new Error("Only the current holder or owner can mark it returned");
  const owner = await getUserById(book.owner_user_id);
  const at = nowIso();
  await withTransaction(async (tx) => {
    await closeOpenHolding(tx, bookId, "returned", at);
    await openHolding(tx, bookId, book.owner_user_id, at);
    await tx.run(
      `UPDATE books SET
         current_holder_user_id = $1,
         current_location_area = $2,
         location_zip = $3,
         status = 'available'
       WHERE id = $4`,
      [
        book.owner_user_id,
        owner?.home_area ?? book.current_location_area,
        owner?.home_zip ?? book.location_zip,
        bookId,
      ]
    );
  });
}

/**
 * The current holder marks whether they're still reading the book or it's ready
 * to pass on to whoever wants it next. Purely informational.
 */
export async function setBookStatus(
  bookId: string,
  holderId: string,
  status: BookStatus
): Promise<void> {
  const book = await one<Book>("SELECT * FROM books WHERE id = $1", [bookId]);
  if (!book) throw new Error("Book not found");
  if (book.current_holder_user_id !== holderId)
    throw new Error("Only the current holder can change status");
  await run("UPDATE books SET status = $1 WHERE id = $2", [status, bookId]);
}

// ---------------------------------------------------------------------------
// Holdings (flow / borrow history) & ratings (member credit)
// ---------------------------------------------------------------------------

async function openHolding(
  exec: Executor,
  bookId: string,
  holderId: string,
  at: string
): Promise<void> {
  await exec.run(
    `INSERT INTO holdings (id, book_id, holder_user_id, started_at, ended_at, ended_reason)
     VALUES ($1, $2, $3, $4, NULL, NULL)`,
    [newId(), bookId, holderId, at]
  );
}

async function closeOpenHolding(
  exec: Executor,
  bookId: string,
  reason: string,
  at: string
): Promise<void> {
  await exec.run(
    `UPDATE holdings SET ended_at = $1, ended_reason = $2
     WHERE book_id = $3 AND ended_at IS NULL`,
    [at, reason, bookId]
  );
}

/** A book's full chain of holders, newest first, with any rating attached. */
export async function getBookHoldings(bookId: string): Promise<BookHolding[]> {
  return sql<BookHolding>(
    `SELECT h.id, h.book_id, h.holder_user_id, u.name AS holder_name,
              h.started_at, h.ended_at, h.ended_reason,
              r.stars AS rating_stars, r.comment AS rating_comment
       FROM holdings h
       JOIN users u ON u.id = h.holder_user_id
       LEFT JOIN ratings r ON r.holding_id = h.id
       WHERE h.book_id = $1
       ORDER BY h.started_at DESC, h.id DESC`,
    [bookId]
  );
}

// ---------------------------------------------------------------------------
// Notifications
// ---------------------------------------------------------------------------

/** Send the same notification to every member of a group except the actor. */
export async function notifyGroupMembers(
  groupId: string,
  exceptUserId: string,
  type: string,
  body: string | null
): Promise<void> {
  const at = nowIso();
  const memberIds = await getGroupMemberIds(groupId);
  await withTransaction(async (tx) => {
    for (const memberId of memberIds) {
      if (memberId === exceptUserId) continue;
      await tx.run(
        `INSERT INTO notifications (id, user_id, group_id, type, body, read_at, created_at)
         VALUES ($1, $2, $3, $4, $5, NULL, $6)`,
        [newId(), memberId, groupId, type, body, at]
      );
    }
  });
}

export async function getNotifications(userId: string): Promise<NotificationItem[]> {
  return sql<NotificationItem>(
    `SELECT n.*, g.name AS group_name
       FROM notifications n
       LEFT JOIN groups g ON g.id = n.group_id
       WHERE n.user_id = $1
       ORDER BY n.created_at DESC, n.id DESC
       LIMIT 100`,
    [userId]
  );
}

export async function getUnreadNotificationCount(userId: string): Promise<number> {
  const row = await one<{ count: number }>(
    "SELECT COUNT(*)::int AS count FROM notifications WHERE user_id = $1 AND read_at IS NULL",
    [userId]
  );
  return row?.count ?? 0;
}

export async function markNotificationsRead(userId: string): Promise<void> {
  await run(
    "UPDATE notifications SET read_at = $1 WHERE user_id = $2 AND read_at IS NULL",
    [nowIso(), userId]
  );
}

/** Aggregate credit (average stars + count) a member has received. */
export async function getUserRating(userId: string): Promise<UserRating> {
  const row = await one<{ avg: number | null; count: number }>(
    `SELECT AVG(stars)::float AS avg, COUNT(*)::int AS count
       FROM ratings WHERE ratee_user_id = $1`,
    [userId]
  );
  return { avg: row?.avg ?? null, count: row?.count ?? 0 };
}

/**
 * The owner rates how a borrower treated the book for a specific (completed)
 * holding. Only the book's owner may rate, only completed borrows by someone
 * other than the owner, and only once per holding.
 */
export async function rateBorrower(
  holdingId: string,
  raterId: string,
  stars: number,
  comment: string | null
): Promise<void> {
  const holding = await one<{
    id: string;
    book_id: string;
    holder_user_id: string;
    ended_at: string | null;
  }>("SELECT * FROM holdings WHERE id = $1", [holdingId]);
  if (!holding) throw new Error("Holding not found");
  const book = await one<Book>("SELECT * FROM books WHERE id = $1", [holding.book_id]);
  if (!book) throw new Error("Book not found");
  if (book.owner_user_id !== raterId)
    throw new Error("Only the owner can rate borrowers");
  if (holding.holder_user_id === book.owner_user_id)
    throw new Error("Cannot rate the owner's own holding");
  if (!holding.ended_at) throw new Error("Can only rate a completed borrow");
  const clamped = Math.max(1, Math.min(5, Math.round(stars)));
  await run(
    `INSERT INTO ratings
       (id, holding_id, book_id, rater_user_id, ratee_user_id, stars, comment, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     ON CONFLICT (holding_id) DO NOTHING`,
    [
      newId(),
      holdingId,
      book.id,
      raterId,
      holding.holder_user_id,
      clamped,
      comment,
      nowIso(),
    ]
  );
}

// ---------------------------------------------------------------------------
// Members (lookup for chat / DMs)
// ---------------------------------------------------------------------------

/** All members of a group with their display names (for starting a DM, etc). */
export async function getGroupMembers(
  groupId: string
): Promise<{ id: string; name: string }[]> {
  return sql<{ id: string; name: string }>(
    `SELECT u.id, u.name
       FROM memberships m JOIN users u ON u.id = m.user_id
       WHERE m.group_id = $1
       ORDER BY u.name`,
    [groupId]
  );
}

// ---------------------------------------------------------------------------
// Credit ("lend to borrow") + contribution: borrow gate, score, leaderboard
// ---------------------------------------------------------------------------

/** Credits every member receives once, when they join a club, to bootstrap. */
export const INITIAL_CREDITS = 3;

/**
 * Taking any book you don't own costs a flat 1 credit. The owner earns more for
 * giving a book away than for lending one that comes back:
 *   - lend (returns): owner +1, taker −1  → net zero, the book just changes hands
 *   - flow (kept):    owner +2, taker −1  → nets +1 into the club, a thank-you
 *                                            for donating a book for good
 */
export const BORROW_COST = 1;
export const LEND_REWARD = 1;
export const FLOW_REWARD = 2;
export const BOOK_REVIEW_CREDIT = 1;
export const COMMUNITY_MESSAGE_DAILY_CREDIT = 1;

/** Credits the owner earns each time their book is taken by someone else. */
export function ownerRewardFor(mode: BookShareMode): number {
  return mode === "flow" ? FLOW_REWARD : LEND_REWARD;
}

/** Score weights: sharing a book is worth more than it being taken once. */
const SCORE_PER_SHARE = 3;
const SCORE_PER_LEND = 2;

async function addCreditEvent(
  exec: Executor,
  groupId: string,
  userId: string,
  delta: number,
  reason: CreditReason,
  bookId: string | null,
  counterpartyId: string | null,
  at: string
): Promise<void> {
  await exec.run(
    `INSERT INTO credit_events
       (id, group_id, user_id, delta, reason, book_id, counterparty_id, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [newId(), groupId, userId, delta, reason, bookId, counterpartyId, at]
  );
}

/** A member's spendable credit balance in a club (sum of ledger deltas). */
export async function getCreditBalance(
  userId: string,
  groupId: string
): Promise<number> {
  const row = await one<{ bal: number }>(
    "SELECT COALESCE(SUM(delta), 0)::int AS bal FROM credit_events WHERE user_id = $1 AND group_id = $2",
    [userId, groupId]
  );
  return row?.bal ?? 0;
}

/** Full credit history for a member, newest first. */
export async function getCreditEvents(
  userId: string,
  groupId: string
): Promise<CreditEvent[]> {
  return sql<CreditEvent>(
    "SELECT * FROM credit_events WHERE user_id = $1 AND group_id = $2 ORDER BY created_at DESC",
    [userId, groupId]
  );
}

/**
 * Grant the one-time initial credits when a member joins a club, so newcomers
 * can borrow right away. Idempotent: never grants a second 'starter' event.
 */
export async function grantInitialCredits(
  userId: string,
  groupId: string
): Promise<void> {
  const already = await one(
    "SELECT 1 FROM credit_events WHERE user_id = $1 AND group_id = $2 AND reason = 'starter' LIMIT 1",
    [userId, groupId]
  );
  if (already) return;
  await addCreditEvent(
    db,
    groupId,
    userId,
    INITIAL_CREDITS,
    "starter",
    null,
    null,
    nowIso()
  );
}

async function grantBookReviewCreditIfFirst(
  exec: Executor,
  groupId: string,
  userId: string,
  bookId: string,
  at: string
): Promise<void> {
  const already = await exec.one(
    `SELECT 1 FROM credit_events
       WHERE user_id = $1 AND group_id = $2 AND reason = 'review' AND book_id = $3
       LIMIT 1`,
    [userId, groupId, bookId]
  );
  if (already) return;
  await addCreditEvent(
    exec,
    groupId,
    userId,
    BOOK_REVIEW_CREDIT,
    "review",
    bookId,
    null,
    at
  );
}

async function grantDailyCommunityCreditIfFirst(
  exec: Executor,
  groupId: string,
  userId: string,
  at: string
): Promise<void> {
  const day = at.slice(0, 10);
  const already = await exec.one(
    `SELECT 1 FROM credit_events
       WHERE user_id = $1 AND group_id = $2 AND reason = 'community'
         AND substr(created_at, 1, 10) = $3
       LIMIT 1`,
    [userId, groupId, day]
  );
  if (already) return;
  await addCreditEvent(
    exec,
    groupId,
    userId,
    COMMUNITY_MESSAGE_DAILY_CREDIT,
    "community",
    null,
    null,
    at
  );
}

function levelForScore(score: number): ContributionLevel {
  if (score >= 48) return "star";
  if (score >= 24) return "gold";
  if (score >= 9) return "active";
  return "new";
}

function toContribution(shared: number, lent: number): Contribution {
  const score = shared * SCORE_PER_SHARE + lent * SCORE_PER_LEND;
  return { shared, lent, score, level: levelForScore(score) };
}

/** A member's standing in a club: books shared, times lent out, score, level. */
export async function getUserContribution(
  userId: string,
  groupId: string
): Promise<Contribution> {
  const sharedRow = await one<{ c: number }>(
    "SELECT COUNT(*)::int AS c FROM books WHERE owner_user_id = $1 AND group_id = $2",
    [userId, groupId]
  );
  const lentRow = await one<{ c: number }>(
    `SELECT COUNT(*)::int AS c
         FROM holdings h JOIN books b ON b.id = h.book_id
         WHERE b.owner_user_id = $1 AND b.group_id = $2 AND h.holder_user_id != $1`,
    [userId, groupId]
  );
  return toContribution(sharedRow?.c ?? 0, lentRow?.c ?? 0);
}

/**
 * Whether the member may borrow. In "trust" clubs there is no gate, so this is
 * always true. In "credit" clubs they need at least `cost` credit available.
 */
export async function canBorrow(
  userId: string,
  groupId: string,
  cost: number = BORROW_COST
): Promise<boolean> {
  if (!(await isCreditModeOn(groupId))) return true;
  return (await getCreditBalance(userId, groupId)) >= cost;
}

/** All members ranked by contribution score (highest first). */
export async function getGroupLeaderboard(
  groupId: string
): Promise<LeaderboardEntry[]> {
  const rows = await sql<{
    user_id: string;
    name: string;
    shared: number;
    lent: number;
    balance: number;
  }>(
    `SELECT u.id AS user_id, u.name,
        (SELECT COUNT(*) FROM books b WHERE b.owner_user_id = u.id AND b.group_id = $1)::int AS shared,
        (SELECT COUNT(*) FROM holdings h JOIN books b ON b.id = h.book_id
           WHERE b.owner_user_id = u.id AND b.group_id = $1 AND h.holder_user_id != u.id)::int AS lent,
        (SELECT COALESCE(SUM(c.delta), 0) FROM credit_events c
           WHERE c.user_id = u.id AND c.group_id = $1)::int AS balance
       FROM memberships m JOIN users u ON u.id = m.user_id
       WHERE m.group_id = $1`,
    [groupId]
  );
  return rows
    .map((r) => ({
      user_id: r.user_id,
      name: r.name,
      balance: r.balance,
      ...toContribution(r.shared, r.lent),
    }))
    .sort((a, b) => b.score - a.score || b.shared - a.shared);
}

// ---------------------------------------------------------------------------
// Book reviews (review the book's content)
// ---------------------------------------------------------------------------

export async function addBookReview(
  bookId: string,
  userId: string,
  stars: number | null,
  comment: string | null
): Promise<void> {
  const book = await one<{ group_id: string }>(
    "SELECT group_id FROM books WHERE id = $1",
    [bookId]
  );
  if (!book) throw new Error("Book not found");
  const at = nowIso();
  await withTransaction(async (tx) => {
    await tx.run(
      `INSERT INTO book_reviews (id, book_id, user_id, stars, comment, created_at)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (book_id, user_id) DO UPDATE SET
         stars = excluded.stars,
         comment = excluded.comment,
         created_at = excluded.created_at`,
      [newId(), bookId, userId, stars, comment, at]
    );
    await grantBookReviewCreditIfFirst(tx, book.group_id, userId, bookId, at);
  });
}

export async function getBookReviews(bookId: string): Promise<BookReview[]> {
  return sql<BookReview>(
    `SELECT r.id, r.book_id, r.user_id, u.name AS user_name,
              r.stars, r.comment, r.created_at
       FROM book_reviews r JOIN users u ON u.id = r.user_id
       WHERE r.book_id = $1
       ORDER BY r.created_at DESC, r.id DESC`,
    [bookId]
  );
}

export async function getBookReviewSummary(bookId: string): Promise<UserRating> {
  const row = await one<{ avg: number | null; count: number }>(
    `SELECT AVG(stars)::float AS avg, COUNT(*)::int AS count
       FROM book_reviews WHERE book_id = $1 AND stars IS NOT NULL`,
    [bookId]
  );
  return { avg: row?.avg ?? null, count: row?.count ?? 0 };
}

// ---------------------------------------------------------------------------
// Group chat
// ---------------------------------------------------------------------------

export async function postGroupMessage(
  groupId: string,
  userId: string,
  body: string
): Promise<void> {
  const at = nowIso();
  await withTransaction(async (tx) => {
    await tx.run(
      `INSERT INTO group_messages (id, group_id, user_id, body, created_at)
       VALUES ($1, $2, $3, $4, $5)`,
      [newId(), groupId, userId, body, at]
    );
    await grantDailyCommunityCreditIfFirst(tx, groupId, userId, at);
  });
}

/** Recent group messages in chronological (oldest-first) order. */
export async function getGroupMessages(
  groupId: string,
  limit = 200
): Promise<GroupMessage[]> {
  const rows = await sql<GroupMessage>(
    `SELECT m.id, m.group_id, m.user_id, u.name AS user_name, m.body, m.created_at
       FROM group_messages m JOIN users u ON u.id = m.user_id
       WHERE m.group_id = $1
       ORDER BY m.created_at DESC, m.id DESC
       LIMIT $2`,
    [groupId, limit]
  );
  return rows.reverse();
}

// ---------------------------------------------------------------------------
// Direct messages (1:1)
// ---------------------------------------------------------------------------

export async function sendDirectMessage(
  senderId: string,
  recipientId: string,
  body: string
): Promise<void> {
  await run(
    `INSERT INTO direct_messages
         (id, sender_user_id, recipient_user_id, body, read_at, created_at)
       VALUES ($1, $2, $3, $4, NULL, $5)`,
    [newId(), senderId, recipientId, body, nowIso()]
  );
}

/** The full 1:1 thread between two users, oldest-first. */
export async function getConversation(
  userA: string,
  userB: string
): Promise<DirectMessage[]> {
  return sql<DirectMessage>(
    `SELECT * FROM direct_messages
       WHERE (sender_user_id = $1 AND recipient_user_id = $2)
          OR (sender_user_id = $2 AND recipient_user_id = $1)
       ORDER BY created_at ASC, id ASC`,
    [userA, userB]
  );
}

/** One row per person the user has talked to, with last message + unread count. */
export async function getConversations(userId: string): Promise<DmConversation[]> {
  return sql<DmConversation>(
    `WITH msgs AS (
         SELECT
           CASE WHEN sender_user_id = $1 THEN recipient_user_id ELSE sender_user_id END AS other_id,
           body, created_at, read_at, recipient_user_id
         FROM direct_messages
         WHERE sender_user_id = $1 OR recipient_user_id = $1
       )
       SELECT
         msgs.other_id AS user_id,
         u.name AS user_name,
         (SELECT body FROM msgs m2 WHERE m2.other_id = msgs.other_id ORDER BY m2.created_at DESC LIMIT 1) AS last_body,
         MAX(msgs.created_at) AS last_at,
         SUM(CASE WHEN msgs.recipient_user_id = $1 AND msgs.read_at IS NULL THEN 1 ELSE 0 END)::int AS unread
       FROM msgs JOIN users u ON u.id = msgs.other_id
       GROUP BY msgs.other_id, u.name
       ORDER BY last_at DESC`,
    [userId]
  );
}

export async function markConversationRead(
  userId: string,
  otherId: string
): Promise<void> {
  await run(
    `UPDATE direct_messages SET read_at = $1
       WHERE recipient_user_id = $2 AND sender_user_id = $3 AND read_at IS NULL`,
    [nowIso(), userId, otherId]
  );
}

export async function getUnreadDmCount(userId: string): Promise<number> {
  const row = await one<{ count: number }>(
    "SELECT COUNT(*)::int AS count FROM direct_messages WHERE recipient_user_id = $1 AND read_at IS NULL",
    [userId]
  );
  return row?.count ?? 0;
}

// ---------------------------------------------------------------------------
// Book requests (wishlist) & interest
// ---------------------------------------------------------------------------

export interface CreateRequestInput {
  group_id: string;
  requester_user_id: string;
  title: string;
  author?: string | null;
  isbn?: string | null;
  note?: string | null;
}

export async function createBookRequest(input: CreateRequestInput): Promise<string> {
  const id = newId();
  await run(
    `INSERT INTO book_requests
         (id, group_id, requester_user_id, title, author, isbn, note, status, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 'open', $8)`,
    [
      id,
      input.group_id,
      input.requester_user_id,
      input.title.trim(),
      input.author ?? null,
      input.isbn ?? null,
      input.note ?? null,
      nowIso(),
    ]
  );
  return id;
}

export async function listBookRequests(
  groupId: string,
  viewerId: string
): Promise<BookRequest[]> {
  return sql<BookRequest>(
    `SELECT b.id, b.group_id, b.requester_user_id, u.name AS requester_name,
              b.title, b.author, b.isbn, b.note, b.status, b.created_at,
              (SELECT COUNT(*) FROM request_interests ri WHERE ri.request_id = b.id AND ri.kind = 'want')::int AS want_count,
              (SELECT COUNT(*) FROM request_interests ri WHERE ri.request_id = b.id AND ri.kind = 'buy')::int AS buy_count,
              (SELECT COUNT(*) FROM request_interests ri WHERE ri.request_id = b.id AND ri.kind = 'want' AND ri.user_id = $1)::int AS viewer_want,
              (SELECT COUNT(*) FROM request_interests ri WHERE ri.request_id = b.id AND ri.kind = 'buy' AND ri.user_id = $1)::int AS viewer_buy
       FROM book_requests b JOIN users u ON u.id = b.requester_user_id
       WHERE b.group_id = $2
       ORDER BY (b.status = 'open') DESC, b.created_at DESC`,
    [viewerId, groupId]
  );
}

export async function getBookRequest(id: string): Promise<BookRequest | undefined> {
  const row = await one<{ group_id: string }>(
    "SELECT group_id FROM book_requests WHERE id = $1",
    [id]
  );
  if (!row) return undefined;
  return (await listBookRequests(row.group_id, "")).find((r) => r.id === id);
}

/** Toggle a member's interest (want/buy) on a request. */
export async function toggleRequestInterest(
  requestId: string,
  userId: string,
  kind: "want" | "buy"
): Promise<void> {
  const existing = await one<{ id: string }>(
    "SELECT id FROM request_interests WHERE request_id = $1 AND user_id = $2 AND kind = $3",
    [requestId, userId, kind]
  );
  if (existing) {
    await run("DELETE FROM request_interests WHERE id = $1", [existing.id]);
  } else {
    await run(
      `INSERT INTO request_interests (id, request_id, user_id, kind, created_at)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (request_id, user_id, kind) DO NOTHING`,
      [newId(), requestId, userId, kind, nowIso()]
    );
  }
}

export async function setRequestStatus(
  requestId: string,
  actorId: string,
  status: "open" | "fulfilled"
): Promise<void> {
  const req = await one<{ requester_user_id: string }>(
    "SELECT requester_user_id FROM book_requests WHERE id = $1",
    [requestId]
  );
  if (!req) throw new Error("Request not found");
  if (req.requester_user_id !== actorId)
    throw new Error("Only the requester can change status");
  await run("UPDATE book_requests SET status = $1 WHERE id = $2", [status, requestId]);
}

// ---------------------------------------------------------------------------
// Recommended book lists
// ---------------------------------------------------------------------------

export async function createBookList(
  groupId: string,
  authorId: string,
  title: string,
  description: string | null
): Promise<string> {
  const id = newId();
  await run(
    `INSERT INTO book_lists (id, group_id, author_user_id, title, description, created_at)
       VALUES ($1, $2, $3, $4, $5, $6)`,
    [id, groupId, authorId, title.trim(), description, nowIso()]
  );
  return id;
}

export async function addBookListItem(
  listId: string,
  title: string,
  author: string | null,
  isbn: string | null,
  note: string | null
): Promise<void> {
  await run(
    `INSERT INTO book_list_items (id, list_id, title, author, isbn, note, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [newId(), listId, title.trim(), author, isbn, note, nowIso()]
  );
}

export async function listBookLists(groupId: string): Promise<BookList[]> {
  return sql<BookList>(
    `SELECT l.id, l.group_id, l.author_user_id, u.name AS author_name,
              l.title, l.description, l.created_at,
              (SELECT COUNT(*) FROM book_list_items i WHERE i.list_id = l.id)::int AS item_count
       FROM book_lists l JOIN users u ON u.id = l.author_user_id
       WHERE l.group_id = $1
       ORDER BY l.created_at DESC`,
    [groupId]
  );
}

export async function getBookList(id: string): Promise<BookList | undefined> {
  return one<BookList>(
    `SELECT l.id, l.group_id, l.author_user_id, u.name AS author_name,
              l.title, l.description, l.created_at,
              (SELECT COUNT(*) FROM book_list_items i WHERE i.list_id = l.id)::int AS item_count
       FROM book_lists l JOIN users u ON u.id = l.author_user_id
       WHERE l.id = $1`,
    [id]
  );
}

export async function getBookListItems(listId: string): Promise<BookListItem[]> {
  return sql<BookListItem>(
    `SELECT * FROM book_list_items WHERE list_id = $1
       ORDER BY created_at ASC, id ASC`,
    [listId]
  );
}

// ---------------------------------------------------------------------------
// AI usage (free-tier daily request budget)
// ---------------------------------------------------------------------------

/** Local calendar day key (YYYY-MM-DD) used to bucket AI usage. */
function aiUsageDay(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Number of external AI requests already made today. */
export async function getAiUsageToday(): Promise<number> {
  const row = await one<{ count: number }>(
    "SELECT count FROM ai_usage WHERE day = $1",
    [aiUsageDay()]
  );
  return row?.count ?? 0;
}

/** Record one external AI request and return the new running total for today. */
export async function incrementAiUsage(): Promise<number> {
  const day = aiUsageDay();
  await run(
    `INSERT INTO ai_usage (day, count) VALUES ($1, 1)
       ON CONFLICT (day) DO UPDATE SET count = ai_usage.count + 1`,
    [day]
  );
  return getAiUsageToday();
}

/** Force today's usage to (at least) the given limit, e.g. after a 429. */
export async function markAiExhausted(limit: number): Promise<void> {
  const day = aiUsageDay();
  await run(
    `INSERT INTO ai_usage (day, count) VALUES ($1, $2)
       ON CONFLICT (day) DO UPDATE SET count = GREATEST(ai_usage.count, excluded.count)`,
    [day, limit]
  );
}
