import { useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';
import { useStore } from '../state/store';
import * as db from '../lib/db';
import { ConfirmButton, Empty, Stat } from '../components/ui';
import { NewExerciseForm } from '../components/NewExerciseForm';
import { personalRecords, strengthSeries } from '../lib/stats';
import { formatDuration, kgTo, trim } from '../lib/units';

const shortDate = (iso: string) =>
  new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });

export function ExerciseDetail() {
  const { id } = useParams<{ id: string }>();
  const nav = useNavigate();
  const { exercisesById, workouts, units, refreshExercises } = useStore();
  const [editing, setEditing] = useState(false);
  const [armed, setArmed] = useState(false);

  const exercise = id ? exercisesById.get(id) : undefined;

  const series = useMemo(() => (id ? strengthSeries(workouts, id) : []), [workouts, id]);
  const pr = useMemo(() => (id ? personalRecords(workouts).get(id) : undefined), [workouts, id]);

  /** Every session this exercise appears in, newest first. */
  const sessions = useMemo(
    () => workouts
      .filter((w) => w.exercises.some((we) => we.exerciseId === id))
      .map((w) => ({
        id: w.id,
        name: w.name,
        date: w.startedAt,
        sets: w.exercises.filter((we) => we.exerciseId === id).flatMap((we) => we.sets.filter((s) => s.completed)),
      })),
    [workouts, id]);

  if (!exercise) {
    return <div className="page"><Empty>Exercise not found. <Link to="/exercises" className="btn ghost sm">Back</Link></Empty></div>;
  }

  const chartData = series.map((p) => ({
    date: shortDate(p.date),
    e1rm: Number(kgTo(p.e1rm, units.weight).toFixed(1)),
    top: Number(kgTo(p.topSetKg, units.weight).toFixed(1)),
  }));

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>{exercise.name}</h1>
          <div className="sub">{exercise.muscleGroup} · {exercise.equipment}{exercise.userId ? ' · custom' : ' · built-in'}</div>
        </div>
        {/* Built-in exercises have no write policy, so editing is offered only
            for your own. */}
        {exercise.userId && (
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn ghost" onClick={() => setEditing(true)}>Edit</button>
            <ConfirmButton
              armed={armed} setArmed={setArmed} armedLabel="Delete?" className="btn danger"
              onConfirm={() => void db.deleteExercise(exercise.id).then(refreshExercises).then(() => nav('/exercises'))}
            >
              Delete
            </ConfirmButton>
          </div>
        )}
      </div>

      {exercise.notes && <div className="card" style={{ marginBottom: 14 }}>{exercise.notes}</div>}

      <div className="stat-grid">
        <Stat
          label="Best set"
          value={pr?.bestWeightKg != null ? trim(kgTo(pr.bestWeightKg, units.weight)) : '—'}
          unit={pr?.bestWeightKg != null ? units.weight : undefined}
          sub={pr?.bestWeightReps != null ? `× ${pr.bestWeightReps} reps` : undefined}
        />
        <Stat
          label="Est. 1RM"
          value={pr?.best1RM != null ? trim(kgTo(pr.best1RM, units.weight), 1) : '—'}
          unit={pr?.best1RM != null ? units.weight : undefined}
        />
        <Stat
          label="Best volume"
          value={pr?.bestSetVolume ? trim(kgTo(pr.bestSetVolume, units.weight), 0) : '—'}
          unit={pr?.bestSetVolume ? units.weight : undefined}
          sub="single set"
        />
        <Stat label="Sessions" value={sessions.length} />
      </div>

      <div className="section-head"><h2>Estimated 1RM over time</h2></div>
      <div className="card">
        {chartData.length < 2 ? (
          <Empty>Needs at least two sessions with sets of 12 reps or fewer.</Empty>
        ) : (
          <div className="chart-box">
            <ResponsiveContainer>
              <LineChart data={chartData} margin={{ left: -8, right: 10, top: 6 }}>
                <CartesianGrid vertical={false} />
                <XAxis dataKey="date" tickLine={false} axisLine={false} minTickGap={24} />
                <YAxis domain={['auto', 'auto']} tickLine={false} axisLine={false} width={44} />
                <Tooltip
                  content={({ active, payload, label }) =>
                    active && payload?.length ? (
                      <div className="tooltip">
                        <div className="k">{label}</div>
                        <div>e1RM {payload[0].value} {units.weight}</div>
                        <div className="k">top set {payload[0].payload.top} {units.weight}</div>
                      </div>
                    ) : null}
                />
                <Line type="monotone" dataKey="e1rm" stroke="var(--accent)" strokeWidth={2} dot={{ r: 2.5 }} />
                <Line type="monotone" dataKey="top" stroke="var(--text-faint)" strokeWidth={1} strokeDasharray="4 4" dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      <div className="section-head"><h2>History</h2></div>
      {sessions.length === 0 && <Empty>You haven't logged this one yet.</Empty>}
      {sessions.map((s) => (
        <Link key={s.id} to={`/history/${s.id}`} className="list-link">
          <div className="row">
            <div className="grow">
              <div className="title">{new Date(s.date).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })}</div>
              <div className="meta">{s.name}</div>
            </div>
            <div className="mono faint" style={{ fontSize: 13, textAlign: 'right' }}>
              {s.sets.map((set, i) => (
                <div key={i}>
                  {set.durationS != null
                    ? formatDuration(set.durationS)
                    : `${set.weightKg != null ? `${trim(kgTo(set.weightKg, units.weight))} × ` : ''}${set.reps ?? 0}`}
                </div>
              ))}
            </div>
          </div>
        </Link>
      ))}

      {editing && <NewExerciseForm existing={exercise} onClose={() => setEditing(false)} />}
    </div>
  );
}
