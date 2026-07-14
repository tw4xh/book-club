export type BookStatus = "available" | "reading";

/**
 * How the owner wants to share a book:
 * - "flow": pay-it-forward; it passes person to person and is never returned.
 * - "lend": it should be returned to the owner when the borrower is done.
 */
export type BookShareMode = "flow" | "lend";

export interface User {
  id: string;
  name: string;
  email: string;
  password_hash: string | null;
  wechat_nickname: string | null;
  contact: string | null;
  home_area: string | null;
  home_zip: string | null;
  /** 1 = others may see this person's contact info; 0 = opted out. */
  contactable: number;
  /** Optional payment handles so borrowers can thank the owner directly. */
  pay_paypal: string | null;
  pay_venmo: string | null;
  pay_wechat: string | null;
  created_at: string;
}

/**
 * How a club handles borrowing:
 * - "trust": no gate — anyone can borrow freely (default; fits friend groups).
 * - "credit": the "lend first, then borrow" credit gate is enforced.
 */
export type CreditMode = "trust" | "credit";

export interface Group {
  id: string;
  name: string;
  type: string | null;
  /** Club rules the owner sets; new members must agree before joining. */
  policy: string | null;
  invite_code: string;
  credit_mode: CreditMode;
  created_at: string;
}

export type MembershipRole = "member" | "admin";

export interface Membership {
  id: string;
  user_id: string;
  group_id: string;
  role: MembershipRole;
  /** When this member agreed to the club policy (null = legacy/no policy). */
  policy_accepted_at: string | null;
  /** When the founder finished/dismissed the club setup guide (null = still onboarding). */
  onboarding_dismissed_at: string | null;
  created_at: string;
}

export interface Book {
  id: string;
  group_id: string;
  owner_user_id: string;
  isbn: string | null;
  share_mode: BookShareMode;
  title: string;
  author: string | null;
  language: string | null;
  cover_image_url: string | null;
  age_range: string | null;
  category: string | null;
  condition: string | null;
  notes: string | null;
  current_holder_user_id: string;
  current_location_area: string | null;
  location_zip: string | null;
  requested_by_user_id: string | null;
  status: BookStatus;
  /** Optional deposit the owner asks for on a lent book (free text, e.g. "¥50"). */
  deposit: string | null;
  /** 1 = visible in the club catalog; owners can hide lend books from others. */
  visible_to_others: number;
  created_at: string;
}

export interface BorrowRecord {
  id: string;
  book_id: string;
  borrower_user_id: string;
  borrowed_at: string;
  due_at: string | null;
  returned_at: string | null;
}

/**
 * A book joined with the people the UI needs: who added it (origin credit) and
 * who currently holds it (the person to contact to get it next).
 */
export interface BookWithPeople extends Book {
  owner_name: string;
  owner_contact: string | null;
  owner_wechat: string | null;
  owner_contactable: number;
  holder_name: string;
  holder_contact: string | null;
  holder_wechat: string | null;
  holder_contactable: number;
}

export interface GroupWithRole extends Group {
  role: MembershipRole;
  member_count: number;
}

/** One entry in a book's flow / borrow history, joined with the holder's name. */
export interface BookHolding {
  id: string;
  book_id: string;
  holder_user_id: string;
  holder_name: string;
  started_at: string;
  ended_at: string | null;
  /** 'passed_on' (flowed to next person) | 'returned' (given back to owner). */
  ended_reason: string | null;
  /** The rating the owner gave for this borrow, if any. */
  rating_stars: number | null;
  rating_comment: string | null;
}

/** Aggregate "credit" for a member, averaged across ratings they received. */
export interface UserRating {
  avg: number | null;
  count: number;
}

export type ContributionLevel = "new" | "active" | "gold" | "star";

/** A member's give-to-get standing within a club. */
export interface Contribution {
  shared: number;
  lent: number;
  score: number;
  level: ContributionLevel;
}

/** One row of a club's contribution leaderboard. */
export interface LeaderboardEntry extends Contribution {
  user_id: string;
  name: string;
  balance: number;
}

export type CreditReason = "starter" | "lend" | "borrow" | "review" | "community";

/** One immutable entry in the "lend to borrow" credit ledger. */
export interface CreditEvent {
  id: string;
  group_id: string;
  user_id: string;
  delta: number;
  reason: CreditReason;
  book_id: string | null;
  counterparty_id: string | null;
  created_at: string;
}

/** A review of a book's content, joined with the reviewer's name. */
export interface BookReview {
  id: string;
  book_id: string;
  user_id: string;
  user_name: string;
  stars: number | null;
  comment: string | null;
  created_at: string;
}

/** A chat message (group chat), joined with the sender's name. */
export interface GroupMessage {
  id: string;
  group_id: string;
  user_id: string;
  user_name: string;
  body: string;
  created_at: string;
}

/** A 1:1 direct message. */
export interface DirectMessage {
  id: string;
  sender_user_id: string;
  recipient_user_id: string;
  body: string;
  read_at: string | null;
  created_at: string;
}

/** A summary of a DM conversation with one other person. */
export interface DmConversation {
  user_id: string;
  user_name: string;
  last_body: string;
  last_at: string;
  unread: number;
}

/** A "want this book" request with tallied interest. */
export interface BookRequest {
  id: string;
  group_id: string;
  requester_user_id: string;
  requester_name: string;
  title: string;
  author: string | null;
  isbn: string | null;
  note: string | null;
  status: string;
  created_at: string;
  want_count: number;
  buy_count: number;
  /** Whether the current viewer has marked each interest kind. */
  viewer_want: number;
  viewer_buy: number;
}

/** A curated reading list, with item count and author name. */
export interface BookList {
  id: string;
  group_id: string;
  author_user_id: string;
  author_name: string;
  title: string;
  description: string | null;
  created_at: string;
  item_count: number;
}

export interface BookListItem {
  id: string;
  list_id: string;
  title: string;
  author: string | null;
  isbn: string | null;
  note: string | null;
  created_at: string;
}

/** An in-app notification delivered to one member. */
export interface NotificationItem {
  id: string;
  user_id: string;
  group_id: string | null;
  type: string;
  /** Optional snapshot/content (e.g. the new policy text). */
  body: string | null;
  read_at: string | null;
  created_at: string;
  group_name: string | null;
}
