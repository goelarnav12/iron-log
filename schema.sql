-- Run this once in your Supabase project's SQL Editor:
--   Dashboard -> SQL Editor -> New Query -> paste all of this -> Run
-- Then run seed_exercises.sql to populate the built-in exercise library.
--
-- Everything numeric is stored canonically: mass in KILOGRAMS, distance in
-- METRES, length in CENTIMETRES, duration in SECONDS. The kg/lb and cm/in
-- toggles in the app are display-only. Never write a converted number back.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- Exercise library
--
-- Two kinds of row live here, distinguished only by user_id:
--   user_id IS NULL  -> built-in, seeded by seed_exercises.sql, readable by
--                       everyone, writable by no one (no policy grants it).
--   user_id = you    -> your own custom exercise.
-- ---------------------------------------------------------------------------
create table if not exists exercises (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) default auth.uid(),
  name text not null,
  -- Primary muscle worked. Drives the volume-by-muscle chart.
  muscle_group text not null,
  equipment text not null default 'other',
  -- How a set of this exercise is measured. 'weight_reps' is the default and
  -- covers almost everything; the others exist so bodyweight and timed work
  -- don't have to fake a weight of 0.
  tracking_type text not null default 'weight_reps'
    check (tracking_type in ('weight_reps', 'reps_only', 'duration', 'weighted_bodyweight')),
  notes text,
  created_at timestamptz not null default now()
);

create index if not exists exercises_user_idx on exercises (user_id);
-- A custom exercise may not collide with another of your own, but it is fine
-- for it to shadow a built-in one (you might want your own "Bench Press").
create unique index if not exists exercises_user_name_idx
  on exercises (user_id, lower(name)) where user_id is not null;

-- ---------------------------------------------------------------------------
-- Routines (workout templates)
-- ---------------------------------------------------------------------------
create table if not exists routines (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) default auth.uid(),
  name text not null,
  notes text,
  position int not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists routine_exercises (
  id uuid primary key default gen_random_uuid(),
  routine_id uuid not null references routines(id) on delete cascade,
  exercise_id uuid not null references exercises(id) on delete cascade,
  position int not null default 0,
  target_sets int not null default 3,
  notes text
);

create index if not exists routine_exercises_routine_idx on routine_exercises (routine_id);

-- ---------------------------------------------------------------------------
-- Workouts: the three-level log.
--   workouts -> workout_exercises -> sets
--
-- A workout with ended_at IS NULL is the one currently in progress. The app
-- relies on there being at most one of those per user.
-- ---------------------------------------------------------------------------
create table if not exists workouts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) default auth.uid(),
  name text not null default 'Workout',
  -- Kept for reference only; deleting a routine does not orphan the workout.
  routine_id uuid references routines(id) on delete set null,
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  notes text
);

create index if not exists workouts_user_started_idx on workouts (user_id, started_at desc);

create table if not exists workout_exercises (
  id uuid primary key default gen_random_uuid(),
  workout_id uuid not null references workouts(id) on delete cascade,
  exercise_id uuid not null references exercises(id) on delete restrict,
  position int not null default 0,
  notes text
);

create index if not exists workout_exercises_workout_idx on workout_exercises (workout_id);

create table if not exists sets (
  id uuid primary key default gen_random_uuid(),
  workout_exercise_id uuid not null references workout_exercises(id) on delete cascade,
  position int not null default 0,
  weight_kg numeric,
  reps int,
  duration_s int,
  set_type text not null default 'normal'
    check (set_type in ('warmup', 'normal', 'failure', 'drop')),
  -- Rows are created unchecked when you start a workout and flipped as you go,
  -- so an abandoned set is distinguishable from a completed one. Only completed
  -- sets count toward volume, PRs, and any other statistic.
  completed boolean not null default false
);

create index if not exists sets_workout_exercise_idx on sets (workout_exercise_id);

