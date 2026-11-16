# Health_tracker (Iron Log)

Read `README.md` first — it covers setup, deploy, and the design decisions.
What matters when editing:

- **Units.** kg / cm / m / s in storage, always. The kg-lb and cm-in toggles are
  display-only and convert at the UI edge via `src/lib/units.ts`. Never persist a
  converted number.
- **The app is local-first.** `src/lib/db.ts` is the data API and touches only
  IndexedDB (`src/lib/idb.ts`) — no screen ever awaits the network. `sync.ts`
  reconciles in the background, `src/lib/remote.ts` turns rows into wire
  records, and `src/lib/backend.ts` is the ONLY file that touches the network.
- **The backend is this app's own Cloudflare Worker + D1** (`worker/`), copied
  from Tally's and deliberately NOT shared with it. A generic sync store: one
  `records` table, each row's full camelCase JSON as `payload`. No foreign keys,
  no check constraints, no server-side validation — `db.ts` is the only place
  invariants are enforced. Gated by one sync password (PBKDF2 in `auth.ts`).
  Pushes go up in slices of 40 rows (`PUSH_CHUNK`) because the Workers free plan
  caps D1 queries per request.
- **Sync is pull-then-push**, resolving last-write-wins on `updatedAt`. Don't
  reorder it: pushing first would overwrite a newer remote edit with a stale
  local one.
- **Deletes are soft** (`deletedAt` tombstones) and cascades are MANUAL. The
  Worker has no cascades at all; it doesn't know which rows belong together.
  Deleting a parent without tombstoning its children leaves orphans that sync forever.
- **Recharts: one plain `<Bar>` per series.** Per-datum `<Cell>` children
  collapse the series into a single rectangle, and two Bars sharing a `stackId`
  rendered at roughly a fifteenth of true height. Both were observed on real
  data in this app; if you need per-bar colour, verify it renders before
  trusting it.
- **Client generates ids** (`crypto.randomUUID`). That's what makes a row created
  offline the same row after it syncs instead of a duplicate.
- **`src/lib/stats.ts` is pure** — no DOM, no network, no app state. All arithmetic
  (volume, Epley e1RM, PRs, streaks, overload suggestions, strength standards)
  lives there so it stays testable. It is also **unit-agnostic**: it deals in kg
  and returns numbers, never formatted strings with a unit in them.
  `overloadSuggestion`'s `reason` deliberately carries no weights for exactly
  that reason — the caller renders `weightKg` through `units.ts` like any other
  load. Don't put "kg" in a string in this file.

- **Prefill is an offer, not a write.** A blank set in `LiveWorkout` seeds its
  inputs from the previous session and renders them dimmed (`.suggested`).
  Nothing reaches IndexedDB until the row is ticked or typed in — that is what
  makes it safe to prefill a set that may never be done, and why `finishWorkout`
  can still drop unticked rows without inventing history. The `suggested` flag
  clears on focus (`claim`) and on tick.

- **`overloadSuggestion` infers its rep target from your own history**, over a
  window that includes the session being judged. On a first session that means
  3,3,2 reads as triples rather than a failed set of five — correct, since
  there's no target to have missed yet, and it self-corrects once a second
  session exists. Don't "fix" it by hardcoding a rep range.

- **Strength standards are male thresholds** (`STRENGTH_STANDARDS`), stated as
  such in the UI because the app has no sex on file and the numbers differ by
  it. Keyed by built-in exercise NAME, so renaming a seeded exercise silently
  drops its standard. Only the barbell lifts with a settled consensus are
  listed — a standard for a cable fly would be invention.
- **Only `completed` sets count** toward any statistic; warmups are additionally
  excluded from volume. `finishWorkout()` deletes unticked rows rather than
  storing nulls.
- **Exercise order is editable, live and after the fact** (`moveWorkoutExercise`).
  It rewrites every sibling's position from the sorted order rather than swapping
  two numbers, because a removed exercise leaves a gap that makes the next swap
  ambiguous. Timestamps edited through the UI carry MINUTE precision — a
  `datetime-local` has no seconds field — so the editor compares the *rendered*
  values and skips the write when nothing changed, rather than silently
  truncating a start time you only looked at.
- **No client cache, no optimistic updates.** Mutate, then refetch via the
  `refresh*` functions on the store. The exceptions are `LiveWorkout.tsx` and
  `WorkoutDetail.tsx`'s edit mode, where set inputs (and, in the editor, the
  name/notes/timestamps) are local state flushed on blur.
- **Editing a finished workout is not a draft.** `WorkoutDetail`'s edit mode
  writes through on every blur, so "Done" only hides the inputs — unlike
  `RoutineEditor`, which builds a draft and saves once. That is deliberate: the
  stats and PR badges on the same screen re-derive as you type. Sets added there
  are seeded `completed: true`, because a finished workout has no tick left to
  press and an unticked row counts toward nothing.
- **Navigation is `src/nav.ts`**: four sections (Today, Train, Progress, You),
  each a list of path prefixes. URLs stay flat (`/history`, not
  `/progress/history`) so old links and bookmarks still resolve; moving a page
  to another section means editing `nav.ts`, not its route.
- **Every colour is a token** at the top of `index.css`, translucent tints
  included. Never put a hex or `rgba()` in a component; a Recharts prop takes
  `var(--…)` like anything else. The tokens are set per theme
  (`[data-theme="…"]`, chosen under You, listed in `src/theme.ts`), so a
  hardcoded colour is wrong on five of six themes. Use `--accent` for fills
  and `--accent-text` for the accent as text or a thin line: on Crimson and
  Ultraviolet the fill is too dark to read on the ground. Adding a token means
  adding it to every theme block, or set a shared default in the first `:root`.
- **`userId` means "custom", not "who".** Built-in exercises have `userId: null`;
  everything you create is stamped `OWNER_ID` (`'owner'`, in `db.ts`). The UI
  reads it as a boolean. Don't compare it to anything.
- **No server schema to migrate.** A new field goes in `types.ts` and `db.ts`;
  rows written before it lack the key, so read it with a default.
