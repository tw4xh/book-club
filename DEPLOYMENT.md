# Deployment & safe-change workflow

How to change the app **without breaking the live site** once you have real users.

There are two separate things that "change production":

1. **Code** — the app bundle Vercel serves.
2. **Data & schema** — the Postgres (Supabase) database the code reads and writes.

Keep both isolated from production while you test.

---

## The golden rule: never test on `main`

`main` auto-deploys to production. Do all work on a branch and test it on Vercel's
automatic **Preview** deployment. Production only changes when a PR is merged.

```bash
git checkout -b my-change
# ...edit, commit...
git push -u origin my-change          # opens a PR / gets a Preview URL
```

Vercel builds a unique URL per branch (e.g.
`book-club-git-my-change-<you>.vercel.app`). Test there. Merge to `main` only when
it works.

---

## Environments

| Environment    | Runs when                    | Database                        | Who sees it    |
| -------------- | ---------------------------- | ------------------------------- | -------------- |
| **Local**      | `npm run dev` on your laptop | Docker Postgres (`localhost`)   | Just you       |
| **Preview**    | Any branch / PR pushed       | **Staging** Supabase project    | Anyone w/ link |
| **Production** | Merge to `main`              | **Production** Supabase project | Real users     |

The critical part: **Preview must not point at the production database.** A
preview build writing to prod can corrupt real users' data even if the code is
"just a test."

### One-time setup

1. **Local DB** — start Postgres with Docker:

   ```bash
   docker compose up -d
   cp .env.example .env      # DATABASE_URL already points at the local container
   npm run seed              # optional demo data
   npm run dev
   ```

2. **Staging DB** — create a _second_ free Supabase project ("book-club-staging").

3. **Vercel env vars** — set `DATABASE_URL` **per environment**
   (Project → Settings → Environment Variables; each var can have different values
   for Production vs Preview):
   - Production `DATABASE_URL` → real Supabase pooler URL
   - Preview `DATABASE_URL` → staging Supabase pooler URL
   - `SESSION_SECRET` → set for both (can be the same or different)

   > If your Supabase plan supports **Branching**, you can skip the manual staging
   > project: Supabase provisions a throwaway DB per Git branch and feeds the
   > connection string into Vercel Previews automatically. Prefer this if available.

---

## Recommended loop for every change

1. Branch off `main`.
2. Build locally against the Docker DB (`npm run dev`), verify by hand.
3. Push the branch → open a PR.
4. **CI** (`.github/workflows/ci.yml`) runs type check + format + build. It must be green.
5. Open the **Vercel Preview URL** and test the real flow against the staging DB.
6. Merge the PR → production deploys.
7. Smoke-test production. If something's wrong, **roll back** (below).

Protect `main` on GitHub so this can't be skipped:
Settings → Branches → add a rule for `main` → _Require a pull request_ and
_Require status checks to pass_ (select the `verify` CI job).

---

## Rolling back a bad production deploy

Code rolls back instantly, data does not.

- **Code:** Vercel → Deployments → pick the last good one → **Promote to
  Production**. No rebuild needed.
- **Data:** a rollback of code does **not** undo database writes. This is why
  schema changes must be backward-compatible (next section) and why destructive
  data changes should be done deliberately, ideally after a Supabase backup.

---

## Database schema changes (important)

This app has **no separate migration step**. `ensureSchema()` in `src/lib/db.ts`
runs on first request after a deploy and applies the schema with
`CREATE TABLE IF NOT EXISTS` / `ALTER TABLE ... ADD COLUMN IF NOT EXISTS`. That
means schema changes ship _with_ the code and auto-apply.

This is safe **only for additive, backward-compatible changes** — adding a new
table or a new nullable/defaulted column. During a deploy, old and new code briefly
run at the same time against the same DB, and additive changes don't break the old
code.

**Safe (do freely):**

- Add a new table.
- Add a new column that is nullable or has a `DEFAULT`.

**Dangerous (never do in a single release):**

- Dropping or renaming a column/table.
- Changing a column's type.
- Adding a `NOT NULL` column without a default to a table that already has rows.

For a rename/drop/retype, split it across **two deploys**:

1. Deploy A: add the new column, start writing to both old and new, backfill data.
2. Deploy B (after A is fully live): stop reading the old column.
3. Deploy C (later, optional): drop the old column.

Always take a Supabase backup before any destructive change.

---

## Quick reference

```bash
# Local database
docker compose up -d          # start
docker compose down           # stop (keep data)
docker compose down -v        # stop and wipe data

# Before pushing (mirrors CI)
npx tsc --noEmit
npx prettier --check .
SKIP_DB_INIT=1 npm run build

# Ship
git checkout -b my-change && git push -u origin my-change   # -> Preview URL + PR
# merge PR -> production
```
