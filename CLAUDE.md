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
