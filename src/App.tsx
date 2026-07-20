import { NavLink, Navigate, Route, Routes } from 'react-router-dom';
import { StoreProvider, useStore } from './state/store';
import { isConfigured } from './lib/supabase';
import { Auth } from './pages/Auth';
import { Dashboard } from './pages/Dashboard';
import { History } from './pages/History';
import { WorkoutDetail } from './pages/WorkoutDetail';
import { LiveWorkout } from './pages/LiveWorkout';
import { Routines } from './pages/Routines';
import { RoutineEditor } from './pages/RoutineEditor';
import { ExerciseLibrary } from './pages/ExerciseLibrary';
import { ExerciseDetail } from './pages/ExerciseDetail';
import { Cardio } from './pages/Cardio';
import { Body } from './pages/Body';
import { Settings } from './pages/Settings';

interface NavItem { to: string; icon: string; label: string; end?: boolean }

// `end` matters only for '/', which would otherwise match every route.
const NAV: NavItem[] = [
  { to: '/',        icon: '◎', label: 'Home', end: true },
  { to: '/workout', icon: '⚡', label: 'Workout' },
  { to: '/history', icon: '≡', label: 'History' },
  { to: '/cardio',  icon: '⇢', label: 'Cardio' },
  { to: '/body',    icon: '◭', label: 'Body' },
];

// The sidebar shows everything; the phone tab bar shows five, because a sixth
// tab makes each one too narrow to hit reliably mid-workout.
const SIDEBAR_EXTRA: NavItem[] = [
  { to: '/routines',  icon: '▤', label: 'Routines' },
  { to: '/exercises', icon: '☰', label: 'Exercises' },
  { to: '/settings',  icon: '⚙', label: 'Settings' },
];

function Shell() {
  const { session, signOut } = useStore();

  return (
    <div className="shell">
      <nav className="sidebar">
        <div className="brand"><span className="dot" /> Iron Log</div>
        {[...NAV, ...SIDEBAR_EXTRA].map((n) => (
          <NavLink key={n.to} to={n.to} end={n.end} className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
            <span className="ico">{n.icon}</span> {n.label}
          </NavLink>
        ))}
        <div className="sidebar-foot">
          <div className="email">{session?.user.email}</div>
          <button className="btn ghost sm" onClick={signOut}>Sign out</button>
        </div>
      </nav>

      <main className="main">
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/workout" element={<LiveWorkout />} />
          <Route path="/history" element={<History />} />
          <Route path="/history/:id" element={<WorkoutDetail />} />
          <Route path="/routines" element={<Routines />} />
          <Route path="/routines/new" element={<RoutineEditor />} />
          <Route path="/routines/:id" element={<RoutineEditor />} />
          <Route path="/exercises" element={<ExerciseLibrary />} />
          <Route path="/exercises/:id" element={<ExerciseDetail />} />
          <Route path="/cardio" element={<Cardio />} />
          <Route path="/body" element={<Body />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>

      <nav className="tabbar">
        {NAV.map((n) => (
          <NavLink key={n.to} to={n.to} end={n.end} className={({ isActive }) => (isActive ? 'active' : '')}>
            <span className="ico">{n.icon}</span> {n.label}
          </NavLink>
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
