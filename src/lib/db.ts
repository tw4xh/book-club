import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";

/**
 * Local SQLite data layer.
 *
 * The product plan targets Supabase (managed Postgres + Auth + Storage). To keep
 * this app runnable with zero cloud setup, we implement the identical data model
 * here in SQLite behind a small repository layer (see repo.ts). Swapping to
 * Supabase/Postgres later only requires reimplementing repo.ts against that API;
 * the rest of the app is unaffected.
 */

const DB_FILE = process.env.DATABASE_FILE || "data/book-club.db";
const INITIAL_CREDITS_FOR_MIGRATION = 3;

let db: Database.Database | null = null;

function initSchema(database: Database.Database) {
  database.pragma("journal_mode = WAL");
  database.pragma("foreign_keys = ON");

  database.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id TEXT PRIMARY KEY,
      applied_at TEXT NOT NULL
    );

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

    -- Every time a book changes hands we open a "holding" row for the new holder
    -- and close the previous one. This is the book's flow / borrow history.
    CREATE TABLE IF NOT EXISTS holdings (
      id TEXT PRIMARY KEY,
      book_id TEXT NOT NULL REFERENCES books(id) ON DELETE CASCADE,
      holder_user_id TEXT NOT NULL REFERENCES users(id),
      started_at TEXT NOT NULL,
      ended_at TEXT,
      ended_reason TEXT
    );

    -- After a borrow completes, the owner can rate how the borrower treated the
    -- book. One rating per holding builds each member's "credit".
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

    -- In-app notifications, e.g. when a club owner updates the policy.
    CREATE TABLE IF NOT EXISTS notifications (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      group_id TEXT REFERENCES groups(id) ON DELETE CASCADE,
      type TEXT NOT NULL,
      body TEXT,
      read_at TEXT,
      created_at TEXT NOT NULL
    );

    -- Reviews of a book's content (separate from rating a borrower's care).
    CREATE TABLE IF NOT EXISTS book_reviews (
      id TEXT PRIMARY KEY,
      book_id TEXT NOT NULL REFERENCES books(id) ON DELETE CASCADE,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      stars INTEGER,
      comment TEXT,
      created_at TEXT NOT NULL
    );

    -- Whole-club group chat.
    CREATE TABLE IF NOT EXISTS group_messages (
      id TEXT PRIMARY KEY,
      group_id TEXT NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      body TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    -- 1:1 direct messages between members.
    CREATE TABLE IF NOT EXISTS direct_messages (
      id TEXT PRIMARY KEY,
      sender_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      recipient_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      body TEXT NOT NULL,
      read_at TEXT,
      created_at TEXT NOT NULL
    );

    -- "I want this book" requests members can rally around.
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

    -- A member's interest in a request: "also want" or "I'll buy it".
    CREATE TABLE IF NOT EXISTS request_interests (
      id TEXT PRIMARY KEY,
      request_id TEXT NOT NULL REFERENCES book_requests(id) ON DELETE CASCADE,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      kind TEXT NOT NULL,
      created_at TEXT NOT NULL,
      UNIQUE(request_id, user_id, kind)
    );

    -- Recommended reading lists curated by members.
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

    -- Append-only credit ledger ("lend to borrow"). A member's balance is the
    -- sum of their deltas. Credits are conserved: every +1 (someone borrows your
    -- book) is matched by a -1 (the borrower pays), so no closed group of
    -- colluding accounts can mint net credit by trading books among themselves.
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
    CREATE INDEX IF NOT EXISTS idx_group_messages_group ON group_messages(group_id);
    CREATE INDEX IF NOT EXISTS idx_dm_pair ON direct_messages(sender_user_id, recipient_user_id);
    CREATE INDEX IF NOT EXISTS idx_dm_recipient ON direct_messages(recipient_user_id);
    CREATE INDEX IF NOT EXISTS idx_book_requests_group ON book_requests(group_id);
    CREATE INDEX IF NOT EXISTS idx_request_interests_req ON request_interests(request_id);
    CREATE INDEX IF NOT EXISTS idx_book_lists_group ON book_lists(group_id);
    CREATE INDEX IF NOT EXISTS idx_book_list_items_list ON book_list_items(list_id);
    CREATE INDEX IF NOT EXISTS idx_credit_user_group ON credit_events(user_id, group_id);
  `);

  runMigrations(database);
}

type Migration = {
  id: string;
  up: (database: Database.Database) => void;
};

const migrations: Migration[] = [
  {
    id: "001_user_book_profile_columns",
    up(database) {
      addColumnIfMissing(database, "users", "home_zip", "TEXT");
      addColumnIfMissing(
        database,
        "users",
        "contactable",
        "INTEGER NOT NULL DEFAULT 1"
      );
      addColumnIfMissing(database, "books", "location_zip", "TEXT");
      addColumnIfMissing(database, "books", "isbn", "TEXT");
      addColumnIfMissing(
        database,
        "books",
        "share_mode",
        "TEXT NOT NULL DEFAULT 'flow'"
      );
    },
  },
  {
    id: "002_trust_policy_and_notifications",
    up(database) {
      addColumnIfMissing(database, "books", "deposit", "TEXT");
      addColumnIfMissing(database, "groups", "policy", "TEXT");
      addColumnIfMissing(database, "memberships", "policy_accepted_at", "TEXT");
      database.exec(`
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

        CREATE INDEX IF NOT EXISTS idx_holdings_book ON holdings(book_id);
        CREATE INDEX IF NOT EXISTS idx_ratings_ratee ON ratings(ratee_user_id);
        CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id);
      `);
    },
  },
  {
    id: "003_community_features",
    up(database) {
      database.exec(`
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

        CREATE INDEX IF NOT EXISTS idx_book_reviews_book ON book_reviews(book_id);
        CREATE INDEX IF NOT EXISTS idx_group_messages_group ON group_messages(group_id);
        CREATE INDEX IF NOT EXISTS idx_dm_pair ON direct_messages(sender_user_id, recipient_user_id);
        CREATE INDEX IF NOT EXISTS idx_dm_recipient ON direct_messages(recipient_user_id);
        CREATE INDEX IF NOT EXISTS idx_book_requests_group ON book_requests(group_id);
        CREATE INDEX IF NOT EXISTS idx_request_interests_req ON request_interests(request_id);
        CREATE INDEX IF NOT EXISTS idx_book_lists_group ON book_lists(group_id);
        CREATE INDEX IF NOT EXISTS idx_book_list_items_list ON book_list_items(list_id);
      `);
    },
  },
  {
    id: "004_credit_ledger_and_initial_credits",
    up(database) {
      database.exec(`
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

        CREATE INDEX IF NOT EXISTS idx_credit_user_group ON credit_events(user_id, group_id);
      `);

      database
        .prepare(
          `INSERT INTO credit_events (
             id, group_id, user_id, delta, reason, book_id, counterparty_id, created_at
           )
           SELECT
             lower(hex(randomblob(16))),
             m.group_id,
             m.user_id,
             ?,
             'starter',
             NULL,
             NULL,
             datetime('now')
           FROM memberships m
           WHERE NOT EXISTS (
             SELECT 1
             FROM credit_events c
             WHERE c.group_id = m.group_id
               AND c.user_id = m.user_id
               AND c.reason = 'starter'
           )`
        )
        .run(INITIAL_CREDITS_FOR_MIGRATION);
    },
  },
  {
    id: "005_anonymous_unique_book_reviews",
    up(database) {
      // Older databases may have multiple reviews from the same user on one book.
      // Keep the newest row so the unique index can be created safely.
      database.exec(`
        DELETE FROM book_reviews
        WHERE rowid NOT IN (
          SELECT MAX(rowid)
          FROM book_reviews
          GROUP BY book_id, user_id
        );

        CREATE UNIQUE INDEX IF NOT EXISTS idx_book_reviews_unique
          ON book_reviews(book_id, user_id);
      `);
    },
  },
  {
    id: "006_payment_handles",
    up(database) {
      addColumnIfMissing(database, "users", "pay_paypal", "TEXT");
      addColumnIfMissing(database, "users", "pay_venmo", "TEXT");
      addColumnIfMissing(database, "users", "pay_wechat", "TEXT");
    },
  },
  {
    id: "007_user_password_hash",
    up(database) {
      addColumnIfMissing(database, "users", "password_hash", "TEXT");
    },
  },
  {
    id: "008_password_reset_tokens",
    up(database) {
      database.exec(`
        CREATE TABLE IF NOT EXISTS password_reset_tokens (
          id TEXT PRIMARY KEY,
          user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          token_hash TEXT NOT NULL UNIQUE,
          expires_at TEXT NOT NULL,
          used_at TEXT,
          created_at TEXT NOT NULL
        );

        CREATE INDEX IF NOT EXISTS idx_password_reset_user ON password_reset_tokens(user_id);
        CREATE INDEX IF NOT EXISTS idx_password_reset_hash ON password_reset_tokens(token_hash);
      `);
    },
  },
  {
    id: "009_lend_book_visibility",
    up(database) {
      addColumnIfMissing(
        database,
        "books",
        "visible_to_others",
        "INTEGER NOT NULL DEFAULT 1"
      );
    },
  },
];

function runMigrations(database: Database.Database) {
  const applied = new Set(
    (
      database.prepare("SELECT id FROM schema_migrations").all() as { id: string }[]
    ).map((row) => row.id)
  );

  const apply = database.transaction((migration: Migration) => {
    migration.up(database);
    database
      .prepare("INSERT OR IGNORE INTO schema_migrations (id, applied_at) VALUES (?, ?)")
      .run(migration.id, new Date().toISOString());
  });

  for (const migration of migrations) {
    if (!applied.has(migration.id)) {
      apply(migration);
    }
  }
}

function addColumnIfMissing(
  database: Database.Database,
  table: string,
  column: string,
  type: string
) {
  const cols = database.prepare(`PRAGMA table_info(${table})`).all() as {
    name: string;
  }[];
  if (!cols.some((c) => c.name === column)) {
    database.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${type}`);
  }
}

export function getDb(): Database.Database {
  if (db) return db;

  const absPath = path.isAbsolute(DB_FILE)
    ? DB_FILE
    : path.join(process.cwd(), DB_FILE);
  fs.mkdirSync(path.dirname(absPath), { recursive: true });

  db = new Database(absPath);
  initSchema(db);
  return db;
}
