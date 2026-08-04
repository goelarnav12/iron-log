// Daily counters — push-ups, planks, and anything else you accumulate through
// the day rather than train in a session.
//
// A counter counts reps, or SECONDS when its exercise is duration-tracked: you
// hold a plank, you don't rep it. The unit comes straight off the exercise via
// `counterUnit`, so nothing here is configured and nothing can disagree with
// the library. Everything below that shows a number — the big today figure,
// the quick-add chips, the stats, the chart, the goal form — asks the unit how
// to render it.
//
// The day's number combines two sources: entries you tap in here, and
// completed sets of the same exercise from that day's workouts. They're always
// shown split, because a total you can't account for is one you stop trusting.

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Bar, BarChart, CartesianGrid, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';
import { useStore } from '../state/store';
import * as db from '../lib/db';
import { ConfirmButton, Empty, Field, Modal, Stat } from '../components/ui';
import { ExercisePicker } from '../components/ExercisePicker';
import {
  counterDays, counterEntryAmount, counterStats, workoutBestSetAmount, workoutAmountByDay,
} from '../lib/stats';
import { formatDuration, formatDurationShort, parseDuration } from '../lib/units';
import { counterUnit, type Counter, type CounterUnit } from '../lib/types';

/** Offered as one-tap buttons. Covers most sets people actually do. */
const QUICK_REPS = [5, 10, 15, 20, 25, 30, 50];

/** Seconds. Half a minute up to five — the span a hold actually lives in. */
const QUICK_SECONDS = [30, 45, 60, 90, 120, 180, 300];

const shortDate = (iso: string) =>
  new Date(`${iso}T12:00:00`).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });

/** A total or a single set, in the counter's unit. `90` -> `"1:30"` or `"90"`. */
const showAmount = (n: number, unit: CounterUnit) =>
  (unit === 'seconds' ? formatDuration(n) : String(n));

/**
 * Lifetime only. Clock form under an hour, so it agrees with the best-day
 * figure sitting next to it — 153s rendering as "3m" beside a best day of
 * "2:33" reads as a bug. Past an hour clock form is unreadable and the rounded
 * "14h 3m" is the number you actually want.
 */
const showTotal = (n: number, unit: CounterUnit) => {
  if (unit === 'reps') return String(n);
  return n < 3600 ? formatDuration(n) : formatDurationShort(n);
};

/**
 * Compact label for a quick-add chip: `30s`, `1m`, `1:30`. Whole minutes read
 * better as minutes, and anything ragged falls back to clock form.
 */
const quickLabel = (n: number, unit: CounterUnit) => {
  if (unit === 'reps') return String(n);
  if (n < 60) return `${n}s`;
  return n % 60 === 0 ? `${n / 60}m` : formatDuration(n);
};

// Chart ticks deliberately use `showAmount` rather than a rounded short form.
// Recharts picks its own tick values, and they are not whole minutes — at a
// 5:00 goal it chose 75s / 150s / 225s, which rounded to "1m / 3m / 4m" and
// made an evenly spaced axis look non-linear. Clock form stays honest and
// still fits the 42px gutter.

export function Counters() {
  const { counters, exercisesById, ready } = useStore();
  const [adding, setAdding] = useState(false);

  if (!ready) return <div className="page"><span className="faint">Loading…</span></div>;

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Daily</h1>
          <div className="sub">Reps and holds you rack up through the day.</div>
        </div>
        <button className="btn primary" onClick={() => setAdding(true)}>+ Track exercise</button>
      </div>

      {counters.length === 0 && (
        <Empty>
          Nothing tracked yet. Add push-ups or a plank and start tapping.
        </Empty>
      )}

      {counters.map((c) => {
        const ex = exercisesById.get(c.exerciseId);
        return (
          <CounterCard
            key={c.id}
            counter={c}
            name={ex?.name ?? 'Unknown'}
            // An exercise we can't resolve is counted in reps rather than
            // hidden — the entries are real either way.
            unit={ex ? counterUnit(ex.trackingType) : 'reps'}
          />
        );
      })}

      {adding && <AddCounter onClose={() => setAdding(false)} />}
    </div>
  );
}

// ---------------------------------------------------------------------------

