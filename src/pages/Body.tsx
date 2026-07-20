import { useMemo, useState } from 'react';
import {
  CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';
import { useStore } from '../state/store';
import * as db from '../lib/db';
import { ConfirmButton, Empty, Field, Modal, Stat } from '../components/ui';
import { MEASUREMENT_FIELDS, type BodyMeasurement, type MeasurementField } from '../lib/types';
import { cmTo, kgTo, toCm, toKg, trim } from '../lib/units';
import { weightSeries } from '../lib/stats';

const today = () => new Date().toISOString().slice(0, 10);

export function Body() {
  const { measurements, units, session, refreshMeasurements } = useStore();
  const [editing, setEditing] = useState<BodyMeasurement | 'new' | null>(null);
  const [armedId, setArmedId] = useState<string | null>(null);
  const [tape, setTape] = useState<MeasurementField>('waistCm');

  const weights = useMemo(() => weightSeries(measurements), [measurements]);
  const latest = weights[weights.length - 1];
  const first = weights[0];

  // Change over the last 30 days, using the smoothed line rather than raw
  // weigh-ins — day-to-day water swings are not signal.
  const monthAgoIdx = weights.findIndex(
    (w) => w.date >= new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10));
  const monthDelta =
    latest?.avg != null && monthAgoIdx >= 0 && weights[monthAgoIdx].avg != null
      ? latest.avg - weights[monthAgoIdx].avg!
      : null;

  const tapeSeries = useMemo(
    () => measurements
      .filter((m) => m[tape] != null)
      .map((m) => ({ date: m.date, v: Number(cmTo(m[tape]!, units.length).toFixed(1)) }))
      .sort((a, b) => a.date.localeCompare(b.date)),
    [measurements, tape, units.length]);

  const tapeLabel = MEASUREMENT_FIELDS.find(([k]) => k === tape)![1];

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Body</h1>
          <div className="sub">{measurements.length} entries · one per day</div>
        </div>
        <button className="btn primary" onClick={() => setEditing('new')}>+ Log entry</button>
      </div>

      <div className="stat-grid">
        <Stat
          label="Current"
          value={latest ? trim(kgTo(latest.weightKg, units.weight), 1) : '—'}
          unit={latest ? units.weight : undefined}
          sub={latest?.date}
        />
        <Stat
          label="7-day average"
          value={latest?.avg != null ? trim(kgTo(latest.avg, units.weight), 1) : '—'}
          unit={latest?.avg != null ? units.weight : undefined}
        />
        <Stat
          label="Last 30 days"
          value={monthDelta != null ? `${monthDelta >= 0 ? '+' : ''}${trim(kgTo(monthDelta, units.weight), 1)}` : '—'}
          unit={monthDelta != null ? units.weight : undefined}
          tone={monthDelta != null ? (monthDelta >= 0 ? 'up' : 'down') : undefined}
        />
        <Stat
          label="All time"
          value={latest && first ? `${latest.weightKg - first.weightKg >= 0 ? '+' : ''}${trim(kgTo(latest.weightKg - first.weightKg, units.weight), 1)}` : '—'}
          unit={latest && first ? units.weight : undefined}
        />
      </div>

      <div className="section-head"><h2>Bodyweight</h2></div>
      <div className="card">
        {weights.length < 2 ? <Empty>Log at least two weigh-ins to see a trend.</Empty> : (
          <div className="chart-box">
            <ResponsiveContainer>
              <LineChart
                data={weights.map((w) => ({
                  date: w.date,
                  weight: Number(kgTo(w.weightKg, units.weight).toFixed(1)),
                  avg: w.avg == null ? null : Number(kgTo(w.avg, units.weight).toFixed(1)),
                }))}
                margin={{ left: -8, right: 10, top: 6 }}
              >
                <CartesianGrid vertical={false} />
                <XAxis dataKey="date" tickLine={false} axisLine={false} minTickGap={30}
                  tickFormatter={(d: string) => d.slice(5)} />
                <YAxis domain={['auto', 'auto']} tickLine={false} axisLine={false} width={44} />
                <Tooltip
                  content={({ active, payload, label }) =>
                    active && payload?.length ? (
                      <div className="tooltip">
                        <div className="k">{label}</div>
                        <div>{payload[0].value} {units.weight}</div>
                        <div className="k">avg {payload[0].payload.avg} {units.weight}</div>
                      </div>
                    ) : null}
                />
                {/* Raw points sit behind; the moving average is the line you read. */}
                <Line type="monotone" dataKey="weight" stroke="var(--text-faint)" strokeWidth={1} dot={{ r: 1.5 }} />
                <Line type="monotone" dataKey="avg" stroke="var(--accent)" strokeWidth={2.2} dot={false} connectNulls />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      <div className="section-head"><h2>Measurements</h2></div>
      <div className="card">
        <div className="chips" style={{ marginBottom: 10 }}>
          {MEASUREMENT_FIELDS.map(([k, label]) => (
            <button key={k} className={`chip ${tape === k ? 'active' : ''}`} onClick={() => setTape(k)}>{label}</button>
          ))}
        </div>
        {tapeSeries.length < 2 ? <Empty>No {tapeLabel.toLowerCase()} history yet.</Empty> : (
          <div className="chart-box short">
            <ResponsiveContainer>
              <LineChart data={tapeSeries} margin={{ left: -8, right: 10, top: 6 }}>
                <CartesianGrid vertical={false} />
                <XAxis dataKey="date" tickLine={false} axisLine={false} minTickGap={30}
                  tickFormatter={(d: string) => d.slice(5)} />
                <YAxis domain={['auto', 'auto']} tickLine={false} axisLine={false} width={44} />
                <Tooltip
                  content={({ active, payload, label }) =>
                    active && payload?.length ? (
                      <div className="tooltip">
                        <div className="k">{label}</div>
                        <div>{tapeLabel} {payload[0].value} {units.length}</div>
                      </div>
                    ) : null}
                />
                <Line type="monotone" dataKey="v" stroke="var(--accent)" strokeWidth={2} dot={{ r: 2.5 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      <div className="section-head"><h2>Entries</h2></div>
      {measurements.length === 0 && <Empty>Nothing logged yet.</Empty>}
      {measurements.map((m) => (
        <div className="row" key={m.id}>
          <div className="grow">
            <div className="title">{m.date}</div>
            <div className="meta">
              {MEASUREMENT_FIELDS.filter(([k]) => m[k] != null)
                .map(([k, label]) => `${label} ${trim(cmTo(m[k]!, units.length), 1)}`)
                .join(' · ') || 'Weight only'}
            </div>
          </div>
          <span className="mono" style={{ fontSize: 14 }}>
            {m.weightKg != null ? `${trim(kgTo(m.weightKg, units.weight), 1)} ${units.weight}` : '—'}
          </span>
          <button className="btn ghost sm" onClick={() => setEditing(m)}>Edit</button>
          <ConfirmButton
            armed={armedId === m.id}
            setArmed={(v) => setArmedId(v ? m.id : null)}
            onConfirm={() => void db.deleteMeasurement(m.id).then(refreshMeasurements)}
          >
            ✕
          </ConfirmButton>
        </div>
      ))}

      {editing && session && (
        <MeasurementForm
          existing={editing === 'new' ? undefined : editing}
          userId={session.user.id}
          onClose={() => setEditing(null)}
          onSaved={async () => { await refreshMeasurements(); setEditing(null); }}
        />
      )}
    </div>
  );
}

function MeasurementForm({
  existing, userId, onClose, onSaved,
}: {
  existing?: BodyMeasurement;
  userId: string;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const { units } = useStore();
  const [date, setDate] = useState(existing?.date ?? today());
  const [weight, setWeight] = useState(
    existing?.weightKg != null ? trim(kgTo(existing.weightKg, units.weight), 2) : '');
  // Tape fields are held as display-unit strings and converted once, on save.
  const [tape, setTape] = useState<Record<string, string>>(() =>
    Object.fromEntries(MEASUREMENT_FIELDS.map(([k]) => [
      k, existing?.[k] != null ? trim(cmTo(existing[k]!, units.length), 2) : '',
    ])));
  const [notes, setNotes] = useState(existing?.notes ?? '');
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function save() {
    setBusy(true);
    try {
      await db.saveMeasurement({
        date,
        weightKg: weight === '' ? null : toKg(Number(weight), units.weight),
        ...Object.fromEntries(MEASUREMENT_FIELDS.map(([k]) => [
          k, tape[k] === '' ? null : toCm(Number(tape[k]), units.length),
        ])),
        notes: notes || null,
      }, userId);
      await onSaved();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      title={existing ? 'Edit entry' : 'Log entry'}
      onClose={onClose}
      wide
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
          <Field label={`Weight (${units.weight})`}>
            <input autoFocus inputMode="decimal" value={weight} onChange={(e) => setWeight(e.target.value)} placeholder="78.4" />
          </Field>
        </div>

        <div className="faint" style={{ fontSize: 12, marginTop: 4 }}>
          Tape measurements ({units.length}) — leave blank to skip.
        </div>
        <div className="form-grid">
          {MEASUREMENT_FIELDS.map(([k, label]) => (
            <Field key={k} label={label}>
              <input
                inputMode="decimal"
                value={tape[k]}
                onChange={(e) => setTape({ ...tape, [k]: e.target.value })}
              />
            </Field>
          ))}
        </div>

        <Field label="Notes"><input value={notes} onChange={(e) => setNotes(e.target.value)} /></Field>
      </div>
    </Modal>
  );
}
