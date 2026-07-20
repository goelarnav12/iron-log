// Daily rep counters — push-ups and anything else you accumulate through the
// day rather than train in a session.
//
// The day's number combines two sources: entries you tap in here, and
// completed sets of the same exercise from that day's workouts. They're always
// shown split, because a total you can't account for is one you stop trusting.

import { useMemo, useState } from 'react';
import {
  Bar, BarChart, CartesianGrid, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';
import { useStore } from '../state/store';
import * as db from '../lib/db';
import { ConfirmButton, Empty, Field, Modal, Stat } from '../components/ui';
import { ExercisePicker } from '../components/ExercisePicker';
import {
  counterDays, counterStats, workoutBestSetReps, workoutRepsByDay,
} from '../lib/stats';
import type { Counter } from '../lib/types';

/** Offered as one-tap buttons. Covers most sets people actually do. */
const QUICK = [5, 10, 15, 20, 25, 30, 50];

const shortDate = (iso: string) =>
  new Date(`${iso}T12:00:00`).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });

export function Counters() {
  const { counters, exercisesById, ready } = useStore();
  const [adding, setAdding] = useState(false);

  if (!ready) return <div className="page"><span className="faint">Loading…</span></div>;

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Daily</h1>
          <div className="sub">Reps you rack up through the day.</div>
        </div>
        <button className="btn primary" onClick={() => setAdding(true)}>+ Track exercise</button>
      </div>

      {counters.length === 0 && (
        <Empty>
          Nothing tracked yet. Add push-ups and start tapping.
        </Empty>
      )}

      {counters.map((c) => (
        <CounterCard key={c.id} counter={c} name={exercisesById.get(c.exerciseId)?.name ?? 'Unknown'} />
      ))}

      {adding && <AddCounter onClose={() => setAdding(false)} />}
    </div>
  );
}

// ---------------------------------------------------------------------------

