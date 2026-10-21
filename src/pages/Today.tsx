// The home screen. Every block answers a question you have standing in the
// gym doorway, top to bottom in the order you have it:
//
//   what am I doing?        → the hero: resume, or the routine that's due
//   am I on track?          → this week against your target, and the streak
//   what's been neglected?  → days since each muscle group was trained
//   daily habits?           → today's counters, with a one-tap add
//   anything to celebrate?  → PRs from the last two weeks
//   where's my weight going → the 7-day average and its direction
//
// The charts that used to live here moved to Progress › Trends: they answer
// "what happened", which isn't a doorway question.

import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useStore } from '../state/store';
import { useStartWorkout } from '../state/useStartWorkout';
import * as db from '../lib/db';
import { Empty } from '../components/ui';
import { Icon } from '../components/Icon';
import { SyncIndicator } from '../components/SyncIndicator';
import { WorkoutRow } from '../components/WorkoutRow';
import {
  counterDays, counterEntryAmount, daysSince, daysSinceByMuscle, nextRoutine, recentPRs,
  weekKey, weekStreak, weightTrend, workoutAmountByDay, workoutSetCount,
} from '../lib/stats';
import { counterUnit, type Counter, type CounterUnit } from '../lib/types';
import { formatDuration, formatDurationShort, kgTo, trim } from '../lib/units';

/** Set on the You screen. Display preference, so localStorage, like rest time. */
const TARGET_KEY = 'ht.weeklyTarget';
const weeklyTarget = () => Number(localStorage.getItem(TARGET_KEY) ?? 3) || 3;

/** A muscle group this many days untrained is flagged as due. */
const DUE_DAYS = 5;

/** How far back a PR still counts as news. */
const PR_WINDOW_DAYS = 14;

const ago = (days: number) => (days === 0 ? 'today' : days === 1 ? 'yesterday' : `${days} days ago`);

