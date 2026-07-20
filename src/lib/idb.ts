// The on-device mirror of the Postgres tables, plus the outbox that makes
// offline writes durable.
//
// Everything the app reads comes from here — pages never await the network.
// `sync.ts` is the only thing that talks to Postgres, and it moves rows in
// both directions through this file.
//
// Stores hold FLAT rows, one store per Postgres table, in the app's camelCase
// shape plus two sync columns. `db.ts` assembles the nested models (a Workout
// with its exercises and sets) from those flat rows.

import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import type {
  BodyMeasurement, CardioSession, Exercise, RoutineExercise, WorkoutSet,
} from './types';

/** Every synced row carries these two. See migration_001_offline_sync.sql. */
export interface SyncFields {
  /** ISO timestamp, always set by the client. The clock last-write-wins uses. */
  updatedAt: string;
  /** Tombstone. Non-null means deleted; every read filters these out. */
  deletedAt: string | null;
}

export type LocalExercise = Exercise & SyncFields;
export type LocalRoutine = {
  id: string; userId: string; name: string; notes: string | null; position: number;
} & SyncFields;
export type LocalRoutineExercise = RoutineExercise & SyncFields;
export type LocalWorkout = {
  id: string; userId: string; name: string; routineId: string | null;
  startedAt: string; endedAt: string | null; notes: string | null;
} & SyncFields;
export type LocalWorkoutExercise = {
  id: string; workoutId: string; exerciseId: string; position: number; notes: string | null;
} & SyncFields;
export type LocalSet = WorkoutSet & SyncFields;
export type LocalCardio = CardioSession & SyncFields;
export type LocalMeasurement = BodyMeasurement & SyncFields;

/**
 * A pending write. One entry per row touched, not per user action — editing
 * the same set twice while offline collapses onto one entry, because the
 * enqueue is keyed by rowId and always carries the row's current state.
 */
export interface OutboxEntry {
  /** `<table>:<rowId>` — the collapsing key. */
  key: string;
  table: TableName;
  rowId: string;
  /** When this change was made locally; also the row's updatedAt. */
  updatedAt: string;
  /** Failed push attempts, used for backoff and to surface a stuck write. */
  attempts: number;
  lastError: string | null;
}

export type TableName =
  | 'exercises' | 'routines' | 'routineExercises' | 'workouts'
  | 'workoutExercises' | 'sets' | 'cardio' | 'measurements';

/** Local store name → Postgres table name. */
export const PG_TABLE: Record<TableName, string> = {
  exercises: 'exercises',
  routines: 'routines',
  routineExercises: 'routine_exercises',
  workouts: 'workouts',
  workoutExercises: 'workout_exercises',
  sets: 'sets',
  cardio: 'cardio_sessions',
  measurements: 'body_measurements',
};

/**
 * Push order matters: a child row referencing a parent that doesn't exist on
 * the server yet is a foreign-key violation. Parents first, always.
 */
export const PUSH_ORDER: TableName[] = [
  'exercises', 'routines', 'routineExercises', 'workouts',
  'workoutExercises', 'sets', 'cardio', 'measurements',
];

interface Schema extends DBSchema {
  exercises: { key: string; value: LocalExercise; indexes: { updatedAt: string } };
  routines: { key: string; value: LocalRoutine; indexes: { updatedAt: string } };
  routineExercises: {
    key: string; value: LocalRoutineExercise;
    indexes: { updatedAt: string; routineId: string };
  };
  workouts: {
    key: string; value: LocalWorkout;
    indexes: { updatedAt: string; startedAt: string };
  };
  workoutExercises: {
    key: string; value: LocalWorkoutExercise;
    indexes: { updatedAt: string; workoutId: string };
  };
  sets: {
    key: string; value: LocalSet;
    indexes: { updatedAt: string; workoutExerciseId: string };
  };
  cardio: { key: string; value: LocalCardio; indexes: { updatedAt: string; date: string } };
  measurements: {
    key: string; value: LocalMeasurement;
    indexes: { updatedAt: string; date: string };
  };
  outbox: { key: string; value: OutboxEntry };
  /** Sync cursors (`cursor:<table>` → ISO timestamp) and the signed-in user id. */
  meta: { key: string; value: unknown };
}

let dbPromise: Promise<IDBPDatabase<Schema>> | null = null;

