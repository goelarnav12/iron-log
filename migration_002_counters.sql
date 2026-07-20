-- Migration 002 — daily rep counters.
-- Run once by hand in the Supabase SQL Editor, after migration_001.
-- Safe to re-run.
--
-- Tracks a movement you accumulate through the day (push-ups, pull-ups) rather
-- than one you do in a gym session. Two tables:
--
--   counters          what you're tracking, one row per exercise
--   counter_entries   one row per set you knock out — NOT a daily total
--
-- Entries are per-set on purpose: a day's total is a sum, but "best single
-- set" can only exist if the individual sets are kept.

create table if not exists counters (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) default auth.uid(),
  -- Links to the exercise library rather than storing a name, so the daily
  -- total can pull matching sets out of workouts by id instead of by string.
  exercise_id uuid not null references exercises(id) on delete restrict,
  -- Reps per day you're aiming for. Null means "any amount counts" — the
  -- streak then just needs a non-zero day.
  daily_goal int check (daily_goal is null or daily_goal > 0),
  position int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

-- One counter per exercise per user; tombstones excluded so deleting and
-- re-adding push-ups works.
create unique index if not exists counters_user_exercise_idx
  on counters (user_id, exercise_id) where deleted_at is null;
create index if not exists counters_updated_at_idx on counters (updated_at);

create table if not exists counter_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) default auth.uid(),
  counter_id uuid not null references counters(id) on delete cascade,
  -- LOCAL calendar date, written by the client. Deliberately a date and not a
  -- timestamp: "how many today" means your today, not UTC's. A 9pm set in
  -- Hong Kong belongs to that day, and a timestamptz would file it under
  -- tomorrow for anyone east of Greenwich.
  date date not null,
  reps int not null check (reps > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create index if not exists counter_entries_counter_date_idx
  on counter_entries (counter_id, date);
create index if not exists counter_entries_updated_at_idx on counter_entries (updated_at);

alter table counters        enable row level security;
alter table counter_entries enable row level security;

do $$
declare t text;
begin
  foreach t in array array['counters', 'counter_entries']
  loop
    execute format($f$
      drop policy if exists "select own %1$s" on %1$I;
      create policy "select own %1$s" on %1$I for select using (auth.uid() = user_id);

      drop policy if exists "insert own %1$s" on %1$I;
      create policy "insert own %1$s" on %1$I for insert with check (auth.uid() = user_id);

      -- `with check` as well as `using`, otherwise an update could reassign
      -- user_id and hand the row to another account.
      drop policy if exists "update own %1$s" on %1$I;
      create policy "update own %1$s" on %1$I for update
        using (auth.uid() = user_id) with check (auth.uid() = user_id);

      drop policy if exists "delete own %1$s" on %1$I;
      create policy "delete own %1$s" on %1$I for delete using (auth.uid() = user_id);
    $f$, t);
  end loop;
end $$;

-- Sanity check — run separately:
--   select 'counters' t, count(*) from counters
--   union all select 'counter_entries', count(*) from counter_entries;
