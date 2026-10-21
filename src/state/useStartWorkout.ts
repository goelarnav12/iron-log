// Starting a session, from wherever the button is (Today's hero, Train).
// Copies the routine's exercises and target set counts into a new workout,
// then opens the live screen.

import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useStore } from './store';
import * as db from '../lib/db';

export function useStartWorkout() {
  const { routines, refreshActive } = useStore();
  const nav = useNavigate();
  const [busy, setBusy] = useState(false);

  async function start(name: string, routineId?: string) {
    setBusy(true);
    try {
      const routine = routines.find((r) => r.id === routineId);
      await db.startWorkout({
        name,
        routineId: routineId ?? null,
        exercises: routine?.exercises.map((e) => ({
          exerciseId: e.exerciseId,
          sets: e.targetSets,
          notes: e.notes,
        })) ?? [],
      });
      await refreshActive();
      nav('/workout');
    } finally {
      setBusy(false);
    }
  }

  return { start, busy };
}
