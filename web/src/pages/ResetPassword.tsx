import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/auth';

// Se muestra al entrar desde el link de "Recuperar contraseña" que llega por email.
// En ese momento el usuario ya tiene una sesión temporal y solo falta guardar la clave nueva.
export default function ResetPassword() {
  const { finishRecovery, signOut } = useAuth();
  const navigate = useNavigate();
  const [password, setPassword] = useState('');
  const [repeat, setRepeat] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (password !== repeat) {
      setError('Las contraseñas no coinciden.');
      return;
    }
    setBusy(true);
    const { error } = await supabase.auth.updateUser({ password });
    setBusy(false);
    if (error) {
      if (/at least 8|weak/i.test(error.message)) setError('La contraseña debe tener al menos 8 caracteres.');
      else if (/different from the old/i.test(error.message)) setError('La contraseña nueva tiene que ser distinta de la anterior.');
      else setError(error.message);
      return;
    }
    finishRecovery();
    navigate('/', { replace: true });
  }

  return (
    <main className="login-wrap">
      <form className="card login-card" onSubmit={submit}>
        <h1 className="login-title">
          <img src="/brand/logo-stacked.svg" alt="Math Trade PY" width={260} height={156} />
        </h1>
        <h2>Nueva contraseña</h2>
        <p className="muted">Elegí una contraseña nueva para tu cuenta.</p>
        <label className="field">
          <span>Contraseña nueva</span>
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={8} autoComplete="new-password" />
        </label>
        <label className="field">
          <span>Repetir contraseña</span>
          <input type="password" value={repeat} onChange={(e) => setRepeat(e.target.value)} required minLength={8} autoComplete="new-password" />
        </label>
        {error && <p className="alert error">{error}</p>}
        <button className="btn primary block" disabled={busy}>
          {busy ? 'Un momento…' : 'Guardar contraseña'}
        </button>
        <p className="login-links">
          <button type="button" className="link-btn" onClick={() => void signOut()}>
            Cancelar
          </button>
        </p>
      </form>
    </main>
  );
}
