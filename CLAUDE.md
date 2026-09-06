# Health_tracker (Iron Log)

Read `README.md` first — it covers setup, deploy, and the design decisions.
What matters when editing:

- **Units.** kg / cm / m / s in Postgres, always. The kg-lb and cm-in toggles are
  display-only and convert at the UI edge via `src/lib/units.ts`. Never persist a
  converted number.
- **The app is local-first.** `src/lib/db.ts` is the data API and touches only
  IndexedDB (`src/lib/idb.ts`) — no screen ever awaits the network. `sync.ts`
  reconciles with Postgres in the background, and `src/lib/remote.ts` is the
  ONLY file that talks to Supabase and the only place camelCase↔snake_case
  translation happens. A component should never see `weight_kg`.
- **Sync is pull-then-push**, resolving last-write-wins on `updatedAt`. Don't
  reorder it: pushing first would overwrite a newer remote edit with a stale
  local one.
- **Deletes are soft** (`deletedAt` tombstones) and cascades are MANUAL. Postgres
  `on delete cascade` never fires now, because a delete is an UPDATE. Deleting a
  parent without tombstoning its children leaves orphans that sync forever.
- **Recharts: one plain `<Bar>` per series.** Per-datum `<Cell>` children
  collapse the series into a single rectangle, and two Bars sharing a `stackId`
  rendered at roughly a fifteenth of true height. Both were observed on real
  data in this app; if you need per-bar colour, verify it renders before
  trusting it.
- **Client generates ids** (`crypto.randomUUID`). That's what makes a row created
  offline the same row after it syncs instead of a duplicate. Never let Postgres
  default the id.
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
- Built-in exercises are the rows with `user_id IS NULL`: world-readable, and no
  RLS write policy matches them. Custom exercises carry your uid.
- `schema.sql` describes the current shape for a fresh project. Changes to a live
  project go in a numbered `migration_NNN_*.sql`, run by hand, same as
  Poker_ledger.
