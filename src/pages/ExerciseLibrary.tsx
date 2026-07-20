import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useStore } from '../state/store';
import { Empty } from '../components/ui';
import { NewExerciseForm } from '../components/NewExerciseForm';
import { EQUIPMENT, MUSCLE_GROUPS } from '../lib/types';
import { personalRecords } from '../lib/stats';
import { kgTo, trim } from '../lib/units';

export function ExerciseLibrary() {
  const { exercises, workouts, units } = useStore();
  const [q, setQ] = useState('');
  const [muscle, setMuscle] = useState<string | null>(null);
  const [equip, setEquip] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  const prs = useMemo(() => personalRecords(workouts), [workouts]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return exercises.filter((e) =>
      (!needle || e.name.toLowerCase().includes(needle)) &&
      (!muscle || e.muscleGroup === muscle) &&
      (!equip || e.equipment === equip));
  }, [exercises, q, muscle, equip]);

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Exercises</h1>
          <div className="sub">{exercises.length} in your library</div>
        </div>
        <button className="btn primary" onClick={() => setCreating(true)}>+ New exercise</button>
      </div>

      <input placeholder="Search…" value={q} onChange={(e) => setQ(e.target.value)} style={{ marginBottom: 12 }} />

      <div className="chips" style={{ marginBottom: 8 }}>
        <button className={`chip ${!muscle ? 'active' : ''}`} onClick={() => setMuscle(null)}>All muscles</button>
        {MUSCLE_GROUPS.map((m) => (
          <button key={m} className={`chip ${muscle === m ? 'active' : ''}`} onClick={() => setMuscle(muscle === m ? null : m)}>{m}</button>
        ))}
      </div>
      <div className="chips" style={{ marginBottom: 18 }}>
        <button className={`chip ${!equip ? 'active' : ''}`} onClick={() => setEquip(null)}>All equipment</button>
        {EQUIPMENT.map((m) => (
          <button key={m} className={`chip ${equip === m ? 'active' : ''}`} onClick={() => setEquip(equip === m ? null : m)}>{m}</button>
        ))}
      </div>

      {filtered.length === 0 && <Empty>Nothing matches.</Empty>}

      {filtered.map((e) => {
        const pr = prs.get(e.id);
        return (
          <Link key={e.id} to={`/exercises/${e.id}`} className="list-link">
            <div className="row">
              <div className="grow">
                <div className="title">{e.name}</div>
                <div className="meta">{e.muscleGroup} · {e.equipment}{e.userId ? ' · custom' : ''}</div>
              </div>
              {pr?.bestWeightKg != null && (
                <span className="mono faint" style={{ fontSize: 13 }}>
                  {trim(kgTo(pr.bestWeightKg, units.weight))} {units.weight} × {pr.bestWeightReps}
                </span>
              )}
            </div>
          </Link>
        );
      })}

      {creating && <NewExerciseForm onClose={() => setCreating(false)} />}
    </div>
  );
}
