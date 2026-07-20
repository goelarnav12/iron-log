// Pure arithmetic over the log. No DOM, no network, no app state — every
// function here is deterministic, which is what makes them testable and what
// keeps the charts honest. New arithmetic belongs here, not in a component.
//
// Universal rule: **only completed sets count.** A workout in progress is full
// of unchecked rows, and letting those into a total would make every number
// jump around while you lift.

import type { BodyMeasurement, Exercise, Workout, WorkoutSet } from './types';

export const isCounted = (s: WorkoutSet) => s.completed;

/** Warmups are completed work but not training volume, so they're excluded. */
export const countsForVolume = (s: WorkoutSet) => s.completed && s.setType !== 'warmup';

/**
 * Epley estimated 1RM. Used for the strength-progression chart, where the
 * point is comparing 5x100 against 3x110 on one axis.
 *
 * Above ~12 reps the formula drifts badly (it would credit 20x60 with a 140kg
 * max), so those sets return null and simply don't plot.
 */
export function epley1RM(weightKg: number | null, reps: number | null): number | null {
  if (weightKg == null || reps == null || weightKg <= 0 || reps <= 0) return null;
  if (reps > 12) return null;
  if (reps === 1) return weightKg;
  return weightKg * (1 + reps / 30);
}

export function setVolume(s: WorkoutSet): number {
  if (!countsForVolume(s)) return 0;
  return (s.weightKg ?? 0) * (s.reps ?? 0);
}

export function workoutVolume(w: Workout): number {
  return w.exercises.reduce(
    (t, we) => t + we.sets.reduce((st, s) => st + setVolume(s), 0),
    0,
  );
}

export function workoutSetCount(w: Workout): number {
  return w.exercises.reduce((t, we) => t + we.sets.filter(countsForVolume).length, 0);
}

export function workoutRepCount(w: Workout): number {
  return w.exercises.reduce(
    (t, we) => t + we.sets.filter(countsForVolume).reduce((r, s) => r + (s.reps ?? 0), 0),
    0,
  );
}

export function workoutDurationS(w: Workout): number {
  if (!w.endedAt) return 0;
  return Math.max(0, (Date.parse(w.endedAt) - Date.parse(w.startedAt)) / 1000);
}

// ---------------------------------------------------------------------------
// Personal records
// ---------------------------------------------------------------------------

export interface ExercisePR {
  exerciseId: string;
  /** Heaviest weight lifted for at least one rep. */
  bestWeightKg: number | null;
  /** Reps achieved at that weight, for context — "100kg × 3" reads better. */
  bestWeightReps: number | null;
  /** Highest single-set volume (weight × reps). */
  bestSetVolume: number;
  /** Highest Epley estimate across all sets. */
  best1RM: number | null;
  bestReps: number | null;
  bestDurationS: number | null;
  date: string | null;
}

/** PRs for every exercise appearing in `workouts`, keyed by exercise id. */
export function personalRecords(workouts: Workout[]): Map<string, ExercisePR> {
  const prs = new Map<string, ExercisePR>();
  for (const w of workouts) {
    for (const we of w.exercises) {
      const pr = prs.get(we.exerciseId) ?? {
        exerciseId: we.exerciseId,
        bestWeightKg: null,
        bestWeightReps: null,
        bestSetVolume: 0,
        best1RM: null,
        bestReps: null,
        bestDurationS: null,
        date: null,
      };
      for (const s of we.sets) {
        if (!isCounted(s)) continue;
        let improved = false;

        if (s.weightKg != null && s.reps != null && s.reps > 0) {
          if (pr.bestWeightKg == null || s.weightKg > pr.bestWeightKg) {
            pr.bestWeightKg = s.weightKg;
            pr.bestWeightReps = s.reps;
            improved = true;
          }
          const vol = s.weightKg * s.reps;
          if (vol > pr.bestSetVolume) {
            pr.bestSetVolume = vol;
            improved = true;
          }
        }
        const e1rm = epley1RM(s.weightKg, s.reps);
        if (e1rm != null && (pr.best1RM == null || e1rm > pr.best1RM)) {
          pr.best1RM = e1rm;
          improved = true;
        }
        if (s.reps != null && (pr.bestReps == null || s.reps > pr.bestReps)) {
          pr.bestReps = s.reps;
          improved = true;
        }
        if (s.durationS != null && (pr.bestDurationS == null || s.durationS > pr.bestDurationS)) {
          pr.bestDurationS = s.durationS;
          improved = true;
        }
        if (improved) pr.date = w.startedAt;
      }
      prs.set(we.exerciseId, pr);
    }
  }
  return prs;
}

/**
 * Best estimated 1RM per session for one exercise, oldest first — the series
 * behind the strength chart. Sessions where every set was too high-rep to
 * estimate from are dropped rather than plotted as zero.
 */
