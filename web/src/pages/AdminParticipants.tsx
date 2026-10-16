import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { formatDate, statusLabel } from '../lib/format';
import type { ParticipantSummary, TradeEvent } from '../lib/types';

type Filter = 'all' | 'without' | 'with';

const FILTERS: { value: Filter; label: string }[] = [
  { value: 'all', label: 'Todos' },
  { value: 'without', label: 'Sin juegos' },
  { value: 'with', label: 'Con juegos' },
];

const norm = (s: string) => s.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();

export default function AdminParticipants() {
  const { id } = useParams();
  const [event, setEvent] = useState<TradeEvent | null>(null);
  const [rows, setRows] = useState<ParticipantSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const [ev, ps] = await Promise.all([
      supabase.from('events').select('*').eq('id', id!).maybeSingle(),
      supabase.rpc('admin_event_participants', { p_event: id! }),
    ]);
    setLoading(false);
    if (ev.error || !ev.data) return setError('No encontramos el evento.');
    if (ps.error) return setError(ps.error.message);
    setError(null);
    setEvent(ev.data as TradeEvent);
    setRows((ps.data as ParticipantSummary[]).map((r) => ({ ...r, items: Number(r.items) })));
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  // Primero quienes no cargaron juegos, después por nombre.
  const sorted = useMemo(
    () =>
      [...(rows ?? [])].sort(
        (a, b) => Number(a.items > 0) - Number(b.items > 0) || a.display_name.localeCompare(b.display_name, 'es'),
      ),
    [rows],
  );

  const visible = useMemo(() => {
    const q = norm(query.trim());
    return sorted.filter((r) => {
      if ((filter === 'without' && r.items > 0) || (filter === 'with' && r.items === 0)) return false;
      return !q || norm(`${r.display_name} ${r.email}`).includes(q);
    });
  }, [sorted, query, filter]);

  async function copyMissing() {
    const emails = sorted.filter((r) => r.items === 0).map((r) => r.email);
    try {
      await navigator.clipboard.writeText(emails.join(', '));
      setNotice(`Copiados ${emails.length} ${emails.length === 1 ? 'email' : 'emails'}.`);
    } catch {
      setError('No se pudo copiar al portapapeles.');
    }
  }

  if (error && !rows) return <p className="alert error">{error}</p>;
  if (!event || !rows) return <p className="muted">Cargando…</p>;

  const total = rows.length;
  const loaded = rows.filter((r) => r.items > 0).length;
  const games = rows.reduce((s, r) => s + r.items, 0);

  return (
    <>
      <p className="small">
        <Link to="/admin">← Administrar</Link>
      </p>
      <h1>Participantes</h1>
      <div className="row gap">
        <Link to={`/events/${event.id}`}>{event.title}</Link>
        <span className={`pill status-${event.status}`}>{statusLabel(event.status)}</span>
      </div>
      {error && <p className="alert error">{error}</p>}
      {notice && <p className="alert ok">{notice}</p>}

      <div className="stats">
        <div className="card stat">
          <span className="stat-num">{total}</span>
          <span className="small muted">Inscriptos</span>
        </div>
        <div className="card stat">
          <span className="stat-num">
            {loaded}
            <span className="stat-of"> de {total}</span>
          </span>
          <span className="small muted">Ya cargaron juegos</span>
        </div>
        <div className="card stat">
          <span className="stat-num">{games}</span>
          <span className="small muted">Juegos cargados</span>
        </div>
      </div>

      <div className="toolbar">
        <input
          className="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Buscar por nombre o email…"
          aria-label="Buscar participantes"
        />
        <button className="btn ghost small" disabled={loading} onClick={() => void load()}>
          Actualizar
        </button>
        <button className="btn small" disabled={total === loaded} onClick={() => void copyMissing()}>
          Copiar emails de quienes no cargaron
        </button>
      </div>
      <div className="chips-row">
        {FILTERS.map((f) => (
          <button key={f.value} className={`chip ${filter === f.value ? 'on' : ''}`} onClick={() => setFilter(f.value)}>
            {f.label}
          </button>
        ))}
      </div>

      {visible.length === 0 && <p className="muted">{total === 0 ? 'Todavía no hay inscriptos.' : 'No hay participantes que coincidan.'}</p>}
      <div className="stack">
        {visible.map((r) => (
          <div key={r.user_id} className="card row between participant">
            <div>
              <strong>{r.display_name}</strong>
              <p className="small muted">
                <a href={`mailto:${r.email}`}>{r.email}</a> · inscripto el {formatDate(r.joined_at)}
              </p>
            </div>
            <span className={`pill ${r.items > 0 ? 'ok' : ''}`}>
              {r.items === 0 ? 'Sin juegos' : `${r.items} ${r.items === 1 ? 'juego' : 'juegos'}`}
            </span>
          </div>
        ))}
      </div>
    </>
  );
}