function CounterCard({ counter, name }: { counter: Counter; name: string }) {
  const { counterEntries, workouts, refreshCounters } = useStore();
  const [custom, setCustom] = useState('');
  const [editing, setEditing] = useState(false);
  const [armed, setArmed] = useState(false);
  const [busy, setBusy] = useState(false);

  const today = db.localDay();

  const entries = useMemo(
    () => counterEntries.filter((e) => e.counterId === counter.id),
    [counterEntries, counter.id]);

  const { days, stats, todayEntries, todayFromWorkouts } = useMemo(() => {
    const wReps = workoutRepsByDay(workouts, counter.exerciseId);
    const d = counterDays(entries, wReps, counter.dailyGoal);
    return {
      days: d,
      stats: counterStats(
        d, entries, workoutBestSetReps(workouts, counter.exerciseId), today, counter.dailyGoal),
      todayEntries: entries.filter((e) => e.date === today),
      todayFromWorkouts: wReps.get(today) ?? 0,
    };
  }, [entries, workouts, counter.exerciseId, counter.dailyGoal, today]);

  async function add(reps: number) {
    if (!Number.isFinite(reps) || reps <= 0) return;
    setBusy(true);
    try {
      await db.addCounterEntry(counter.id, Math.round(reps));
      await refreshCounters();
      setCustom('');
    } finally {
      setBusy(false);
    }
  }

  /**
   * Last 30 days including empty ones, so a gap reads as a gap rather than
   * being silently compressed away by the chart.
   *
   * One plain <Bar> deliberately. Two other approaches were tried against this
   * data and both rendered wrong: per-datum <Cell> children (to colour goal
   * days green) produced a single collapsed rectangle, and two stacked Bars
   * produced one bar at roughly a fifteenth of its true height. Whether the
   * goal was met is carried by the ReferenceLine instead, which is legible and
   * actually works.
   */
  const chart = useMemo(() => {
    const byDate = new Map(days.map((d) => [d.date, d]));
    const out: { date: string; total: number }[] = [];
    for (let i = 29; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const key = db.localDay(d);
      out.push({ date: key, total: byDate.get(key)?.total ?? 0 });
    }
    return out;
  }, [days]);

  const goalPct = counter.dailyGoal ? Math.min(100, (stats.today / counter.dailyGoal) * 100) : null;

  return (
    <div className="card" style={{ marginBottom: 14 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
        <h3 style={{ flex: 1 }}>{name}</h3>
        <button className="btn ghost sm" onClick={() => setEditing(true)}>Goal</button>
        <ConfirmButton
          armed={armed} setArmed={setArmed} armedLabel="Delete?"
          onConfirm={() => void db.deleteCounter(counter.id).then(refreshCounters)}
        >
          ✕
        </ConfirmButton>
      </div>

      {/* Today, and the quick-add row — the thing you actually came here for. */}
      <div className="today-block">
        <div className="today-num">
          <span className="n">{stats.today}</span>
          {counter.dailyGoal && <span className="goal">/ {counter.dailyGoal}</span>}
        </div>
        <div className="faint" style={{ fontSize: 12.5 }}>
          today
          {todayFromWorkouts > 0 && (
            <> · {todayEntries.reduce((n, e) => n + e.reps, 0)} tapped + {todayFromWorkouts} from workouts</>
          )}
        </div>
        {goalPct != null && (
          <div className="goal-bar"><div style={{ width: `${goalPct}%` }} /></div>
        )}
      </div>

      <div className="chips" style={{ margin: '14px 0 10px' }}>
        {QUICK.map((n) => (
          <button key={n} className="chip quick" disabled={busy} onClick={() => void add(n)}>+{n}</button>
        ))}
      </div>

      <form
        onSubmit={(e) => { e.preventDefault(); void add(Number(custom)); }}
        style={{ display: 'flex', gap: 8, marginBottom: 4 }}
      >
        <input
          inputMode="numeric" placeholder="Custom" value={custom}
          onChange={(e) => setCustom(e.target.value)}
          style={{ maxWidth: 120 }}
        />
        <button className="btn" disabled={busy || !custom}>Add</button>
      </form>

      <div className="stat-grid" style={{ marginTop: 16 }}>
        <Stat label="Best set" value={stats.bestSet || '—'} />
        <Stat
          label="Best day"
          value={stats.bestDay?.total ?? '—'}
          sub={stats.bestDay ? shortDate(stats.bestDay.date) : undefined}
        />
        <Stat
          label="Streak"
          value={stats.currentStreak}
          unit={stats.currentStreak === 1 ? 'day' : 'days'}
          sub={`longest ${stats.longestStreak}`}
        />
        <Stat label="Lifetime" value={stats.lifetime} sub={`${stats.daysActive} active days`} />
      </div>

      <div className="chart-box short" style={{ marginTop: 14 }}>
        <ResponsiveContainer>
          {/* No negative left margin: it pulled the Y labels outside the SVG
              and clipped them against the card edge. */}
          <BarChart data={chart} margin={{ left: 0, right: 6, top: 6 }}>
            <CartesianGrid vertical={false} />
            <XAxis
              dataKey="date" tickLine={false} axisLine={false} minTickGap={26}
              tickFormatter={shortDate}
            />
            {/* The domain has to cover the goal, not just the data: with a
                goal of 100 and a best day of 55 the reference line would sit
                off the top of the chart and simply not be drawn. */}
            <YAxis
              tickLine={false} axisLine={false} width={42} allowDecimals={false}
              domain={[0, (max: number) => Math.max(max, counter.dailyGoal ?? 0)]}
            />
            {counter.dailyGoal && (
              <ReferenceLine y={counter.dailyGoal} stroke="var(--warn)" strokeDasharray="4 4" />
            )}
            <Tooltip
              cursor={{ fill: 'rgba(255,255,255,0.04)' }}
              content={({ active, payload }) =>
                active && payload?.length ? (
                  <div className="tooltip">
                    <div className="k">{shortDate(payload[0].payload.date)}</div>
                    <div>{payload[0].payload.total} reps</div>
                  </div>
                ) : null}
            />
            <Bar dataKey="total" fill="var(--accent)" radius={[3, 3, 0, 0]} isAnimationActive={false} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {todayEntries.length > 0 && (
        <div style={{ marginTop: 12 }}>
          <div className="faint" style={{ fontSize: 11.5, textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 650, marginBottom: 6 }}>
            Today's sets
          </div>
          <div className="chips">
            {todayEntries.map((e) => (
              <button
                key={e.id}
                className="chip"
                title="Tap to remove"
                onClick={() => void db.deleteCounterEntry(e.id).then(refreshCounters)}
              >
                {e.reps} ✕
              </button>
            ))}
          </div>
        </div>
      )}

      {editing && (
        <GoalForm counter={counter} name={name} onClose={() => setEditing(false)} />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------

function GoalForm({ counter, name, onClose }: { counter: Counter; name: string; onClose: () => void }) {
  const { refreshCounters } = useStore();
  const [goal, setGoal] = useState(counter.dailyGoal != null ? String(counter.dailyGoal) : '');

  async function save() {
    const n = goal.trim() === '' ? null : Math.round(Number(goal));
    await db.updateCounter(counter.id, { dailyGoal: n && n > 0 ? n : null });
    await refreshCounters();
    onClose();
  }

  return (
    <Modal
      title={`${name} goal`}
      onClose={onClose}
      footer={
        <>
          <button className="btn ghost" onClick={onClose}>Cancel</button>
          <button className="btn primary" onClick={() => void save()}>Save</button>
        </>
      }
    >
      <Field label="Daily goal (reps)">
        <input
          autoFocus inputMode="numeric" value={goal}
          onChange={(e) => setGoal(e.target.value)} placeholder="e.g. 100"
        />
      </Field>
      <p className="faint" style={{ fontSize: 13, marginBottom: 0 }}>
        Leave blank for no goal — the streak then counts any day you did at least one rep.
        With a goal set, only days that reach it extend the streak.
      </p>
    </Modal>
  );
}

function AddCounter({ onClose }: { onClose: () => void }) {
  const { refreshCounters } = useStore();
  const [err, setErr] = useState<string | null>(null);

  async function pick(ids: string[]) {
    try {
      // The picker is multi-select; take them all.
      for (const id of ids) await db.createCounter(id, null);
      await refreshCounters();
      onClose();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setErr(msg.startsWith('duplicate') ? "You're already tracking that one." : msg);
    }
  }

  return (
    <>
      {err && (
        <Modal title="Couldn't add" onClose={() => { setErr(null); onClose(); }}>
          <div className="error-note" style={{ marginBottom: 0 }}>{err}</div>
        </Modal>
      )}
      {!err && <ExercisePicker onPick={(ids) => void pick(ids)} onClose={onClose} />}
    </>
  );
}
