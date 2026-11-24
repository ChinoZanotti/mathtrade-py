import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/auth';
import { STAGES, formatDate, stageDeadline, stageGuide } from '../lib/format';
import { friendlyError } from '../lib/errors';
import type { TradeEvent } from '../lib/types';
import ListingStage from './ListingStage';
import WantingStage from './WantingStage';
import ResultsStage from './ResultsStage';
import EventDescription from '../components/EventDescription';

export default function EventPage() {
  const { id } = useParams();
  const { session, profile } = useAuth();
  const userId = session!.user.id;
  const [event, setEvent] = useState<TradeEvent | null>(null);
  const [joined, setJoined] = useState(false);
  const [count, setCount] = useState(0);
  // Error al cargar el evento (reemplaza la página) y error de una acción (se muestra sin perder la página).
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoadError(null);
    const [ev, mine, total] = await Promise.all([
      supabase.from('events').select('*').eq('id', id!).maybeSingle(),
      supabase.from('event_participants').select('user_id').eq('event_id', id!).eq('user_id', userId).maybeSingle(),
      supabase.from('event_participants').select('user_id', { count: 'exact', head: true }).eq('event_id', id!),
    ]);
    if (ev.error) return setLoadError(friendlyError(ev.error, 'No pudimos cargar el evento.'));
    if (!ev.data) return setLoadError('No encontramos el evento. Puede que el link esté mal o que lo hayan eliminado.');
    setEvent(ev.data as TradeEvent);
    setJoined(Boolean(mine.data));
    setCount(total.count ?? 0);
  }, [id, userId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function join() {
    setBusy(true);
    setActionError(null);
    const { error } = await supabase.from('event_participants').insert({ event_id: id!, user_id: userId });
    setBusy(false);
    if (error) return setActionError(friendlyError(error, 'No pudimos inscribirte. Probá de nuevo.'));
    await load();
  }

  async function leave() {
    if (!confirm('¿Seguro que querés bajarte del evento? Se borrarán los juegos que cargaste.')) return;
    setBusy(true);
    setActionError(null);
    const { error } = await supabase.from('event_participants').delete().eq('event_id', id!).eq('user_id', userId);
    setBusy(false);
    if (error) return setActionError(friendlyError(error, 'No pudimos darte de baja. Probá de nuevo.'));
    await load();
  }

  if (loadError)
    return (
      <>
        <p className="small">
          <Link to="/">← Eventos</Link>
        </p>
        <div className="alert error" role="alert">
          <p className="alert-text">{loadError}</p>
          <button className="btn small" onClick={() => void load()}>
            Reintentar
          </button>
        </div>
      </>
    );
  if (!event)
    return (
      <p className="muted" role="status">
        Cargando…
      </p>
    );

  const dl = stageDeadline(event);
  const stageIdx = STAGES.findIndex((s) => s.status === event.status);
  const canJoin = event.status === 'upcoming' || event.status === 'listing';
  const guide = stageGuide(event.status, joined);
  const actionAlert = actionError && (
    <p className="alert error" role="alert">
      {actionError}
    </p>
  );

  return (
    <>
      <p className="small">
        <Link to="/">← Eventos</Link>
      </p>
      <h1>{event.title}</h1>

      <ol className="stepper" aria-label="Etapas del evento">
        {STAGES.filter((s) => s.status !== 'processing').map((s) => {
          const idx = STAGES.findIndex((x) => x.status === s.status);
          // Mientras se calcula, "Resultados" figura como la etapa en curso.
          const isNow = idx === stageIdx || (event.status === 'processing' && s.status === 'finished');
          const state = isNow ? 'now' : idx < stageIdx ? 'done' : 'todo';
          return (
            <li key={s.status} className={`${state} stage-${s.status}`} aria-current={isNow ? 'step' : undefined}>
              <span className="dot" aria-hidden />
              <span>{s.label}</span>
              {state !== 'todo' && <span className="sr-only">{isNow ? '(etapa actual)' : '(completada)'}</span>}
            </li>
          );
        })}
      </ol>
      <div className="next-step">
        <p>
          <strong>Ahora:</strong> {guide.now}
        </p>
        {guide.next && (
          <p className="muted">
            <strong>Después:</strong> {guide.next}
          </p>
        )}
      </div>
      <p className="small muted">
        {count} {count === 1 ? 'participante' : 'participantes'}
        {dl && (
          <>
            {' · '}
            {dl.label}: <strong>{formatDate(dl.date)}</strong>
          </>
        )}
      </p>

      {profile?.is_admin && (
        <div className="row gap">
          <Link className="btn ghost small" to={`/admin/events/${event.id}/participantes`}>
            Ver participantes
          </Link>
          {event.status === 'finished' && (
            <Link className="btn small" to={`/admin/events/${event.id}/intercambios`}>
              Ver todos los intercambios y entregas
            </Link>
          )}
        </div>
      )}

      {!joined && canJoin && (
        <div className="card callout">
          <h2>Participá en este evento</h2>
          <p className="muted">
            Primero cargás los juegos que ofrecés (etapa 1) y después elegís qué aceptás a cambio de cada uno (etapa 2). Te avisamos por email cuando
            empiece cada etapa.
          </p>
          {actionAlert}
          <button className="btn primary" disabled={busy} onClick={() => void join()}>
            {busy ? 'Un momento…' : 'Inscribirme'}
          </button>
        </div>
      )}
      {!joined && !canJoin && <p className="alert">Este evento ya no admite inscripciones y no participaste en él.</p>}

      {joined && (
        <>
          {event.status === 'upcoming' && (
            <div className="card callout">
              <h2>
                Estás inscripto <span aria-hidden>🎉</span>
              </h2>
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
              <button className="btn small" onClick={() => void load()}>
                Actualizar
              </button>
            </div>
          )}
          {event.status === 'finished' && <ResultsStage event={event} userId={userId} />}
        </>
      )}

      {/* La descripción va después de la acción principal, para no empujarla fuera de la pantalla en celular. */}
      {event.description && <EventDescription text={event.description} status={event.status} />}

      {joined && (event.status === 'upcoming' || event.status === 'listing') && (
        <div className="leave-event">
          {actionAlert}
          <button className="btn ghost small danger" disabled={busy} onClick={() => void leave()}>
            Bajarme del evento
          </button>
        </div>
      )}
    </>
  );
}
