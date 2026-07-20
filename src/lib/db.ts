// The app's data API. Every read and write is LOCAL — this file touches
// IndexedDB and nothing else, so no screen ever waits on a network round trip
// and every action works with the phone in airplane mode.
//
// Writes land in the on-device mirror and are queued in the outbox; `sync.ts`
// drains that queue in the background. The function signatures are unchanged
// from the online-only version on purpose, so pages didn't have to change.
//
// Two invariants worth keeping:
//
//   Ids are generated HERE, on the client. That is what lets a row created
//   offline be the same row after it syncs, rather than a duplicate.
//
//   Deletes are soft, and must cascade BY HAND. Postgres `on delete cascade`
//   never fires, because a delete is now an UPDATE setting deleted_at. Miss a
//   child and it becomes an orphan that syncs forever.

import {
  allRows, deleteRow, getRow, putRow, rowsByIndex, type LocalCardio,
  type LocalCounter, type LocalCounterEntry, type LocalExercise,
  type LocalMeasurement, type LocalRoutine, type LocalRoutineExercise,
  type LocalSet, type LocalWorkout, type LocalWorkoutExercise,
} from './idb';
import { refreshPending, syncNow } from './sync';
import type {
  BodyMeasurement, CardioSession, Counter, CounterEntry, Exercise, Routine,
  RoutineExercise, Workout, WorkoutExercise, WorkoutSet,
} from './types';

const now = () => new Date().toISOString();
const uid = () => crypto.randomUUID();

/** Set at sign-in. Every row this device creates is stamped with it, because
 *  RLS rejects an insert whose user_id isn't the caller. */
let currentUserId: string | null = null;
export function setCurrentUser(id: string | null) { currentUserId = id; }

function requireUser(): string {
  if (!currentUserId) throw new Error('Not signed in');
  return currentUserId;
}

/** Queue a background sync without blocking the caller. Fire-and-forget: the
 *  write is already durable on disk, so a failure here costs nothing. */
function kick() {
  void refreshPending();
  void syncNow();
}

const stamp = () => ({ updatedAt: now(), deletedAt: null });

// ---------------------------------------------------------------------------
// Exercises
// ---------------------------------------------------------------------------

export async function fetchExercises(): Promise<Exercise[]> {
  const rows = await allRows<LocalExercise>('exercises');
  return rows.sort((a, b) => a.name.localeCompare(b.name));
}

export async function createExercise(
  e: Pick<Exercise, 'name' | 'muscleGroup' | 'equipment' | 'trackingType'> & { notes?: string | null },
): Promise<Exercise> {
  const existing = await allRows<LocalExercise>('exercises');
  // The unique index on (user_id, lower(name)) would reject this at push time,
  // long after the UI said it worked. Check locally so the error is immediate.
  if (existing.some((x) => x.userId && x.name.toLowerCase() === e.name.trim().toLowerCase())) {
    throw new Error('duplicate: you already have an exercise with that name');
  }
  const row: LocalExercise = {
    id: uid(), userId: requireUser(), name: e.name, muscleGroup: e.muscleGroup,
    equipment: e.equipment, trackingType: e.trackingType, notes: e.notes ?? null, ...stamp(),
  };
  await putRow('exercises', row);
  kick();
  return row;
}

export async function updateExercise(id: string, e: Partial<Exercise>): Promise<void> {
  const row = await getRow<LocalExercise>('exercises', id);
  if (!row) return;
  await putRow('exercises', { ...row, ...e, updatedAt: now() });
  kick();
}

export async function deleteExercise(id: string): Promise<void> {
  await deleteRow('exercises', id);
  kick();
}

// ---------------------------------------------------------------------------
// Workouts — assembled from three flat stores into the nested model.
// ---------------------------------------------------------------------------

async function hydrate(w: LocalWorkout): Promise<Workout> {
  const wes = await rowsByIndex<LocalWorkoutExercise>('workoutExercises', 'workoutId', w.id);
  const exercises: WorkoutExercise[] = [];
  for (const we of wes.sort((a, b) => a.position - b.position)) {
    const sets = await rowsByIndex<LocalSet>('sets', 'workoutExerciseId', we.id);
    exercises.push({
      id: we.id, workoutId: we.workoutId, exerciseId: we.exerciseId,
      position: we.position, notes: we.notes,
      sets: sets.sort((a, b) => a.position - b.position),
    });
  }
  return {
    id: w.id, userId: w.userId, name: w.name, routineId: w.routineId,
    startedAt: w.startedAt, endedAt: w.endedAt, notes: w.notes, exercises,
  };
}

