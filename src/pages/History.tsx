import { useMemo, useState } from 'react';
import { useStore } from '../state/store';
import { WorkoutRow } from '../components/WorkoutRow';
import { Empty } from '../components/ui';
import { totals } from '../lib/stats';
import { formatDurationShort, kgTo, trim } from '../lib/units';

/** `2026-07` -> `July 2026`, for the month dividers. */
const monthLabel = (key: string) =>
  new Date(`${key}-01T12:00:00`).toLocaleDateString(undefined, { month: 'long', year: 'numeric' });

export function History() {
  const { workouts, exercisesById, units } = useStore();
  const [q, setQ] = useState('');

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return workouts;
    // Searches the workout name, its notes, and the exercises in it — which is
    // how you actually look for "that session where I squatted heavy".
    return workouts.filter((w) =>
      w.name.toLowerCase().includes(needle) ||
      (w.notes ?? '').toLowerCase().includes(needle) ||
      w.exercises.some((we) =>
        (exercisesById.get(we.exerciseId)?.name ?? '').toLowerCase().includes(needle)));
  }, [workouts, q, exercisesById]);

  const byMonth = useMemo(() => {
    const groups = new Map<string, typeof filtered>();
    for (const w of filtered) {
      const key = w.startedAt.slice(0, 7);
      groups.set(key, [...(groups.get(key) ?? []), w]);
    }
    return [...groups.entries()];
  }, [filtered]);

  const t = totals(filtered);

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>History</h1>
          <div className="sub">
            {t.workouts} workouts · {t.sets} sets · {trim(kgTo(t.volume, units.weight), 0)} {units.weight} ·{' '}
            {formatDurationShort(t.durationS)}
          </div>
        </div>
      </div>

      <input
        placeholder="Search by workout, exercise or note…"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        style={{ marginBottom: 18 }}
      />

      {byMonth.length === 0 && <Empty>{q ? 'Nothing matches that.' : 'No finished workouts yet.'}</Empty>}

      {byMonth.map(([month, list]) => (
        <div key={month}>
          <div className="section-head"><h2>{monthLabel(month)}</h2><span className="faint" style={{ fontSize: 12 }}>{list.length}</span></div>
          {list.map((w) => <WorkoutRow key={w.id} workout={w} />)}
        </div>
      ))}
    </div>
  );
}
