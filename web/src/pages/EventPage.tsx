import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/auth';
import { STAGES, formatDate, stageDeadline } from '../lib/format';
import type { TradeEvent } from '../lib/types';
import ListingStage from './ListingStage';
import WantingStage from './WantingStage';
import ResultsStage from './ResultsStage';

export default function EventPage() {
  const { id } = useParams();
  const { session } = useAuth();
  const userId = session!.user.id;
  const [event, setEvent] = useState<TradeEvent | null>(null);
  const [joined, setJoined] = useState(false);
  const [count, setCount] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const [ev, mine, total] = await Promise.all([
      supabase.from('events').select('*').eq('id', id!).maybeSingle(),
      supabase.from('event_participants').select('user_id').eq('event_id', id!).eq('user_id', userId).maybeSingle(),
      supabase.from('event_participants').select('user_id', { count: 'exact', head: true }).eq('event_id', id!),
    ]);
    if (ev.error || !ev.data) return setError('No encontramos el evento.');
    setEvent(ev.data as TradeEvent);
    setJoined(Boolean(mine.data));
    setCount(total.count ?? 0);
  }, [id, userId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function join() {
    setBusy(true);
    const { error } = await supabase.from('event_participants').insert({ event_id: id!, user_id: userId });
    setBusy(false);
    if (error) return setError(error.message);
    await load();
  }

  async function leave() {
    if (!confirm('¿Seguro que querés bajarte del evento? Se borrarán los juegos que cargaste.')) return;
    setBusy(true);
    const { error } = await supabase.from('event_participants').delete().eq('event_id', id!).eq('user_id', userId);
    setBusy(false);
    if (error) return setError(error.message);
    await load();
  }

  if (error) return <p className="alert error">{error}</p>;
  if (!event) return <p className="muted">Cargando…</p>;

  const dl = stageDeadline(event);
  const stageIdx = STAGES.findIndex((s) => s.status === event.status);
  const canJoin = event.status === 'upcoming' || event.status === 'listing';

  return (
    <>
      <p className="small">
        <Link to="/">← Eventos</Link>
      </p>
      <h1>{event.title}</h1>
      {event.description && <p className="muted pre">{event.description}</p>}

      <ol className="stepper" aria-label="Etapas del evento">
        {STAGES.filter((s) => s.status !== 'processing').map((s) => {
          const idx = STAGES.findIndex((x) => x.status === s.status);
          const state = idx < stageIdx ? 'done' : idx === stageIdx ? 'now' : 'todo';
          return (
            <li key={s.status} className={`${state} stage-${s.status}`}>
              <span className="dot" />
              <span>{s.label}</span>
            </li>
          );
        })}
      </ol>
      <p className="small muted">
        {count} {count === 1 ? 'participante' : 'participantes'}
        {dl && (
          <>
            {' · '}
            {dl.label}: <strong>{formatDate(dl.date)}</strong>
          </>
        )}
      </p>

      {!joined && canJoin && (
        <div className="card callout">
          <h2>Participá en este evento</h2>
          <p className="muted">Al inscribirte vas a recibir un email cuando empiece cada etapa.</p>
          <button className="btn primary" disabled={busy} onClick={() => void join()}>
            Inscribirme
          </button>
        </div>
      )}
      {!joined && !canJoin && <p className="alert">Este evento ya no admite inscripciones y no participaste en él.</p>}

      {joined && (
        <>
          {event.status === 'upcoming' && (
            <div className="card callout">
              <h2>Estás inscripto 🎉</h2>
              <p className="muted">
                Está previsto que el evento empiece el <strong>{formatDate(event.listing_starts_at)}</strong>. Te avisaremos por email para que cargues tus juegos.
              </p>
            </div>
          )}
          {event.status === 'listing' && <ListingStage event={event} userId={userId} />}
          {event.status === 'wanting' && <WantingStage event={event} userId={userId} />}
          {event.status === 'processing' && (
            <div className="card callout">
              <h2>Calculando intercambios…</h2>
              <p className="muted">Estamos buscando la combinación que permite la mayor cantidad de cambios. Volvé a revisar en unos minutos.</p>
            </div>
          )}
          {event.status === 'finished' && <ResultsStage event={event} userId={userId} />}

          {(event.status === 'upcoming' || event.status === 'listing') && (
            <p className="small">
              <button className="btn ghost small" disabled={busy} onClick={() => void leave()}>
                Bajarme del evento
              </button>
            </p>
          )}
        </>
      )}
    </>
  );
}