function CounterCard({
  counter, name, unit,
}: { counter: Counter; name: string; unit: CounterUnit }) {
  const { counterEntries, workouts, refreshCounters } = useStore();
  const [custom, setCustom] = useState('');
  const [editing, setEditing] = useState(false);
  const [armed, setArmed] = useState(false);
  const [busy, setBusy] = useState(false);

  const today = db.localDay();
  const held = unit === 'seconds';

  const entries = useMemo(
    () => counterEntries.filter((e) => e.counterId === counter.id),
    [counterEntries, counter.id]);

  const { days, stats, todayEntries, todayTapped, todayFromWorkouts } = useMemo(() => {
    const wAmount = workoutAmountByDay(workouts, counter.exerciseId, unit);
    const d = counterDays(entries, wAmount, counter.dailyGoal, unit);
    // Entries logged in the other unit contribute nothing, so they'd render as
    // an unremovable "0" chip. Drop them from the list rather than show that.
    const mine = entries.filter((e) => e.date === today && counterEntryAmount(e, unit) > 0);
    return {
      days: d,
      stats: counterStats(
        d, entries, workoutBestSetAmount(workouts, counter.exerciseId, unit),
        today, counter.dailyGoal, unit),
      todayEntries: mine,
      todayTapped: mine.reduce((n, e) => n + counterEntryAmount(e, unit), 0),
      todayFromWorkouts: wAmount.get(today) ?? 0,
    };
  }, [entries, workouts, counter.exerciseId, counter.dailyGoal, today, unit]);

  async function add(amount: number) {
    if (!Number.isFinite(amount) || amount <= 0) return;
    setBusy(true);
    try {
      await db.addCounterEntry(counter.id, Math.round(amount), unit);
      await refreshCounters();
      setCustom('');
    } finally {
      setBusy(false);
    }
  }

  /** `parseDuration` returns null on a typo rather than 0, so a bad "1:xx" logs nothing. */
  function submitCustom() {
    const parsed = held ? parseDuration(custom) : Number(custom);
    if (parsed != null) void add(parsed);
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
          <span className="n">{showAmount(stats.today, unit)}</span>
          {counter.dailyGoal && (
            <span className="goal">/ {showAmount(counter.dailyGoal, unit)}</span>
          )}
        </div>
        <div className="faint" style={{ fontSize: 12.5 }}>
          today
          {todayFromWorkouts > 0 && (
            <>
              {' '}· {showAmount(todayTapped, unit)} tapped
              {' '}+ {showAmount(todayFromWorkouts, unit)} from workouts
            </>
          )}
        </div>
        {goalPct != null && (
          <div className="goal-bar"><div style={{ width: `${goalPct}%` }} /></div>
        )}
      </div>

      <div className="chips" style={{ margin: '14px 0 10px' }}>
        {(held ? QUICK_SECONDS : QUICK_REPS).map((n) => (
          <button key={n} className="chip quick" disabled={busy} onClick={() => void add(n)}>
            +{quickLabel(n, unit)}
          </button>
        ))}
      </div>

      {/* A hold is the one thing here you can't tap out afterwards from memory. */}
      {held && <HoldTimer disabled={busy} onLog={(s) => void add(s)} />}

      <form
        onSubmit={(e) => { e.preventDefault(); submitCustom(); }}
        style={{ display: 'flex', gap: 8, marginBottom: 4 }}
      >
        <input
          // A numeric keypad has no colon, so a time gets the full keyboard.
          inputMode={held ? 'text' : 'numeric'}
          placeholder={held ? '1:30' : 'Custom'}
          value={custom}
          onChange={(e) => setCustom(e.target.value)}
          style={{ maxWidth: 120 }}
        />
        <button className="btn" disabled={busy || !custom}>Add</button>
      </form>

      <div className="stat-grid" style={{ marginTop: 16 }}>
        <Stat
          label={held ? 'Best hold' : 'Best set'}
          value={stats.bestSet ? showAmount(stats.bestSet, unit) : '—'}
        />
        <Stat
          label="Best day"
          value={stats.bestDay ? showAmount(stats.bestDay.total, unit) : '—'}
          sub={stats.bestDay ? shortDate(stats.bestDay.date) : undefined}
        />
        <Stat
          label="Streak"
          value={stats.currentStreak}
          unit={stats.currentStreak === 1 ? 'day' : 'days'}
          sub={`longest ${stats.longestStreak}`}
        />
        <Stat
          label="Lifetime"
          value={showTotal(stats.lifetime, unit)}
          sub={`${stats.daysActive} active days`}
        />
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
              tickFormatter={(v: number) => showAmount(v, unit)}
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
                    <div>
                      {showAmount(payload[0].payload.total, unit)}{held ? '' : ' reps'}
                    </div>
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
            {held ? "Today's holds" : "Today's sets"}
          </div>
          <div className="chips">
            {todayEntries.map((e) => (
              <button
                key={e.id}
                className="chip"
                title="Tap to remove"
                onClick={() => void db.deleteCounterEntry(e.id).then(refreshCounters)}
              >
                {showAmount(counterEntryAmount(e, unit), unit)} ✕
              </button>
            ))}
          </div>
        </div>
      )}

      {editing && (
        <GoalForm counter={counter} name={name} unit={unit} onClose={() => setEditing(false)} />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------

/**
 * Stopwatch for a hold. Elapsed time is derived from wall-clock — `Date.now()`
 * minus the start — and never accumulated tick by tick: a backgrounded tab has
 * its timers throttled, and counting ticks would quietly undercount a plank
 * you actually held. The interval only decides how often the number redraws.
 *
 * Nothing is written until you stop it, and cancelling writes nothing at all,
 * so a mistaken tap costs you nothing.
 */
function HoldTimer({ disabled, onLog }: { disabled: boolean; onLog: (seconds: number) => void }) {
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [elapsed, setElapsed] = useState(0);
  // Read at stop time so the logged value is exact rather than up-to-200ms stale.
  const startRef = useRef<number | null>(null);

  useEffect(() => {
    if (startedAt == null) return;
    const id = setInterval(() => setElapsed(Math.round((Date.now() - startedAt) / 1000)), 200);
    return () => clearInterval(id);
  }, [startedAt]);

  function start() {
    const t = Date.now();
    startRef.current = t;
    setElapsed(0);
    setStartedAt(t);
  }

  function reset() {
    startRef.current = null;
    setStartedAt(null);
    setElapsed(0);
  }

  function stop() {
    const seconds = startRef.current == null
      ? 0 : Math.round((Date.now() - startRef.current) / 1000);
    reset();
    // Under a second is a fumbled tap, not a hold. Logging it would put a "0:00"
    // in the day and break the check constraint on the way to Postgres.
    if (seconds >= 1) onLog(seconds);
  }

  if (startedAt == null) {
    return (
      <button className="btn hold" disabled={disabled} onClick={start}>
        ▶ Start hold
      </button>
    );
  }

  return (
    <div className="hold-running">
      <button className="btn hold running" onClick={stop}>
        ⏹ <span className="t">{formatDuration(elapsed)}</span> Stop &amp; log
      </button>
      <button className="btn ghost sm" title="Discard this hold" onClick={reset}>✕</button>
    </div>
  );
}

// ---------------------------------------------------------------------------

function GoalForm({
  counter, name, unit, onClose,
}: { counter: Counter; name: string; unit: CounterUnit; onClose: () => void }) {
  const { refreshCounters } = useStore();
  const held = unit === 'seconds';
  const [goal, setGoal] = useState(
    counter.dailyGoal != null ? showAmount(counter.dailyGoal, unit) : '');

  async function save() {
    const raw = goal.trim();
    const n = raw === '' ? null : held ? parseDuration(raw) : Math.round(Number(raw));
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
      <Field label={held ? 'Daily goal (total time)' : 'Daily goal (reps)'}>
        <input
          autoFocus
          inputMode={held ? 'text' : 'numeric'}
          value={goal}
          onChange={(e) => setGoal(e.target.value)}
          placeholder={held ? 'e.g. 5:00' : 'e.g. 100'}
        />
      </Field>
      <p className="faint" style={{ fontSize: 13, marginBottom: 0 }}>
        {held
          ? 'Total time across the day, not one hold — "5:00" is five minutes of plank however you split it. '
          : ''}
        Leave blank for no goal — the streak then counts any day you did
        {held ? ' any at all' : ' at least one rep'}.
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
