# Health_tracker (Iron Log)

Read `README.md` first — it covers setup, deploy, and the design decisions.
What matters when editing:

- **Units.** kg / cm / m / s in Postgres, always. The kg-lb and cm-in toggles are
  display-only and convert at the UI edge via `src/lib/units.ts`. Never persist a
  converted number.
- **`src/lib/db.ts` is the only file that talks to Supabase** and the only place
  camelCase↔snake_case translation happens. A component should never see
  `weight_kg`.
- **`src/lib/stats.ts` is pure** — no DOM, no network, no app state. All arithmetic
  (volume, Epley e1RM, PRs, streaks) lives there so it stays testable.
- **Only `completed` sets count** toward any statistic; warmups are additionally
  excluded from volume. `finishWorkout()` deletes unticked rows rather than
  storing nulls.
- **No client cache, no optimistic updates.** Mutate, then refetch via the
  `refresh*` functions on the store. The exception is `LiveWorkout.tsx`, where set
  inputs are local state flushed on blur.
- Built-in exercises are the rows with `user_id IS NULL`: world-readable, and no
  RLS write policy matches them. Custom exercises carry your uid.
- `schema.sql` describes the current shape for a fresh project. Changes to a live
  project go in a numbered `migration_NNN_*.sql`, run by hand, same as
  Poker_ledger.
