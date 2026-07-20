-- Migration 001 — offline sync support.
-- Run once by hand in the Supabase SQL Editor, after schema.sql.
-- Safe to re-run: every statement is guarded.
--
-- Adds the two columns a last-write-wins sync needs on every table:
--
--   updated_at  The clock LWW compares. The CLIENT sets this on every write,
--               deliberately — if a server trigger overwrote it with now(),
--               the row would come back from the next pull looking newer than
--               the local copy that produced it, and the two would ping-pong.
--               The default only covers rows created outside the app (here in
--               the SQL Editor, say).
--
--   deleted_at  Soft delete. A hard DELETE is invisible to a device that was
--               offline when it happened — it has nothing to pull, so it would
--               resurrect the row on its next push. A tombstone is a normal
--               update that syncs like any other change.
--
-- Every read in the app filters `deleted_at is null`.

-- ---------------------------------------------------------------------------
-- Columns + the index each table needs for an incremental pull
-- (`where updated_at > <cursor> order by updated_at`).
-- ---------------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array[
    'exercises', 'routines', 'routine_exercises', 'workouts',
    'workout_exercises', 'sets', 'cardio_sessions', 'body_measurements'
  ]
  loop
    execute format($f$
      alter table %1$I add column if not exists updated_at timestamptz not null default now();
      alter table %1$I add column if not exists deleted_at timestamptz;
      create index if not exists %1$s_updated_at_idx on %1$I (updated_at);
    $f$, t);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- Unique indexes have to ignore tombstones.
--
-- Without this, deleting a measurement for 3 March and logging a new one the
-- same day collides with the tombstone still sitting in the table — the insert
-- fails with a duplicate key error and the app looks broken.
-- ---------------------------------------------------------------------------
drop index if exists body_measurements_user_date_idx;
create unique index if not exists body_measurements_user_date_idx
  on body_measurements (user_id, date)
  where deleted_at is null;

drop index if exists exercises_user_name_idx;
create unique index if not exists exercises_user_name_idx
  on exercises (user_id, lower(name))
  where user_id is not null and deleted_at is null;

-- ---------------------------------------------------------------------------
-- Child rows are deleted by cascade when a parent is hard-deleted, which the
-- app no longer does — but `on delete restrict` on workout_exercises.exercise_id
-- would still block soft-deleting an exercise you have history for. It doesn't:
-- a soft delete is an UPDATE, so the FK never fires. Nothing to change here;
-- noting it so the next person doesn't go looking.
-- ---------------------------------------------------------------------------

-- Sanity check — run separately afterwards:
--   select table_name, count(*) filter (where column_name = 'updated_at') as has_updated,
--          count(*) filter (where column_name = 'deleted_at') as has_deleted
--   from information_schema.columns
--   where table_schema = 'public'
--     and table_name in ('exercises','routines','routine_exercises','workouts',
--                        'workout_exercises','sets','cardio_sessions','body_measurements')
--   group by table_name order by table_name;
