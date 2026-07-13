import { Pool } from "pg";

/**
 * PostgreSQL data layer (Supabase-compatible).
 *
 * All access goes through the small `Executor` interface below, which both the
 * pooled connection (`db`) and a transaction client implement. The repository
 * layer (repo.ts) is written against this interface so the rest of the app is
 * unaware of the database engine.
 *
 * Connection is configured via DATABASE_URL, e.g.:
 *   postgres://user:pass@host:5432/dbname
 * For Supabase, use the connection string from the dashboard (the pooler URL on
 * port 6543 is recommended for serverless/Vercel).
 */

let pool: Pool | null = null;

function isLocal(url: string): boolean {
  return /@(localhost|127\.0\.0\.1)[:/]/.test(url);
}

function getPool(): Pool {
  if (pool) return pool;
  // Read lazily so scripts that load .env at runtime (e.g. the seed) work.
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error(
      "DATABASE_URL is not set. Point it at your Postgres/Supabase database."
    );
  }
  pool = new Pool({
    connectionString,
    // Supabase (and most managed Postgres) require SSL; local Docker does not.
    ssl:
      process.env.PGSSL === "disable" || isLocal(connectionString)
        ? undefined
        : { rejectUnauthorized: false },
    max: Number(process.env.PG_POOL_MAX) || 10,
  });
  return pool;
}

export type Executor = {
  query: <T = Record<string, unknown>>(
    text: string,
    params?: unknown[]
  ) => Promise<T[]>;
  one: <T = Record<string, unknown>>(
    text: string,
    params?: unknown[]
  ) => Promise<T | undefined>;
  run: (text: string, params?: unknown[]) => Promise<number>;
};

export async function sql<T = Record<string, unknown>>(
  text: string,
  params: unknown[] = []
): Promise<T[]> {
  await ensureSchema();
  const res = await getPool().query(text, params);
  return res.rows as T[];
}

export async function one<T = Record<string, unknown>>(
  text: string,
  params: unknown[] = []
): Promise<T | undefined> {
  return (await sql<T>(text, params))[0];
}

export async function run(text: string, params: unknown[] = []): Promise<number> {
  await ensureSchema();
  const res = await getPool().query(text, params);
  return res.rowCount ?? 0;
}

/** The default (non-transactional) executor, backed by the pool. */
export const db: Executor = { query: sql, one, run };

