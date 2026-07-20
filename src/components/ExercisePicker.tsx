// Searchable exercise picker, used by the live workout and the routine editor.
// Multi-select: you pick several, then confirm once, because adding six
// exercises one modal at a time is miserable on a phone.

import { useMemo, useState } from 'react';
import { useStore } from '../state/store';
import { Modal } from './ui';
import { EQUIPMENT, MUSCLE_GROUPS } from '../lib/types';
import { NewExerciseForm } from './NewExerciseForm';

export function ExercisePicker({
  onPick, onClose,
}: {
  /** Called once with everything selected, in the order it was selected. */
  onPick: (exerciseIds: string[]) => void;
  onClose: () => void;
}) {
  const { exercises } = useStore();
  const [q, setQ] = useState('');
  const [muscle, setMuscle] = useState<string | null>(null);
  const [equip, setEquip] = useState<string | null>(null);
  const [picked, setPicked] = useState<string[]>([]);
  const [creating, setCreating] = useState(false);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return exercises.filter((e) =>
      (!needle || e.name.toLowerCase().includes(needle)) &&
      (!muscle || e.muscleGroup === muscle) &&
      (!equip || e.equipment === equip));
  }, [exercises, q, muscle, equip]);

  const toggle = (id: string) =>
    setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));

  return (
    <>
      <Modal
        title="Add Exercise"
        onClose={onClose}
        wide
        footer={
          <>
            <button className="btn ghost" onClick={() => setCreating(true)}>+ New Exercise</button>
            <div style={{ flex: 1 }} />
            <button className="btn ghost" onClick={onClose}>Cancel</button>
            <button
              className="btn primary"
              disabled={!picked.length}
              onClick={() => { onPick(picked); onClose(); }}
            >
              Add {picked.length ? `(${picked.length})` : ''}
            </button>
          </>
        }
      >
        <input
          autoFocus
          placeholder="Search exercises…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          style={{ marginBottom: 12 }}
        />

        <div className="chips" style={{ marginBottom: 8 }}>
          <button className={`chip ${!muscle ? 'active' : ''}`} onClick={() => setMuscle(null)}>All muscles</button>
          {MUSCLE_GROUPS.map((m) => (
            <button key={m} className={`chip ${muscle === m ? 'active' : ''}`} onClick={() => setMuscle(muscle === m ? null : m)}>{m}</button>
          ))}
        </div>
        <div className="chips" style={{ marginBottom: 14 }}>
          <button className={`chip ${!equip ? 'active' : ''}`} onClick={() => setEquip(null)}>All equipment</button>
          {EQUIPMENT.map((m) => (
            <button key={m} className={`chip ${equip === m ? 'active' : ''}`} onClick={() => setEquip(equip === m ? null : m)}>{m}</button>
          ))}
        </div>

        {filtered.length === 0 && <div className="empty">Nothing matches. Try “+ New Exercise”.</div>}

        {filtered.map((e) => {
          const i = picked.indexOf(e.id);
          return (
            <div
              key={e.id}
              className="row"
              style={{
                cursor: 'pointer',
                borderColor: i >= 0 ? 'var(--accent)' : undefined,
                background: i >= 0 ? 'var(--accent-soft)' : undefined,
              }}
              onClick={() => toggle(e.id)}
            >
              <div className="grow">
                <div className="title">{e.name}</div>
                <div className="meta">
                  {e.muscleGroup} · {e.equipment}
                  {e.userId && ' · custom'}
                </div>
              </div>
              {i >= 0 && <span className="badge" style={{ background: 'var(--accent)', color: '#0b0d14' }}>{i + 1}</span>}
            </div>
          );
        })}
      </Modal>

      {creating && (
        <NewExerciseForm
          onClose={() => setCreating(false)}
          onCreated={(id) => { setPicked((p) => [...p, id]); setCreating(false); }}
        />
      )}
    </>
  );
}
