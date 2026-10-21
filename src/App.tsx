import { Link, NavLink, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { StoreProvider, useStore } from './state/store';
import { isConfigured } from './lib/supabase';
import { SyncIndicator } from './components/SyncIndicator';
import { Icon } from './components/Icon';
import { SECTIONS, sectionFor } from './nav';
import { Auth } from './pages/Auth';
import { Today } from './pages/Today';
import { Train } from './pages/Train';
import { Trends } from './pages/Trends';
import { History } from './pages/History';
import { WorkoutDetail } from './pages/WorkoutDetail';
import { LiveWorkout } from './pages/LiveWorkout';
import { RoutineEditor } from './pages/RoutineEditor';
import { ExerciseLibrary } from './pages/ExerciseLibrary';
import { ExerciseDetail } from './pages/ExerciseDetail';
import { Cardio } from './pages/Cardio';
import { Body } from './pages/Body';
import { Counters } from './pages/Counters';
import { Settings } from './pages/Settings';

/**
 * Four sections, the same four on every screen size: a tab bar on a phone, a
 * sidebar on desktop. Everything else lives inside a section — see `nav.ts` —
 * so the tab bar never needs a "More" overflow.
 */
function Shell() {
  const { session, signOut } = useStore();
  const { pathname } = useLocation();
  const current = sectionFor(pathname);

  return (
    <div className="shell">
      <nav className="sidebar">
        <Link to="/" className="brand"><span className="dot" /> Iron Log</Link>
        {SECTIONS.map((s) => (
          <div className="nav-group" key={s.id}>
            <Link to={s.to} className={`nav-link ${current === s.id ? 'active' : ''}`}>
              <Icon name={s.icon} /> {s.label}
            </Link>
            {current === s.id && s.pages.map((p) => (
              <NavLink key={p.to} to={p.to} end={p.end} className={({ isActive }) => `nav-sub ${isActive ? 'active' : ''}`}>
                {p.label}
              </NavLink>
            ))}
          </div>
        ))}
        <div className="sidebar-foot">
          <div style={{ marginBottom: 10 }}><SyncIndicator /></div>
          <div className="email">{session?.user.email}</div>
          <button className="btn ghost sm" onClick={signOut}>Sign out</button>
        </div>
      </nav>

      <main className="main">
        <Routes>
          <Route path="/" element={<Today />} />
          <Route path="/daily" element={<Counters />} />
          <Route path="/train" element={<Train />} />
          <Route path="/workout" element={<LiveWorkout />} />
          <Route path="/routines" element={<Navigate to="/train" replace />} />
          <Route path="/routines/new" element={<RoutineEditor />} />
          <Route path="/routines/:id" element={<RoutineEditor />} />
          <Route path="/history" element={<History />} />
          <Route path="/history/:id" element={<WorkoutDetail />} />
          <Route path="/exercises" element={<ExerciseLibrary />} />
          <Route path="/exercises/:id" element={<ExerciseDetail />} />
          <Route path="/body" element={<Body />} />
          <Route path="/cardio" element={<Cardio />} />
          <Route path="/trends" element={<Trends />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>

      <nav className="tabbar">
        {SECTIONS.map((s) => (
          <Link key={s.id} to={s.to} className={current === s.id ? 'active' : ''}>
            <Icon name={s.icon} size={24} /> {s.label}
          </Link>
        ))}
      </nav>
    </div>
  );
}

function Gate() {
  const { session, loading } = useStore();

  if (!isConfigured) {
    return (
      <div className="auth-wrap">
        <div className="auth-card card">
          <h3 style={{ marginBottom: 8 }}>Setup needed</h3>
          <p className="muted" style={{ fontSize: 14 }}>
            Copy <code>.env.example</code> to <code>.env.local</code>, paste in your
            Supabase project URL and publishable key, then restart <code>npm run dev</code>.
            See <code>README.md</code>.
          </p>
        </div>
      </div>
    );
  }
  if (loading) return <div className="auth-wrap"><span className="faint">Loading…</span></div>;
  return session ? <Shell /> : <Auth />;
}

export default function App() {
  return (
    <StoreProvider>
      <Gate />
    </StoreProvider>
  );
}
