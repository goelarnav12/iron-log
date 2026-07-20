import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useStore } from '../state/store';
import * as db from '../lib/db';
import { ConfirmButton, Empty, Stat } from '../components/ui';
import {
  epley1RM, personalRecords, workoutDurationS, workoutSetCount, workoutVolume,
} from '../lib/stats';
import { formatDuration, formatDurationShort, kgTo, trim } from '../lib/units';
import type { SetType } from '../lib/types';

const SET_TYPE_MARK: Record<SetType, string> = { normal: '', warmup: 'W', failure: 'F', drop: 'D' };

export function WorkoutDetail() {
  const { id } = useParams<{ id: string }>();
  const nav = useNavigate();
  const { workouts, exercisesById, units, refreshWorkouts } = useStore();
  const [armed, setArmed] = useState(false);

  const workout = workouts.find((w) => w.id === id);
  if (!workout) {
    return <div className="page"><Empty>Workout not found. <Link to="/history" className="btn ghost sm">Back</Link></Empty></div>;
  }

  // A set is flagged as a PR when it equals the all-time best for that
  // exercise — computed across every workout, so an old session correctly
  // stops showing the badge once it's been beaten.
  const prs = personalRecords(workouts);

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>{workout.name}</h1>
          <div className="sub">
            {new Date(workout.startedAt).toLocaleString(undefined, {
              weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
              hour: 'numeric', minute: '2-digit',
            })}
          </div>
        </div>
        <ConfirmButton
          armed={armed} setArmed={setArmed} armedLabel="Delete for good?"
          className="btn danger"
          onConfirm={() => void db.deleteWorkout(workout.id).then(refreshWorkouts).then(() => nav('/history'))}
        >
          Delete
        </ConfirmButton>
      </div>

      <div className="stat-grid">
        <Stat label="Duration" value={formatDurationShort(workoutDurationS(workout))} />
        <Stat label="Volume" value={trim(kgTo(workoutVolume(workout), units.weight), 0)} unit={units.weight} />
        <Stat label="Sets" value={workoutSetCount(workout)} />
        <Stat label="Exercises" value={workout.exercises.length} />
      </div>

      {workout.notes && (
        <div className="card" style={{ marginTop: 14 }}>
          <div className="faint" style={{ fontSize: 11.5, textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 650 }}>Notes</div>
          <div style={{ marginTop: 5 }}>{workout.notes}</div>
        </div>
      )}

      <div className="section-head"><h2>Exercises</h2></div>

      {workout.exercises.map((we) => {
        const ex = exercisesById.get(we.exerciseId);
        const pr = prs.get(we.exerciseId);
        return (
          <div className="card" key={we.id} style={{ marginBottom: 10 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
              <Link to={`/exercises/${we.exerciseId}`} style={{ fontWeight: 650, color: 'var(--accent)' }}>
                {ex?.name ?? 'Unknown exercise'}
              </Link>
              <span className="faint" style={{ fontSize: 12 }}>{ex?.muscleGroup}</span>
            </div>

            {we.sets.map((s, i) => {
              const e1rm = epley1RM(s.weightKg, s.reps);
              const isPr =
                pr?.bestWeightKg != null && s.weightKg === pr.bestWeightKg && s.reps === pr.bestWeightReps;
              return (
                <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '5px 0', fontSize: 14 }}>
                  <span className="faint mono" style={{ width: 22 }}>{SET_TYPE_MARK[s.setType] || i + 1}</span>
                  <span className="mono" style={{ flex: 1 }}>
                    {s.durationS != null
                      ? formatDuration(s.durationS)
                      : `${s.weightKg != null ? `${trim(kgTo(s.weightKg, units.weight))} ${units.weight} × ` : ''}${s.reps ?? 0}`}
                  </span>
                  {isPr && <span className="badge pr">PR</span>}
                  {e1rm != null && (
                    <span className="faint mono" style={{ fontSize: 12 }}>
                      e1RM {trim(kgTo(e1rm, units.weight), 1)}
                    </span>
                  )}
                </div>
              );
            })}

            {we.notes && <div className="faint" style={{ fontSize: 13, marginTop: 6 }}>{we.notes}</div>}
          </div>
        );
      })}
    </div>
  );
}
