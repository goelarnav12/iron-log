// The screen you actually stand at the rack with.
//
// State model: the workout lives in Postgres and is re-fetched after every
// structural change (add/remove exercise, add/delete set). Set *inputs* are
// the exception — they're held in local component state and flushed on blur,
// so typing doesn't fire a request per keystroke. Ticking a set flushes
// immediately, since that's the moment the number is final.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useStore } from '../state/store';
import * as db from '../lib/db';
import type { SetType, Workout, WorkoutSet } from '../lib/types';
import { formatDuration, kgTo, toKg, trim } from '../lib/units';
import { ExercisePicker } from '../components/ExercisePicker';
import { ConfirmButton, Empty, Modal } from '../components/ui';

const REST_KEY = 'ht.restSeconds';
const defaultRest = () => Number(localStorage.getItem(REST_KEY) ?? 90);

const SET_TYPE_CYCLE: SetType[] = ['normal', 'warmup', 'failure', 'drop'];
const SET_TYPE_MARK: Record<SetType, string> = { normal: '', warmup: 'W', failure: 'F', drop: 'D' };

export function LiveWorkout() {
  const { activeWorkout, routines, refreshActive, refreshWorkouts, exercisesById } = useStore();
  const [busy, setBusy] = useState(false);

  async function start(name: string, routineId?: string) {
    setBusy(true);
    try {
      const routine = routines.find((r) => r.id === routineId);
      await db.startWorkout({
        name,
        routineId: routineId ?? null,
        exercises: routine?.exercises.map((e) => ({
          exerciseId: e.exerciseId,
          sets: e.targetSets,
          notes: e.notes,
        })) ?? [],
      });
      await refreshActive();
    } finally {
      setBusy(false);
    }
  }

  if (activeWorkout) {
    return <ActiveWorkout workout={activeWorkout} onChanged={refreshActive} onFinished={async () => {
      await Promise.all([refreshActive(), refreshWorkouts()]);
    }} />;
  }

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Start a workout</h1>
          <div className="sub">Pick a routine, or start from nothing and add as you go.</div>
        </div>
      </div>

      <button
        className="btn primary lg block"
        disabled={busy}
        onClick={() => void start('Workout')}
      >
        ⚡ Start empty workout
      </button>

      <div className="section-head"><h2>From a routine</h2></div>
      {routines.length === 0 && <Empty>No routines yet — build one under Routines.</Empty>}
      {routines.map((r) => (
        <div key={r.id} className="row">
          <div className="grow">
            <div className="title">{r.name}</div>
            <div className="meta">
              {r.exercises.length
                ? r.exercises.map((e) => exercisesById.get(e.exerciseId)?.name ?? '?').join(' · ')
                : 'Empty routine'}
            </div>
          </div>
          <button className="btn sm" disabled={busy} onClick={() => void start(r.name, r.id)}>Start</button>
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------

function ActiveWorkout({
  workout, onChanged, onFinished,
}: {
  workout: Workout;
  onChanged: () => Promise<void>;
  onFinished: () => Promise<void>;
}) {
  const { exercisesById, workouts } = useStore();
  const [picking, setPicking] = useState(false);
  const [finishing, setFinishing] = useState(false);
  const [notes, setNotes] = useState(workout.notes ?? '');
  const [restEndsAt, setRestEndsAt] = useState<number | null>(null);
  const [discardArmed, setDiscardArmed] = useState(false);
  const [name, setName] = useState(workout.name);

  const elapsed = useElapsed(workout.startedAt);

  /**
   * The last time each exercise was trained, as a positional list of sets.
   * Shown greyed behind each row so you know what to beat without leaving the
   * screen. Built once per history change rather than per row.
   */
  const previous = useMemo(() => {
    const map = new Map<string, WorkoutSet[]>();
    // `workouts` is newest-first, so the first hit for an exercise is the most
    // recent one and later ones must not overwrite it.
    for (const w of workouts) {
      for (const we of w.exercises) {
        if (map.has(we.exerciseId)) continue;
        const done = we.sets.filter((s) => s.completed);
        if (done.length) map.set(we.exerciseId, done);
      }
    }
    return map;
  }, [workouts]);

  const addExercises = useCallback(async (ids: string[]) => {
    let pos = workout.exercises.length;
    for (const id of ids) {
      const we = await db.addWorkoutExercise(workout.id, id, pos++);
      // One blank set, so there's somewhere to type immediately.
      await db.addSet(we.id, 0);
    }
    await onChanged();
  }, [workout, onChanged]);

  async function finish() {
    await db.updateWorkout(workout.id, { name });
    await db.finishWorkout(workout.id, notes || null);
    setFinishing(false);
    await onFinished();
  }

  async function discard() {
    await db.deleteWorkout(workout.id);
    await onFinished();
  }

  const completedSets = workout.exercises.reduce(
    (n, we) => n + we.sets.filter((s) => s.completed).length, 0);

  return (
    <>
      <div className="live-bar">
        <span className="timer">{formatDuration(elapsed)}</span>
        <span className="faint" style={{ fontSize: 13 }}>{completedSets} sets</span>
        <div style={{ flex: 1 }} />
        <ConfirmButton armed={discardArmed} setArmed={setDiscardArmed} onConfirm={() => void discard()} armedLabel="Discard?">
          Discard
        </ConfirmButton>
        <button className="btn primary sm" onClick={() => setFinishing(true)}>Finish</button>
      </div>

      <div className="page">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          onBlur={() => void db.updateWorkout(workout.id, { name })}
          style={{
            background: 'transparent', border: 'none', padding: 0,
            fontSize: 24, fontWeight: 650, marginBottom: 18,
          }}
        />

        {workout.exercises.length === 0 && (
          <Empty>Nothing logged yet. Add your first exercise below.</Empty>
        )}

        {workout.exercises.map((we) => {
          const ex = exercisesById.get(we.exerciseId);
          return (
            <ExerciseBlock
              key={we.id}
              workoutExerciseId={we.id}
              name={ex?.name ?? 'Unknown exercise'}
              trackingType={ex?.trackingType ?? 'weight_reps'}
              sets={we.sets}
              previous={previous.get(we.exerciseId) ?? []}
              onChanged={onChanged}
              onRest={() => setRestEndsAt(Date.now() + defaultRest() * 1000)}
            />
          );
        })}

        <button className="btn block lg" style={{ marginTop: 8 }} onClick={() => setPicking(true)}>
          + Add exercise
        </button>
      </div>

      {restEndsAt && <RestTimer endsAt={restEndsAt} onDismiss={() => setRestEndsAt(null)} />}
      {picking && <ExercisePicker onPick={(ids) => void addExercises(ids)} onClose={() => setPicking(false)} />}

      {finishing && (
        <Modal
          title="Finish workout"
          onClose={() => setFinishing(false)}
          footer={
            <>
              <button className="btn ghost" onClick={() => setFinishing(false)}>Keep going</button>
              <button className="btn primary" onClick={() => void finish()}>Finish</button>
            </>
          }
        >
          <p className="muted" style={{ marginTop: 0, fontSize: 14 }}>
            {formatDuration(elapsed)} · {completedSets} sets completed. Anything left
            unticked will be dropped.
          </p>
          <div className="field">
            <label>Notes</label>
            <textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="How it felt, what to change next time" />
          </div>
        </Modal>
      )}
    </>
  );
}

// ---------------------------------------------------------------------------

function ExerciseBlock({
  workoutExerciseId, name, trackingType, sets, previous, onChanged, onRest,
}: {
  workoutExerciseId: string;
  name: string;
  trackingType: string;
  sets: WorkoutSet[];
  previous: WorkoutSet[];
  onChanged: () => Promise<void>;
  onRest: () => void;
}) {
  const { units } = useStore();
  const [removeArmed, setRemoveArmed] = useState(false);
  const showWeight = trackingType !== 'reps_only' && trackingType !== 'duration';
  const showDuration = trackingType === 'duration';

  async function addSet() {
    // Seed from the last set so a straight-sets scheme is one tap per set.
    const last = sets[sets.length - 1];
    await db.addSet(workoutExerciseId, sets.length, last
      ? { weightKg: last.weightKg, reps: last.reps, durationS: last.durationS, setType: last.setType === 'warmup' ? 'normal' : last.setType }
      : undefined);
    await onChanged();
  }

  return (
    <div className="ex-block">
      <div className="ex-head">
        <span className="name">{name}</span>
        <ConfirmButton
          armed={removeArmed}
          setArmed={setRemoveArmed}
          armedLabel="Remove?"
          onConfirm={() => void db.removeWorkoutExercise(workoutExerciseId).then(onChanged)}
        >
          ✕
        </ConfirmButton>
      </div>

      <div className="set-grid head">
        <span>Set</span>
        <span style={{ textAlign: 'center' }}>Previous</span>
        <span style={{ textAlign: 'center' }}>{showDuration ? 'Time' : units.weight}</span>
        <span style={{ textAlign: 'center' }}>{showDuration ? '' : 'Reps'}</span>
        <span />
        <span />
      </div>

      {sets.map((s, i) => (
        <SetRow
          key={s.id}
          set={s}
          index={i}
          previous={previous[i]}
          showWeight={showWeight}
          showDuration={showDuration}
          onChanged={onChanged}
          onRest={onRest}
        />
      ))}

      <button className="btn sm block" style={{ marginTop: 4 }} onClick={() => void addSet()}>+ Add set</button>
    </div>
  );
}

// ---------------------------------------------------------------------------

function SetRow({
  set, index, previous, showWeight, showDuration, onChanged, onRest,
}: {
  set: WorkoutSet;
  index: number;
  previous?: WorkoutSet;
  showWeight: boolean;
  showDuration: boolean;
  onChanged: () => Promise<void>;
  onRest: () => void;
}) {
  const { units } = useStore();
  // Inputs are strings while being edited so a half-typed "1." survives, and
  // are only parsed on the way out.
  const [weight, setWeight] = useState(() => (set.weightKg == null ? '' : trim(kgTo(set.weightKg, units.weight))));
  const [reps, setReps] = useState(set.reps == null ? '' : String(set.reps));
  const [dur, setDur] = useState(set.durationS == null ? '' : String(set.durationS));

  // Re-sync if the row is replaced by a refetch (e.g. a set was deleted above
  // it and positions shifted) but not while it's focused.
  const focused = useRef(false);
  useEffect(() => {
    if (focused.current) return;
    setWeight(set.weightKg == null ? '' : trim(kgTo(set.weightKg, units.weight)));
    setReps(set.reps == null ? '' : String(set.reps));
    setDur(set.durationS == null ? '' : String(set.durationS));
  }, [set.weightKg, set.reps, set.durationS, units.weight]);

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

  async function toggleDone() {
    const next = !set.completed;
    // Commit whatever is in the inputs at the same time, so ticking is a
    // single action rather than "blur, then tick".
    await db.updateSet(set.id, { ...parsed(), completed: next });
    await onChanged();
    if (next) onRest();
  }

  async function cycleType() {
    const next = SET_TYPE_CYCLE[(SET_TYPE_CYCLE.indexOf(set.setType) + 1) % SET_TYPE_CYCLE.length];
    await db.updateSet(set.id, { setType: next });
    await onChanged();
  }

  const prevLabel = previous
    ? previous.durationS != null
      ? formatDuration(previous.durationS)
      : `${trim(kgTo(previous.weightKg ?? 0, units.weight))} × ${previous.reps ?? 0}`
    : '—';

  return (
    <div className={`set-grid set-row ${set.completed ? 'done' : ''}`}>
      <button className={`set-type-btn ${set.setType}`} onClick={() => void cycleType()} title="Cycle set type">
        {SET_TYPE_MARK[set.setType] || index + 1}
      </button>

      <span className="set-prev">{prevLabel}</span>

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

      <button className={`check-btn ${set.completed ? 'on' : ''}`} onClick={() => void toggleDone()} aria-label="Complete set">✓</button>

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

// ---------------------------------------------------------------------------

/** Seconds since `startedAt`, ticking once a second. */
function useElapsed(startedAt: string): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  return Math.max(0, (now - Date.parse(startedAt)) / 1000);
}

/**
 * Rest countdown. Driven off a wall-clock deadline rather than a decrementing
 * counter, so backgrounding the tab (or locking the phone) doesn't pause it.
 */
function RestTimer({ endsAt, onDismiss }: { endsAt: number; onDismiss: () => void }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(t);
  }, []);

  const left = Math.max(0, Math.round((endsAt - now) / 1000));

  useEffect(() => {
    if (left > 0) return;
    // Vibration is the only alert that works with the screen off and the phone
    // in a pocket; it's a no-op on desktop and on iOS Safari.
    navigator.vibrate?.([200, 100, 200]);
    const t = setTimeout(onDismiss, 3000);
    return () => clearTimeout(t);
  }, [left, onDismiss]);

  return (
    <div className="rest-timer">
      <span className="t" style={left === 0 ? { color: 'var(--good)' } : undefined}>
        {left === 0 ? 'Go' : formatDuration(left)}
      </span>
      <button className="btn ghost sm" onClick={onDismiss}>Skip</button>
    </div>
  );
}
