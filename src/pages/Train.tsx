// Everything about starting a session: a blank workout, a routine, or a cardio
// entry — plus the routines themselves. The live workout opens full-screen at
// /workout once one is running.

import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useStore } from '../state/store';
import { useStartWorkout } from '../state/useStartWorkout';
import * as db from '../lib/db';
import { ConfirmButton, Empty } from '../components/ui';
import { Icon } from '../components/Icon';
import { formatDurationShort } from '../lib/units';

export function Train() {
  const { activeWorkout, routines, exercisesById, refreshRoutines } = useStore();
  const { start, busy } = useStartWorkout();
  // One id at a time: arming a second delete disarms the first, which is what
  // you'd expect from a list of two-step buttons.
  const [armedId, setArmedId] = useState<string | null>(null);

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Train</h1>
          <div className="sub">Start from a routine, or from nothing and add as you go.</div>
        </div>
      </div>

      {activeWorkout ? (
        <div className="hero">
          <div className="eyebrow">In progress · started {formatDurationShort(
            Math.max(0, Math.round((Date.now() - Date.parse(activeWorkout.startedAt)) / 1000)))} ago</div>
          <div className="name">{activeWorkout.name}</div>
          <div className="actions">
            <Link to="/workout" className="btn ink">Resume workout <Icon name="arrow" /></Link>
          </div>
        </div>
      ) : (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button className="btn primary lg" style={{ flex: '2 1 220px' }} disabled={busy} onClick={() => void start('Workout')}>
            <Icon name="plus" /> Empty workout
          </button>
          <Link to="/cardio" className="btn lg" style={{ flex: '1 1 140px' }}>Log cardio</Link>
        </div>
      )}

      <div className="section-head">
        <h2>Routines</h2>
        <Link to="/routines/new" className="btn sm"><Icon name="plus" size={18} /> New</Link>
      </div>

      {routines.length === 0 && <Empty>No routines yet. Build one and it shows up here and on Today.</Empty>}

      {routines.map((r) => (
        <div className="row stack" key={r.id}>
          <div className="grow">
            <div className="title">{r.name}</div>
            <div className="meta">
              {r.exercises.length
                ? r.exercises.map((e) => `${exercisesById.get(e.exerciseId)?.name ?? '?'} ×${e.targetSets}`).join(' · ')
                : 'No exercises'}
            </div>
          </div>
          <div className="actions">
            <ConfirmButton
              armed={armedId === r.id}
              setArmed={(v) => setArmedId(v ? r.id : null)}
              onConfirm={() => void db.deleteRoutine(r.id).then(refreshRoutines)}
            >
              Delete
            </ConfirmButton>
            <Link to={`/routines/${r.id}`} className="btn ghost sm">Edit</Link>
            {!activeWorkout && (
              <button className="btn primary sm" disabled={busy} onClick={() => void start(r.name, r.id)}>Start</button>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
