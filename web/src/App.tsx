import { Link, NavLink, Navigate, Route, Routes } from 'react-router-dom';
import { useAuth } from './lib/auth';
import { isConfigured } from './lib/supabase';
import Login from './pages/Login';
import Events from './pages/Events';
import EventPage from './pages/EventPage';
import Admin from './pages/Admin';

export default function App() {
  const { session, profile, loading, signOut } = useAuth();

  if (!isConfigured) {
    return (
      <main className="container narrow">
        <h1>Falta configurar Supabase</h1>
        <p>
          Copiá <code>web/.env.example</code> a <code>web/.env</code> y completá <code>VITE_SUPABASE_URL</code> y{' '}
          <code>VITE_SUPABASE_ANON_KEY</code>.
        </p>
      </main>
    );
  }
  if (loading) return <div className="center muted">Cargando…</div>;
  if (!session) {
    return (
      <Routes>
        <Route path="*" element={<Login />} />
      </Routes>
    );
  }

  return (
    <>
      <header className="topbar">
        <div className="container topbar-inner">
          <Link to="/" className="brand">
            <span aria-hidden>🎲</span> Math Trade
          </Link>
          <nav className="nav">
            <NavLink to="/" end>
              Eventos
            </NavLink>
            {profile?.is_admin && <NavLink to="/admin">Administrar</NavLink>}
          </nav>
          <div className="user">
            <span className="muted">{profile?.display_name}</span>
            <button className="btn ghost small" onClick={() => void signOut()}>
              Salir
            </button>
          </div>
        </div>
      </header>
      <main className="container">
        <Routes>
          <Route path="/" element={<Events />} />
          <Route path="/events/:id" element={<EventPage />} />
          <Route path="/admin" element={profile?.is_admin ? <Admin /> : <Navigate to="/" replace />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
    </>
  );
}
