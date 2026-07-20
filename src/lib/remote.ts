// The Supabase transport. The ONLY file that talks to Postgres, and the only
// place camelCase <-> snake_case translation happens.
//
// Nothing here is called from a component. `sync.ts` drives it; the app reads
// and writes IndexedDB via `db.ts` and never waits on any of this.

import { supabase } from './supabase';
import { PG_TABLE, type TableName } from './idb';

/* eslint-disable @typescript-eslint/no-explicit-any */
type Row = Record<string, any>;

const num = (v: any) => (v == null ? null : Number(v));

// ---------------------------------------------------------------------------
// Row mappers, one pair per table.
//
// `fromPg` also normalises Postgres numerics, which arrive as strings — miss
// one and a weight silently becomes "60" instead of 60, which then fails every
// arithmetic comparison in stats.ts.
// ---------------------------------------------------------------------------

interface Mapper {
  fromPg: (r: Row) => Row;
  toPg: (r: Row) => Row;
}

const sync = (r: Row) => ({ updatedAt: r.updated_at, deletedAt: r.deleted_at ?? null });
const syncOut = (r: Row) => ({ updated_at: r.updatedAt, deleted_at: r.deletedAt ?? null });

export const MAPPERS: Record<TableName, Mapper> = {
  exercises: {
    fromPg: (r) => ({
      id: r.id, userId: r.user_id, name: r.name, muscleGroup: r.muscle_group,
      equipment: r.equipment, trackingType: r.tracking_type, notes: r.notes, ...sync(r),
    }),
    toPg: (r) => ({
      id: r.id, user_id: r.userId, name: r.name, muscle_group: r.muscleGroup,
      equipment: r.equipment, tracking_type: r.trackingType, notes: r.notes, ...syncOut(r),
    }),
  },
  routines: {
    fromPg: (r) => ({
      id: r.id, userId: r.user_id, name: r.name, notes: r.notes,
      position: r.position, ...sync(r),
    }),
    toPg: (r) => ({
      id: r.id, user_id: r.userId, name: r.name, notes: r.notes,
      position: r.position, ...syncOut(r),
    }),
  },
  routineExercises: {
    fromPg: (r) => ({
      id: r.id, routineId: r.routine_id, exerciseId: r.exercise_id,
      position: r.position, targetSets: r.target_sets, notes: r.notes, ...sync(r),
    }),
    toPg: (r) => ({
      id: r.id, routine_id: r.routineId, exercise_id: r.exerciseId,
      position: r.position, target_sets: r.targetSets, notes: r.notes, ...syncOut(r),
    }),
  },
  workouts: {
    fromPg: (r) => ({
      id: r.id, userId: r.user_id, name: r.name, routineId: r.routine_id,
      startedAt: r.started_at, endedAt: r.ended_at, notes: r.notes, ...sync(r),
    }),
    toPg: (r) => ({
      id: r.id, user_id: r.userId, name: r.name, routine_id: r.routineId,
      started_at: r.startedAt, ended_at: r.endedAt, notes: r.notes, ...syncOut(r),
    }),
  },
  workoutExercises: {
    fromPg: (r) => ({
      id: r.id, workoutId: r.workout_id, exerciseId: r.exercise_id,
      position: r.position, notes: r.notes, ...sync(r),
    }),
    toPg: (r) => ({
      id: r.id, workout_id: r.workoutId, exercise_id: r.exerciseId,
      position: r.position, notes: r.notes, ...syncOut(r),
    }),
  },
  sets: {
    fromPg: (r) => ({
      id: r.id, workoutExerciseId: r.workout_exercise_id, position: r.position,
      weightKg: num(r.weight_kg), reps: r.reps, durationS: r.duration_s,
      setType: r.set_type, completed: r.completed, ...sync(r),
    }),
    toPg: (r) => ({
      id: r.id, workout_exercise_id: r.workoutExerciseId, position: r.position,
      weight_kg: r.weightKg, reps: r.reps, duration_s: r.durationS,
      set_type: r.setType, completed: r.completed, ...syncOut(r),
    }),
  },
  cardio: {
    fromPg: (r) => ({
      id: r.id, userId: r.user_id, date: r.date, activity: r.activity,
      durationS: r.duration_s, distanceM: num(r.distance_m), avgHr: r.avg_hr,
      calories: r.calories, notes: r.notes, ...sync(r),
    }),
    toPg: (r) => ({
      id: r.id, user_id: r.userId, date: r.date, activity: r.activity,
      duration_s: r.durationS, distance_m: r.distanceM, avg_hr: r.avgHr,
      calories: r.calories, notes: r.notes, ...syncOut(r),
    }),
  },
  measurements: {
    fromPg: (r) => ({
      id: r.id, userId: r.user_id, date: r.date,
      weightKg: num(r.weight_kg), neckCm: num(r.neck_cm), shouldersCm: num(r.shoulders_cm),
      chestCm: num(r.chest_cm), waistCm: num(r.waist_cm), hipsCm: num(r.hips_cm),
      leftArmCm: num(r.left_arm_cm), rightArmCm: num(r.right_arm_cm),
      leftThighCm: num(r.left_thigh_cm), rightThighCm: num(r.right_thigh_cm),
      leftCalfCm: num(r.left_calf_cm), rightCalfCm: num(r.right_calf_cm),
      notes: r.notes, ...sync(r),
    }),
    toPg: (r) => ({
      id: r.id, user_id: r.userId, date: r.date,
      weight_kg: r.weightKg, neck_cm: r.neckCm, shoulders_cm: r.shouldersCm,
      chest_cm: r.chestCm, waist_cm: r.waistCm, hips_cm: r.hipsCm,
      left_arm_cm: r.leftArmCm, right_arm_cm: r.rightArmCm,
      left_thigh_cm: r.leftThighCm, right_thigh_cm: r.rightThighCm,
      left_calf_cm: r.leftCalfCm, right_calf_cm: r.rightCalfCm,
      notes: r.notes, ...syncOut(r),
    }),
  },
};

// ---------------------------------------------------------------------------

/** Rows changed since `cursor`, oldest first. Tombstones included — a delete
 *  that happened while this device was offline arrives as an ordinary row. */
export async function pull(
  table: TableName, cursor: string | null, limit = 1000,
): Promise<Row[]> {
  let q = supabase.from(PG_TABLE[table]).select('*').order('updated_at').limit(limit);
  if (cursor) q = q.gt('updated_at', cursor);
  const { data, error } = await q;
  if (error) throw new Error(`pull ${table}: ${error.message}`);
  return (data ?? []).map(MAPPERS[table].fromPg);
}

/**
 * Upsert a batch. `id` is the conflict target because the client generates it
 * — that's what makes an offline insert and its later sync the same row rather
 * than two.
 */
export async function push(table: TableName, rows: Row[]): Promise<void> {
  if (!rows.length) return;
  const { error } = await supabase
    .from(PG_TABLE[table])
    .upsert(rows.map(MAPPERS[table].toPg), { onConflict: 'id' });
  if (error) throw new Error(`push ${table}: ${error.message}`);
}

/** Cheap connectivity probe — `navigator.onLine` only knows about the local
 *  link, not whether Supabase is actually reachable. */
export async function reachable(): Promise<boolean> {
  try {
    const { error } = await supabase.from('exercises').select('id').limit(1);
    return !error;
  } catch {
    return false;
  }
}