/** Run a set of statements in a single transaction. */
export async function withTransaction<T>(
  fn: (executor: Executor) => Promise<T>
): Promise<T> {
  await ensureSchema();
  const client = await getPool().connect();
  const exec: Executor = {
    query: async <R = Record<string, unknown>>(t: string, p: unknown[] = []) =>
      (await client.query(t, p)).rows as R[],
    one: async <R = Record<string, unknown>>(t: string, p: unknown[] = []) =>
      (await client.query(t, p)).rows[0] as R | undefined,
    run: async (t: string, p: unknown[] = []) =>
      (await client.query(t, p)).rowCount ?? 0,
  };
  try {
    await client.query("BEGIN");
    const result = await fn(exec);
    await client.query("COMMIT");
    return result;
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT,
  wechat_nickname TEXT,
  contact TEXT,
  home_area TEXT,
  home_zip TEXT,
  contactable INTEGER NOT NULL DEFAULT 1,
  pay_paypal TEXT,
  pay_venmo TEXT,
  pay_wechat TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS password_reset_tokens (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TEXT NOT NULL,
  used_at TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS groups (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  type TEXT,
  policy TEXT,
  invite_code TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS memberships (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  group_id TEXT NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'member',
  policy_accepted_at TEXT,
  created_at TEXT NOT NULL,
  UNIQUE(user_id, group_id)
);

CREATE TABLE IF NOT EXISTS books (
  id TEXT PRIMARY KEY,
  group_id TEXT NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  owner_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  isbn TEXT,
  share_mode TEXT NOT NULL DEFAULT 'flow',
  title TEXT NOT NULL,
  author TEXT,
  language TEXT,
  cover_image_url TEXT,
  age_range TEXT,
  category TEXT,
  condition TEXT,
  notes TEXT,
  deposit TEXT,
  current_holder_user_id TEXT NOT NULL REFERENCES users(id),
  current_location_area TEXT,
  location_zip TEXT,
  requested_by_user_id TEXT REFERENCES users(id),
  status TEXT NOT NULL DEFAULT 'available',
  visible_to_others INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS borrow_records (
  id TEXT PRIMARY KEY,
  book_id TEXT NOT NULL REFERENCES books(id) ON DELETE CASCADE,
  borrower_user_id TEXT NOT NULL REFERENCES users(id),
  borrowed_at TEXT NOT NULL,
  due_at TEXT,
  returned_at TEXT
);

CREATE TABLE IF NOT EXISTS holdings (
  id TEXT PRIMARY KEY,
  book_id TEXT NOT NULL REFERENCES books(id) ON DELETE CASCADE,
  holder_user_id TEXT NOT NULL REFERENCES users(id),
  started_at TEXT NOT NULL,
  ended_at TEXT,
  ended_reason TEXT
);

CREATE TABLE IF NOT EXISTS ratings (
  id TEXT PRIMARY KEY,
  holding_id TEXT NOT NULL REFERENCES holdings(id) ON DELETE CASCADE,
  book_id TEXT NOT NULL REFERENCES books(id) ON DELETE CASCADE,
  rater_user_id TEXT NOT NULL REFERENCES users(id),
  ratee_user_id TEXT NOT NULL REFERENCES users(id),
  stars INTEGER NOT NULL,
  comment TEXT,
  created_at TEXT NOT NULL,
  UNIQUE(holding_id)
);

CREATE TABLE IF NOT EXISTS notifications (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  group_id TEXT REFERENCES groups(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  body TEXT,
  read_at TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS book_reviews (
  id TEXT PRIMARY KEY,
  book_id TEXT NOT NULL REFERENCES books(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  stars INTEGER,
  comment TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS group_messages (
  id TEXT PRIMARY KEY,
  group_id TEXT NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  body TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS direct_messages (
  id TEXT PRIMARY KEY,
  sender_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  recipient_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  body TEXT NOT NULL,
  read_at TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS book_requests (
  id TEXT PRIMARY KEY,
  group_id TEXT NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  requester_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  author TEXT,
  isbn TEXT,
  note TEXT,
  status TEXT NOT NULL DEFAULT 'open',
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS request_interests (
  id TEXT PRIMARY KEY,
  request_id TEXT NOT NULL REFERENCES book_requests(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE(request_id, user_id, kind)
);

CREATE TABLE IF NOT EXISTS book_lists (
  id TEXT PRIMARY KEY,
  group_id TEXT NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  author_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS book_list_items (
  id TEXT PRIMARY KEY,
  list_id TEXT NOT NULL REFERENCES book_lists(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  author TEXT,
  isbn TEXT,
  note TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS credit_events (
  id TEXT PRIMARY KEY,
  group_id TEXT NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  delta INTEGER NOT NULL,
  reason TEXT NOT NULL,
  book_id TEXT REFERENCES books(id) ON DELETE SET NULL,
  counterparty_id TEXT REFERENCES users(id),
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS ai_usage (
  day TEXT PRIMARY KEY,
  count INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_books_group ON books(group_id);
CREATE INDEX IF NOT EXISTS idx_password_reset_user ON password_reset_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_password_reset_hash ON password_reset_tokens(token_hash);
CREATE INDEX IF NOT EXISTS idx_memberships_user ON memberships(user_id);
CREATE INDEX IF NOT EXISTS idx_memberships_group ON memberships(group_id);
CREATE INDEX IF NOT EXISTS idx_borrow_book ON borrow_records(book_id);
CREATE INDEX IF NOT EXISTS idx_holdings_book ON holdings(book_id);
CREATE INDEX IF NOT EXISTS idx_ratings_ratee ON ratings(ratee_user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_book_reviews_book ON book_reviews(book_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_book_reviews_unique ON book_reviews(book_id, user_id);
CREATE INDEX IF NOT EXISTS idx_group_messages_group ON group_messages(group_id);
CREATE INDEX IF NOT EXISTS idx_dm_pair ON direct_messages(sender_user_id, recipient_user_id);
CREATE INDEX IF NOT EXISTS idx_dm_recipient ON direct_messages(recipient_user_id);
CREATE INDEX IF NOT EXISTS idx_book_requests_group ON book_requests(group_id);
CREATE INDEX IF NOT EXISTS idx_request_interests_req ON request_interests(request_id);
CREATE INDEX IF NOT EXISTS idx_book_lists_group ON book_lists(group_id);
CREATE INDEX IF NOT EXISTS idx_book_list_items_list ON book_list_items(list_id);
CREATE INDEX IF NOT EXISTS idx_credit_user_group ON credit_events(user_id, group_id);
`;

let schemaPromise: Promise<void> | null = null;

/** Create the schema once per process (idempotent; safe to call on every query). */
export function ensureSchema(): Promise<void> {
  if (process.env.SKIP_DB_INIT === "1") return Promise.resolve();
  if (!schemaPromise) {
    schemaPromise = getPool()
      .query(SCHEMA_SQL)
      .then(() => undefined)
      .catch((err) => {
        // Allow a later retry if the first attempt failed (e.g. transient).
        schemaPromise = null;
        throw err;
      });
  }
  return schemaPromise;
}
