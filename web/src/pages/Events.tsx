import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/auth';
import { friendlyError } from '../lib/errors';
import { formatDate, stageDeadline, stageGuide, statusLabel } from '../lib/format';
import type { TradeEvent } from '../lib/types';

export default function Events() {
  const { session } = useAuth();
  const userId = session!.user.id;
  const [events, setEvents] = useState<TradeEvent[] | null>(null);
  const [joined, setJoined] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    const [ev, mine] = await Promise.all([
      supabase.from('events').select('*').order('listing_starts_at', { ascending: false }),
      supabase.from('event_participants').select('event_id').eq('user_id', userId),
    ]);
    if (ev.error || mine.error) return setError(friendlyError(ev.error ?? mine.error, 'No pudimos cargar los eventos.'));
    setEvents(ev.data as TradeEvent[]);
    setJoined(new Set((mine.data ?? []).map((r) => r.event_id as string)));
  }, [userId]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <>
      <h1>Eventos</h1>
      {error && (
        <div className="alert error" role="alert">
          <p className="alert-text">{error}</p>
          <button className="btn small" onClick={() => void load()}>
            Reintentar
          </button>
        </div>
      )}
      {!events && !error && (
        <div className="grid" aria-busy="true">
          <span className="sr-only" role="status">
            Cargando eventos…
          </span>
          {[0, 1].map((i) => (
            <div key={i} className="card" aria-hidden>
              <span className="sk sk-pill" />
              <div className="sk sk-line" style={{ width: '70%', height: 26, marginTop: 16 }} />
              <div className="sk sk-line" />
              <div className="sk sk-line short" />
            </div>
          ))}
        </div>
      )}
      {events && events.length === 0 && <p className="muted">Todavía no hay eventos. Cuando se publique uno, vas a poder inscribirte acá.</p>}
      {events && (
        <div className="grid">
          {events.map((e) => {
            const dl = stageDeadline(e);
            const isJoined = joined.has(e.id);
            const guide = stageGuide(e.status, isJoined);
            return (
              <Link key={e.id} to={`/events/${e.id}`} className="card event-card">
                <div className="row between">
                  <span className={`pill status-${e.status}`}>{statusLabel(e.status)}</span>
                  {isJoined && <span className="pill ok">Inscripto</span>}
                </div>
                <h2>{e.title}</h2>
                {e.description && <p className="muted clamp">{e.description}</p>}
                {dl && (
                  <p className="small">
                    {dl.label}: <strong>{formatDate(dl.date)}</strong>
                  </p>
                )}
                {guide.cta ? <p className="event-cta">{guide.cta} →</p> : <p className="small muted">{guide.now}</p>}
              </Link>
            );
          })}
        </div>
      )}
    </>
  );
}
