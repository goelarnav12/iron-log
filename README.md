# Iron Log

A personal gym, cardio and body tracker. Workout logging with routines and a
live rest timer, an exercise library with per-exercise strength history, and
bodyweight/tape-measurement trends. Exercises reorder mid-session, and a
finished workout stays editable — its clock, name, notes, sets and exercise
list — from its page in History.

Vite + React + TypeScript, installable as a PWA. Data lives on the device
(IndexedDB) and syncs to this app's own Cloudflare Worker + D1 database, gated
by a single sync password. Single user by design: one Worker, one log.

## Setup

You need Node (`brew install node`) and a free Cloudflare account.

**1. The Worker** (`worker/`, the sync API — a copy of Tally's, with its own
database):

```sh
cd worker
npm install
npx wrangler login
npx wrangler d1 create iron-log          # put the id in wrangler.toml
npm run db:remote                        # applies worker/schema.sql
npm run deploy                           # prints the Worker URL
```

Add the app's production URL to `ALLOWED_ORIGINS` in `wrangler.toml` (exact
origins only, no wildcards) and deploy again.

**2. Point the app at it.**

```sh
cp .env.example .env.local               # set VITE_API_URL to the Worker URL
npm install
npm run dev                              # http://localhost:5173
```

The first load asks you to **set a sync password**, which creates the log;
every later device asks for that password. There is no email and no reset
link. A forgotten password means deleting the `sync_meta` row with
`wrangler d1 execute`, which keeps the data and lets you set a new one.

The built-in exercise library lives in the database like any other row. A
brand-new store starts with an empty library; custom exercises work as normal.

## Deploying

```sh
npm run build        # -> dist/
```

