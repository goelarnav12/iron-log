// Every Supabase call in the app lives here, and so does every camelCase <->
// snake_case translation. Components deal in the models from types.ts and
// never see a raw row; if you find yourself writing `weight_kg` in a
// component, the mapping belongs in this file instead.

import { supabase } from './supabase';
import type {
  BodyMeasurement, CardioSession, Exercise, Routine, RoutineExercise,
  SetType, Workout, WorkoutExercise, WorkoutSet,
} from './types';

/* eslint-disable @typescript-eslint/no-explicit-any */
type Row = Record<string, any>;

function fail(error: { message: string } | null): void {
  if (error) throw new Error(error.message);
}

// ---------------------------------------------------------------------------
// Mappers
// ---------------------------------------------------------------------------

const toExercise = (r: Row): Exercise => ({
  id: r.id,
  userId: r.user_id,
  name: r.name,
  muscleGroup: r.muscle_group,
  equipment: r.equipment,
  trackingType: r.tracking_type,
  notes: r.notes,
});

const toSet = (r: Row): WorkoutSet => ({
  id: r.id,
  workoutExerciseId: r.workout_exercise_id,
  position: r.position,
  weightKg: r.weight_kg == null ? null : Number(r.weight_kg),
  reps: r.reps,
  durationS: r.duration_s,
  setType: r.set_type,
  completed: r.completed,
});

const toWorkoutExercise = (r: Row): WorkoutExercise => ({
  id: r.id,
  workoutId: r.workout_id,
  exerciseId: r.exercise_id,
  position: r.position,
  notes: r.notes,
  sets: ((r.sets ?? []) as Row[]).map(toSet).sort((a, b) => a.position - b.position),
});

const toWorkout = (r: Row): Workout => ({
  id: r.id,
  userId: r.user_id,
  name: r.name,
  routineId: r.routine_id,
  startedAt: r.started_at,
  endedAt: r.ended_at,
  notes: r.notes,
  exercises: ((r.workout_exercises ?? []) as Row[])
    .map(toWorkoutExercise)
    .sort((a, b) => a.position - b.position),
});

const toRoutineExercise = (r: Row): RoutineExercise => ({
  id: r.id,
  routineId: r.routine_id,
  exerciseId: r.exercise_id,
  position: r.position,
  targetSets: r.target_sets,
  notes: r.notes,
});

const toRoutine = (r: Row): Routine => ({
  id: r.id,
  userId: r.user_id,
  name: r.name,
  notes: r.notes,
  position: r.position,
  exercises: ((r.routine_exercises ?? []) as Row[])
    .map(toRoutineExercise)
    .sort((a, b) => a.position - b.position),
});

const toCardio = (r: Row): CardioSession => ({
  id: r.id,
  userId: r.user_id,
  date: r.date,
  activity: r.activity,
  durationS: r.duration_s,
  distanceM: r.distance_m == null ? null : Number(r.distance_m),
  avgHr: r.avg_hr,
  calories: r.calories,
  notes: r.notes,
});

const num = (v: any) => (v == null ? null : Number(v));

const toMeasurement = (r: Row): BodyMeasurement => ({
  id: r.id,
  userId: r.user_id,
  date: r.date,
  weightKg: num(r.weight_kg),
  neckCm: num(r.neck_cm),
  shouldersCm: num(r.shoulders_cm),
  chestCm: num(r.chest_cm),
  waistCm: num(r.waist_cm),
  hipsCm: num(r.hips_cm),
  leftArmCm: num(r.left_arm_cm),
  rightArmCm: num(r.right_arm_cm),
  leftThighCm: num(r.left_thigh_cm),
  rightThighCm: num(r.right_thigh_cm),
  leftCalfCm: num(r.left_calf_cm),
  rightCalfCm: num(r.right_calf_cm),
  notes: r.notes,
});

