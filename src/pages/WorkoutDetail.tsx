// One finished workout: read it, or fix it.
//
// Edit mode is not a draft. Every change writes straight through `db.ts` to
// IndexedDB the moment it's committed, exactly as the live screen does, so
// "Done" only stops showing the inputs — there is nothing to save and nothing
// to lose by navigating away. That also means the stats above the fold and the
// PR badges below it re-derive as you type, which is the point: you can watch a
// mistyped 100 turn back into 10 and see the PR badge disappear.
//
// Set inputs are held in local component state and flushed on blur, the same
// exception to mutate-then-refetch that `LiveWorkout` makes and for the same
// reason — typing shouldn't churn IndexedDB on every keystroke.

import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useStore } from '../state/store';
import * as db from '../lib/db';
import { ConfirmButton, Empty, Field, Stat } from '../components/ui';
import { ExercisePicker } from '../components/ExercisePicker';
import {
  epley1RM, personalRecords, workoutDurationS, workoutSetCount, workoutVolume,
} from '../lib/stats';
import { formatDuration, formatDurationShort, kgTo, toKg, trim } from '../lib/units';
import type { SetType, Workout, WorkoutExercise, WorkoutSet } from '../lib/types';

const SET_TYPE_MARK: Record<SetType, string> = { normal: '', warmup: 'W', failure: 'F', drop: 'D' };
const SET_TYPE_CYCLE: SetType[] = ['normal', 'warmup', 'failure', 'drop'];

