import crypto from "node:crypto";
import { getDb } from "./db";
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

export function getUserById(id: string): User | undefined {
  return getDb().prepare("SELECT * FROM users WHERE id = ?").get(id) as
    User | undefined;
}

export function getUserByEmail(email: string): User | undefined {
  return getDb()
    .prepare("SELECT * FROM users WHERE email = ?")
    .get(email.toLowerCase().trim()) as User | undefined;
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
export function upsertUserByEmail(input: UpsertUserInput): User {
  const db = getDb();
  const email = input.email.toLowerCase().trim();
  const existing = getUserByEmail(email);
  if (existing) {
    db.prepare(
      `UPDATE users SET
         name = ?,
         password_hash = COALESCE(password_hash, ?),
         wechat_nickname = COALESCE(?, wechat_nickname),
         contact = COALESCE(?, contact),
         home_area = COALESCE(?, home_area),
         home_zip = COALESCE(?, home_zip)
       WHERE id = ?`
    ).run(
      input.name.trim() || existing.name,
      input.password_hash ?? null,
      input.wechat_nickname ?? null,
      input.contact ?? null,
      input.home_area ?? null,
      input.home_zip ?? null,
      existing.id
    );
    return getUserById(existing.id)!;
  }

  const id = newId();
  db.prepare(
    `INSERT INTO users (
       id, name, email, password_hash, wechat_nickname, contact, home_area, home_zip, created_at
     )
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    id,
    input.name.trim() || email,
    email,
    input.password_hash ?? null,
    input.wechat_nickname ?? null,
    input.contact ?? null,
    input.home_area ?? null,
    input.home_zip ?? null,
    nowIso()
  );
  return getUserById(id)!;
}

/** Opt in/out of letting other members see your contact info. */
export function setUserContactable(userId: string, contactable: boolean): void {
  getDb()
    .prepare("UPDATE users SET contactable = ? WHERE id = ?")
    .run(contactable ? 1 : 0, userId);
}

export interface PaymentHandles {
  paypal?: string | null;
  venmo?: string | null;
  wechat?: string | null;
}

/** Set the payment handles a member exposes so others can thank them. */
export function setUserPaymentHandles(userId: string, handles: PaymentHandles): void {
  const clean = (v: string | null | undefined) => {
    const s = (v ?? "").trim();
    return s.length > 0 ? s : null;
  };
  getDb()
    .prepare(
      "UPDATE users SET pay_paypal = ?, pay_venmo = ?, pay_wechat = ? WHERE id = ?"
    )
    .run(clean(handles.paypal), clean(handles.venmo), clean(handles.wechat), userId);
}

export function setUserPasswordHash(userId: string, passwordHash: string): void {
  getDb()
    .prepare("UPDATE users SET password_hash = ? WHERE id = ?")
    .run(passwordHash, userId);
}

export interface PasswordResetRequest {
  token: string;
  expires_at: string;
}

/** Create a one-time password reset token. Store only a hash in the DB. */
export function createPasswordResetToken(
  email: string,
  ttlMinutes = 30
): PasswordResetRequest | null {
  const user = getUserByEmail(email);
  if (!user) return null;
  const token = crypto.randomBytes(32).toString("base64url");
  const now = new Date();
  const expiresAt = new Date(now.getTime() + ttlMinutes * 60 * 1000).toISOString();
  const db = getDb();
  const tx = db.transaction(() => {
    // Keep the latest request simple and prevent old unused tokens from piling up.
    db.prepare(
      "UPDATE password_reset_tokens SET used_at = ? WHERE user_id = ? AND used_at IS NULL"
    ).run(now.toISOString(), user.id);
    db.prepare(
      `INSERT INTO password_reset_tokens
         (id, user_id, token_hash, expires_at, used_at, created_at)
       VALUES (?, ?, ?, ?, NULL, ?)`
    ).run(newId(), user.id, sha256(token), expiresAt, now.toISOString());
  });
  tx();
  return { token, expires_at: expiresAt };
}

/** Consume a valid reset token and update the user's password hash atomically. */
export function resetPasswordWithToken(token: string, passwordHash: string): boolean {
  const db = getDb();
  const tokenHash = sha256(token);
  const now = new Date().toISOString();
  const tx = db.transaction(() => {
    const row = db
      .prepare(
        `SELECT id, user_id
         FROM password_reset_tokens
         WHERE token_hash = ?
           AND used_at IS NULL
           AND expires_at > ?`
      )
      .get(tokenHash, now) as { id: string; user_id: string } | undefined;
    if (!row) return false;
    db.prepare("UPDATE users SET password_hash = ? WHERE id = ?").run(
      passwordHash,
      row.user_id
    );
    db.prepare("UPDATE password_reset_tokens SET used_at = ? WHERE id = ?").run(
      now,
      row.id
    );
    return true;
  });
  return tx();
}

// ---------------------------------------------------------------------------
// Groups & memberships
// ---------------------------------------------------------------------------

export function createGroup(
  name: string,
  type: string | null,
  policy: string | null = null
): Group {
  const db = getDb();
  const id = newId();
  let code = newInviteCode();
  // Avoid the (astronomically unlikely) collision.
  while (getGroupByInviteCode(code)) code = newInviteCode();
  db.prepare(
    `INSERT INTO groups (id, name, type, policy, invite_code, created_at) VALUES (?, ?, ?, ?, ?, ?)`
  ).run(id, name.trim(), type, policy, code, nowIso());
  return getGroupById(id)!;
}

/** Only a club admin should call this (enforced in the action layer). */
export function setGroupPolicy(groupId: string, policy: string | null): void {
  getDb().prepare("UPDATE groups SET policy = ? WHERE id = ?").run(policy, groupId);
}

export function getGroupMemberIds(groupId: string): string[] {
  return (
    getDb()
      .prepare("SELECT user_id FROM memberships WHERE group_id = ?")
      .all(groupId) as { user_id: string }[]
  ).map((r) => r.user_id);
}

export function getGroupById(id: string): Group | undefined {
  return getDb().prepare("SELECT * FROM groups WHERE id = ?").get(id) as
    Group | undefined;
}

export function getGroupByInviteCode(code: string): Group | undefined {
  return getDb()
    .prepare("SELECT * FROM groups WHERE invite_code = ?")
    .get(code.toUpperCase().trim()) as Group | undefined;
}

export function getMembership(userId: string, groupId: string): Membership | undefined {
  return getDb()
    .prepare("SELECT * FROM memberships WHERE user_id = ? AND group_id = ?")
    .get(userId, groupId) as Membership | undefined;
}

export function addMembership(
  userId: string,
  groupId: string,
  role: MembershipRole = "member",
  policyAcceptedAt: string | null = null
): Membership {
  const db = getDb();
  const existing = getMembership(userId, groupId);
  if (existing) return existing;
  const id = newId();
  db.prepare(
    `INSERT INTO memberships (id, user_id, group_id, role, policy_accepted_at, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`
  ).run(id, userId, groupId, role, policyAcceptedAt, nowIso());
  // Every new member starts with initial credits so they can borrow right away.
  grantInitialCredits(userId, groupId);
  return getMembership(userId, groupId)!;
}

export function getGroupsForUser(userId: string): GroupWithRole[] {
  return getDb()
    .prepare(
      `SELECT g.*, m.role AS role,
              (SELECT COUNT(*) FROM memberships m2 WHERE m2.group_id = g.id) AS member_count
       FROM groups g
       JOIN memberships m ON m.group_id = g.id
       WHERE m.user_id = ?
       ORDER BY g.created_at ASC`
    )
    .all(userId) as GroupWithRole[];
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

export function createBook(input: CreateBookInput): Book {
  const db = getDb();
  const id = newId();
  const at = nowIso();
  db.prepare(
    `INSERT INTO books (
       id, group_id, owner_user_id, isbn, share_mode, title, author, language, cover_image_url,
       age_range, category, condition, notes, deposit,
       current_holder_user_id, current_location_area, location_zip, requested_by_user_id,
       status, visible_to_others, created_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, 'available', ?, ?)`
  ).run(
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
    at
  );
  // The owner is the first holder; open a holding so history starts with them.
  openHolding(db, id, input.owner_user_id, at);
  return getDb().prepare("SELECT * FROM books WHERE id = ?").get(id) as Book;
}

export function getBookById(id: string): BookWithPeople | undefined {
  return getDb().prepare(`${BOOK_SELECT} WHERE b.id = ?`).get(id) as
    BookWithPeople | undefined;
}

export interface BookFilters {
  search?: string;
  language?: string;
  age_range?: string;
  status?: BookStatus;
  area?: string;
  viewerUserId?: string;
}

export function listBooks(
  groupId: string,
  filters: BookFilters = {}
): BookWithPeople[] {
  const clauses: string[] = ["b.group_id = ?"];
  const params: unknown[] = [groupId];
  if (filters.viewerUserId) {
    clauses.push(
      "(b.share_mode <> 'lend' OR b.visible_to_others = 1 OR b.owner_user_id = ?)"
    );
    params.push(filters.viewerUserId);
  } else {
    clauses.push("(b.share_mode <> 'lend' OR b.visible_to_others = 1)");
  }

  if (filters.search) {
    clauses.push("(b.title LIKE ? OR b.author LIKE ?)");
    const like = `%${filters.search.trim()}%`;
    params.push(like, like);
  }
  if (filters.language) {
    clauses.push("b.language = ?");
    params.push(filters.language);
  }
  if (filters.age_range) {
    clauses.push("b.age_range = ?");
    params.push(filters.age_range);
  }
  if (filters.status) {
    clauses.push("b.status = ?");
    params.push(filters.status);
  }
  if (filters.area) {
    clauses.push("b.current_location_area = ?");
    params.push(filters.area);
  }

  const sql = `${BOOK_SELECT} WHERE ${clauses.join(
    " AND "
  )} ORDER BY b.created_at DESC`;
  return getDb()
    .prepare(sql)
    .all(...params) as BookWithPeople[];
}

/** Distinct values for building filter dropdowns. */
export function getBookFacets(
  groupId: string,
  viewerUserId?: string
): {
  languages: string[];
  ageRanges: string[];
  areas: string[];
} {
  const db = getDb();
  const visibilityClause = viewerUserId
    ? "AND (share_mode <> 'lend' OR visible_to_others = 1 OR owner_user_id = ?)"
    : "AND (share_mode <> 'lend' OR visible_to_others = 1)";
  const col = (c: string) =>
    (
      db
        .prepare(
          `SELECT DISTINCT ${c} AS v
           FROM books
           WHERE group_id = ?
             AND ${c} IS NOT NULL
             AND ${c} <> ''
             ${visibilityClause}
           ORDER BY v`
        )
        .all(...(viewerUserId ? [groupId, viewerUserId] : [groupId])) as { v: string }[]
    ).map((r) => r.v);
  return {
    languages: col("language"),
    ageRanges: col("age_range"),
    areas: col("current_location_area"),
  };
}

export function setBookVisibleToOthers(
  bookId: string,
  ownerUserId: string,
  visible: boolean
): void {
  getDb()
    .prepare(
      `UPDATE books
       SET visible_to_others = ?
       WHERE id = ?
         AND owner_user_id = ?
         AND share_mode = 'lend'`
    )
    .run(visible ? 1 : 0, bookId, ownerUserId);
}

/** Books this user added (origin), regardless of who holds them now. */
export function getOwnedBooks(userId: string, groupId: string): BookWithPeople[] {
  return getDb()
    .prepare(
      `${BOOK_SELECT} WHERE b.owner_user_id = ? AND b.group_id = ? ORDER BY b.created_at DESC`
    )
    .all(userId, groupId) as BookWithPeople[];
}

/** Books this user currently holds (the books physically with them now). */
export function getHeldBooks(userId: string, groupId: string): BookWithPeople[] {
  return getDb()
    .prepare(
      `${BOOK_SELECT} WHERE b.current_holder_user_id = ? AND b.group_id = ? ORDER BY b.created_at DESC`
    )
    .all(userId, groupId) as BookWithPeople[];
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
export function claimBook(bookId: string, newHolderId: string): void {
  const db = getDb();
  const book = db.prepare("SELECT * FROM books WHERE id = ?").get(bookId) as
    Book | undefined;
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
  const holder = getUserById(newHolderId);
  const at = nowIso();
  const tx = db.transaction(() => {
    closeOpenHolding(db, bookId, "passed_on", at);
    openHolding(db, bookId, newHolderId, at);
    db.prepare(
      `UPDATE books SET
         current_holder_user_id = ?,
         current_location_area = ?,
         location_zip = ?,
         status = 'reading'
       WHERE id = ?`
    ).run(
      newHolderId,
      holder?.home_area ?? book.current_location_area,
      holder?.home_zip ?? book.location_zip,
      bookId
    );
    // Credit ledger: taking someone else's book costs the taker and pays the
    // owner. Conserved (+ and - cancel), so colluders can't mint net credit.
    if (newHolderId !== book.owner_user_id) {
      const cost = creditCostForBook(bookId, book.share_mode);
      addCreditEvent(
        db,
        book.group_id,
        newHolderId,
        -cost,
        "borrow",
        bookId,
        book.owner_user_id,
        at
      );
      addCreditEvent(
        db,
        book.group_id,
        book.owner_user_id,
        cost,
        "lend",
        bookId,
        newHolderId,
        at
      );
    }
  });
  tx();
}

/**
 * For "lend" books: the current holder (borrower) marks the book as returned to
 * its owner. The book and its location go back to the owner. Coordination of the
 * actual handoff happens directly between members.
 */
export function returnToOwner(bookId: string, actorId: string): void {
  const db = getDb();
  const book = db.prepare("SELECT * FROM books WHERE id = ?").get(bookId) as
    Book | undefined;
  if (!book) throw new Error("Book not found");
  if (book.current_holder_user_id !== actorId && book.owner_user_id !== actorId)
    throw new Error("Only the current holder or owner can mark it returned");
  const owner = getUserById(book.owner_user_id);
  const at = nowIso();
  const tx = db.transaction(() => {
    closeOpenHolding(db, bookId, "returned", at);
    openHolding(db, bookId, book.owner_user_id, at);
    db.prepare(
      `UPDATE books SET
         current_holder_user_id = ?,
         current_location_area = ?,
         location_zip = ?,
         status = 'available'
       WHERE id = ?`
    ).run(
      book.owner_user_id,
      owner?.home_area ?? book.current_location_area,
      owner?.home_zip ?? book.location_zip,
      bookId
    );
  });
  tx();
}

/**
 * The current holder marks whether they're still reading the book or it's ready
 * to pass on to whoever wants it next. Purely informational.
 */
export function setBookStatus(
  bookId: string,
  holderId: string,
  status: BookStatus
): void {
  const db = getDb();
  const book = db.prepare("SELECT * FROM books WHERE id = ?").get(bookId) as
    Book | undefined;
  if (!book) throw new Error("Book not found");
  if (book.current_holder_user_id !== holderId)
    throw new Error("Only the current holder can change status");
  db.prepare("UPDATE books SET status = ? WHERE id = ?").run(status, bookId);
}

// ---------------------------------------------------------------------------
// Holdings (flow / borrow history) & ratings (member credit)
// ---------------------------------------------------------------------------

type DbHandle = ReturnType<typeof getDb>;

function openHolding(db: DbHandle, bookId: string, holderId: string, at: string): void {
  db.prepare(
    `INSERT INTO holdings (id, book_id, holder_user_id, started_at, ended_at, ended_reason)
     VALUES (?, ?, ?, ?, NULL, NULL)`
  ).run(newId(), bookId, holderId, at);
}

function closeOpenHolding(
  db: DbHandle,
  bookId: string,
  reason: string,
  at: string
): void {
  db.prepare(
    `UPDATE holdings SET ended_at = ?, ended_reason = ?
     WHERE book_id = ? AND ended_at IS NULL`
  ).run(at, reason, bookId);
}

/** A book's full chain of holders, newest first, with any rating attached. */
export function getBookHoldings(bookId: string): BookHolding[] {
  return getDb()
    .prepare(
      `SELECT h.id, h.book_id, h.holder_user_id, u.name AS holder_name,
              h.started_at, h.ended_at, h.ended_reason,
              r.stars AS rating_stars, r.comment AS rating_comment
       FROM holdings h
       JOIN users u ON u.id = h.holder_user_id
       LEFT JOIN ratings r ON r.holding_id = h.id
       WHERE h.book_id = ?
       ORDER BY h.started_at DESC, h.rowid DESC`
    )
    .all(bookId) as BookHolding[];
}

// ---------------------------------------------------------------------------
// Notifications
// ---------------------------------------------------------------------------

/** Send the same notification to every member of a group except the actor. */
export function notifyGroupMembers(
  groupId: string,
  exceptUserId: string,
  type: string,
  body: string | null
): void {
  const db = getDb();
  const at = nowIso();
  const insert = db.prepare(
    `INSERT INTO notifications (id, user_id, group_id, type, body, read_at, created_at)
     VALUES (?, ?, ?, ?, ?, NULL, ?)`
  );
  const tx = db.transaction((memberIds: string[]) => {
    for (const memberId of memberIds) {
      if (memberId === exceptUserId) continue;
      insert.run(newId(), memberId, groupId, type, body, at);
    }
  });
  tx(getGroupMemberIds(groupId));
}

export function getNotifications(userId: string): NotificationItem[] {
  return getDb()
    .prepare(
      `SELECT n.*, g.name AS group_name
       FROM notifications n
       LEFT JOIN groups g ON g.id = n.group_id
       WHERE n.user_id = ?
       ORDER BY n.created_at DESC, n.rowid DESC
       LIMIT 100`
    )
    .all(userId) as NotificationItem[];
}

export function getUnreadNotificationCount(userId: string): number {
  const row = getDb()
    .prepare(
      "SELECT COUNT(*) AS count FROM notifications WHERE user_id = ? AND read_at IS NULL"
    )
    .get(userId) as { count: number };
  return row.count;
}

export function markNotificationsRead(userId: string): void {
  getDb()
    .prepare(
      "UPDATE notifications SET read_at = ? WHERE user_id = ? AND read_at IS NULL"
    )
    .run(nowIso(), userId);
}

/** Aggregate credit (average stars + count) a member has received. */
export function getUserRating(userId: string): UserRating {
  const row = getDb()
    .prepare(
      `SELECT AVG(stars) AS avg, COUNT(*) AS count
       FROM ratings WHERE ratee_user_id = ?`
    )
    .get(userId) as { avg: number | null; count: number };
  return { avg: row.avg, count: row.count };
}

/**
 * The owner rates how a borrower treated the book for a specific (completed)
 * holding. Only the book's owner may rate, only completed borrows by someone
 * other than the owner, and only once per holding.
 */
export function rateBorrower(
  holdingId: string,
  raterId: string,
  stars: number,
  comment: string | null
): void {
  const db = getDb();
  const holding = db.prepare("SELECT * FROM holdings WHERE id = ?").get(holdingId) as
    | { id: string; book_id: string; holder_user_id: string; ended_at: string | null }
    | undefined;
  if (!holding) throw new Error("Holding not found");
  const book = db.prepare("SELECT * FROM books WHERE id = ?").get(holding.book_id) as
    Book | undefined;
  if (!book) throw new Error("Book not found");
  if (book.owner_user_id !== raterId)
    throw new Error("Only the owner can rate borrowers");
  if (holding.holder_user_id === book.owner_user_id)
    throw new Error("Cannot rate the owner's own holding");
  if (!holding.ended_at) throw new Error("Can only rate a completed borrow");
  const clamped = Math.max(1, Math.min(5, Math.round(stars)));
  db.prepare(
    `INSERT OR IGNORE INTO ratings
       (id, holding_id, book_id, rater_user_id, ratee_user_id, stars, comment, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    newId(),
    holdingId,
    book.id,
    raterId,
    holding.holder_user_id,
    clamped,
    comment,
    nowIso()
  );
}

// ---------------------------------------------------------------------------
// Members (lookup for chat / DMs)
// ---------------------------------------------------------------------------

/** All members of a group with their display names (for starting a DM, etc). */
export function getGroupMembers(groupId: string): { id: string; name: string }[] {
  return getDb()
    .prepare(
      `SELECT u.id, u.name
       FROM memberships m JOIN users u ON u.id = m.user_id
       WHERE m.group_id = ?
       ORDER BY u.name`
    )
    .all(groupId) as { id: string; name: string }[];
}

// ---------------------------------------------------------------------------
// Credit ("lend to borrow") + contribution: borrow gate, score, leaderboard
// ---------------------------------------------------------------------------

/** Credits every member receives once, when they join a club, to bootstrap. */
export const INITIAL_CREDITS = 3;

/**
 * Taking a book you don't own costs the taker credits and pays the owner the
 * same amount. Pass-on ("flow") books are gone for good, so sharing one is a
 * bigger contribution than lending a book that comes back — it's worth more.
 */
export const LEND_COST = 1;
export const FLOW_COST = 2;

/** Credit cost (and owner reward) for taking a book of the given share mode. */
export function creditCostFor(mode: BookShareMode): number {
  return mode === "flow" ? FLOW_COST : LEND_COST;
}

/**
 * Higher-rated books are worth more credit: a well-loved book is a bigger gift
 * to the club. The bonus applies to both sides (taker pays more, owner earns
 * more), so it stays conserved and rating-gaming still can't mint net credit.
 */
export function qualityBonus(avgStars: number | null): number {
  if (avgStars == null) return 0;
  if (avgStars >= 4.5) return 2;
  if (avgStars >= 3.5) return 1;
  return 0;
}

/** Full credit cost for taking a specific book: share mode + quality bonus. */
export function creditCostForBook(bookId: string, mode: BookShareMode): number {
  return creditCostFor(mode) + qualityBonus(getBookReviewSummary(bookId).avg);
}

/** Score weights: sharing a book is worth more than it being taken once. */
const SCORE_PER_SHARE = 3;
const SCORE_PER_LEND = 2;

function addCreditEvent(
  db: ReturnType<typeof getDb>,
  groupId: string,
  userId: string,
  delta: number,
  reason: CreditReason,
  bookId: string | null,
  counterpartyId: string | null,
  at: string
): void {
  db.prepare(
    `INSERT INTO credit_events
       (id, group_id, user_id, delta, reason, book_id, counterparty_id, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(newId(), groupId, userId, delta, reason, bookId, counterpartyId, at);
}

/** A member's spendable credit balance in a club (sum of ledger deltas). */
export function getCreditBalance(userId: string, groupId: string): number {
  const row = getDb()
    .prepare(
      "SELECT COALESCE(SUM(delta), 0) AS bal FROM credit_events WHERE user_id = ? AND group_id = ?"
    )
    .get(userId, groupId) as { bal: number };
  return row.bal;
}

/** Full credit history for a member, newest first. */
export function getCreditEvents(userId: string, groupId: string): CreditEvent[] {
  return getDb()
    .prepare(
      "SELECT * FROM credit_events WHERE user_id = ? AND group_id = ? ORDER BY created_at DESC"
    )
    .all(userId, groupId) as CreditEvent[];
}

/**
 * Grant the one-time initial credits when a member joins a club, so newcomers
 * can borrow right away. Idempotent: never grants a second 'starter' event.
 */
export function grantInitialCredits(userId: string, groupId: string): void {
  const db = getDb();
  const already = db
    .prepare(
      "SELECT 1 FROM credit_events WHERE user_id = ? AND group_id = ? AND reason = 'starter' LIMIT 1"
    )
    .get(userId, groupId);
  if (already) return;
  addCreditEvent(db, groupId, userId, INITIAL_CREDITS, "starter", null, null, nowIso());
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
export function getUserContribution(userId: string, groupId: string): Contribution {
  const db = getDb();
  const shared = (
    db
      .prepare(
        "SELECT COUNT(*) AS c FROM books WHERE owner_user_id = ? AND group_id = ?"
      )
      .get(userId, groupId) as { c: number }
  ).c;
  const lent = (
    db
      .prepare(
        `SELECT COUNT(*) AS c
         FROM holdings h JOIN books b ON b.id = h.book_id
         WHERE b.owner_user_id = ? AND b.group_id = ? AND h.holder_user_id != ?`
      )
      .get(userId, groupId, userId) as { c: number }
  ).c;
  return toContribution(shared, lent);
}

/** True when the member has at least `cost` credit available. */
export function canBorrow(
  userId: string,
  groupId: string,
  cost: number = LEND_COST
): boolean {
  return getCreditBalance(userId, groupId) >= cost;
}

/** All members ranked by contribution score (highest first). */
export function getGroupLeaderboard(groupId: string): LeaderboardEntry[] {
  const rows = getDb()
    .prepare(
      `SELECT u.id AS user_id, u.name,
        (SELECT COUNT(*) FROM books b WHERE b.owner_user_id = u.id AND b.group_id = ?) AS shared,
        (SELECT COUNT(*) FROM holdings h JOIN books b ON b.id = h.book_id
           WHERE b.owner_user_id = u.id AND b.group_id = ? AND h.holder_user_id != u.id) AS lent,
        (SELECT COALESCE(SUM(c.delta), 0) FROM credit_events c
           WHERE c.user_id = u.id AND c.group_id = ?) AS balance
       FROM memberships m JOIN users u ON u.id = m.user_id
       WHERE m.group_id = ?`
    )
    .all(groupId, groupId, groupId, groupId) as {
    user_id: string;
    name: string;
    shared: number;
    lent: number;
    balance: number;
  }[];
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

export function addBookReview(
  bookId: string,
  userId: string,
  stars: number | null,
  comment: string | null
): void {
  getDb()
    .prepare(
      `INSERT INTO book_reviews (id, book_id, user_id, stars, comment, created_at)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(book_id, user_id) DO UPDATE SET
         stars = excluded.stars,
         comment = excluded.comment,
         created_at = excluded.created_at`
    )
    .run(newId(), bookId, userId, stars, comment, nowIso());
}

export function getBookReviews(bookId: string): BookReview[] {
  return getDb()
    .prepare(
      `SELECT r.id, r.book_id, r.user_id, u.name AS user_name,
              r.stars, r.comment, r.created_at
       FROM book_reviews r JOIN users u ON u.id = r.user_id
       WHERE r.book_id = ?
       ORDER BY r.created_at DESC, r.rowid DESC`
    )
    .all(bookId) as BookReview[];
}

export function getBookReviewSummary(bookId: string): UserRating {
  const row = getDb()
    .prepare(
      `SELECT AVG(stars) AS avg, COUNT(*) AS count
       FROM book_reviews WHERE book_id = ? AND stars IS NOT NULL`
    )
    .get(bookId) as { avg: number | null; count: number };
  return { avg: row.avg, count: row.count };
}

// ---------------------------------------------------------------------------
// Group chat
// ---------------------------------------------------------------------------

export function postGroupMessage(groupId: string, userId: string, body: string): void {
  getDb()
    .prepare(
      `INSERT INTO group_messages (id, group_id, user_id, body, created_at)
       VALUES (?, ?, ?, ?, ?)`
    )
    .run(newId(), groupId, userId, body, nowIso());
}

/** Recent group messages in chronological (oldest-first) order. */
export function getGroupMessages(groupId: string, limit = 200): GroupMessage[] {
  const rows = getDb()
    .prepare(
      `SELECT m.id, m.group_id, m.user_id, u.name AS user_name, m.body, m.created_at
       FROM group_messages m JOIN users u ON u.id = m.user_id
       WHERE m.group_id = ?
       ORDER BY m.created_at DESC, m.rowid DESC
       LIMIT ?`
    )
    .all(groupId, limit) as GroupMessage[];
  return rows.reverse();
}

// ---------------------------------------------------------------------------
// Direct messages (1:1)
// ---------------------------------------------------------------------------

export function sendDirectMessage(
  senderId: string,
  recipientId: string,
  body: string
): void {
  getDb()
    .prepare(
      `INSERT INTO direct_messages
         (id, sender_user_id, recipient_user_id, body, read_at, created_at)
       VALUES (?, ?, ?, ?, NULL, ?)`
    )
    .run(newId(), senderId, recipientId, body, nowIso());
}

/** The full 1:1 thread between two users, oldest-first. */
export function getConversation(userA: string, userB: string): DirectMessage[] {
  return getDb()
    .prepare(
      `SELECT * FROM direct_messages
       WHERE (sender_user_id = ? AND recipient_user_id = ?)
          OR (sender_user_id = ? AND recipient_user_id = ?)
       ORDER BY created_at ASC, rowid ASC`
    )
    .all(userA, userB, userB, userA) as DirectMessage[];
}

/** One row per person the user has talked to, with last message + unread count. */
export function getConversations(userId: string): DmConversation[] {
  return getDb()
    .prepare(
      `WITH msgs AS (
         SELECT
           CASE WHEN sender_user_id = ? THEN recipient_user_id ELSE sender_user_id END AS other_id,
           body, created_at, read_at, recipient_user_id
         FROM direct_messages
         WHERE sender_user_id = ? OR recipient_user_id = ?
       )
       SELECT
         msgs.other_id AS user_id,
         u.name AS user_name,
         (SELECT body FROM msgs m2 WHERE m2.other_id = msgs.other_id ORDER BY m2.created_at DESC LIMIT 1) AS last_body,
         MAX(msgs.created_at) AS last_at,
         SUM(CASE WHEN msgs.recipient_user_id = ? AND msgs.read_at IS NULL THEN 1 ELSE 0 END) AS unread
       FROM msgs JOIN users u ON u.id = msgs.other_id
       GROUP BY msgs.other_id
       ORDER BY last_at DESC`
    )
    .all(userId, userId, userId, userId) as DmConversation[];
}

export function markConversationRead(userId: string, otherId: string): void {
  getDb()
    .prepare(
      `UPDATE direct_messages SET read_at = ?
       WHERE recipient_user_id = ? AND sender_user_id = ? AND read_at IS NULL`
    )
    .run(nowIso(), userId, otherId);
}

export function getUnreadDmCount(userId: string): number {
  const row = getDb()
    .prepare(
      "SELECT COUNT(*) AS count FROM direct_messages WHERE recipient_user_id = ? AND read_at IS NULL"
    )
    .get(userId) as { count: number };
  return row.count;
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

export function createBookRequest(input: CreateRequestInput): string {
  const id = newId();
  getDb()
    .prepare(
      `INSERT INTO book_requests
         (id, group_id, requester_user_id, title, author, isbn, note, status, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'open', ?)`
    )
    .run(
      id,
      input.group_id,
      input.requester_user_id,
      input.title.trim(),
      input.author ?? null,
      input.isbn ?? null,
      input.note ?? null,
      nowIso()
    );
  return id;
}

export function listBookRequests(groupId: string, viewerId: string): BookRequest[] {
  return getDb()
    .prepare(
      `SELECT b.id, b.group_id, b.requester_user_id, u.name AS requester_name,
              b.title, b.author, b.isbn, b.note, b.status, b.created_at,
              (SELECT COUNT(*) FROM request_interests ri WHERE ri.request_id = b.id AND ri.kind = 'want') AS want_count,
              (SELECT COUNT(*) FROM request_interests ri WHERE ri.request_id = b.id AND ri.kind = 'buy') AS buy_count,
              (SELECT COUNT(*) FROM request_interests ri WHERE ri.request_id = b.id AND ri.kind = 'want' AND ri.user_id = ?) AS viewer_want,
              (SELECT COUNT(*) FROM request_interests ri WHERE ri.request_id = b.id AND ri.kind = 'buy' AND ri.user_id = ?) AS viewer_buy
       FROM book_requests b JOIN users u ON u.id = b.requester_user_id
       WHERE b.group_id = ?
       ORDER BY (b.status = 'open') DESC, b.created_at DESC`
    )
    .all(viewerId, viewerId, groupId) as BookRequest[];
}

export function getBookRequest(id: string): BookRequest | undefined {
  const db = getDb();
  const row = db.prepare("SELECT group_id FROM book_requests WHERE id = ?").get(id) as
    { group_id: string } | undefined;
  if (!row) return undefined;
  return listBookRequests(row.group_id, "").find((r) => r.id === id);
}

/** Toggle a member's interest (want/buy) on a request. */
export function toggleRequestInterest(
  requestId: string,
  userId: string,
  kind: "want" | "buy"
): void {
  const db = getDb();
  const existing = db
    .prepare(
      "SELECT id FROM request_interests WHERE request_id = ? AND user_id = ? AND kind = ?"
    )
    .get(requestId, userId, kind) as { id: string } | undefined;
  if (existing) {
    db.prepare("DELETE FROM request_interests WHERE id = ?").run(existing.id);
  } else {
    db.prepare(
      `INSERT OR IGNORE INTO request_interests (id, request_id, user_id, kind, created_at)
       VALUES (?, ?, ?, ?, ?)`
    ).run(newId(), requestId, userId, kind, nowIso());
  }
}

export function setRequestStatus(
  requestId: string,
  actorId: string,
  status: "open" | "fulfilled"
): void {
  const db = getDb();
  const req = db
    .prepare("SELECT requester_user_id FROM book_requests WHERE id = ?")
    .get(requestId) as { requester_user_id: string } | undefined;
  if (!req) throw new Error("Request not found");
  if (req.requester_user_id !== actorId)
    throw new Error("Only the requester can change status");
  db.prepare("UPDATE book_requests SET status = ? WHERE id = ?").run(status, requestId);
}

// ---------------------------------------------------------------------------
// Recommended book lists
// ---------------------------------------------------------------------------

export function createBookList(
  groupId: string,
  authorId: string,
  title: string,
  description: string | null
): string {
  const id = newId();
  getDb()
    .prepare(
      `INSERT INTO book_lists (id, group_id, author_user_id, title, description, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`
    )
    .run(id, groupId, authorId, title.trim(), description, nowIso());
  return id;
}

export function addBookListItem(
  listId: string,
  title: string,
  author: string | null,
  isbn: string | null,
  note: string | null
): void {
  getDb()
    .prepare(
      `INSERT INTO book_list_items (id, list_id, title, author, isbn, note, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    )
    .run(newId(), listId, title.trim(), author, isbn, note, nowIso());
}

export function listBookLists(groupId: string): BookList[] {
  return getDb()
    .prepare(
      `SELECT l.id, l.group_id, l.author_user_id, u.name AS author_name,
              l.title, l.description, l.created_at,
              (SELECT COUNT(*) FROM book_list_items i WHERE i.list_id = l.id) AS item_count
       FROM book_lists l JOIN users u ON u.id = l.author_user_id
       WHERE l.group_id = ?
       ORDER BY l.created_at DESC`
    )
    .all(groupId) as BookList[];
}

export function getBookList(id: string): BookList | undefined {
  return getDb()
    .prepare(
      `SELECT l.id, l.group_id, l.author_user_id, u.name AS author_name,
              l.title, l.description, l.created_at,
              (SELECT COUNT(*) FROM book_list_items i WHERE i.list_id = l.id) AS item_count
       FROM book_lists l JOIN users u ON u.id = l.author_user_id
       WHERE l.id = ?`
    )
    .get(id) as BookList | undefined;
}

export function getBookListItems(listId: string): BookListItem[] {
  return getDb()
    .prepare(
      `SELECT * FROM book_list_items WHERE list_id = ?
       ORDER BY created_at ASC, rowid ASC`
    )
    .all(listId) as BookListItem[];
}