const measurementRow = (m: Partial<BodyMeasurement>): Row => ({
  date: m.date,
  weight_kg: m.weightKg,
  neck_cm: m.neckCm,
  shoulders_cm: m.shouldersCm,
  chest_cm: m.chestCm,
  waist_cm: m.waistCm,
  hips_cm: m.hipsCm,
  left_arm_cm: m.leftArmCm,
  right_arm_cm: m.rightArmCm,
  left_thigh_cm: m.leftThighCm,
  right_thigh_cm: m.rightThighCm,
  left_calf_cm: m.leftCalfCm,
  right_calf_cm: m.rightCalfCm,
  notes: m.notes ?? null,
});

// ---------------------------------------------------------------------------
// Exercises
// ---------------------------------------------------------------------------

export async function fetchExercises(): Promise<Exercise[]> {
  const { data, error } = await supabase.from('exercises').select('*').order('name');
  fail(error);
  return (data ?? []).map(toExercise);
}

export async function createExercise(
  e: Pick<Exercise, 'name' | 'muscleGroup' | 'equipment' | 'trackingType'> & { notes?: string | null },
): Promise<Exercise> {
  const { data, error } = await supabase
    .from('exercises')
    .insert({
      name: e.name,
      muscle_group: e.muscleGroup,
      equipment: e.equipment,
      tracking_type: e.trackingType,
      notes: e.notes ?? null,
    })
    .select()
    .single();
  fail(error);
  return toExercise(data!);
}

export async function updateExercise(id: string, e: Partial<Exercise>): Promise<void> {
  const { error } = await supabase
    .from('exercises')
    .update({
      name: e.name,
      muscle_group: e.muscleGroup,
      equipment: e.equipment,
      tracking_type: e.trackingType,
      notes: e.notes,
    })
    .eq('id', id);
  fail(error);
}

export async function deleteExercise(id: string): Promise<void> {
  const { error } = await supabase.from('exercises').delete().eq('id', id);
  fail(error);
}

// ---------------------------------------------------------------------------
// Workouts
//
// A workout is always fetched whole, with its exercises and sets nested via
// PostgREST embedding. The data volume is one person's training history, so
// there is no paging and no partial hydration to keep in sync.
// ---------------------------------------------------------------------------

const WORKOUT_SELECT =
  '*, workout_exercises(*, sets(*))';

export async function fetchWorkouts(): Promise<Workout[]> {
  const { data, error } = await supabase
    .from('workouts')
    .select(WORKOUT_SELECT)
    .not('ended_at', 'is', null)
    .order('started_at', { ascending: false });
  fail(error);
  return (data ?? []).map(toWorkout);
}

/**
 * The in-progress workout, if any. Schema allows only one per user by
 * convention (ended_at is null); if somehow there are two, the newest wins.
 */
export async function fetchActiveWorkout(): Promise<Workout | null> {
  const { data, error } = await supabase
    .from('workouts')
    .select(WORKOUT_SELECT)
    .is('ended_at', null)
    .order('started_at', { ascending: false })
    .limit(1);
  fail(error);
  return data && data.length ? toWorkout(data[0]) : null;
}

export async function fetchWorkout(id: string): Promise<Workout | null> {
  const { data, error } = await supabase
    .from('workouts')
    .select(WORKOUT_SELECT)
    .eq('id', id)
    .maybeSingle();
  fail(error);
  return data ? toWorkout(data) : null;
}

export async function startWorkout(opts: {
  name: string;
  routineId?: string | null;
  /** Exercises to pre-populate, with the number of blank sets each. */
  exercises?: { exerciseId: string; sets: number; notes?: string | null }[];
}): Promise<Workout> {
  const { data, error } = await supabase
    .from('workouts')
    .insert({ name: opts.name, routine_id: opts.routineId ?? null })
    .select()
    .single();
  fail(error);
  const workoutId = data!.id as string;

  for (const [i, e] of (opts.exercises ?? []).entries()) {
    const we = await addWorkoutExercise(workoutId, e.exerciseId, i);
    for (let s = 0; s < Math.max(1, e.sets); s++) {
      await addSet(we.id, s);
    }
  }
  return (await fetchWorkout(workoutId))!;
}