Drag `dist/` to Netlify Drop, or point Vercel/Cloudflare Pages at the repo.
Set `VITE_API_URL` in the host's dashboard, and add the deployed origin to
the Worker's `ALLOWED_ORIGINS`.

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
worker/               the sync API: Cloudflare Worker + D1, one generic table
src/lib/types.ts      the models, and the enum-ish constant lists
src/lib/db.ts         the app's data API — reads and writes IndexedDB only
src/lib/idb.ts        the on-device mirror and the outbox
src/lib/sync.ts       the background push/pull loop and conflict resolution
src/lib/remote.ts     rows <-> wire records (JSON payloads)
src/lib/backend.ts    the only file that touches the network; sync password
src/lib/auth.ts       sync password -> PBKDF2 token
src/lib/stats.ts      pure arithmetic — volume, e1RM, PRs, streaks
src/lib/units.ts      kg/lb, cm/in, km/mi, duration parsing and formatting
src/state/store.tsx   sign-in state + all app data in one context
src/nav.ts            the four sections and which pages live under each
src/pages/            one file per route
src/components/       shared pieces (modal, stat tile, icons, exercise picker)
```

## Screens

Four sections, as a tab bar on a phone and a sidebar on desktop:

- **Today** — the home screen. What to do next (resume the running workout, or
  the routine you've done least recently), this week against your weekly
  target, days since each muscle group was trained, the daily counters with a
  one-tap add, PRs from the last two weeks, and the bodyweight trend.
  **Daily** (the full counter screen) sits under it.
- **Train** — start an empty workout or a routine, log cardio, and manage
  routines. The live workout opens full-screen at `/workout`.
- **Progress** — History, Exercises, Body, Cardio and Trends (weekly volume,
  sets per muscle, the consistency heatmap).
- **You** — theme, weekly target, units, rest timer, sync and sign-out.

URLs are flat (`/history`, not `/progress/history`), so links from before the
redesign still resolve. The layout is "Plate": Barlow Condensed for headings
and numbers, square controls. Colours are a theme picked under You — Volt
(graphite and lime, the default), Plate, Cobalt, Crimson, Mint and
Ultraviolet, all dark. Each is one `[data-theme]` block of tokens at the top of
`index.css`; `src/theme.ts` lists them and saves the choice on the device.

## How it works

**Units.** Everything is stored in kg, cm, metres and seconds. The kg/lb and
cm/in toggles under You are display-only, converted at the edge of the UI in
`units.ts`. Switching units never rewrites a stored number, so you can flip
back and forth freely.

**Local-first.** The app reads and writes IndexedDB, never the network. Every
screen renders from the on-device mirror, so a cold start with no signal shows
your full history and logging never fails. `sync.ts` reconciles with the Worker
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

**Deletes are soft**, via `deletedAt`. A hard delete is invisible to a device
that was offline when it happened — it has nothing to pull, so it would
resurrect the row on its next push. The cost is that cascades must be done by
hand in `db.ts`: the Worker stores opaque rows and knows nothing about which
belong to which. Delete a workout and you must tombstone its exercises and sets
yourself.

**The sync indicator** in the header is green when synced, amber with a count
when writes are queued or you're offline, red on error (tap to retry). A write
that fails 6 times stops being retried and turns the dot red rather than
looping forever.

**Completed sets.** A workout in progress is full of unchecked rows. Only
`completed` sets count toward volume, PRs, or any statistic, and warmup sets
are further excluded from volume. Finishing a workout deletes whatever was left
unticked rather than storing a row of nulls.

**Daily counters** (Today › Daily) track a movement you accumulate through the
day rather than train in a session. A day's total is your tapped-in entries
*plus* completed sets of the same exercise from that day's workouts — summed,
but shown split, since a total you can't account for is one you stop trusting.
Entries are stored per set rather than as a daily total, which is what makes
"best single set" possible. The date is the device's LOCAL day: an evening set
would otherwise be filed under tomorrow for anyone east of UTC.

A counter on a **duration-tracked exercise counts seconds, not reps** — you
hold a plank, you don't rep it. The unit is read off the exercise's
`trackingType` every time rather than stored on the counter, so it can't
disagree with the library, and the entry lands in `reps` or `duration_s`
accordingly (exactly one; nothing on the server checks it, so `db.ts` must). The card then swaps
its quick-add chips for times, adds a stopwatch, and reads its goal, stats,
axis and tooltip as `m:ss`.

Streaks tolerate today being empty — at 9am you haven't done them yet — and
break only once yesterday is missed. With a goal set, only days reaching it
extend the streak; without one, any non-zero day counts.

**Estimated 1RM.** Epley (`w × (1 + r/30)`), and only for sets of 12 reps or
fewer — above that the formula drifts far enough to be misleading, so those
sets are dropped from the chart rather than plotted.

**Sets prefill from last time.** A blank set is filled in with whatever you did
in that slot the session before, shown dimmed. Nothing is written until you
tick the set or type in it, so a suggestion never becomes a logged set by
accident — but repeating last week is one tap on the tick, which is the whole
point. The Previous column still shows what it was after you start typing.

**What to put on the bar.** Each loaded exercise carries a one-line suggestion:
hit your target reps on every working set and it says add weight, miss badly on
all of them and it says drop some, anything between says hold. The target rep
count is **inferred from your own history** — whatever you do most often on
that lift — so a 5×5 programme is held to 5 and a hypertrophy block to 10 with
nothing to configure. It is a prompt, not a prescription: nothing is prefilled
from it and ignoring it costs you nothing.

**Strength standards.** On the six main barbell lifts, your best estimated 1RM
is shown as a multiple of your bodyweight and placed on the
Beginner → Elite scale, with how much more you need for the next level. It
appears only when there's a standard for that lift, a bodyweight on file, and
an e1RM to compare — any one missing shows nothing rather than a zero. The
thresholds are **male** figures and the card says so, because the app has no
sex on file and these differ by it.

**Deleting** is always two-step: first click arms the button for four seconds,
second commits. There is no undo anywhere.

## Adding things

- **An exercise** — use "+ New exercise" in the app.
- **A field** — add it to the type in `types.ts` and write it in `db.ts`. The
  Worker stores whole rows as JSON, so there is no server schema to migrate;
  old rows simply lack the key, so read it with a default (`?? null`).
- **A statistic** — `stats.ts`, as a pure function. Components should read it,
  not compute it.
