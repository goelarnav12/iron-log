// The sync password screen. No email and no account: one log per Worker, and
// the first password set claims it. The password never leaves the browser —
// auth.ts stretches it into the token that is actually sent.

import { useEffect, useState } from 'react';
import { BackendError, getSalt, login, signup } from '../lib/backend';
import { useStore } from '../state/store';
import { Field } from '../components/ui';

type Mode = 'loading' | 'signup' | 'login';

export function Auth() {
  const { markSignedIn } = useStore();
  const [mode, setMode] = useState<Mode>('loading');
  const [password, setPassword] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    // Whether a log exists decides "create" vs "sign in". A network failure
    // here is non-fatal: default to sign in, and the button surfaces any real
    // error.
    void getSalt()
      .then((info) => setMode(info ? 'login' : 'signup'))
      .catch(() => setMode('login'));
  }, []);

  async function submit() {
    setBusy(true); setErr(null);
    try {
      if (mode === 'signup') await signup(password);
      else await login(password);
      setPassword('');
      markSignedIn();
    } catch (e) {
      setErr(e instanceof BackendError && e.status === 401
        ? 'Wrong sync password.'
        : e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  const creating = mode === 'signup';

  return (
    <div className="auth-wrap">
      <div className="auth-card">
        <div className="brand"><span className="dot" /> Iron Log</div>
        <div className="card">
          <h3>{creating ? 'Set a sync password' : 'Sign in'}</h3>
          <p className="muted" style={{ fontSize: 13.5, marginTop: 4, marginBottom: 18 }}>
            {creating
              ? 'This creates your log. Use the same password on every device.'
              : 'Enter your sync password to open your training log on this device.'}
          </p>

          {err && <div className="error-note">{err}</div>}

          <form
            onSubmit={(e) => { e.preventDefault(); if (password.length >= 8) void submit(); }}
            style={{ display: 'grid', gap: 12 }}
          >
            <Field label="Sync password">
              <input
                type="password"
                autoComplete={creating ? 'new-password' : 'current-password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="At least 8 characters"
              />
            </Field>
            <button
              className="btn primary"
              style={{ marginTop: 4 }}
              disabled={busy || mode === 'loading' || password.length < 8}
            >
              {creating ? 'Create log' : 'Sign in'}
            </button>
          </form>
          {creating && (
            <p className="faint" style={{ fontSize: 12.5, marginTop: 12, marginBottom: 0 }}>
              There&apos;s no email and no reset link, so keep it in your password manager.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