export async function fetchWorkouts(): Promise<Workout[]> {
  const rows = (await allRows<LocalWorkout>('workouts'))
    .filter((w) => w.endedAt)
    .sort((a, b) => b.startedAt.localeCompare(a.startedAt));
  return Promise.all(rows.map(hydrate));
}

export async function fetchActiveWorkout(): Promise<Workout | null> {
  const rows = (await allRows<LocalWorkout>('workouts'))
    .filter((w) => !w.endedAt)
    .sort((a, b) => b.startedAt.localeCompare(a.startedAt));
  return rows.length ? hydrate(rows[0]) : null;
}

export async function fetchWorkout(id: string): Promise<Workout | null> {
  const w = await getRow<LocalWorkout>('workouts', id);
  return w ? hydrate(w) : null;
}

export async function startWorkout(opts: {
  name: string;
  routineId?: string | null;
  exercises?: { exerciseId: string; sets: number; notes?: string | null }[];
}): Promise<Workout> {
  const workoutId = uid();
  await putRow('workouts', {
    id: workoutId, userId: requireUser(), name: opts.name,
    routineId: opts.routineId ?? null, startedAt: now(), endedAt: null,
    notes: null, ...stamp(),
  } satisfies LocalWorkout);

  for (const [i, e] of (opts.exercises ?? []).entries()) {
    const we = await addWorkoutExercise(workoutId, e.exerciseId, i);
    for (let s = 0; s < Math.max(1, e.sets); s++) await addSet(we.id, s);
  }
  kick();
  return (await fetchWorkout(workoutId))!;
}

export async function addWorkoutExercise(
  workoutId: string, exerciseId: string, position: number,
): Promise<WorkoutExercise> {
  const row: LocalWorkoutExercise = {
    id: uid(), workoutId, exerciseId, position, notes: null, ...stamp(),
  };
  await putRow('workoutExercises', row);
  kick();
  return { ...row, sets: [] };
}

export async function removeWorkoutExercise(id: string): Promise<void> {
  for (const s of await rowsByIndex<LocalSet>('sets', 'workoutExerciseId', id)) {
    await deleteRow('sets', s.id);
  }
  await deleteRow('workoutExercises', id);
  kick();
}

export async function updateWorkoutExercise(
  id: string, patch: { notes?: string | null; position?: number },
): Promise<void> {
  const row = await getRow<LocalWorkoutExercise>('workoutExercises', id);
  if (!row) return;
  await putRow('workoutExercises', { ...row, ...patch, updatedAt: now() });
  kick();
}

export async function addSet(
  workoutExerciseId: string,
  position: number,
  seed?: Partial<Pick<WorkoutSet, 'weightKg' | 'reps' | 'durationS' | 'setType'>>,
): Promise<WorkoutSet> {
  const row: LocalSet = {
    id: uid(), workoutExerciseId, position,
    weightKg: seed?.weightKg ?? null, reps: seed?.reps ?? null,
    durationS: seed?.durationS ?? null, setType: seed?.setType ?? 'normal',
    completed: false, ...stamp(),
  };
  await putRow('sets', row);
  kick();
  return row;
}

export async function updateSet(
  id: string,
  patch: Partial<Pick<WorkoutSet, 'weightKg' | 'reps' | 'durationS' | 'setType' | 'completed'>>,
): Promise<void> {
  const row = await getRow<LocalSet>('sets', id);
  if (!row) return;
  await putRow('sets', { ...row, ...patch, updatedAt: now() });
  kick();
}

export async function deleteSet(id: string): Promise<void> {
  await deleteRow('sets', id);
  kick();
}

export async function finishWorkout(id: string, notes?: string | null): Promise<void> {
  const w = await fetchWorkout(id);
  if (w) {
    // Unticked sets are work that didn't happen; drop them rather than storing
    // a row of nulls that would drag every average down.
    for (const we of w.exercises) {
      for (const s of we.sets) if (!s.completed) await deleteRow('sets', s.id);
      if (we.sets.every((s) => !s.completed)) await deleteRow('workoutExercises', we.id);
    }
  }
  const row = await getRow<LocalWorkout>('workouts', id);
  if (row) {
    await putRow('workouts', { ...row, endedAt: now(), notes: notes ?? null, updatedAt: now() });
  }
  kick();
}

