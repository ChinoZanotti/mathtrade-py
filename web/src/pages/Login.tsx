import { useState, type FormEvent } from 'react';
import { authErrorInUrl, supabase } from '../lib/supabase';

type Mode = 'login' | 'signup' | 'forgot';

export default function Login() {
  const [mode, setMode] = useState<Mode>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  // Si se llegó desde un link de email vencido o ya usado, avisarlo de entrada.
  const [error, setError] = useState<string | null>(
    authErrorInUrl === 'otp_expired' ? 'El link venció o ya fue usado. Pedí uno nuevo.' : authErrorInUrl ? 'No se pudo validar el link del email.' : null,
  );
  const [info, setInfo] = useState<string | null>(null);

  function changeMode(m: Mode) {
    setMode(m);
    setError(null);
    setInfo(null);
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setInfo(null);
    try {
      if (mode === 'login') {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      } else if (mode === 'forgot') {
        // El link del email vuelve al mismo sitio (localhost o Render), que detecta type=recovery.
        const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: window.location.origin });
        if (error) throw error;
        // Mismo mensaje exista o no la cuenta, para no revelar qué emails están registrados.
        setInfo('Si hay una cuenta con ese email, te enviamos un link para crear una contraseña nueva. Revisá tu bandeja de entrada (y spam).');
      } else {
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          // El link de confirmación vuelve al mismo sitio (localhost o Render).
          options: { data: { display_name: name.trim() }, emailRedirectTo: window.location.origin },
        });
        if (error) throw error;
        if (!data.session) setInfo('Te enviamos un email para confirmar tu cuenta. Después podés iniciar sesión.');
      }
    } catch (err) {
      setError(translateAuthError(err instanceof Error ? err.message : String(err)));
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="login-wrap">
      <form className="card login-card" onSubmit={submit}>
        <h1 className="login-title">
          <img src="/brand/logo-stacked.svg" alt="Math Trade PY" width={260} height={156} />
        </h1>
        <p className="muted">Intercambiá juegos de mesa con la comunidad, en ciclos que benefician a todos.</p>

        {mode === 'forgot' ? (
          <>
            <h2>Recuperar contraseña</h2>
            <p className="muted">Ingresá tu email y te mandamos un link para crear una contraseña nueva.</p>
          </>
        ) : (
          <div className="tabs" role="tablist">
            <button type="button" role="tab" aria-selected={mode === 'login'} className={mode === 'login' ? 'on' : ''} onClick={() => changeMode('login')}>
              Ingresar
            </button>
            <button type="button" role="tab" aria-selected={mode === 'signup'} className={mode === 'signup' ? 'on' : ''} onClick={() => changeMode('signup')}>
              Crear cuenta
            </button>
          </div>
        )}

        {mode === 'signup' && (
          <label className="field">
            <span>Nombre o apodo (visible para los demás)</span>
            <input value={name} onChange={(e) => setName(e.target.value)} required minLength={2} maxLength={60} autoComplete="nickname" />
          </label>
        )}
        <label className="field">
          <span>Email</span>
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" />
        </label>
        {mode !== 'forgot' && (
          <label className="field">
            <span>Contraseña</span>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={8}
              autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
            />
          </label>
        )}

        {error && <p className="alert error">{error}</p>}
        {info && <p className="alert ok">{info}</p>}
        <button className="btn primary block" disabled={busy}>
          {busy ? 'Un momento…' : mode === 'login' ? 'Ingresar' : mode === 'signup' ? 'Crear cuenta' : 'Enviar link'}
        </button>

        {mode === 'login' && (
          <p className="login-links">
            <button type="button" className="link-btn" onClick={() => changeMode('forgot')}>
              ¿Olvidaste tu contraseña?
            </button>
          </p>
        )}
        {mode === 'forgot' && (
          <p className="login-links">
            <button type="button" className="link-btn" onClick={() => changeMode('login')}>
              Volver a ingresar
            </button>
          </p>
        )}
      </form>
    </main>
  );
}

function translateAuthError(msg: string): string {
  if (/invalid login credentials/i.test(msg)) return 'Email o contraseña incorrectos.';
  if (/already registered/i.test(msg)) return 'Ya existe una cuenta con ese email.';
  if (/at least 8|weak/i.test(msg)) return 'La contraseña debe tener al menos 8 caracteres.';
  if (/email not confirmed/i.test(msg)) return 'Todavía no confirmaste tu email. Revisá tu bandeja de entrada.';
  if (/rate limit|security purposes/i.test(msg)) return 'Demasiados intentos. Esperá unos minutos y probá de nuevo.';
  return msg;
}