export function strengthSeries(
  workouts: Workout[],
  exerciseId: string,
): { date: string; e1rm: number; topSetKg: number }[] {
  const points: { date: string; e1rm: number; topSetKg: number }[] = [];
  for (const w of workouts) {
    let best = 0;
    let topSet = 0;
    for (const we of w.exercises) {
      if (we.exerciseId !== exerciseId) continue;
      for (const s of we.sets) {
        if (!isCounted(s)) continue;
        const e = epley1RM(s.weightKg, s.reps);
        if (e != null && e > best) best = e;
        if ((s.weightKg ?? 0) > topSet) topSet = s.weightKg ?? 0;
      }
    }
    if (best > 0) points.push({ date: w.startedAt, e1rm: best, topSetKg: topSet });
  }
  return points.sort((a, b) => a.date.localeCompare(b.date));
}

// ---------------------------------------------------------------------------
// Aggregations
// ---------------------------------------------------------------------------

/** ISO week key, `2026-W03` — sorts lexicographically, which the charts rely on. */
export function weekKey(iso: string): string {
  const d = new Date(iso);
  const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  // Thursday of the current week determines the ISO year.
  const day = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((t.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return `${t.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}

export function volumeByWeek(workouts: Workout[]): { week: string; volume: number; workouts: number }[] {
  const acc = new Map<string, { volume: number; workouts: number }>();
  for (const w of workouts) {
    const k = weekKey(w.startedAt);
    const cur = acc.get(k) ?? { volume: 0, workouts: 0 };
    cur.volume += workoutVolume(w);
    cur.workouts += 1;
    acc.set(k, cur);
  }
  return [...acc.entries()]
    .map(([week, v]) => ({ week, ...v }))
    .sort((a, b) => a.week.localeCompare(b.week));
}

/**
 * Sets per muscle group over the given workouts — the "am I balanced?" view.
 * Counted in sets rather than kilos on purpose: a set of lateral raises and a
 * set of squats are comparable as training stimulus, their tonnage is not.
 */
export function setsByMuscle(
  workouts: Workout[],
  exercises: Map<string, Exercise>,
): { muscle: string; sets: number }[] {
  const acc = new Map<string, number>();
  for (const w of workouts) {
    for (const we of w.exercises) {
      const ex = exercises.get(we.exerciseId);
      if (!ex) continue;
      const n = we.sets.filter(countsForVolume).length;
      if (n) acc.set(ex.muscleGroup, (acc.get(ex.muscleGroup) ?? 0) + n);
    }
  }
  return [...acc.entries()]
    .map(([muscle, sets]) => ({ muscle, sets }))
    .sort((a, b) => b.sets - a.sets);
}

/** Local-time `YYYY-MM-DD`. Not `toISOString()`, which would shift the day. */
export function dayKey(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/**
 * Consecutive *weeks* containing at least one workout, counting back from the
 * current week. Weeks, not days — nobody trains 7 days a week, and a day-based
 * streak would break every rest day and mean nothing.
 */
export function weekStreak(workouts: Workout[], now = new Date()): number {
  const weeks = new Set(workouts.map((w) => weekKey(w.startedAt)));
  let streak = 0;
  const cursor = new Date(now);
  // Allow the current week to be empty without breaking the streak — it may
  // simply not have happened yet.
  if (!weeks.has(weekKey(cursor.toISOString()))) cursor.setDate(cursor.getDate() - 7);
  while (weeks.has(weekKey(cursor.toISOString()))) {
    streak += 1;
    cursor.setDate(cursor.getDate() - 7);
  }
  return streak;
}

/** Trailing moving average, used to calm the bodyweight line down. */
export function movingAverage(values: (number | null)[], window: number): (number | null)[] {
  const out: (number | null)[] = [];
  const buf: number[] = [];
  for (const v of values) {
    if (v != null) {
      buf.push(v);
      if (buf.length > window) buf.shift();
    }
    out.push(buf.length ? buf.reduce((a, b) => a + b, 0) / buf.length : null);
  }
  return out;
}

export function weightSeries(
  measurements: BodyMeasurement[],
): { date: string; weightKg: number; avg: number | null }[] {
  const points = measurements
    .filter((m) => m.weightKg != null)
    .sort((a, b) => a.date.localeCompare(b.date));
  const avg = movingAverage(points.map((p) => p.weightKg), 7);
  return points.map((p, i) => ({ date: p.date, weightKg: p.weightKg!, avg: avg[i] }));
}

export interface Totals {
  workouts: number;
  volume: number;
  sets: number;
  reps: number;
  durationS: number;
}

export function totals(workouts: Workout[]): Totals {
  return workouts.reduce<Totals>(
    (t, w) => ({
      workouts: t.workouts + 1,
      volume: t.volume + workoutVolume(w),
      sets: t.sets + workoutSetCount(w),
      reps: t.reps + workoutRepCount(w),
      durationS: t.durationS + workoutDurationS(w),
    }),
    { workouts: 0, volume: 0, sets: 0, reps: 0, durationS: 0 },
  );
}
