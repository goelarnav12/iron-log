// The whole app's state, in one context.
//
// The app is LOCAL-FIRST: every read and write in `db.ts` hits IndexedDB on
// the device, so nothing here awaits the network and the whole app works
// offline. `sync.ts` reconciles with Postgres in the background and this
// provider re-reads the mirror whenever a sync lands.
//
// Mutations still follow mutate-then-refresh, but "refresh" is now an
// IndexedDB read costing a millisecond rather than a round trip.

import {
  createContext, useCallback, useContext, useEffect, useMemo, useRef, useState,
  type ReactNode,
} from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase, isConfigured } from '../lib/supabase';
import * as db from '../lib/db';
import * as sync from '../lib/sync';
import { getMeta, setMeta, wipe } from '../lib/idb';
import type {
  BodyMeasurement, CardioSession, Counter, CounterEntry, Exercise, Routine, Workout,
} from '../lib/types';
import type { DistanceUnit, LengthUnit, WeightUnit } from '../lib/units';

interface Units {
  weight: WeightUnit;
  length: LengthUnit;
  distance: DistanceUnit;
}

const DEFAULT_UNITS: Units = { weight: 'kg', length: 'cm', distance: 'km' };

interface Store {
  session: Session | null;
  loading: boolean;
  /** True once the first data load after sign-in has finished. */
  ready: boolean;
  error: string | null;

  exercises: Exercise[];
  exercisesById: Map<string, Exercise>;
  workouts: Workout[];
  activeWorkout: Workout | null;
  routines: Routine[];
  cardio: CardioSession[];
  measurements: BodyMeasurement[];
  counters: Counter[];
  counterEntries: CounterEntry[];

  units: Units;
  setUnits: (u: Partial<Units>) => void;

  /** Background sync state, for the header indicator. */
  syncStatus: sync.SyncStatus;
  syncNow: () => Promise<void>;
  retryStuck: () => Promise<void>;

  refreshExercises: () => Promise<void>;
  refreshWorkouts: () => Promise<void>;
  refreshActive: () => Promise<void>;
  refreshRoutines: () => Promise<void>;
  refreshCardio: () => Promise<void>;
  refreshMeasurements: () => Promise<void>;
  refreshCounters: () => Promise<void>;
  refreshAll: () => Promise<void>;
  signOut: () => Promise<void>;
}

const StoreContext = createContext<Store | null>(null);

// Unit preference is a display setting, not data — localStorage is the right
// home for it, and it means the choice survives a signed-out reload.
const UNITS_KEY = 'ht.units';

function loadUnits(): Units {
  try {
    const raw = localStorage.getItem(UNITS_KEY);
    return raw ? { ...DEFAULT_UNITS, ...JSON.parse(raw) } : DEFAULT_UNITS;
  } catch {
    return DEFAULT_UNITS;
  }
}

