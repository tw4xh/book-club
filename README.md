# 邻里书屋 · Neighbor Book Club

A mobile-first, bilingual (简体中文 / English) web app that lets a community group
share physical books. It's built for Chinese moms in the US sharing Chinese
children's books, but everything is organized around generic **clubs (groups)**,
so any community can use it.

It is an **information board** for books that **flow** from person to person
(pay-it-forward). The site just shares each book's info and shows **who has it now**;
when you receive a book there's **no need to return it** — you read it and pass it
on to the next person who wants it. Members arrange pickup and timing **directly
with each other** (e.g. over WeChat). Nobody stores books or manages lending.

It solves the three problems that made earlier book sharing hard:

- **A shared catalog** — everyone can see what books exist and search/filter them.
- **Location-aware** — every book shows where it is now (its current holder's city,
  by zip code) on a map with an estimated driving time from you and a one-tap
  "Directions" link, so pickup is easy to arrange.
- **No management needed** — members add their own books and choose, per book, how
  to share it:
  - **Pass it on (flow):** read it and pass it to the next person; never returned.
  - **Lend:** the borrower returns it to the owner when done.
    Either way you tap "I have it now" when you receive a book so the next person can
    find it. No due dates and no central inventory.

## Features

- Passwordless login (email + display name), meant for small trusted groups.
- Create or join a club via a shareable invite link (paste it into a WeChat group).
- Add books with almost no typing: scan the back-cover barcode (ISBN) with your
  phone camera, or type the ISBN, and the title, author, cover image, language,
  and category are auto-filled from a free books database (Google Books, with
  Open Library fallback). You can still edit anything or upload your own photo.
- Browse and filter the catalog by text, language, age range, area, and status.
- Location by zip code: each book shows its city, an embedded OpenStreetMap, an
  estimated drive time from your zip, and a "Directions" link to your maps app.
  (Zip lookup and distance use the offline `zipcodes` dataset; the map is OSM's
  keyless embed; drive time is estimated from distance, no API key required.)
- Get a book by contacting whoever has it now: each book shows the current holder's
  contact and a note to arrange pickup directly. Tap "I have it now" to become the
  new holder once you receive it; the holder can mark "being read" / "free to pass
  on". No returns.
- "My Shelf": the books with you now (with a pass-on toggle) and the books you
  originally shared.
- Installable PWA with offline catalog browsing.

## Tech stack

- **Next.js (App Router) + React + TypeScript**
- **Tailwind CSS** (mobile-first)
- **PostgreSQL** via `pg` (Supabase in production; local Docker in dev)
- Lightweight custom **i18n** (zh-CN default, en secondary), cookie-based locale
- Cookie-based **password sessions** (HMAC-signed)
- **PWA**: web manifest + service worker

### Data layer

All data access lives in one repository layer (`src/lib/repo.ts`) on top of a small
Postgres helper (`src/lib/db.ts`). The schema is created automatically on first
query (`ensureSchema`), so there is no separate migration step. Set `DATABASE_URL`
to any Postgres database — a local Docker container in development, Supabase in
production.

## Getting started

You need a Postgres database. The quickest local option is Docker:

```bash
docker run -d --name bookclub-pg \
  -e POSTGRES_USER=bookclub -e POSTGRES_PASSWORD=bookclub -e POSTGRES_DB=bookclub \
  -p 5433:5432 postgres:16
```

Then:

```bash
npm install
cp .env.example .env       # sets DATABASE_URL to the local container above
npm run seed               # optional; creates demo clubs + sample books
npm run dev                # http://localhost:3000
```

The demo club uses invite code **MNMOMS**. After seeding you can log in with, e.g.,
`lily@example.com` and any display name to see the seeded catalog, or create your
own club from the **My Clubs** tab.

## Production build

```bash
npm run build
npm start
```

## Deploying to Supabase + Vercel

### 1. Create the Supabase database

1. Create a project at [supabase.com](https://supabase.com) (free tier is fine).
2. Go to **Project Settings → Database → Connection string** and copy the
   **Transaction** pooler URL (port `6543`). It looks like:
   `postgres://postgres.<ref>:<password>@aws-0-<region>.pooler.supabase.com:6543/postgres`
   The pooler is important for serverless — it avoids exhausting connections.
3. The schema is created automatically on first request, so there is nothing to run
   manually. (Optionally seed demo data locally against the Supabase URL by setting
   `DATABASE_URL` and running `npm run seed`.)

### 2. Deploy to Vercel

1. Push this repo to GitHub and **Import Project** at [vercel.com](https://vercel.com).
   Vercel auto-detects Next.js — no extra build config needed.
2. Add these **Environment Variables** (Project → Settings → Environment Variables):

   | Variable             | Value                                                   |
   | -------------------- | ------------------------------------------------------- |
   | `DATABASE_URL`       | the Supabase **pooler** connection string (port 6543)   |
   | `SESSION_SECRET`     | a long random string — `openssl rand -base64 48`        |
   | `TANSHU_API_KEY`     | (optional) Chinese ISBN metadata fallback               |
   | `AI_CHAT_ENABLED`    | (optional) `true` to enable the Gemini assistant        |
   | `GEMINI_API_KEY`     | (optional) required if `AI_CHAT_ENABLED=true`           |
   | `GEMINI_MODEL`       | (optional) e.g. `gemini-3.1-flash-lite`                 |
   | `GEMINI_DAILY_LIMIT` | (optional) free-tier daily request budget (default 500) |

   `SESSION_SECRET` is **required in production** — the app refuses to start
   sessions without a strong value.

3. Deploy. On the first visit the schema is created and the app is live.

### Note on uploaded covers

Cover images added by URL or fetched from ISBN APIs work anywhere. If you use the
local file-upload path (`public/uploads`), note that Vercel's filesystem is
ephemeral; for durable uploads switch that to Supabase Storage.

### Other hosts

Because it is a standard Next.js + Postgres app, it also runs on any long-running
Node host (Render, Railway, Fly.io, a VM) — just set the same environment variables.

## Project layout

```
src/
  app/
    actions.ts          # server actions (auth, groups, books, borrow lifecycle)
    page.tsx            # catalog (home)
    login/              # passwordless login
    books/new/          # add a book
    books/[id]/         # book detail + borrow/return actions
    shelf/              # "My Shelf"
    groups/             # create / join / switch clubs
    join/[code]/        # accept an invite link
  components/           # TopBar, BottomNav, BookCard, etc.
  lib/
    db.ts               # Postgres pool + schema (Supabase-compatible)
    repo.ts             # all data access (async, group-scoped)
    auth.ts             # signed-cookie sessions + active group
    context.ts          # resolves current user + active club
    i18n.ts             # zh/en dictionaries + translator
    types.ts            # shared types
scripts/seed.ts         # demo data
```
