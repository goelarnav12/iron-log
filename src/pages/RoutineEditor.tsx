import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useStore } from '../state/store';
import * as db from '../lib/db';
import { Empty, Field } from '../components/ui';
import { ExercisePicker } from '../components/ExercisePicker';

interface Draft {
  exerciseId: string;
  targetSets: number;
  notes: string | null;
}

/**
 * Handles both `/routines/new` and `/routines/:id`. The whole routine is
 * edited as a local draft and written in one go by saveRoutine(), which
 * replaces the child rows wholesale — so nothing is persisted until Save.
 */
export function RoutineEditor() {
  const { id } = useParams<{ id: string }>();
  const nav = useNavigate();
  const { routines, exercisesById, refreshRoutines } = useStore();
  const existing = id ? routines.find((r) => r.id === id) : undefined;

  const [name, setName] = useState(existing?.name ?? '');
  const [notes, setNotes] = useState(existing?.notes ?? '');
  const [items, setItems] = useState<Draft[]>(
    existing?.exercises.map((e) => ({ exerciseId: e.exerciseId, targetSets: e.targetSets, notes: e.notes })) ?? []);
  const [picking, setPicking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const move = (i: number, delta: number) => {
    const j = i + delta;
    if (j < 0 || j >= items.length) return;
    const next = [...items];
    [next[i], next[j]] = [next[j], next[i]];
    setItems(next);
  };

  const patch = (i: number, p: Partial<Draft>) =>
    setItems(items.map((it, k) => (k === i ? { ...it, ...p } : it)));

  async function save() {
    if (!name.trim()) { setErr('Give the routine a name.'); return; }
    setBusy(true);
    try {
      await db.saveRoutine({ id: existing?.id, name: name.trim(), notes: notes || null }, items);
      await refreshRoutines();
      nav('/routines');
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>{existing ? 'Edit routine' : 'New routine'}</h1>
          <div className="sub">Exercises run in this order when you start it.</div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn ghost" onClick={() => nav('/routines')}>Cancel</button>
          <button className="btn primary" onClick={() => void save()} disabled={busy}>Save</button>
        </div>
      </div>

      {err && <div className="error-note">{err}</div>}

      <div className="card">
        <div style={{ display: 'grid', gap: 12 }}>
          <Field label="Name">
            <input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Push A" />
          </Field>
          <Field label="Notes (optional)">
            <input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Progression scheme, deload rules" />
          </Field>
        </div>
      </div>

      <div className="section-head"><h2>Exercises</h2></div>

      {items.length === 0 && <Empty>Nothing added yet.</Empty>}

      {items.map((it, i) => (
        <div className="row" key={`${it.exerciseId}-${i}`}>
          <div className="grow">
            <div className="title">{exercisesById.get(it.exerciseId)?.name ?? 'Unknown'}</div>
            <div className="meta">{exercisesById.get(it.exerciseId)?.muscleGroup}</div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <input
              type="number" min={1} max={20} value={it.targetSets}
              onChange={(e) => patch(i, { targetSets: Math.max(1, Number(e.target.value) || 1) })}
              style={{ width: 62, textAlign: 'center' }}
            />
            <span className="faint" style={{ fontSize: 12 }}>sets</span>
          </div>
          <button className="btn ghost sm" onClick={() => move(i, -1)} disabled={i === 0} aria-label="Move up">↑</button>
          <button className="btn ghost sm" onClick={() => move(i, 1)} disabled={i === items.length - 1} aria-label="Move down">↓</button>
          <button className="btn danger sm" onClick={() => setItems(items.filter((_, k) => k !== i))} aria-label="Remove">✕</button>
        </div>
      ))}

      <button className="btn block" style={{ marginTop: 8 }} onClick={() => setPicking(true)}>+ Add exercise</button>

      {picking && (
        <ExercisePicker
          onPick={(ids) => setItems([...items, ...ids.map((exerciseId) => ({ exerciseId, targetSets: 3, notes: null }))])}
          onClose={() => setPicking(false)}
        />
      )}
    </div>
  );
}