export async function updateWorkout(
  id: string,
  patch: { name?: string; notes?: string | null; startedAt?: string; endedAt?: string },
): Promise<void> {
  const row = await getRow<LocalWorkout>('workouts', id);
  if (!row) return;
  await putRow('workouts', { ...row, ...patch, updatedAt: now() });
  kick();
}

export async function deleteWorkout(id: string): Promise<void> {
  for (const we of await rowsByIndex<LocalWorkoutExercise>('workoutExercises', 'workoutId', id)) {
    for (const s of await rowsByIndex<LocalSet>('sets', 'workoutExerciseId', we.id)) {
      await deleteRow('sets', s.id);
    }
    await deleteRow('workoutExercises', we.id);
  }
  await deleteRow('workouts', id);
  kick();
}

// ---------------------------------------------------------------------------
// Routines
// ---------------------------------------------------------------------------

export async function fetchRoutines(): Promise<Routine[]> {
  const rows = (await allRows<LocalRoutine>('routines')).sort((a, b) => a.position - b.position);
  const out: Routine[] = [];
  for (const r of rows) {
    const kids = await rowsByIndex<LocalRoutineExercise>('routineExercises', 'routineId', r.id);
    out.push({
      id: r.id, userId: r.userId, name: r.name, notes: r.notes, position: r.position,
      exercises: kids.sort((a, b) => a.position - b.position).map((k): RoutineExercise => ({
        id: k.id, routineId: k.routineId, exerciseId: k.exerciseId,
        position: k.position, targetSets: k.targetSets, notes: k.notes,
      })),
    });
  }
  return out;
}

export async function saveRoutine(
  routine: { id?: string; name: string; notes?: string | null },
  exercises: { exerciseId: string; targetSets: number; notes?: string | null }[],
): Promise<string> {
  const id = routine.id ?? uid();
  const existing = routine.id ? await getRow<LocalRoutine>('routines', id) : undefined;

  await putRow('routines', {
    id,
    userId: existing?.userId ?? requireUser(),
    name: routine.name,
    notes: routine.notes ?? null,
    position: existing?.position ?? 0,
    ...stamp(),
  } satisfies LocalRoutine);

  // Child rows are replaced wholesale rather than diffed — a routine has at
  // most a couple of dozen, and the tombstones sync like any other change.
  for (const old of await rowsByIndex<LocalRoutineExercise>('routineExercises', 'routineId', id)) {
    await deleteRow('routineExercises', old.id);
  }
  for (const [i, e] of exercises.entries()) {
    await putRow('routineExercises', {
      id: uid(), routineId: id, exerciseId: e.exerciseId, position: i,
      targetSets: e.targetSets, notes: e.notes ?? null, ...stamp(),
    } satisfies LocalRoutineExercise);
  }
  kick();
  return id;
}

export async function deleteRoutine(id: string): Promise<void> {
  for (const k of await rowsByIndex<LocalRoutineExercise>('routineExercises', 'routineId', id)) {
    await deleteRow('routineExercises', k.id);
  }
  await deleteRow('routines', id);
  kick();
}

// ---------------------------------------------------------------------------
// Cardio
// ---------------------------------------------------------------------------

export async function fetchCardio(): Promise<CardioSession[]> {
  return (await allRows<LocalCardio>('cardio')).sort((a, b) => b.date.localeCompare(a.date));
}

export async function saveCardio(c: Partial<CardioSession> & { id?: string }): Promise<void> {
  const id = c.id ?? uid();
  const existing = c.id ? await getRow<LocalCardio>('cardio', id) : undefined;
  await putRow('cardio', {
    id,
    userId: existing?.userId ?? requireUser(),
    date: c.date!, activity: c.activity!, durationS: c.durationS!,
    distanceM: c.distanceM ?? null, avgHr: c.avgHr ?? null,
    calories: c.calories ?? null, notes: c.notes ?? null, ...stamp(),
  } satisfies LocalCardio);
  kick();
}

