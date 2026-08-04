// Pure arithmetic over the log. No DOM, no network, no app state — every
// function here is deterministic, which is what makes them testable and what
// keeps the charts honest. New arithmetic belongs here, not in a component.
//
// Universal rule: **only completed sets count.** A workout in progress is full
// of unchecked rows, and letting those into a total would make every number
// jump around while you lift.

import type {
  BodyMeasurement, CounterUnit, Exercise, Workout, WorkoutSet,
} from './types';

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

// ---------------------------------------------------------------------------
// Daily counters
//
// A day's total has TWO sources: the counter entries you tap in through the
// day, and any completed sets of the same exercise inside that day's workouts.
// They're summed but kept separately in the return value, because a total you
// can't explain is a total you stop trusting — the UI shows the split.
//
// Everything here is amount-in-a-unit, not reps: a plank counter accumulates
// seconds. The unit comes from the exercise (`counterUnit`) and is passed in,
// so nothing below has to know what a tracking type is. As everywhere else in
// this file the numbers are bare — formatting a duration is the caller's job.
// ---------------------------------------------------------------------------

/** The two amount columns of a counter entry, or of a workout set. */
type Amounts = { reps: number | null; durationS: number | null };

/**
 * What one entry contributes, in the counter's unit. An entry filled in the
 * OTHER unit counts zero rather than being added blindly — that only happens
 * if an exercise's tracking type is flipped after some history exists, and
 * summing seconds into reps would produce a number that means nothing.
 */
export const counterEntryAmount = (e: Amounts, unit: CounterUnit): number =>
  (unit === 'seconds' ? e.durationS : e.reps) ?? 0;

export interface CounterDay {
  date: string;
  /** Amount tapped into the counter. */
  entries: number;
  /** Amount of the same exercise found in that day's workouts. */
  fromWorkouts: number;
  total: number;
  /** True when a goal is set and the total reached it. */
  hitGoal: boolean;
}

/**
 * One exercise's amount per local day, from completed workout sets.
 * Warmups count here — a warmup push-up is still a push-up you did, which is
 * the opposite of how `countsForVolume` treats them for training volume.
 */
export function workoutAmountByDay(
  workouts: Workout[], exerciseId: string, unit: CounterUnit,
): Map<string, number> {
  const acc = new Map<string, number>();
  for (const w of workouts) {
    const day = dayKey(w.startedAt);
    for (const we of w.exercises) {
      if (we.exerciseId !== exerciseId) continue;
      for (const s of we.sets) {
        const amount = counterEntryAmount(s, unit);
        if (!isCounted(s) || !amount) continue;
        acc.set(day, (acc.get(day) ?? 0) + amount);
      }
    }
  }
  return acc;
}

/** Per-day totals for one counter, oldest first, days with zero omitted. */
export function counterDays(
  entries: (Amounts & { date: string })[],
  workoutAmounts: Map<string, number>,
  dailyGoal: number | null,
  unit: CounterUnit,
): CounterDay[] {
  const byDay = new Map<string, { entries: number; fromWorkouts: number }>();
  for (const e of entries) {
    const cur = byDay.get(e.date) ?? { entries: 0, fromWorkouts: 0 };
    cur.entries += counterEntryAmount(e, unit);
    byDay.set(e.date, cur);
  }
  for (const [day, amount] of workoutAmounts) {
    const cur = byDay.get(day) ?? { entries: 0, fromWorkouts: 0 };
    cur.fromWorkouts += amount;
    byDay.set(day, cur);
  }
  return [...byDay.entries()]
    .map(([date, v]) => {
      const total = v.entries + v.fromWorkouts;
      return { date, ...v, total, hitGoal: dailyGoal != null && total >= dailyGoal };
    })
    .sort((a, b) => a.date.localeCompare(b.date));
}

export interface CounterStats {
  today: number;
  bestSet: number;
  bestDay: { date: string; total: number } | null;
  currentStreak: number;
  longestStreak: number;
  lifetime: number;
  daysActive: number;
}

/**
 * A day counts toward a streak if it hit the goal, or — when no goal is set —
 * if it had any reps at all.
 *
 * The current streak tolerates today being empty: at 9am you haven't done your
 * push-ups yet, and zeroing the streak then would be both wrong and dispiriting.
 * It breaks only once YESTERDAY is missed.
 */
