// The whole app's state, in one context.
//
// Deliberately simple: there is no client-side cache and no optimistic update.
// Every mutation goes to Postgres and is followed by a refetch of whatever it
// touched. The dataset is one person's training history — a few thousand rows
// at the outside — so the extra round trip buys correctness for free.
//
// The one exception is the live workout screen, which keeps set inputs in
// local component state while you type and writes on blur; see LiveWorkout.

import {
  createContext, useCallback, useContext, useEffect, useMemo, useState,
  type ReactNode,
} from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase, isConfigured } from '../lib/supabase';
import * as db from '../lib/db';
import type {
  BodyMeasurement, CardioSession, Exercise, Routine, Workout,
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

  units: Units;
  setUnits: (u: Partial<Units>) => void;

  refreshExercises: () => Promise<void>;
  refreshWorkouts: () => Promise<void>;
  refreshActive: () => Promise<void>;
  refreshRoutines: () => Promise<void>;
  refreshCardio: () => Promise<void>;
  refreshMeasurements: () => Promise<void>;
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
  const [units, setUnitsState] = useState<Units>(loadUnits);

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

  const refreshAll = useCallback(async () => {
    await Promise.all([
      refreshExercises(), refreshWorkouts(), refreshActive(),
      refreshRoutines(), refreshCardio(), refreshMeasurements(),
    ]);
    setReady(true);
  }, [refreshExercises, refreshWorkouts, refreshActive, refreshRoutines,
      refreshCardio, refreshMeasurements]);

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

  useEffect(() => {
    if (!session) {
      setReady(false);
      setExercises([]); setWorkouts([]); setActiveWorkout(null);
      setRoutines([]); setCardio([]); setMeasurements([]);
      return;
    }
    void refreshAll();
  }, [session, refreshAll]);

  const exercisesById = useMemo(
    () => new Map(exercises.map((e) => [e.id, e])), [exercises]);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
  }, []);

  const value: Store = {
    session, loading, ready, error,
    exercises, exercisesById, workouts, activeWorkout, routines, cardio, measurements,
    units, setUnits,
    refreshExercises, refreshWorkouts, refreshActive, refreshRoutines,
    refreshCardio, refreshMeasurements, refreshAll, signOut,
  };

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useStore(): Store {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error('useStore must be used inside <StoreProvider>');
  return ctx;
}