export async function deleteCardio(id: string): Promise<void> {
  await deleteRow('cardio', id);
  kick();
}

// ---------------------------------------------------------------------------
// Daily rep counters
// ---------------------------------------------------------------------------

export async function fetchCounters(): Promise<Counter[]> {
  return (await allRows<LocalCounter>('counters')).sort((a, b) => a.position - b.position);
}

export async function fetchCounterEntries(): Promise<CounterEntry[]> {
  return (await allRows<LocalCounterEntry>('counterEntries'))
    .sort((a, b) => b.date.localeCompare(a.date));
}

export async function createCounter(exerciseId: string, dailyGoal: number | null): Promise<Counter> {
  const existing = await allRows<LocalCounter>('counters');
  // Matches the unique index on (user_id, exercise_id); catching it here means
  // the error appears now rather than at push time.
  if (existing.some((c) => c.exerciseId === exerciseId)) {
    throw new Error('duplicate: you are already tracking that exercise');
  }
  const row: LocalCounter = {
    id: uid(), userId: requireUser(), exerciseId, dailyGoal,
    position: existing.length, ...stamp(),
  };
  await putRow('counters', row);
  kick();
  return row;
}

export async function updateCounter(
  id: string, patch: { dailyGoal?: number | null; position?: number },
): Promise<void> {
  const row = await getRow<LocalCounter>('counters', id);
  if (!row) return;
  await putRow('counters', { ...row, ...patch, updatedAt: now() });
  kick();
}

export async function deleteCounter(id: string): Promise<void> {
  // Soft deletes don't cascade — see the note at the top of this file.
  for (const e of await rowsByIndex<LocalCounterEntry>('counterEntries', 'counterId', id)) {
    await deleteRow('counterEntries', e.id);
  }
  await deleteRow('counters', id);
  kick();
}

/**
 * Log a set. `date` defaults to the LOCAL day — using an ISO timestamp's date
 * portion would file an evening set under tomorrow for anyone east of UTC.
 */
export async function addCounterEntry(
  counterId: string, reps: number, date?: string,
): Promise<CounterEntry> {
  const row: LocalCounterEntry = {
    id: uid(), userId: requireUser(), counterId,
    date: date ?? localDay(), reps, ...stamp(),
  };
  await putRow('counterEntries', row);
  kick();
  return row;
}

export async function deleteCounterEntry(id: string): Promise<void> {
  await deleteRow('counterEntries', id);
  kick();
}

/** Today in the device's own timezone, as YYYY-MM-DD. */
export function localDay(d = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// ---------------------------------------------------------------------------
// Body measurements
// ---------------------------------------------------------------------------

export async function fetchMeasurements(): Promise<BodyMeasurement[]> {
  return (await allRows<LocalMeasurement>('measurements')).sort((a, b) => b.date.localeCompare(a.date));
}

/**
 * Upsert on date: logging a day twice edits that day rather than putting two
 * points on the trend line. The server enforces the same thing with a unique
 * index on (user_id, date), so finding the existing row here is what keeps a
 * second entry from being rejected at push time.
 */
export async function saveMeasurement(m: Partial<BodyMeasurement>, userId: string): Promise<void> {
  const all = await allRows<LocalMeasurement>('measurements');
  const existing = all.find((x) => x.date === m.date);
  await putRow('measurements', {
    id: existing?.id ?? uid(),
    userId: existing?.userId ?? userId,
    date: m.date!,
    weightKg: m.weightKg ?? null,
    neckCm: m.neckCm ?? null, shouldersCm: m.shouldersCm ?? null,
    chestCm: m.chestCm ?? null, waistCm: m.waistCm ?? null, hipsCm: m.hipsCm ?? null,
    leftArmCm: m.leftArmCm ?? null, rightArmCm: m.rightArmCm ?? null,
    leftThighCm: m.leftThighCm ?? null, rightThighCm: m.rightThighCm ?? null,
    leftCalfCm: m.leftCalfCm ?? null, rightCalfCm: m.rightCalfCm ?? null,
    notes: m.notes ?? null, ...stamp(),
  } satisfies LocalMeasurement);
  kick();
}

export async function deleteMeasurement(id: string): Promise<void> {
  await deleteRow('measurements', id);
  kick();
}
