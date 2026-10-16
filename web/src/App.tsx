import { Link, NavLink, Navigate, Route, Routes } from 'react-router-dom';
import { useAuth } from './lib/auth';
import { isConfigured } from './lib/supabase';
import Login from './pages/Login';
import ResetPassword from './pages/ResetPassword';
import Events from './pages/Events';
import EventPage from './pages/EventPage';
import Admin from './pages/Admin';
import AdminTrades from './pages/AdminTrades';
import PoweredByBgg from './components/PoweredByBgg';

export default function App() {
  const { session, profile, loading, recovering, signOut } = useAuth();

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
  // Entró con el link de recuperación: primero tiene que elegir la contraseña nueva.
  if (session && recovering) return <ResetPassword />;
  if (!session) {
    return (
      <Routes>
        <Route path="*" element={<Login />} />
      </Routes>
    );
  }

  return (
    <div className="app">
      <header className="topbar">
        <div className="container topbar-inner">
          <Link to="/" className="brand">
            <img src="/brand/logo-horizontal.svg" alt="Math Trade PY" className="brand-logo" width={146} height={40} />
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
      <main className="container app-main">
        <Routes>
          <Route path="/" element={<Events />} />
          <Route path="/events/:id" element={<EventPage />} />
          <Route path="/admin" element={profile?.is_admin ? <Admin /> : <Navigate to="/" replace />} />
          <Route path="/admin/events/:id/intercambios" element={profile?.is_admin ? <AdminTrades /> : <Navigate to="/" replace />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
      <footer className="footer">
        <div className="container footer-inner small muted">
          <span>Los datos de los juegos provienen de <a href="https://boardgamegeek.com/" target="_blank" rel="noopener noreferrer">BoardGameGeek</a>.</span>
          <PoweredByBgg />
        </div>
      </footer>
    </div>
  );
}
