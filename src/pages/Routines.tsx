import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useStore } from '../state/store';
import * as db from '../lib/db';
import { ConfirmButton, Empty } from '../components/ui';

export function Routines() {
  const { routines, exercisesById, refreshRoutines, refreshActive } = useStore();
  const nav = useNavigate();
  // One id at a time: arming a second delete disarms the first, which is what
  // you'd expect from a list of two-step buttons.
  const [armedId, setArmedId] = useState<string | null>(null);

  async function start(routineId: string, name: string) {
    const r = routines.find((x) => x.id === routineId);
    await db.startWorkout({
      name,
      routineId,
      exercises: r?.exercises.map((e) => ({ exerciseId: e.exerciseId, sets: e.targetSets, notes: e.notes })) ?? [],
    });
    await refreshActive();
    nav('/workout');
  }

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Routines</h1>
          <div className="sub">Templates you start a workout from.</div>
        </div>
        <Link to="/routines/new" className="btn primary">+ New routine</Link>
      </div>

      {routines.length === 0 && <Empty>No routines yet. Build one and it shows up on the workout screen.</Empty>}

      {routines.map((r) => (
        <div className="row" key={r.id}>
          <div className="grow">
            <div className="title">{r.name}</div>
            <div className="meta">
              {r.exercises.length
                ? r.exercises.map((e) => `${exercisesById.get(e.exerciseId)?.name ?? '?'} ×${e.targetSets}`).join(' · ')
                : 'No exercises'}
            </div>
          </div>
          <button className="btn primary sm" onClick={() => void start(r.id, r.name)}>Start</button>
          <Link to={`/routines/${r.id}`} className="btn ghost sm">Edit</Link>
          <ConfirmButton
            armed={armedId === r.id}
            setArmed={(v) => setArmedId(v ? r.id : null)}
            onConfirm={() => void db.deleteRoutine(r.id).then(refreshRoutines)}
          >
            ✕
          </ConfirmButton>
        </div>
      ))}
    </div>
  );
}
