import { useState } from 'react';
import { Field, Modal } from './ui';
import { EQUIPMENT, MUSCLE_GROUPS, type Exercise, type TrackingType } from '../lib/types';
import * as db from '../lib/db';
import { useStore } from '../state/store';

const TRACKING_LABELS: Record<TrackingType, string> = {
  weight_reps: 'Weight × reps',
  reps_only: 'Reps only',
  duration: 'Duration',
  weighted_bodyweight: 'Bodyweight (+ optional weight)',
};

/** Creates a custom exercise, or edits one you already own. */
export function NewExerciseForm({
  existing, onClose, onCreated,
}: {
  existing?: Exercise;
  onClose: () => void;
  onCreated?: (id: string) => void;
}) {
  const { refreshExercises } = useStore();
  const [name, setName] = useState(existing?.name ?? '');
  const [muscleGroup, setMuscle] = useState(existing?.muscleGroup ?? 'Chest');
  const [equipment, setEquip] = useState(existing?.equipment ?? 'Barbell');
  const [trackingType, setTracking] = useState<TrackingType>(existing?.trackingType ?? 'weight_reps');
  const [notes, setNotes] = useState(existing?.notes ?? '');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function save() {
    if (!name.trim()) { setErr('Give it a name.'); return; }
    setBusy(true);
    try {
      if (existing) {
        await db.updateExercise(existing.id, { name: name.trim(), muscleGroup, equipment, trackingType, notes: notes || null });
        await refreshExercises();
        onClose();
      } else {
        const created = await db.createExercise({ name: name.trim(), muscleGroup, equipment, trackingType, notes: notes || null });
        await refreshExercises();
        onCreated?.(created.id);
        if (!onCreated) onClose();
      }
    } catch (e) {
      // The unique index on (user_id, lower(name)) is the usual culprit.
      const msg = e instanceof Error ? e.message : String(e);
      setErr(msg.includes('duplicate') ? 'You already have an exercise with that name.' : msg);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      title={existing ? 'Edit Exercise' : 'New Exercise'}
      onClose={onClose}
      footer={
        <>
          <button className="btn ghost" onClick={onClose}>Cancel</button>
          <button className="btn primary" onClick={save} disabled={busy}>Save</button>
        </>
      }
    >
      {err && <div className="error-note">{err}</div>}
      <div style={{ display: 'grid', gap: 12 }}>
        <Field label="Name">
          <input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Cable Y-Raise" />
        </Field>
        <div className="form-grid">
          <Field label="Muscle group">
            <select value={muscleGroup} onChange={(e) => setMuscle(e.target.value)}>
              {MUSCLE_GROUPS.map((m) => <option key={m}>{m}</option>)}
            </select>
          </Field>
          <Field label="Equipment">
            <select value={equipment} onChange={(e) => setEquip(e.target.value)}>
              {EQUIPMENT.map((m) => <option key={m}>{m}</option>)}
            </select>
          </Field>
        </div>
        <Field label="Tracked as">
          <select value={trackingType} onChange={(e) => setTracking(e.target.value as TrackingType)}>
            {Object.entries(TRACKING_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </Field>
        <Field label="Notes (optional)">
          <input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Setup, cues, pin position" />
        </Field>
      </div>
    </Modal>
  );
}
