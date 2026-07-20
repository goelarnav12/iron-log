import { useState } from 'react';
import { supabase } from '../lib/supabase';
import { Field } from '../components/ui';

export function Auth() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function run(mode: 'in' | 'up') {
    setBusy(true); setErr(null); setNote(null);
    const fn = mode === 'in' ? supabase.auth.signInWithPassword : supabase.auth.signUp;
    const { data, error } = await fn.call(supabase.auth, { email, password });
    setBusy(false);
    if (error) { setErr(error.message); return; }
    // With email confirmation switched on, sign-up returns a user but no
    // session — the app would otherwise sit on this screen with no explanation.
    if (mode === 'up' && !data.session) setNote('Check your email to confirm the account, then sign in.');
  }

  return (
    <div className="auth-wrap">
      <div className="auth-card">
        <div className="brand"><span className="dot" /> Iron Log</div>
        <div className="card">
          <h3>Sign in</h3>
          <p className="muted" style={{ fontSize: 13.5, marginTop: 4, marginBottom: 18 }}>
            Your training log is private to your account.
          </p>

          {err && <div className="error-note">{err}</div>}
          {note && <div className="error-note" style={{ background: 'var(--accent-soft)', borderColor: 'var(--accent)', color: 'var(--accent)' }}>{note}</div>}

          <form
            onSubmit={(e) => { e.preventDefault(); void run('in'); }}
            style={{ display: 'grid', gap: 12 }}
          >
            <Field label="Email">
              <input type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@email.com" />
            </Field>
            <Field label="Password">
              <input type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="At least 6 characters" />
            </Field>
            <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
              <button className="btn primary" style={{ flex: 1 }} disabled={busy}>Log in</button>
              <button type="button" className="btn" onClick={() => void run('up')} disabled={busy}>Sign up</button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