export function WorkoutDetail() {
  const { id } = useParams<{ id: string }>();
  const nav = useNavigate();
  const { workouts, exercisesById, units, refreshWorkouts } = useStore();
  const [armed, setArmed] = useState(false);
  const [editing, setEditing] = useState(false);
  const [picking, setPicking] = useState(false);

  const workout = workouts.find((w) => w.id === id);

  const changed = useCallback(() => refreshWorkouts(), [refreshWorkouts]);

  const addExercises = useCallback(async (ids: string[]) => {
    if (!workout) return;
    let pos = workout.exercises.length;
    for (const exerciseId of ids) {
      const we = await db.addWorkoutExercise(workout.id, exerciseId, pos++);
      // A set added after the fact is work that happened — there is no tick
      // left to press, so it counts from the moment it exists.
      await db.addSet(we.id, 0, { completed: true });
    }
    await changed();
  }, [workout, changed]);

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
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            className={editing ? 'btn primary' : 'btn'}
            onClick={() => setEditing((v) => !v)}
          >
            {editing ? 'Done' : 'Edit'}
          </button>
          <ConfirmButton
            armed={armed} setArmed={setArmed} armedLabel="Delete for good?"
            className="btn danger"
            onConfirm={() => void db.deleteWorkout(workout.id).then(refreshWorkouts).then(() => nav('/history'))}
          >
            Delete
          </ConfirmButton>
        </div>
      </div>

      <div className="stat-grid">
        <Stat label="Duration" value={formatDurationShort(workoutDurationS(workout))} />
        <Stat label="Volume" value={trim(kgTo(workoutVolume(workout), units.weight), 0)} unit={units.weight} />
        <Stat label="Sets" value={workoutSetCount(workout)} />
        <Stat label="Exercises" value={workout.exercises.length} />
      </div>

      {editing ? (
        <WorkoutFields workout={workout} onChanged={changed} />
      ) : (
        workout.notes && (
          <div className="card" style={{ marginTop: 14 }}>
            <div className="faint" style={{ fontSize: 11.5, textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 650 }}>Notes</div>
            <div style={{ marginTop: 5 }}>{workout.notes}</div>
          </div>
        )
      )}

      <div className="section-head"><h2>Exercises</h2></div>

      {workout.exercises.length === 0 && (
        <Empty>{editing ? 'Nothing here — add an exercise below.' : 'No exercises logged.'}</Empty>
      )}

      {editing
        ? workout.exercises.map((we, i) => (
          <EditableExercise
            key={we.id}
            workout={workout}
            we={we}
            first={i === 0}
            last={i === workout.exercises.length - 1}
            onChanged={changed}
          />
        ))
        : workout.exercises.map((we) => {
          const ex = exercisesById.get(we.exerciseId);
          const pr = prs.get(we.exerciseId);
          return (
            <div className="card" key={we.id} style={{ marginBottom: 10 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                <Link to={`/exercises/${we.exerciseId}`} style={{ fontWeight: 650, color: 'var(--accent-text)' }}>
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

      {editing && (
        <button className="btn block lg" style={{ marginTop: 8 }} onClick={() => setPicking(true)}>
          + Add exercise
        </button>
      )}

      {picking && (
        <ExercisePicker onPick={(ids) => void addExercises(ids)} onClose={() => setPicking(false)} />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Name, clock and notes
// ---------------------------------------------------------------------------

/**
 * `<input type="datetime-local">` speaks local wall-clock time with no zone,
 * which is exactly what you mean when you say the session started at 18:40.
 * These convert at that edge; the stored value stays a UTC ISO string.
 */
function toLocalInput(iso: string): string {
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

const fromLocalInput = (v: string) => new Date(v).toISOString();

function WorkoutFields({ workout, onChanged }: { workout: Workout; onChanged: () => Promise<void> }) {
  const [name, setName] = useState(workout.name);
  const [notes, setNotes] = useState(workout.notes ?? '');
  // A finished workout always has an end; the type doesn't know that, so fall
  // back to the start rather than rendering an empty control.
  const [started, setStarted] = useState(() => toLocalInput(workout.startedAt));
  const [ended, setEnded] = useState(() => toLocalInput(workout.endedAt ?? workout.startedAt));
  const [err, setErr] = useState<string | null>(null);

  /**
   * Commit both timestamps together, because they're only valid as a pair —
   * dragging the start past the end has to be rejected as one edit, not
   * accepted as a half-written one.
   *
   * The controls carry minute precision, so a commit drops the seconds off a
   * timestamp. Comparing the *rendered* values rather than the ISO ones means
   * that only happens when you actually change a time, not merely by opening
   * the editor and closing it again.
   */
  async function commitTimes() {
    const s = Date.parse(started);
    const e = Date.parse(ended);
    if (Number.isNaN(s) || Number.isNaN(e)) { setErr('That isn’t a valid date and time.'); return; }
    if (e < s) { setErr('The workout can’t end before it started.'); return; }

    // Validate before the no-op check, not after: putting a rejected time back
    // the way it was is a fix, and a fix has to clear the message even though
    // it leaves nothing to write.
    setErr(null);
    if (started === toLocalInput(workout.startedAt)
      && ended === toLocalInput(workout.endedAt ?? workout.startedAt)) return;

    await db.updateWorkout(workout.id, {
      startedAt: fromLocalInput(started), endedAt: fromLocalInput(ended),
    });
    await onChanged();
  }

  // Only for a pair that makes sense. A backwards range has no duration to
  // preview, and clamping it to "0m" would read as a fact rather than a fault.
  const previewS = (() => {
    const s = Date.parse(started);
    const e = Date.parse(ended);
    return Number.isNaN(s) || Number.isNaN(e) || e < s ? null : (e - s) / 1000;
  })();

  return (
    <div className="card" style={{ marginTop: 14 }}>
      {err && <div className="error-note" style={{ marginTop: 0 }}>{err}</div>}
      <div style={{ display: 'grid', gap: 12 }}>
        <Field label="Name">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            onBlur={() => {
              const next = name.trim() || 'Workout';
              setName(next);
              if (next !== workout.name) void db.updateWorkout(workout.id, { name: next }).then(onChanged);
            }}
          />
        </Field>

        <div className="time-fields">
          <Field label="Started">
            <input type="datetime-local" value={started} onChange={(e) => setStarted(e.target.value)} onBlur={() => void commitTimes()} />
          </Field>
          <Field label="Ended">
            <input type="datetime-local" value={ended} onChange={(e) => setEnded(e.target.value)} onBlur={() => void commitTimes()} />
          </Field>
        </div>

        {previewS != null && (
          <div className="faint" style={{ fontSize: 12.5, marginTop: -4 }}>
            Duration {formatDurationShort(previewS)}
          </div>
        )}

        <Field label="Notes">
          <textarea
            value={notes}
            placeholder="How it felt, what to change next time"
            onChange={(e) => setNotes(e.target.value)}
            onBlur={() => {
              if ((notes || null) !== workout.notes) {
                void db.updateWorkout(workout.id, { notes: notes || null }).then(onChanged);
              }
            }}
          />
        </Field>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Editable exercises and sets
//
// Deliberately not shared with LiveWorkout's ExerciseBlock/SetRow. Those carry
// the whole prefill-and-suggest apparatus — last session's numbers offered
// dimmed, an overload target, a rest timer, a tick that turns an offer into a
// record. None of it means anything on a session that already happened, and
// bolting a mode flag onto the one screen you use at the rack to save eighty
// lines here would be a bad trade.
// ---------------------------------------------------------------------------

function EditableExercise({
  workout, we, first, last, onChanged,
}: {
  workout: Workout;
  we: WorkoutExercise;
  first: boolean;
  last: boolean;
  onChanged: () => Promise<void>;
}) {
  const { exercisesById, units } = useStore();
  const [removeArmed, setRemoveArmed] = useState(false);

  const ex = exercisesById.get(we.exerciseId);
  const name = ex?.name ?? 'Unknown exercise';
  const tracking = ex?.trackingType ?? 'weight_reps';
  const showWeight = tracking !== 'reps_only' && tracking !== 'duration';
  const showDuration = tracking === 'duration';

  async function addSet() {
    // Seeded from the set above it, same as the live screen — a straight-sets
    // scheme is then one tap per missing row. `prev`, not `last`: `last` is
    // the prop saying this block is the bottom one.
    const prev = we.sets[we.sets.length - 1];
    await db.addSet(we.id, we.sets.length, {
      weightKg: prev?.weightKg ?? null,
      reps: prev?.reps ?? null,
      durationS: prev?.durationS ?? null,
      setType: prev && prev.setType !== 'warmup' ? prev.setType : 'normal',
      completed: true,
    });
    await onChanged();
  }

  const move = (delta: number) =>
    void db.moveWorkoutExercise(workout.id, we.id, delta).then(onChanged);

  return (
    <div className="ex-block">
      <div className="ex-head">
        <span className="name">{name}</span>
        <button className="btn ghost sm move" onClick={() => move(-1)} disabled={first} aria-label={`Move ${name} up`}>↑</button>
        <button className="btn ghost sm move" onClick={() => move(1)} disabled={last} aria-label={`Move ${name} down`}>↓</button>
        <ConfirmButton
          armed={removeArmed} setArmed={setRemoveArmed} armedLabel="Remove?"
          onConfirm={() => void db.removeWorkoutExercise(we.id).then(onChanged)}
        >
          ✕
        </ConfirmButton>
      </div>

      <div className="set-grid edit head">
        <span>Set</span>
        <span style={{ textAlign: 'center' }}>{showDuration ? 'Time' : units.weight}</span>
        <span style={{ textAlign: 'center' }}>{showDuration ? '' : 'Reps'}</span>
        <span />
        <span />
      </div>

      {we.sets.map((s, i) => (
        <EditableSet
          key={s.id}
          set={s}
          index={i}
          showWeight={showWeight}
          showDuration={showDuration}
          onChanged={onChanged}
        />
      ))}

      <button className="btn sm block" style={{ marginTop: 4 }} onClick={() => void addSet()}>+ Add set</button>
    </div>
  );
}

function EditableSet({
  set, index, showWeight, showDuration, onChanged,
}: {
  set: WorkoutSet;
  index: number;
  showWeight: boolean;
  showDuration: boolean;
  onChanged: () => Promise<void>;
}) {
  const { units } = useStore();

  const shown = useCallback((s: WorkoutSet) => ({
    weight: s.weightKg == null ? '' : trim(kgTo(s.weightKg, units.weight)),
    reps: s.reps == null ? '' : String(s.reps),
    dur: s.durationS == null ? '' : String(s.durationS),
  }), [units.weight]);

  const [weight, setWeight] = useState(() => shown(set).weight);
  const [reps, setReps] = useState(() => shown(set).reps);
  const [dur, setDur] = useState(() => shown(set).dur);

  // Re-sync when the row is replaced by a refetch — a set deleted above this
  // one shifts positions — but never while it's being typed in.
  const focused = useRef(false);
  useEffect(() => {
    if (focused.current) return;
    const next = shown(set);
    setWeight(next.weight);
    setReps(next.reps);
    setDur(next.dur);
  }, [set, shown]);

  const parsed = () => ({
    weightKg: weight === '' ? null : toKg(Number(weight), units.weight),
    reps: reps === '' ? null : Math.round(Number(reps)),
    durationS: dur === '' ? null : Math.round(Number(dur)),
  });

  const flush = async () => {
    focused.current = false;
    const p = parsed();
    if (p.weightKg === set.weightKg && p.reps === set.reps && p.durationS === set.durationS) return;
    await db.updateSet(set.id, p);
    await onChanged();
  };

  async function cycleType() {
    const next = SET_TYPE_CYCLE[(SET_TYPE_CYCLE.indexOf(set.setType) + 1) % SET_TYPE_CYCLE.length];
    await db.updateSet(set.id, { setType: next });
    await onChanged();
  }

  // Always `done`: `finishWorkout` deletes every unticked set, so by the time a
  // workout reaches this screen each of its sets is one you actually did. There
  // is deliberately no tick to un-press — a row that displays but counts for
  // nothing is exactly what dropping unticked sets exists to prevent. Delete it
  // instead.
  return (
    <div className="set-grid edit set-row done">
      <button className={`set-type-btn ${set.setType}`} onClick={() => void cycleType()} title="Cycle set type">
        {SET_TYPE_MARK[set.setType] || index + 1}
      </button>

      {showDuration ? (
        <input
          inputMode="numeric" placeholder="sec" value={dur}
          onFocus={() => { focused.current = true; }}
          onChange={(e) => setDur(e.target.value)} onBlur={() => void flush()}
        />
      ) : (
        <input
          inputMode="decimal" placeholder={showWeight ? '0' : '—'} value={weight}
          disabled={!showWeight}
          onFocus={() => { focused.current = true; }}
          onChange={(e) => setWeight(e.target.value)} onBlur={() => void flush()}
        />
      )}

      {showDuration ? <span /> : (
        <input
          inputMode="numeric" placeholder="0" value={reps}
          onFocus={() => { focused.current = true; }}
          onChange={(e) => setReps(e.target.value)} onBlur={() => void flush()}
        />
      )}

      <span />

      <button
        className="btn ghost sm"
        style={{ padding: '6px 4px' }}
        onClick={() => void db.deleteSet(set.id).then(onChanged)}
        aria-label="Delete set"
      >
        ✕
      </button>
    </div>
  );
}
