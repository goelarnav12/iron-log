import { Link } from 'react-router-dom';
import type { Workout } from '../lib/types';
import { workoutDurationS, workoutSetCount, workoutVolume } from '../lib/stats';
import { formatDurationShort, kgTo, trim } from '../lib/units';
import { useStore } from '../state/store';

const fmtDate = (iso: string) =>
  new Date(iso).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' });

export function WorkoutRow({ workout }: { workout: Workout }) {
  const { units, exercisesById } = useStore();
  const names = workout.exercises
    .map((we) => exercisesById.get(we.exerciseId)?.name)
    .filter(Boolean)
    .join(' · ');

  return (
    <Link to={`/history/${workout.id}`} className="list-link">
      <div className="row">
        <div className="grow">
          <div className="title">{workout.name}</div>
          <div className="meta">{names || 'No exercises'}</div>
        </div>
        <div style={{ textAlign: 'right', flexShrink: 0 }}>
          <div className="mono" style={{ fontSize: 13 }}>
            {trim(kgTo(workoutVolume(workout), units.weight), 0)} {units.weight}
          </div>
          <div className="meta">
            {fmtDate(workout.startedAt)} · {workoutSetCount(workout)} sets · {formatDurationShort(workoutDurationS(workout))}
          </div>
        </div>
      </div>
    </Link>
  );
}
