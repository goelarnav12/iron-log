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

**2. Create the tables.** In the dashboard, open SQL Editor → New Query, paste
all of `schema.sql`, Run. **Then do the same with `seed_exercises.sql`** — that
one fills in the ~295 built-in exercises. Skipping it is the reason for an empty
exercise picker; `schema.sql` only creates the table, it doesn't populate it.

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

`vercel.json` covers both of the requirements below for Vercel. It does two
things, and neither is expressible as a comment because `vercel.json` rejects
unknown keys:

- The `rewrites` rule serves `index.html` for every path, so a hard load of
  `/history/<id>` reaches React Router instead of 404ing. Vercel applies
  rewrites only *after* the filesystem check, so real files (`/assets/*`,
  `/sw.js`, `/manifest.webmanifest`) are served normally.
- The `sw.js` header disables caching on the service worker. Vite fingerprints
  the assets the worker precaches, so a cached `sw.js` would pin the app to an
  old build indefinitely.

On another host you need the same two things by its own mechanism.

Two things the host needs to get right:

- **SPA fallback** — every route must serve `index.html`, or a refresh on
  `/history/abc` 404s. Netlify and Vercel do this automatically for Vite
  projects; on a bare static host you may need a rewrite rule.
- **HTTPS** — required for the PWA to install and for the service worker to
  register at all.

Then open the deployed URL on your phone and use Add to Home Screen. It runs
full-screen and the app shell is cached, so it opens instantly. Logging still
needs a connection: writes go straight to Postgres and are not queued offline.

## Layout

```
schema.sql            run once — tables, indexes, RLS policies
seed_exercises.sql    run once after schema — the built-in exercise library
src/lib/types.ts      the models, and the enum-ish constant lists
src/lib/db.ts         every Supabase call, and every snake_case translation
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

**Data flow.** No client cache and no optimistic updates: every mutation hits
Postgres, then the affected slice is refetched. One person's training history
is small enough that the extra round trip is free, and it means the screen is
never showing something the database disagrees with. The exception is the live
workout screen, where set inputs live in local state and flush on blur — see
the comment at the top of `LiveWorkout.tsx`.

**Completed sets.** A workout in progress is full of unchecked rows. Only
`completed` sets count toward volume, PRs, or any statistic, and warmup sets
are further excluded from volume. Finishing a workout deletes whatever was left
unticked rather than storing a row of nulls.

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
