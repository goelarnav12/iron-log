import { useMemo, useState } from 'react';
import { useStore } from '../state/store';
import * as db from '../lib/db';
import { ConfirmButton, Empty, Field, Modal, Stat } from '../components/ui';
import { CARDIO_ACTIVITIES, type CardioSession } from '../lib/types';
import {
  formatDuration, formatDurationShort, formatPace, mTo, parseDuration, toM, trim,
} from '../lib/units';

const today = () => new Date().toISOString().slice(0, 10);

export function Cardio() {
  const { cardio, units, refreshCardio } = useStore();
  const [editing, setEditing] = useState<CardioSession | 'new' | null>(null);
  const [armedId, setArmedId] = useState<string | null>(null);

  // Last 30 days, since "how much cardio am I doing" is a recent question.
  const recent = useMemo(() => {
    const cut = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
    return cardio.filter((c) => c.date >= cut);
  }, [cardio]);

  const totalS = recent.reduce((n, c) => n + c.durationS, 0);
  const totalM = recent.reduce((n, c) => n + (c.distanceM ?? 0), 0);

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Cardio</h1>
          <div className="sub">{cardio.length} sessions logged</div>
        </div>
        <button className="btn primary" onClick={() => setEditing('new')}>+ Log cardio</button>
      </div>

      <div className="stat-grid">
        <Stat label="Sessions · 30d" value={recent.length} />
        <Stat label="Time · 30d" value={formatDurationShort(totalS)} />
        <Stat label="Distance · 30d" value={totalM ? trim(mTo(totalM, units.distance), 1) : '—'} unit={totalM ? units.distance : undefined} />
        <Stat
          label="Avg pace · 30d"
          value={totalM ? formatPace(totalS, totalM, units.distance) : '—'}
        />
      </div>

      <div className="section-head"><h2>Sessions</h2></div>

      {cardio.length === 0 && <Empty>No cardio logged yet.</Empty>}

      {cardio.map((c) => (
        <div className="row" key={c.id}>
          <div className="grow">
            <div className="title">{c.activity}</div>
            <div className="meta">
              {c.date}
              {c.avgHr ? ` · ${c.avgHr} bpm` : ''}
              {c.calories ? ` · ${c.calories} kcal` : ''}
              {c.notes ? ` · ${c.notes}` : ''}
            </div>
          </div>
          <div style={{ textAlign: 'right', flexShrink: 0 }}>
            <div className="mono" style={{ fontSize: 13 }}>
              {formatDuration(c.durationS)}
              {c.distanceM ? ` · ${trim(mTo(c.distanceM, units.distance), 2)} ${units.distance}` : ''}
            </div>
            <div className="meta">{formatPace(c.durationS, c.distanceM, units.distance)}</div>
          </div>
          <button className="btn ghost sm" onClick={() => setEditing(c)}>Edit</button>
          <ConfirmButton
            armed={armedId === c.id}
            setArmed={(v) => setArmedId(v ? c.id : null)}
            onConfirm={() => void db.deleteCardio(c.id).then(refreshCardio)}
          >
            ✕
          </ConfirmButton>
        </div>
      ))}

      {editing && (
        <CardioForm
          existing={editing === 'new' ? undefined : editing}
          onClose={() => setEditing(null)}
          onSaved={async () => { await refreshCardio(); setEditing(null); }}
        />
      )}
    </div>
  );
}

function CardioForm({
  existing, onClose, onSaved,
}: {
  existing?: CardioSession;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const { units } = useStore();
  const [date, setDate] = useState(existing?.date ?? today());
  const [activity, setActivity] = useState(existing?.activity ?? 'Run');
  // Duration is free text so "45", "45:00" and "1:05:00" all work.
  const [duration, setDuration] = useState(existing ? formatDuration(existing.durationS) : '');
  const [distance, setDistance] = useState(
    existing?.distanceM != null ? trim(mTo(existing.distanceM, units.distance), 2) : '');
  const [hr, setHr] = useState(existing?.avgHr != null ? String(existing.avgHr) : '');
  const [kcal, setKcal] = useState(existing?.calories != null ? String(existing.calories) : '');
  const [notes, setNotes] = useState(existing?.notes ?? '');
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function save() {
    const durationS = parseDuration(duration);
    if (durationS == null || durationS <= 0) {
      setErr('Duration should look like 45, 45:00 or 1:05:00.');
      return;
    }
    setBusy(true);
    try {
      await db.saveCardio({
        id: existing?.id,
        date,
        activity,
        durationS,
        distanceM: distance === '' ? null : toM(Number(distance), units.distance),
        avgHr: hr === '' ? null : Math.round(Number(hr)),
        calories: kcal === '' ? null : Math.round(Number(kcal)),
        notes: notes || null,
      });
      await onSaved();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      title={existing ? 'Edit cardio' : 'Log cardio'}
      onClose={onClose}
      footer={
        <>
          <button className="btn ghost" onClick={onClose}>Cancel</button>
          <button className="btn primary" onClick={() => void save()} disabled={busy}>Save</button>
        </>
      }
    >
      {err && <div className="error-note">{err}</div>}
      <div style={{ display: 'grid', gap: 12 }}>
        <div className="form-grid">
          <Field label="Date"><input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></Field>
          <Field label="Activity">
            <select value={activity} onChange={(e) => setActivity(e.target.value)}>
              {CARDIO_ACTIVITIES.map((a) => <option key={a}>{a}</option>)}
            </select>
          </Field>
        </div>
        <div className="form-grid">
          <Field label="Duration (mm:ss)">
            <input autoFocus inputMode="numeric" value={duration} onChange={(e) => setDuration(e.target.value)} placeholder="32:40" />
          </Field>
          <Field label={`Distance (${units.distance})`}>
            <input inputMode="decimal" value={distance} onChange={(e) => setDistance(e.target.value)} placeholder="5.2" />
          </Field>
        </div>
        <div className="form-grid">
          <Field label="Avg HR"><input inputMode="numeric" value={hr} onChange={(e) => setHr(e.target.value)} placeholder="148" /></Field>
          <Field label="Calories"><input inputMode="numeric" value={kcal} onChange={(e) => setKcal(e.target.value)} placeholder="420" /></Field>
        </div>
        <Field label="Notes"><input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Route, how it felt" /></Field>
      </div>
    </Modal>
  );
}