-- ---------------------------------------------------------------------------
-- Cardio: deliberately not modelled as an exercise. A run has no sets and no
-- reps, and forcing it into the table above would mean a column of nulls.
-- ---------------------------------------------------------------------------
create table if not exists cardio_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) default auth.uid(),
  date date not null default current_date,
  activity text not null default 'Run',
  duration_s int not null,
  distance_m numeric,
  avg_hr int,
  calories int,
  notes text,
  created_at timestamptz not null default now()
);

create index if not exists cardio_user_date_idx on cardio_sessions (user_id, date desc);

-- ---------------------------------------------------------------------------
-- Body measurements. One row per weigh-in; every field except date is
-- optional, so a bare weight entry and a full tape session are the same shape.
-- ---------------------------------------------------------------------------
create table if not exists body_measurements (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) default auth.uid(),
  date date not null default current_date,
  weight_kg numeric,
  neck_cm numeric,
  shoulders_cm numeric,
  chest_cm numeric,
  waist_cm numeric,
  hips_cm numeric,
  left_arm_cm numeric,
  right_arm_cm numeric,
  left_thigh_cm numeric,
  right_thigh_cm numeric,
  left_calf_cm numeric,
  right_calf_cm numeric,
  notes text,
  created_at timestamptz not null default now()
);

-- One entry per day: logging the same day again edits that day rather than
-- stacking a second point onto the trend line.
create unique index if not exists body_measurements_user_date_idx
  on body_measurements (user_id, date);

-- ---------------------------------------------------------------------------
-- Row level security
--
-- This is the only thing protecting the data — the publishable key shipped in
-- the built JS is public by design. Never drop or weaken these.
-- ---------------------------------------------------------------------------
alter table exercises          enable row level security;
alter table routines           enable row level security;
alter table routine_exercises  enable row level security;
alter table workouts           enable row level security;
alter table workout_exercises  enable row level security;
alter table sets               enable row level security;
alter table cardio_sessions    enable row level security;
alter table body_measurements  enable row level security;

-- Tables owned directly by a user_id column.
do $$
declare t text;
begin
  foreach t in array array['routines', 'workouts', 'cardio_sessions', 'body_measurements']
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

-- Exercises are the exception: built-ins (user_id is null) are world-readable
-- but match no write policy, so nobody can touch them.
drop policy if exists "select exercises" on exercises;
create policy "select exercises" on exercises for select
  using (user_id is null or auth.uid() = user_id);

drop policy if exists "insert own exercises" on exercises;
create policy "insert own exercises" on exercises for insert
  with check (auth.uid() = user_id);

drop policy if exists "update own exercises" on exercises;
create policy "update own exercises" on exercises for update
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "delete own exercises" on exercises;
create policy "delete own exercises" on exercises for delete
  using (auth.uid() = user_id);

-- Child tables carry no user_id; ownership is inherited from the parent row,
-- and `exists` against the parent is itself filtered by the parent's policy.
drop policy if exists "all own routine_exercises" on routine_exercises;
create policy "all own routine_exercises" on routine_exercises for all
  using (exists (select 1 from routines r where r.id = routine_id and r.user_id = auth.uid()))
  with check (exists (select 1 from routines r where r.id = routine_id and r.user_id = auth.uid()));

drop policy if exists "all own workout_exercises" on workout_exercises;
create policy "all own workout_exercises" on workout_exercises for all
  using (exists (select 1 from workouts w where w.id = workout_id and w.user_id = auth.uid()))
  with check (exists (select 1 from workouts w where w.id = workout_id and w.user_id = auth.uid()));

drop policy if exists "all own sets" on sets;
create policy "all own sets" on sets for all
  using (exists (
    select 1 from workout_exercises we
    join workouts w on w.id = we.workout_id
    where we.id = workout_exercise_id and w.user_id = auth.uid()))
  with check (exists (
    select 1 from workout_exercises we
    join workouts w on w.id = we.workout_id
    where we.id = workout_exercise_id and w.user_id = auth.uid()));
