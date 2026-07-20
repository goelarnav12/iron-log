import { useState } from 'react';
import { useStore } from '../state/store';
import { Field } from '../components/ui';
import { totals } from '../lib/stats';

const REST_KEY = 'ht.restSeconds';

export function Settings() {
  const { units, setUnits, session, signOut, workouts, exercises, cardio, measurements } = useStore();
  const [rest, setRest] = useState(() => Number(localStorage.getItem(REST_KEY) ?? 90));

  function saveRest(v: number) {
    const clamped = Math.min(600, Math.max(10, Math.round(v)));
    setRest(clamped);
    localStorage.setItem(REST_KEY, String(clamped));
  }

  const t = totals(workouts);

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Settings</h1>
          <div className="sub">{session?.user.email}</div>
        </div>
      </div>

      <div className="card">
        <h3 style={{ marginBottom: 4 }}>Units</h3>
        <p className="faint" style={{ fontSize: 13, marginTop: 0, marginBottom: 14 }}>
          Display only. Everything is stored in kg, cm and metres, so switching
          back and forth never changes a logged number.
        </p>
        <div className="form-grid">
          <Field label="Weight">
            <select value={units.weight} onChange={(e) => setUnits({ weight: e.target.value as 'kg' | 'lb' })}>
              <option value="kg">Kilograms (kg)</option>
              <option value="lb">Pounds (lb)</option>
            </select>
          </Field>
          <Field label="Length">
            <select value={units.length} onChange={(e) => setUnits({ length: e.target.value as 'cm' | 'in' })}>
              <option value="cm">Centimetres (cm)</option>
              <option value="in">Inches (in)</option>
            </select>
          </Field>
          <Field label="Distance">
            <select value={units.distance} onChange={(e) => setUnits({ distance: e.target.value as 'km' | 'mi' })}>
              <option value="km">Kilometres (km)</option>
              <option value="mi">Miles (mi)</option>
            </select>
          </Field>
        </div>
      </div>

      <div className="card">
        <h3 style={{ marginBottom: 4 }}>Rest timer</h3>
        <p className="faint" style={{ fontSize: 13, marginTop: 0, marginBottom: 14 }}>
          Starts automatically when you tick a set.
        </p>
        <Field label="Default rest (seconds)">
          <input
            type="number" min={10} max={600} step={5} value={rest}
            onChange={(e) => saveRest(Number(e.target.value))}
            style={{ maxWidth: 160 }}
          />
        </Field>
      </div>

      <div className="card">
        <h3 style={{ marginBottom: 10 }}>Your data</h3>
        <div className="faint mono" style={{ fontSize: 13, lineHeight: 1.9 }}>
          <div>{t.workouts} workouts · {t.sets} sets · {t.reps} reps</div>
          <div>{exercises.length} exercises in library</div>
          <div>{cardio.length} cardio sessions</div>
          <div>{measurements.length} body entries</div>
        </div>
      </div>

      <div className="card">
        <button className="btn danger" onClick={() => void signOut()}>Sign out</button>
      </div>
    </div>
  );
}