export async function addWorkoutExercise(
  workoutId: string,
  exerciseId: string,
  position: number,
): Promise<WorkoutExercise> {
  const { data, error } = await supabase
    .from('workout_exercises')
    .insert({ workout_id: workoutId, exercise_id: exerciseId, position })
    .select()
    .single();
  fail(error);
  return toWorkoutExercise(data!);
}

export async function removeWorkoutExercise(id: string): Promise<void> {
  const { error } = await supabase.from('workout_exercises').delete().eq('id', id);
  fail(error);
}

export async function updateWorkoutExercise(id: string, patch: { notes?: string | null; position?: number }): Promise<void> {
  const { error } = await supabase.from('workout_exercises').update(patch).eq('id', id);
  fail(error);
}

export async function addSet(
  workoutExerciseId: string,
  position: number,
  seed?: Partial<Pick<WorkoutSet, 'weightKg' | 'reps' | 'durationS' | 'setType'>>,
): Promise<WorkoutSet> {
  const { data, error } = await supabase
    .from('sets')
    .insert({
      workout_exercise_id: workoutExerciseId,
      position,
      weight_kg: seed?.weightKg ?? null,
      reps: seed?.reps ?? null,
      duration_s: seed?.durationS ?? null,
      set_type: seed?.setType ?? 'normal',
    })
    .select()
    .single();
  fail(error);
  return toSet(data!);
}

export async function updateSet(
  id: string,
  patch: Partial<Pick<WorkoutSet, 'weightKg' | 'reps' | 'durationS' | 'setType' | 'completed'>>,
): Promise<void> {
  const row: Row = {};
  if ('weightKg' in patch) row.weight_kg = patch.weightKg;
  if ('reps' in patch) row.reps = patch.reps;
  if ('durationS' in patch) row.duration_s = patch.durationS;
  if ('setType' in patch) row.set_type = patch.setType as SetType;
  if ('completed' in patch) row.completed = patch.completed;
  const { error } = await supabase.from('sets').update(row).eq('id', id);
  fail(error);
}

export async function deleteSet(id: string): Promise<void> {
  const { error } = await supabase.from('sets').delete().eq('id', id);
  fail(error);
}

export async function finishWorkout(id: string, notes?: string | null): Promise<void> {
  // Anything left unchecked is work that didn't happen, so it goes rather than
  // sitting in history as a set of nulls.
  const w = await fetchWorkout(id);
  if (w) {
    const abandoned = w.exercises.flatMap((we) => we.sets.filter((s) => !s.completed).map((s) => s.id));
    if (abandoned.length) {
      const { error } = await supabase.from('sets').delete().in('id', abandoned);
      fail(error);
    }
    const empty = w.exercises
      .filter((we) => we.sets.every((s) => !s.completed))
      .map((we) => we.id);
    if (empty.length) {
      const { error } = await supabase.from('workout_exercises').delete().in('id', empty);
      fail(error);
    }
  }
  const { error } = await supabase
    .from('workouts')
    .update({ ended_at: new Date().toISOString(), notes: notes ?? null })
    .eq('id', id);
  fail(error);
}

export async function updateWorkout(
  id: string,
  patch: { name?: string; notes?: string | null; startedAt?: string; endedAt?: string },
): Promise<void> {
  const row: Row = {};
  if (patch.name !== undefined) row.name = patch.name;
  if (patch.notes !== undefined) row.notes = patch.notes;
  if (patch.startedAt !== undefined) row.started_at = patch.startedAt;
  if (patch.endedAt !== undefined) row.ended_at = patch.endedAt;
  const { error } = await supabase.from('workouts').update(row).eq('id', id);
  fail(error);
}

