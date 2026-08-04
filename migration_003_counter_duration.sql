-- Migration 003 — time-based daily counters.
-- Run once by hand in the Supabase SQL Editor, after migration_002.
-- Safe to re-run.
--
-- Some things you accumulate through the day are held, not repped: a plank, a
-- dead hang, a wall sit. Those exercises are already `tracking_type =
-- 'duration'` in the library, so a counter on one of them counts SECONDS.
--
-- Modelled the same way `sets` already models it — reps and duration_s side by
-- side, exactly one of them filled — rather than overloading `reps` to mean
-- seconds. A column whose units depend on a join is a column that eventually
-- gets read wrong.

-- reps stops being mandatory: a held set has no rep count.
alter table counter_entries alter column reps drop not null;

-- Seconds, matching the s-everywhere rule the rest of the schema follows.
alter table counter_entries add column if not exists duration_s int;

-- The original inline `check (reps > 0)` still stands and still does the right
-- thing — a null reps makes it unknown, not false, so it passes.
do $$
begin
  alter table counter_entries drop constraint if exists counter_entries_duration_s_check;
  alter table counter_entries add  constraint counter_entries_duration_s_check
    check (duration_s is null or duration_s > 0);

  -- Exactly one, never both and never neither. Without this an entry could be
  -- silently uncounted (both null) or counted twice under two units.
  alter table counter_entries drop constraint if exists counter_entries_amount_check;
  alter table counter_entries add  constraint counter_entries_amount_check
    check (num_nonnulls(reps, duration_s) = 1);
end $$;

-- counters.daily_goal needs no change: it's a positive int either way, read as
-- reps/day for a repped exercise and seconds/day for a held one. Which it is
-- comes from the exercise, so a goal can never disagree with its entries.
comment on column counters.daily_goal is
  'Per-day target. Reps for a repped exercise, seconds for a duration-tracked one.';

-- Sanity check — run separately. Every existing row should land in `reps`, and
-- `mixed` must be 0:
--   select count(*) filter (where reps is not null)       as repped,
--          count(*) filter (where duration_s is not null) as held,
--          count(*) filter (where num_nonnulls(reps, duration_s) <> 1) as mixed
--   from counter_entries;
