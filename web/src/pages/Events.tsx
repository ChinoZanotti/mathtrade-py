import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/auth';
import { formatDate, stageDeadline, statusLabel } from '../lib/format';
import type { TradeEvent } from '../lib/types';

export default function Events() {
  const { session } = useAuth();
  const [events, setEvents] = useState<TradeEvent[] | null>(null);
  const [joined, setJoined] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      const [ev, mine] = await Promise.all([
        supabase.from('events').select('*').order('listing_starts_at', { ascending: false }),
        supabase.from('event_participants').select('event_id').eq('user_id', session!.user.id),
      ]);
      if (ev.error) return setError(ev.error.message);
      setEvents(ev.data as TradeEvent[]);
      setJoined(new Set((mine.data ?? []).map((r) => r.event_id as string)));
    })();
  }, [session]);

  if (error) return <p className="alert error">{error}</p>;
  if (!events) return <p className="muted">Cargando eventos…</p>;

  return (
    <>
      <h1>Eventos</h1>
      {events.length === 0 && <p className="muted">Todavía no hay eventos. Cuando se publique uno, vas a poder inscribirte acá.</p>}
      <div className="grid">
        {events.map((e) => {
          const dl = stageDeadline(e);
          return (
            <Link key={e.id} to={`/events/${e.id}`} className="card event-card">
              <div className="row between">
                <span className={`pill status-${e.status}`}>{statusLabel(e.status)}</span>
                {joined.has(e.id) && <span className="pill ok">Inscripto</span>}
              </div>
              <h2>{e.title}</h2>
              {e.description && <p className="muted clamp">{e.description}</p>}
              {dl && (
                <p className="small">
                  {dl.label}: <strong>{formatDate(dl.date)}</strong>
                </p>
              )}
            </Link>
          );
        })}
      </div>
    </>
  );
}
