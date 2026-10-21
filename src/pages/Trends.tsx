// The long view: how much, how balanced, how consistent. These were the home
// screen before the redesign; they answer "what happened", which is a
// Progress question — Today answers "what now".

import {
  Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';
import { useStore } from '../state/store';
import { Empty, Stat } from '../components/ui';
import { SubNav } from '../components/SubNav';
import { dayKey, setsByMuscle, totals, volumeByWeek, workoutSetCount } from '../lib/stats';
import type { Workout } from '../lib/types';
import { formatDurationShort, kgTo, trim } from '../lib/units';

export function Trends() {
  const { workouts, exercisesById, units, ready, error } = useStore();

  const t = totals(workouts);

  // Last 12 weeks only: a bar chart of three years of training is unreadable
  // and the question ("am I training enough lately?") is a recent one.
  const weekly = volumeByWeek(workouts).slice(-12);
  // Same window for the balance chart, for the same reason.
  const recentCut = Date.now() - 28 * 86400000;
  const muscle = setsByMuscle(
    workouts.filter((w) => Date.parse(w.startedAt) >= recentCut), exercisesById);

  if (error) return <div className="page"><div className="error-note">{error}</div></div>;
  if (!ready) return <div className="page"><span className="faint">Loading…</span></div>;

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Trends</h1>
          <div className="sub">Volume, balance and consistency.</div>
        </div>
      </div>
      <SubNav section="progress" />

      <div className="stat-grid">
        <Stat label="Workouts" value={t.workouts} />
        <Stat label="Sets" value={t.sets} />
        <Stat label="Moved" value={trim(kgTo(t.volume, units.weight), 0)} unit={units.weight} />
        <Stat label="Under the bar" value={formatDurationShort(t.durationS)} />
      </div>

      <div className="section-head"><h2>Weekly volume</h2></div>
      <div className="card">
        {weekly.length === 0 ? <Empty>Log a workout to see this.</Empty> : (
          <div className="chart-box">
            <ResponsiveContainer>
              <BarChart data={weekly.map((w) => ({ ...w, volume: kgTo(w.volume, units.weight) }))}>
                <CartesianGrid vertical={false} />
                <XAxis dataKey="week" tickFormatter={(w: string) => w.slice(-3)} tickLine={false} axisLine={false} />
                <YAxis tickFormatter={(v: number) => (v >= 1000 ? `${Math.round(v / 1000)}k` : String(v))} tickLine={false} axisLine={false} width={40} />
                <Tooltip
                  cursor={{ fill: 'var(--chart-cursor)' }}
                  content={({ active, payload, label }) =>
                    active && payload?.length ? (
                      <div className="tooltip">
                        <div className="k">{label}</div>
                        <div>{trim(Number(payload[0].value), 0)} {units.weight} · {payload[0].payload.workouts} workouts</div>
                      </div>
                    ) : null}
                />
                <Bar dataKey="volume" fill="var(--accent)" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      <div className="section-head"><h2>Sets by muscle · last 28 days</h2></div>
      <div className="card">
        {muscle.length === 0 ? <Empty>Nothing in the last four weeks.</Empty> : (
          <div className="chart-box" style={{ height: Math.max(160, muscle.length * 26 + 30) }}>
            <ResponsiveContainer>
              <BarChart data={muscle} layout="vertical" margin={{ left: 6, right: 12 }}>
                <CartesianGrid horizontal={false} />
                <XAxis type="number" tickLine={false} axisLine={false} allowDecimals={false} />
                <YAxis type="category" dataKey="muscle" width={82} tickLine={false} axisLine={false} />
                <Tooltip
                  cursor={{ fill: 'var(--chart-cursor)' }}
                  content={({ active, payload, label }) =>
                    active && payload?.length ? (
                      <div className="tooltip"><div className="k">{label}</div><div>{payload[0].value} sets</div></div>
                    ) : null}
                />
                {/* A flat fill, not per-bar <Cell>s: Recharts collapses a
                    Bar's Cell children into one rectangle, so the series
                    silently rendered as a single bar. */}
                <Bar dataKey="sets" fill="var(--accent)" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      <div className="section-head"><h2>Consistency</h2></div>
      <div className="card scroll-x"><Heatmap workouts={workouts} /></div>
    </div>
  );
}

/**
 * A year of days as columns of weeks, GitHub-style. Intensity is bucketed by
 * set count rather than volume so a light technique day still shows up.
 */
function Heatmap({ workouts }: { workouts: Workout[] }) {
  const byDay = new Map<string, number>();
  for (const w of workouts) {
    const k = dayKey(w.startedAt);
    byDay.set(k, (byDay.get(k) ?? 0) + workoutSetCount(w));
  }

  const days: { key: string; sets: number }[] = [];
  const cursor = new Date();
  cursor.setHours(12, 0, 0, 0);
  // Wind back to the most recent Sunday so every column is a clean week.
  cursor.setDate(cursor.getDate() - cursor.getDay());
  cursor.setDate(cursor.getDate() + 6);
  for (let i = 0; i < 371; i++) {
    const k = dayKey(cursor.toISOString());
    days.unshift({ key: k, sets: byDay.get(k) ?? 0 });
    cursor.setDate(cursor.getDate() - 1);
  }

  const cols: { key: string; sets: number }[][] = [];
  for (let i = 0; i < days.length; i += 7) cols.push(days.slice(i, i + 7));

  const level = (n: number) => (n === 0 ? '' : n < 10 ? 'l1' : n < 20 ? 'l2' : 'l3');

  return (
    <div className="heat">
      {cols.map((col, i) => (
        <div className="heat-col" key={i}>
          {col.map((d) => (
            <div key={d.key} className={`heat-cell ${level(d.sets)}`} title={d.sets ? `${d.key}: ${d.sets} sets` : d.key} />
          ))}
        </div>
      ))}
    </div>
  );
}