/**
 * The generic helpers below are parameterised by store NAME, so idb's
 * per-store type unions can't narrow and every call fails to type-check. The
 * typed `Schema` still governs `openDB`, which is where it earns its keep
 * (store and index creation in `upgrade`); past that point this loose view is
 * the pragmatic escape hatch. Each helper's own signature restores the types.
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
type LooseDB = IDBPDatabase<any>;

export function idb(): Promise<IDBPDatabase<Schema>> {
  dbPromise ??= openDB<Schema>('iron-log', 1, {
    upgrade(database) {
      // Same reason as LooseDB below: creating stores by name defeats idb's
      // per-store narrowing, so the extra indexes wouldn't type-check.
      const d = database as unknown as IDBPDatabase<any>;

      // Every store gets an updatedAt index — that's what the incremental pull
      // cursor walks. Extra per-store indexes back the app's own lookups.
      const create = (name: TableName, indexes: string[] = []) => {
        const s = d.createObjectStore(name, { keyPath: 'id' });
        s.createIndex('updatedAt', 'updatedAt');
        for (const i of indexes) s.createIndex(i, i);
      };
      create('exercises');
      create('routines');
      create('routineExercises', ['routineId']);
      create('workouts', ['startedAt']);
      create('workoutExercises', ['workoutId']);
      create('sets', ['workoutExerciseId']);
      create('cardio', ['date']);
      create('measurements', ['date']);
      d.createObjectStore('outbox', { keyPath: 'key' });
      d.createObjectStore('meta');
    },
  });
  return dbPromise;
}

// ---------------------------------------------------------------------------
// Reads. All of them drop tombstones — callers never see a deleted row.
// ---------------------------------------------------------------------------

const alive = <T extends SyncFields>(rows: T[]) => rows.filter((r) => !r.deletedAt);

export async function allRows<T extends SyncFields>(table: TableName): Promise<T[]> {
  const d = (await idb()) as LooseDB;
  return alive((await d.getAll(table)) as T[]);
}

export async function rowsByIndex<T extends SyncFields>(
  table: TableName, index: string, value: string,
): Promise<T[]> {
  const d = (await idb()) as LooseDB;
  return alive((await d.getAllFromIndex(table, index, value)) as T[]);
}

export async function getRow<T extends SyncFields>(
  table: TableName, id: string,
): Promise<T | undefined> {
  const d = (await idb()) as LooseDB;
  const row = (await d.get(table, id)) as T | undefined;
  return row && !row.deletedAt ? row : undefined;
}

/** Like getRow but keeps tombstones — sync needs them for the LWW comparison. */
export async function getRowRaw<T extends SyncFields>(
  table: TableName, id: string,
): Promise<T | undefined> {
  const d = (await idb()) as LooseDB;
  return (await d.get(table, id)) as T | undefined;
}

// ---------------------------------------------------------------------------
// Writes. Every local mutation goes through one of these two so that nothing
// can change a row without also queueing it for the server.
// ---------------------------------------------------------------------------

/**
 * Write a row locally and queue it. Stamps `updatedAt` unless the caller
 * supplies one — sync.ts does, when applying a row pulled from the server,
 * and passes `enqueue: false` so a remote change isn't echoed straight back.
 */
export async function putRow<T extends SyncFields & { id: string }>(
  table: TableName,
  row: T,
  opts: { enqueue?: boolean } = {},
): Promise<T> {
  const enqueue = opts.enqueue !== false;
  const d = (await idb()) as LooseDB;
  const tx = d.transaction([table, 'outbox'], 'readwrite');
  await tx.objectStore(table).put(row);
  if (enqueue) {
    // Attempts reset to 0 deliberately: re-editing a row that previously failed
    // to push produces a different payload, so it deserves a clean try rather
    // than inheriting the old entry's backoff.
    const entry: OutboxEntry = {
      key: `${table}:${row.id}`,
      table,
      rowId: row.id,
      updatedAt: row.updatedAt,
      attempts: 0,
      lastError: null,
    };
    await tx.objectStore('outbox').put(entry);
  }
  await tx.done;
  return row;
}

/** Soft delete: a tombstone is an ordinary update that syncs like any other. */
export async function deleteRow(table: TableName, id: string): Promise<void> {
  const row = await getRowRaw<SyncFields & { id: string }>(table, id);
  if (!row) return;
  const ts = new Date().toISOString();
  await putRow(table, { ...row, deletedAt: ts, updatedAt: ts });
}

// ---------------------------------------------------------------------------
// Outbox + cursors
// ---------------------------------------------------------------------------

export async function outboxAll(): Promise<OutboxEntry[]> {
  const d = (await idb()) as LooseDB;
  return d.getAll('outbox');
}

export async function outboxCount(): Promise<number> {
  const d = (await idb()) as LooseDB;
  return d.count('outbox');
}

export async function outboxClear(key: string): Promise<void> {
  const d = (await idb()) as LooseDB;
  await d.delete('outbox', key);
}

export async function outboxPut(e: OutboxEntry): Promise<void> {
  const d = (await idb()) as LooseDB;
  await d.put('outbox', e);
}

export async function outboxFail(key: string, message: string): Promise<void> {
  const d = (await idb()) as LooseDB;
  const e = (await d.get('outbox', key)) as OutboxEntry | undefined;
  if (!e) return;
  await d.put('outbox', { ...e, attempts: e.attempts + 1, lastError: message });
}

export const getCursor = async (t: TableName): Promise<string | null> =>
  ((await ((await idb()) as LooseDB).get('meta', `cursor:${t}`)) as string | undefined) ?? null;

export const setCursor = async (t: TableName, iso: string): Promise<void> => {
  await ((await idb()) as LooseDB).put('meta', iso, `cursor:${t}`);
};

export const getMeta = async <T>(k: string): Promise<T | undefined> =>
  (await ((await idb()) as LooseDB).get('meta', k)) as T | undefined;

export const setMeta = async (k: string, v: unknown): Promise<void> => {
  await ((await idb()) as LooseDB).put('meta', v, k);
};

/**
 * Wipe everything. Used on sign-out, and when a different account signs in on
 * the same device — otherwise the new user would inherit the previous one's
 * mirror, and RLS would reject every row in the outbox.
 */
export async function wipe(): Promise<void> {
  const d = (await idb()) as LooseDB;
  const stores: (TableName | 'outbox' | 'meta')[] = [...PUSH_ORDER, 'outbox', 'meta'];
  const tx = d.transaction(stores, 'readwrite');
  await Promise.all(stores.map((s) => tx.objectStore(s).clear()));
  await tx.done;
}