export async function deleteWorkout(id: string): Promise<void> {
  const { error } = await supabase.from('workouts').delete().eq('id', id);
  fail(error);
}

// ---------------------------------------------------------------------------
// Routines
// ---------------------------------------------------------------------------

export async function fetchRoutines(): Promise<Routine[]> {
  const { data, error } = await supabase
    .from('routines')
    .select('*, routine_exercises(*)')
    .order('position');
  fail(error);
  return (data ?? []).map(toRoutine);
}

export async function saveRoutine(
  routine: { id?: string; name: string; notes?: string | null },
  exercises: { exerciseId: string; targetSets: number; notes?: string | null }[],
): Promise<string> {
  let id = routine.id;
  if (id) {
    const { error } = await supabase
      .from('routines')
      .update({ name: routine.name, notes: routine.notes ?? null })
      .eq('id', id);
    fail(error);
    // Rewriting the child rows wholesale is simpler than diffing them, and a
    // routine has at most a couple of dozen.
    const { error: delErr } = await supabase.from('routine_exercises').delete().eq('routine_id', id);
    fail(delErr);
  } else {
    const { data, error } = await supabase
      .from('routines')
      .insert({ name: routine.name, notes: routine.notes ?? null })
      .select()
      .single();
    fail(error);
    id = data!.id as string;
  }

  if (exercises.length) {
    const { error } = await supabase.from('routine_exercises').insert(
      exercises.map((e, i) => ({
        routine_id: id,
        exercise_id: e.exerciseId,
        position: i,
        target_sets: e.targetSets,
        notes: e.notes ?? null,
      })),
    );
    fail(error);
  }
  return id!;
}

export async function deleteRoutine(id: string): Promise<void> {
  const { error } = await supabase.from('routines').delete().eq('id', id);
  fail(error);
}

// ---------------------------------------------------------------------------
// Cardio
// ---------------------------------------------------------------------------

export async function fetchCardio(): Promise<CardioSession[]> {
  const { data, error } = await supabase
    .from('cardio_sessions')
    .select('*')
    .order('date', { ascending: false });
  fail(error);
  return (data ?? []).map(toCardio);
}

export async function saveCardio(c: Partial<CardioSession> & { id?: string }): Promise<void> {
  const row: Row = {
    date: c.date,
    activity: c.activity,
    duration_s: c.durationS,
    distance_m: c.distanceM ?? null,
    avg_hr: c.avgHr ?? null,
    calories: c.calories ?? null,
    notes: c.notes ?? null,
  };
  const { error } = c.id
    ? await supabase.from('cardio_sessions').update(row).eq('id', c.id)
    : await supabase.from('cardio_sessions').insert(row);
  fail(error);
}

export async function deleteCardio(id: string): Promise<void> {
  const { error } = await supabase.from('cardio_sessions').delete().eq('id', id);
  fail(error);
}

// ---------------------------------------------------------------------------
// Body measurements
// ---------------------------------------------------------------------------

export async function fetchMeasurements(): Promise<BodyMeasurement[]> {
  const { data, error } = await supabase
    .from('body_measurements')
    .select('*')
    .order('date', { ascending: false });
  fail(error);
  return (data ?? []).map(toMeasurement);
}

/**
 * Upsert on (user_id, date): logging a day twice edits that day rather than
 * putting two points on the trend line. Matches the unique index in schema.sql.
 */
export async function saveMeasurement(m: Partial<BodyMeasurement>, userId: string): Promise<void> {
  const { error } = await supabase
    .from('body_measurements')
    .upsert({ ...measurementRow(m), user_id: userId }, { onConflict: 'user_id,date' });
  fail(error);
}

export async function deleteMeasurement(id: string): Promise<void> {
  const { error } = await supabase.from('body_measurements').delete().eq('id', id);
  fail(error);
}
