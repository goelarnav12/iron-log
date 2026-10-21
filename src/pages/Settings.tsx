import { useState } from 'react';
import { useStore } from '../state/store';
import { Field } from '../components/ui';
import { SyncIndicator } from '../components/SyncIndicator';
import { Icon } from '../components/Icon';
import { THEMES, loadTheme, saveTheme, type ThemeId } from '../theme';
import { totals } from '../lib/stats';

const REST_KEY = 'ht.restSeconds';
/** Read by Today's "this week" tile. */
const TARGET_KEY = 'ht.weeklyTarget';

export function Settings() {
  const { units, setUnits, session, signOut, workouts, exercises, cardio, measurements } = useStore();
  const [rest, setRest] = useState(() => Number(localStorage.getItem(REST_KEY) ?? 90));
  const [theme, setTheme] = useState<ThemeId>(loadTheme);
  const [target, setTarget] = useState(() => Number(localStorage.getItem(TARGET_KEY) ?? 3) || 3);

  function saveRest(v: number) {
    const clamped = Math.min(600, Math.max(10, Math.round(v)));
    setRest(clamped);
    localStorage.setItem(REST_KEY, String(clamped));
  }

  function saveTarget(v: number) {
    const clamped = Math.min(14, Math.max(1, Math.round(v)));
    setTarget(clamped);
    localStorage.setItem(TARGET_KEY, String(clamped));
  }

  const t = totals(workouts);

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>You</h1>
          <div className="sub">{session?.user.email}</div>
        </div>
        <SyncIndicator />
      </div>

      <div className="card">
        <h3 style={{ marginBottom: 4 }}>Theme</h3>
        <p className="faint" style={{ fontSize: 13, marginTop: 0, marginBottom: 14 }}>
          Colours only. Saved on this device.
        </p>
        <div className="theme-grid">
          {THEMES.map((t) => (
            // Each option carries its own data-theme, so it previews itself
            // in its own colours whatever the app is currently wearing.
            <button
              key={t.id}
              data-theme={t.id}
              className={`theme-opt ${theme === t.id ? 'on' : ''}`}
              aria-pressed={theme === t.id}
              onClick={() => { setTheme(t.id); saveTheme(t.id); }}
            >
              <span className="sw" />
              <span className="txt">
                <span className="name">{t.label}</span>
                <span className="hint">{t.hint}</span>
              </span>
              {theme === t.id && <Icon name="check" size={20} />}
            </button>
          ))}
        </div>
      </div>

      <div className="card">
        <h3 style={{ marginBottom: 4 }}>Weekly target</h3>
        <p className="faint" style={{ fontSize: 13, marginTop: 0, marginBottom: 14 }}>
          How many workouts a week you're aiming for. Today counts you against it.
        </p>
        <div className="chips">
          {[2, 3, 4, 5, 6].map((n) => (
            <button key={n} className={`chip quick ${target === n ? 'active' : ''}`} onClick={() => saveTarget(n)}>
              {n}
            </button>
          ))}
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