export function StoreProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [exercises, setExercises] = useState<Exercise[]>([]);
  const [workouts, setWorkouts] = useState<Workout[]>([]);
  const [activeWorkout, setActiveWorkout] = useState<Workout | null>(null);
  const [routines, setRoutines] = useState<Routine[]>([]);
  const [cardio, setCardio] = useState<CardioSession[]>([]);
  const [measurements, setMeasurements] = useState<BodyMeasurement[]>([]);
  const [counters, setCounters] = useState<Counter[]>([]);
  const [counterEntries, setCounterEntries] = useState<CounterEntry[]>([]);
  const [units, setUnitsState] = useState<Units>(loadUnits);
  const [syncStatus, setSyncStatus] = useState<sync.SyncStatus>(sync.getStatus);

  const setUnits = useCallback((u: Partial<Units>) => {
    setUnitsState((prev) => {
      const next = { ...prev, ...u };
      localStorage.setItem(UNITS_KEY, JSON.stringify(next));
      return next;
    });
  }, []);

  // Any refresh can fail (offline, expired token). Surfacing it once here
  // beats a try/catch at every call site.
  const guard = useCallback(async (fn: () => Promise<void>) => {
    try {
      await fn();
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, []);

  const refreshExercises = useCallback(
    () => guard(async () => setExercises(await db.fetchExercises())), [guard]);
  const refreshWorkouts = useCallback(
    () => guard(async () => setWorkouts(await db.fetchWorkouts())), [guard]);
  const refreshActive = useCallback(
    () => guard(async () => setActiveWorkout(await db.fetchActiveWorkout())), [guard]);
  const refreshRoutines = useCallback(
    () => guard(async () => setRoutines(await db.fetchRoutines())), [guard]);
  const refreshCardio = useCallback(
    () => guard(async () => setCardio(await db.fetchCardio())), [guard]);
  const refreshMeasurements = useCallback(
    () => guard(async () => setMeasurements(await db.fetchMeasurements())), [guard]);
  // Counters and their entries always move together — every screen that reads
  // one needs the other to compute a daily total.
  const refreshCounters = useCallback(
    () => guard(async () => {
      setCounters(await db.fetchCounters());
      setCounterEntries(await db.fetchCounterEntries());
    }), [guard]);

  const refreshAll = useCallback(async () => {
    await Promise.all([
      refreshExercises(), refreshWorkouts(), refreshActive(),
      refreshRoutines(), refreshCardio(), refreshMeasurements(), refreshCounters(),
    ]);
    setReady(true);
  }, [refreshExercises, refreshWorkouts, refreshActive, refreshRoutines,
      refreshCardio, refreshMeasurements, refreshCounters]);

  useEffect(() => {
    if (!isConfigured) {
      setLoading(false);
      return;
    }
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => {
      setSession(s);
      setLoading(false);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  // Keeps the latest refreshAll reachable from the sync subscription without
  // making that subscription re-run on every render.
  const refreshRef = useRef(refreshAll);
  refreshRef.current = refreshAll;

  useEffect(() => {
    if (!session) {
      db.setCurrentUser(null);
      setReady(false);
      setExercises([]); setWorkouts([]); setActiveWorkout(null);
      setRoutines([]); setCardio([]); setMeasurements([]);
      setCounters([]); setCounterEntries([]);
      return;
    }

    let stop: (() => void) | undefined;
    let cancelled = false;

    void (async () => {
      // A different account on this device would inherit the previous user's
      // mirror, and every row in the outbox would then be rejected by RLS.
      const previous = await getMeta<string>('userId');
      if (previous && previous !== session.user.id) await wipe();
      await setMeta('userId', session.user.id);

      db.setCurrentUser(session.user.id);
      if (cancelled) return;

      // Render from whatever is already on disk before the network is involved
      // at all — this is what makes a cold start offline show your history.
      await refreshAll();
      stop = sync.startSync();
    })();

    return () => { cancelled = true; stop?.(); };
  }, [session, refreshAll]);

  // A completed sync may have pulled rows from another device; re-read the
  // mirror so the UI reflects them.
  useEffect(() => {
    let previous = sync.getStatus().lastSyncedAt;
    return sync.subscribe((s) => {
      setSyncStatus(s);
      if (s.lastSyncedAt && s.lastSyncedAt !== previous) {
        previous = s.lastSyncedAt;
        void refreshRef.current();
      }
    });
  }, []);

  const exercisesById = useMemo(
    () => new Map(exercises.map((e) => [e.id, e])), [exercises]);

  const signOut = useCallback(async () => {
    // Push anything still queued before the token goes away, otherwise those
    // writes are stranded on disk until the same account signs back in.
    await sync.syncNow().catch(() => {});
    await wipe();
    await supabase.auth.signOut();
  }, []);

  const value: Store = {
    session, loading, ready, error,
    exercises, exercisesById, workouts, activeWorkout, routines, cardio, measurements,
    counters, counterEntries,
    units, setUnits,
    syncStatus, syncNow: sync.syncNow, retryStuck: sync.retryStuck,
    refreshExercises, refreshWorkouts, refreshActive, refreshRoutines,
    refreshCardio, refreshMeasurements, refreshCounters, refreshAll, signOut,
  };

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useStore(): Store {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error('useStore must be used inside <StoreProvider>');
  return ctx;
}