export function Today() {
  const {
    workouts, activeWorkout, routines, exercisesById, counters, measurements, units, ready, error,
  } = useStore();
  const { start, busy } = useStartWorkout();

  const thisWeek = weekKey(new Date().toISOString());
  const weekWorkouts = workouts.filter((w) => weekKey(w.startedAt) === thisWeek);
  const weekSets = weekWorkouts.reduce((n, w) => n + workoutSetCount(w), 0);
  const target = weeklyTarget();
  const streak = weekStreak(workouts);

  const next = useMemo(() => nextRoutine(routines, workouts), [routines, workouts]);
  const fresh = useMemo(() => daysSinceByMuscle(workouts, exercisesById).slice(0, 6), [workouts, exercisesById]);
  const prs = useMemo(
    () => recentPRs(workouts, new Date(Date.now() - PR_WINDOW_DAYS * 86400000).toISOString()),
    [workouts]);
  const weight = useMemo(() => weightTrend(measurements), [measurements]);

  if (error) return <div className="page"><div className="error-note">{error}</div></div>;
  if (!ready) return <div className="page"><span className="faint">Loading…</span></div>;

  const pr = prs[0];

  return (
    <div className="page">
      <div className="today-head">
        <div>
          <div className="eyebrow">
            {new Date().toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'short' })}
          </div>
          <h1>Today</h1>
        </div>
        <SyncIndicator />
      </div>

      {activeWorkout ? (
        <div className="hero">
          <div className="eyebrow">In progress · {formatDurationShort(
            Math.max(0, Math.round((Date.now() - Date.parse(activeWorkout.startedAt)) / 1000)))}</div>
          <div className="name">{activeWorkout.name}</div>
          <div className="actions">
            <Link to="/workout" className="btn ink">Resume workout <Icon name="arrow" /></Link>
          </div>
        </div>
      ) : next ? (
        <div className="hero">
          <div className="eyebrow">
            Next up · {next.lastDone ? `last done ${ago(daysSince(next.lastDone))}` : 'not done yet'}
          </div>
          <div className="name">{next.routine.name}</div>
          <div className="detail">
            {next.routine.exercises.map((e) => exercisesById.get(e.exerciseId)?.name ?? '?').join(' · ') || 'No exercises'}
          </div>
          <div className="actions">
            <button className="btn ink" disabled={busy} onClick={() => void start(next.routine.name, next.routine.id)}>
              Start workout <Icon name="arrow" />
            </button>
            <Link to="/train" className="btn ghost">Other</Link>
          </div>
        </div>
      ) : (
        <div className="hero">
          <div className="eyebrow">No routines yet</div>
          <div className="name">Lift something</div>
          <div className="actions">
            <button className="btn ink" disabled={busy} onClick={() => void start('Workout')}>
              Empty workout <Icon name="arrow" />
            </button>
            <Link to="/routines/new" className="btn ghost">Build a routine</Link>
          </div>
        </div>
      )}

      <div className="today-grid">
        <div className="stat-grid wide" style={{ gridTemplateColumns: 'repeat(3, minmax(0, 1fr))' }}>
          <div className="stat">
            <div className="label">This week</div>
            <div className="value">{weekWorkouts.length}<span className="unit">/{target}</span></div>
            <div className="segments" aria-hidden="true">
              {Array.from({ length: Math.max(target, weekWorkouts.length) }, (_, i) => (
                <span key={i} className={i < weekWorkouts.length ? 'on' : ''} />
              ))}
            </div>
          </div>
          <div className="stat">
            <div className="label">Streak</div>
            <div className="value">{streak}<span className="unit">wk</span></div>
          </div>
          <div className="stat">
            <div className="label">Sets</div>
            <div className="value">{weekSets}</div>
          </div>
        </div>

        <div className="card wide">
          <div className="card-head">
            <h2>Days since trained</h2>
            <span className="hint">Due ≥ {DUE_DAYS} days</span>
          </div>
          {fresh.length === 0 ? <Empty>Finish a workout and this fills in.</Empty> : (
            <div className="fresh-grid">
              {fresh.map((f) => (
                <div key={f.muscle} className={`fresh ${f.days >= DUE_DAYS ? 'due' : ''}`}>
                  <div className="m">{f.muscle}</div>
                  <div className="d">{f.days}d</div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="card wide">
          <div className="card-head">
            <h2>Daily</h2>
            <Link to="/daily">{counters.length ? 'Manage →' : 'Set one up →'}</Link>
          </div>
          {counters.length === 0
            ? <div className="faint" style={{ fontSize: 14 }}>Track push-ups, planks, anything you rack up through the day.</div>
            : counters.map((c) => {
              const ex = exercisesById.get(c.exerciseId);
              return (
                <CounterLine
                  key={c.id}
                  counter={c}
                  name={ex?.name ?? 'Unknown'}
                  unit={ex ? counterUnit(ex.trackingType) : 'reps'}
                />
              );
            })}
        </div>

        <div className="card half">
          <div className="eyebrow" style={pr ? { color: 'var(--pr)' } : undefined}>
            {pr ? `New PR · ${ago(daysSince(pr.date))}` : 'PRs'}
          </div>
          {pr ? (
            <>
              <div style={{ fontWeight: 600, marginTop: 2 }}>
                <Link to={`/exercises/${pr.exerciseId}`}>{exercisesById.get(pr.exerciseId)?.name ?? 'Exercise'}</Link>
              </div>
              <div className="big-num">
                {trim(kgTo(pr.weightKg, units.weight))} × {pr.reps}
                <span className="unit">{units.weight}</span>
              </div>
              {prs.length > 1 && <div className="faint" style={{ fontSize: 13 }}>+{prs.length - 1} more this fortnight</div>}
            </>
          ) : (
            <div className="faint" style={{ fontSize: 14, marginTop: 4 }}>None in the last {PR_WINDOW_DAYS} days. Go get one.</div>
          )}
        </div>

        <Link to="/body" className="card half" style={{ display: 'block' }}>
          <div className="eyebrow">Bodyweight · 7-day avg</div>
          {weight ? (
            <>
              <div className="big-num" style={{ marginTop: 6 }}>
                {trim(kgTo(weight.avgKg, units.weight), 1)}<span className="unit">{units.weight}</span>
              </div>
              <div className="muted" style={{ fontSize: 13 }}>
                {weight.deltaKg == null
                  ? 'Not enough history for a trend yet'
                  : `${weight.deltaKg > 0 ? '+' : weight.deltaKg < 0 ? '−' : '±'}${trim(Math.abs(kgTo(weight.deltaKg, units.weight)), 1)} ${units.weight} vs a week ago`}
              </div>
            </>
          ) : (
            <div className="faint" style={{ fontSize: 14, marginTop: 4 }}>No weigh-ins yet. Log one →</div>
          )}
        </Link>
      </div>

      {workouts[0] && (
        <>
          <div className="section-head">
            <h2>Last session</h2>
            <Link to="/history" className="btn ghost sm">History →</Link>
          </div>
          <WorkoutRow workout={workouts[0]} />
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------

/**
 * One counter, compact: today's total against the goal, and a button that adds
 * your usual set. "Usual" is the amount you've tapped in most often — the
 * Daily screen has the full chip row for anything else.
 */
function CounterLine({ counter, name, unit }: { counter: Counter; name: string; unit: CounterUnit }) {
  const { counterEntries, workouts, refreshCounters } = useStore();
  const [busy, setBusy] = useState(false);
  const today = db.localDay();

  const { total, step } = useMemo(() => {
    const entries = counterEntries.filter((e) => e.counterId === counter.id);
    const days = counterDays(entries, workoutAmountByDay(workouts, counter.exerciseId, unit), counter.dailyGoal, unit);
    const tally = new Map<number, number>();
    for (const e of entries) {
      const n = counterEntryAmount(e, unit);
      if (n > 0) tally.set(n, (tally.get(n) ?? 0) + 1);
    }
    const usual = [...tally.entries()].sort((a, b) => b[1] - a[1] || b[0] - a[0])[0]?.[0];
    return {
      total: days.find((d) => d.date === today)?.total ?? 0,
      step: usual ?? (unit === 'seconds' ? 30 : 10),
    };
  }, [counterEntries, workouts, counter, unit, today]);

  const show = (n: number) => (unit === 'seconds' ? formatDuration(n) : String(n));
  const goal = counter.dailyGoal;

  async function add() {
    setBusy(true);
    try {
      await db.addCounterEntry(counter.id, step, unit);
      await refreshCounters();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="counter-line">
      <div className="grow">
        <div className="top">
          <span>{name}</span>
          <span className="mono">{show(total)}{goal != null && <span className="faint"> / {show(goal)}</span>}</span>
        </div>
        {goal != null && (
          <div className="goal-bar"><div style={{ width: `${Math.min(100, (total / goal) * 100)}%` }} /></div>
        )}
      </div>
      <button className="btn square" disabled={busy} onClick={() => void add()} aria-label={`Add ${show(step)} ${name}`}>
        +{unit === 'seconds' ? show(step) : step}
      </button>
    </div>
  );
}
