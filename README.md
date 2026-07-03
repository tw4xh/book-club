# 邻里书屋 · Neighbor Bookshelf

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
- **SQLite** via `better-sqlite3` for local persistence
- Lightweight custom **i18n** (zh-CN default, en secondary), cookie-based locale
- Cookie-based **passwordless sessions** (HMAC-signed)
- **PWA**: web manifest + service worker

### Note on the data layer (Supabase)

The product plan targets **Supabase** (managed Postgres + Auth + Storage). To keep
this runnable with zero cloud setup, the same data model and group-scoped access
are implemented locally in SQLite behind a small repository layer
(`src/lib/repo.ts`). Moving to Supabase/Postgres in production means reimplementing
that one file against the Supabase client (and swapping cover uploads from the local
`public/uploads` folder to Supabase Storage); the UI and flows stay the same.

## Getting started

```bash
npm install
cp .env.example .env       # optional; set SESSION_SECRET for stable sessions
npm run seed               # optional; creates a demo club + sample books
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

## Deploying

This local build uses SQLite and writes uploaded covers to `public/uploads`, which
works on a single long-running server (e.g. a small VM, Render, Railway, Fly.io).

For **Vercel** (serverless), the filesystem is read-only and ephemeral, so move the
data layer to Supabase/Postgres and cover storage to Supabase Storage (see the note
above) before deploying there.

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
    db.ts               # SQLite connection + schema
    repo.ts             # all data access (swap this for Supabase later)
    auth.ts             # signed-cookie sessions + active group
    context.ts          # resolves current user + active club
    i18n.ts             # zh/en dictionaries + translator
    types.ts            # shared types
scripts/seed.ts         # demo data
```
