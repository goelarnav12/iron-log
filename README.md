# Iron Log

A personal gym, cardio and body tracker. Workout logging with routines and a
live rest timer, an exercise library with per-exercise strength history, and
bodyweight/tape-measurement trends.

Vite + React + TypeScript, Supabase for auth and storage, installable as a PWA.
Single user by design — every row is scoped to your account by row level
security.

## Setup

You need Node (`brew install node`) and a free Supabase project.

**1. Create the Supabase project** at [supabase.com](https://supabase.com).

**2. Create the tables.** In the dashboard, open SQL Editor → New Query, and run
these three files in order:

1. `schema.sql` — tables, indexes, RLS policies
2. `migration_001_offline_sync.sql` — adds the `updated_at` / `deleted_at`
   columns the offline sync needs. **Required**: without it every sync fails.
3. `migration_002_counters.sql` — the daily rep-counter tables. Also required:
   the sync pulls every table, so a missing one fails the whole cycle.
4. `seed_exercises.sql` — the ~295 built-in exercises. Skipping this is the
   reason for an empty exercise picker; `schema.sql` only creates the table.

**3. Point the app at it.**

```sh
cp .env.example .env.local
```

Fill in `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` from
Project Settings → API Keys. The publishable key is public by design; row level
security is what protects the data.

**4. Run it.**

```sh
npm install
npm run dev          # http://localhost:5173
```

Sign up with any email and password on first load. If Supabase's email
confirmation is on (Authentication → Providers → Email), you'll need to click
the link before you can sign in — or switch confirmation off, since it's a
single-user app.

## Deploying

```sh
npm run build        # -> dist/
```

Drag `dist/` to Netlify Drop, or point Vercel/Cloudflare Pages at the repo.
Set the same two env vars in the host's dashboard.

Three things the host needs to get right:

- **SPA fallback** — every route must serve `index.html`, or a refresh on
  `/history/abc` 404s.
- **No caching on `/sw.js`** — Vite fingerprints the assets the service worker
  precaches, so a cached worker pins the app to an old build indefinitely.
- **HTTPS** — required for the PWA to install and for the service worker to
  register at all.

`vercel.json` handles the first two. Its contents carry no comments because
`vercel.json` rejects unknown keys, so the reasoning lives here instead. On
another host you need the same two things by its own mechanism; HTTPS is
automatic everywhere.

Then open the deployed URL on your phone and use Add to Home Screen. It runs
full-screen, and because the app is local-first it works with no signal at all —
open it, log a full session, and it uploads when you're back on a network.

## Layout

```
schema.sql            run once — tables, indexes, RLS policies
migration_00N_*.sql   run once after schema, in order
seed_exercises.sql    run once after schema — the built-in exercise library
src/lib/types.ts      the models, and the enum-ish constant lists
src/lib/db.ts         the app's data API — reads and writes IndexedDB only
src/lib/idb.ts        the on-device mirror and the outbox
src/lib/sync.ts       the background push/pull loop and conflict resolution
src/lib/remote.ts     the only file that talks to Supabase; all snake_case
src/lib/stats.ts      pure arithmetic — volume, e1RM, PRs, streaks
src/lib/units.ts      kg/lb, cm/in, km/mi, duration parsing and formatting
src/state/store.tsx   auth + all app data in one context
src/pages/            one file per route
src/components/       shared pieces (modal, stat tile, exercise picker)
```

## How it works

**Units.** Everything is stored in kg, cm, metres and seconds. The kg/lb and
cm/in toggles in Settings are display-only, converted at the edge of the UI in
`units.ts`. Switching units never rewrites a stored number, so you can flip
back and forth freely.

**Local-first.** The app reads and writes IndexedDB, never the network. Every
screen renders from the on-device mirror, so a cold start with no signal shows
your full history and logging never fails. `sync.ts` reconciles with Postgres
in the background — on a 30s timer, on regaining connectivity, and whenever the
tab returns to the foreground.

Writes are queued in an outbox keyed by `<table>:<rowId>`, so editing the same
set five times offline collapses to one pending entry. Ids are generated on the
client (`crypto.randomUUID`), which is what makes a row created offline the
*same* row after it syncs rather than a duplicate.

**Sync order is pull-then-push, and that matters.** A pulled row with a newer
`updatedAt` than the local copy means another device won; the local row is
overwritten and its outbox entry dropped. Pushing first would overwrite the
server with the older value and lose the newer edit. Conflicts resolve
last-write-wins per row.

**Deletes are soft**, via `deleted_at`. A hard delete is invisible to a device
that was offline when it happened — it has nothing to pull, so it would
resurrect the row on its next push. The cost is that cascades must be done by
hand in `db.ts`: Postgres `on delete cascade` never fires, because a delete is
now an UPDATE. Delete a workout and you must tombstone its exercises and sets
yourself.

**The sync indicator** in the header is green when synced, amber with a count
when writes are queued or you're offline, red on error (tap to retry). A write
that fails 6 times stops being retried and turns the dot red rather than
looping forever.

**Completed sets.** A workout in progress is full of unchecked rows. Only
`completed` sets count toward volume, PRs, or any statistic, and warmup sets
are further excluded from volume. Finishing a workout deletes whatever was left
unticked rather than storing a row of nulls.

**Daily counters** (the Daily tab) track a movement you accumulate through the
day rather than train in a session. A day's total is your tapped-in entries
*plus* completed sets of the same exercise from that day's workouts — summed,
but shown split, since a total you can't account for is one you stop trusting.
Entries are stored per set rather than as a daily total, which is what makes
"best single set" possible. The date is the device's LOCAL day: an evening set
would otherwise be filed under tomorrow for anyone east of UTC.

Streaks tolerate today being empty — at 9am you haven't done them yet — and
break only once yesterday is missed. With a goal set, only days reaching it
extend the streak; without one, any non-zero day counts.

**Estimated 1RM.** Epley (`w × (1 + r/30)`), and only for sets of 12 reps or
fewer — above that the formula drifts far enough to be misleading, so those
sets are dropped from the chart rather than plotted.

**Deleting** is always two-step: first click arms the button for four seconds,
second commits. There is no undo anywhere.

## Adding things

- **An exercise** — use "+ New exercise" in the app. Editing `seed_exercises.sql`
  and re-running it is for adding to the shared built-in library; it anti-joins
  on name, so it's safe to re-run.
- **A schema change** — put it in a numbered `migration_NNN_*.sql` and run it by
  hand in the SQL Editor, the way `Poker_ledger` does. `schema.sql` describes
  the current shape for a fresh project; it is not a migration history.
- **A statistic** — `stats.ts`, as a pure function. Components should read it,
  not compute it.