export function counterStats(
  days: CounterDay[],
  entries: Amounts[],
  workoutBestSet: number,
  todayKey: string,
  dailyGoal: number | null,
  unit: CounterUnit,
): CounterStats {
  // The goal has to be passed in, not inferred from the days: a goal that
  // exists but has never been hit would otherwise look like no goal at all,
  // and every non-zero day would wrongly extend the streak.
  const ok = (d: CounterDay) => (dailyGoal != null ? d.total >= dailyGoal : d.total > 0);

  const byDate = new Map(days.map((d) => [d.date, d]));

  const stepBack = (iso: string, n: number) => {
    const [y, m, dd] = iso.split('-').map(Number);
    const t = new Date(y, m - 1, dd - n);
    return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`;
  };

  let currentStreak = 0;
  let offset = 0;
  const todayDay = byDate.get(todayKey);
  if (!todayDay || !ok(todayDay)) offset = 1;
  for (;;) {
    const d = byDate.get(stepBack(todayKey, offset));
    if (!d || !ok(d)) break;
    currentStreak += 1;
    offset += 1;
  }

  let longestStreak = 0;
  let run = 0;
  let prev: string | null = null;
  for (const d of days) {
    if (!ok(d)) { run = 0; prev = d.date; continue; }
    run = prev && stepBack(d.date, 1) === prev ? run + 1 : 1;
    longestStreak = Math.max(longestStreak, run);
    prev = d.date;
  }

  const best = days.reduce<CounterDay | null>(
    (b, d) => (b == null || d.total > b.total ? d : b), null);

  return {
    today: todayDay?.total ?? 0,
    bestSet: Math.max(0, workoutBestSet, ...entries.map((e) => counterEntryAmount(e, unit))),
    bestDay: best ? { date: best.date, total: best.total } : null,
    currentStreak,
    longestStreak,
    lifetime: days.reduce((n, d) => n + d.total, 0),
    daysActive: days.filter((d) => d.total > 0).length,
  };
}

/** Best single completed set of one exercise across all workouts, in `unit`. */
export function workoutBestSetAmount(
  workouts: Workout[], exerciseId: string, unit: CounterUnit,
): number {
  let best = 0;
  for (const w of workouts) {
    for (const we of w.exercises) {
      if (we.exerciseId !== exerciseId) continue;
      for (const s of we.sets) {
        const amount = counterEntryAmount(s, unit);
        if (isCounted(s) && amount > best) best = amount;
      }
    }
  }
  return best;
}

// ---------------------------------------------------------------------------
// Progressive overload
// ---------------------------------------------------------------------------

/** A completed working set — not a warmup, and with both numbers recorded. */
const isWorkingSet = (s: WorkoutSet) =>
  countsForVolume(s) && s.weightKg != null && s.weightKg > 0 && s.reps != null && s.reps > 0;

/**
 * Working sets of one exercise, grouped by workout, newest session first.
 * Sessions where nothing qualified are dropped rather than left empty.
 */
function workingSessions(workouts: Workout[], exerciseId: string): WorkoutSet[][] {
  const byWorkout: { date: string; sets: WorkoutSet[] }[] = [];
  for (const w of workouts) {
    const sets: WorkoutSet[] = [];
    for (const we of w.exercises) {
      if (we.exerciseId !== exerciseId) continue;
      for (const s of we.sets) if (isWorkingSet(s)) sets.push(s);
    }
    if (sets.length) byWorkout.push({ date: w.startedAt, sets });
  }
  return byWorkout.sort((a, b) => b.date.localeCompare(a.date)).map((x) => x.sets);
}

/**
 * The smallest jump you can actually load: 2.5 kg, or 2.5% of the bar rounded
 * to the nearest 2.5 kg once that exceeds it. A flat 2.5 kg is right at 100 kg
 * and absurd on a 200 kg deadlift, where it is a rounding error.
 */
export function loadIncrementKg(weightKg: number): number {
  return Math.max(2.5, Math.round((weightKg * 0.025) / 2.5) * 2.5);
}

export interface OverloadSuggestion {
  action: 'increase' | 'hold' | 'deload';
  /** What to put on the bar next time, in kg. */
  weightKg: number;
  /** Reps to aim for on every working set at that weight. */
  targetReps: number;
  /** The weight the last session was actually done at. */
  lastWeightKg: number;
  /** Reps achieved last session, in set order. */
  lastReps: number[];
  sessions: number;
  reason: string;
}

/**
 * What to do next on one exercise, in the style of Hevy's auto-progression:
 * hit your target reps on every working set and the load goes up, miss it
 * badly and it comes down, anything in between holds.
 *
 * The target rep count is **inferred from your own history** rather than
 * configured. Whatever you do most often on this lift across the last few
 * sessions is what the app assumes you are training for — so a 5×5 programme
 * gets held to 5 and a hypertrophy block to 10, with nothing to set up. Ties
 * resolve to the higher count, because the harder reading is the safer one to
 * hold yourself to.
 *
 * That window includes the session being judged, which matters on the very
 * first one: with no history behind it, a session of 3,3,2 reads as triples
 * with one short set rather than as a failed set of five, so it holds rather
 * than deloading. That is the honest answer — there is no target to have
 * missed yet — and it self-corrects as soon as a second session exists.
 *
 * Returns null when there is nothing to go on: no history, or no session where
 * a completed non-warmup set carried both a weight and a rep count.
 */
export function overloadSuggestion(
  workouts: Workout[],
  exerciseId: string,
  lookback = 5,
): OverloadSuggestion | null {
  const sessions = workingSessions(workouts, exerciseId);
  if (!sessions.length) return null;

  // Most common rep count over the recent window. Counting sets rather than
  // sessions means a session of 5×5 weighs more than one stray set of 12.
  const counts = new Map<number, number>();
  for (const sets of sessions.slice(0, lookback)) {
    for (const s of sets) counts.set(s.reps!, (counts.get(s.reps!) ?? 0) + 1);
  }
  let targetReps = 0;
  let best = -1;
  for (const [reps, n] of counts) {
    if (n > best || (n === best && reps > targetReps)) {
      best = n;
      targetReps = reps;
    }
  }

  // The working weight is the heaviest load carried by a working set — a
  // top-set-then-backoff session should progress from the top set, not from
  // the average of the two.
  const last = sessions[0];
  const lastWeightKg = Math.max(...last.map((s) => s.weightKg!));
  const atWeight = last.filter((s) => s.weightKg === lastWeightKg);
  const lastReps = atWeight.map((s) => s.reps!);

  const hitAll = lastReps.every((r) => r >= targetReps);
  // "Badly missed" is more than a rep short on every set — one bad set is a
  // bad set, not a signal to strip weight off the bar.
  const missedBadly = lastReps.every((r) => r <= targetReps - 2);

  const base = { targetReps, lastWeightKg, lastReps, sessions: sessions.length };
  // `reason` carries NO weights, deliberately: this file is unit-agnostic, and
  // the caller renders `weightKg` through units.ts like every other load.
  const setWord = lastReps.length === 1 ? 'the set' : `all ${lastReps.length} sets`;

  if (hitAll) {
    return {
      ...base,
      action: 'increase',
      weightKg: lastWeightKg + loadIncrementKg(lastWeightKg),
      reason: `Hit ${targetReps} on ${setWord} last time.`,
    };
  }
  if (missedBadly) {
    // 10% off, rounded to a loadable 2.5 kg, and never below an empty bar.
    const cut = Math.max(2.5, Math.round((lastWeightKg * 0.1) / 2.5) * 2.5);
    return {
      ...base,
      action: 'deload',
      weightKg: Math.max(2.5, lastWeightKg - cut),
      reason: `Two or more reps short on ${setWord} — build back up.`,
    };
  }
  return {
    ...base,
    action: 'hold',
    weightKg: lastWeightKg,
    reason: `Not every set reached ${targetReps} yet.`,
  };
}

// ---------------------------------------------------------------------------
// Strength standards
// ---------------------------------------------------------------------------

export const STRENGTH_LEVELS = ['Beginner', 'Novice', 'Intermediate', 'Advanced', 'Elite'] as const;
export type StrengthLevel = (typeof STRENGTH_LEVELS)[number];

/**
 * Estimated 1RM as a multiple of bodyweight, at which each level begins.
 * Male figures — the app has no sex on file and these thresholds differ by it,
 * so they are stated as what they are rather than presented as universal.
 *
 * Keyed by the built-in exercise name. Only the barbell lifts with a settled
 * consensus are listed: a standard for a cable fly would be invention.
 */
export const STRENGTH_STANDARDS: Record<string, readonly number[]> = {
  'Squat (Barbell)':          [0.75, 1.25, 1.75, 2.5,  3.0],
  'Bench Press (Barbell)':    [0.5,  0.75, 1.25, 1.75, 2.0],
  'Deadlift (Barbell)':       [1.0,  1.5,  2.25, 3.0,  3.5],
  'Overhead Press (Barbell)': [0.35, 0.55, 0.8,  1.1,  1.4],
  'Bent Over Row (Barbell)':  [0.5,  0.75, 1.0,  1.5,  1.75],
  'Front Squat (Barbell)':    [0.6,  1.0,  1.4,  2.0,  2.4],
};

export interface StrengthStanding {
  ratio: number;
  /** null until the Beginner threshold is reached. */
  level: StrengthLevel | null;
  next: StrengthLevel | null;
  /** e1RM in kg still needed to reach `next`; null once Elite. */
  toNextKg: number | null;
  /** Progress from the current threshold to the next, 0–1. */
  progress: number;
}

/**
 * Where an estimated 1RM sits against the standards for that lift.
 *
 * Returns null when the lift has no published standard, when bodyweight is
 * unknown, or when there is no e1RM yet — every one of those is a reason to
 * show nothing rather than a reason to show a zero.
 */
export function strengthStanding(
  exerciseName: string,
  e1rmKg: number | null,
  bodyweightKg: number | null,
): StrengthStanding | null {
  const table = STRENGTH_STANDARDS[exerciseName];
  if (!table || e1rmKg == null || e1rmKg <= 0 || bodyweightKg == null || bodyweightKg <= 0) {
    return null;
  }
  const ratio = e1rmKg / bodyweightKg;

  // Index of the highest threshold reached, -1 when below Beginner.
  let i = -1;
  for (let k = 0; k < table.length; k++) if (ratio >= table[k]) i = k;

  const level = i >= 0 ? STRENGTH_LEVELS[i] : null;
  const next = i + 1 < table.length ? STRENGTH_LEVELS[i + 1] : null;
  if (next == null) return { ratio, level, next: null, toNextKg: null, progress: 1 };

  const floor = i >= 0 ? table[i] : 0;
  const ceil = table[i + 1];
  return {
    ratio,
    level,
    next,
    toNextKg: Math.max(0, ceil * bodyweightKg - e1rmKg),
    progress: Math.min(1, Math.max(0, (ratio - floor) / (ceil - floor))),
  };
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
