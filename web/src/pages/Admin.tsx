import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { formatDate, statusLabel } from '../lib/format';
import type { TradeEvent } from '../lib/types';

const NEXT_LABEL: Record<string, string> = {
  upcoming: 'Iniciar etapa 1 ahora',
  listing: 'Cerrar etapa 1 e iniciar etapa 2',
  wanting: 'Cerrar etapa 2 y calcular resultados',
};

function addDays(d: Date, days: number) {
  const x = new Date(d);
  x.setDate(x.getDate() + days);
  return x;
}

export default function Admin() {
  const [events, setEvents] = useState<TradeEvent[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [start, setStart] = useState(() => new Date().toISOString().slice(0, 10));
  const [listingDays, setListingDays] = useState(30);
  const [wantingDays, setWantingDays] = useState(30);

  const load = useCallback(async () => {
    const { data, error } = await supabase.from('events').select('*').order('listing_starts_at', { ascending: false });
    if (error) return setError(error.message);
    setEvents(data as TradeEvent[]);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function create(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const s = new Date(`${start}T00:00:00`);
    const l = addDays(s, listingDays);
    const w = addDays(l, wantingDays);
    const { error } = await supabase.from('events').insert({
      title: title.trim(),
      description: description.trim(),
      listing_starts_at: s.toISOString(),
      listing_ends_at: l.toISOString(),
      wanting_ends_at: w.toISOString(),
    });
    setBusy(false);
    if (error) return setError(error.message);
    setTitle('');
    setDescription('');
    setNotice('Evento creado. Los usuarios ya pueden inscribirse.');
    await load();
  }

  async function advance(ev: TradeEvent) {
    if (!confirm(`${NEXT_LABEL[ev.status]}?\n\nEsto avisa por email a los participantes y no se puede deshacer.`)) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    const { data, error } = await supabase.functions.invoke('advance-events', { body: { event_id: ev.id } });
    setBusy(false);
    if (error) return setError(error.message);
    setNotice(data?.message ?? 'Listo.');
    await load();
  }

  async function downloadInput(ev: TradeEvent) {
    const { data, error } = await supabase.from('event_inputs').select('tm_input').eq('event_id', ev.id).maybeSingle();
    if (error || !data) return setError(error?.message ?? 'No hay archivo para este evento.');
    const blob = new Blob([data.tm_input as string], { type: 'text/plain;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${ev.title.replace(/[^\w-]+/g, '_')}_tm.txt`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  return (
    <>
      <h1>Administrar eventos</h1>
      {error && <p className="alert error">{error}</p>}
      {notice && <p className="alert ok">{notice}</p>}

      <form className="card form" onSubmit={create}>
        <h2>Nuevo evento</h2>
        <label className="field">
          <span>Título</span>
          <input value={title} onChange={(e) => setTitle(e.target.value)} required minLength={3} maxLength={120} placeholder="Math Trade Noviembre 2026" />
        </label>
        <label className="field">
          <span>Descripción / reglas (opcional)</span>
          <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} />
        </label>
        <div className="grid three">
          <label className="field">
            <span>Inicio (etapa 1)</span>
            <input type="date" value={start} onChange={(e) => setStart(e.target.value)} required />
          </label>
          <label className="field">
            <span>Días para cargar juegos</span>
            <input type="number" min={1} max={120} value={listingDays} onChange={(e) => setListingDays(Number(e.target.value))} required />
          </label>
          <label className="field">
            <span>Días para elegir cambios</span>
            <input type="number" min={1} max={120} value={wantingDays} onChange={(e) => setWantingDays(Number(e.target.value))} required />
          </label>
        </div>
        <button className="btn primary" disabled={busy}>
          Crear evento
        </button>
      </form>

      <h2>Eventos</h2>
      {!events && <p className="muted">Cargando…</p>}
      <div className="stack">
        {events?.map((ev) => (
          <div key={ev.id} className="card">
            <div className="row between">
              <h3>
                <Link to={`/events/${ev.id}`}>{ev.title}</Link>
              </h3>
              <span className={`pill status-${ev.status}`}>{statusLabel(ev.status)}</span>
            </div>
            <p className="small muted">
              Etapa 1: {formatDate(ev.listing_starts_at)} → {formatDate(ev.listing_ends_at)} · Etapa 2 hasta {formatDate(ev.wanting_ends_at)}
            </p>
            <div className="row gap">
              {NEXT_LABEL[ev.status] && (
                <button className="btn small" disabled={busy} onClick={() => void advance(ev)}>
                  {NEXT_LABEL[ev.status]}
                </button>
              )}
              {ev.status === 'finished' && (
                <button className="btn ghost small" onClick={() => void downloadInput(ev)}>
                  Descargar archivo para TradeMaximizer
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
      <p className="small muted">
        Las etapas avanzan solas al llegar a cada fecha (una tarea programada revisa cada 15 minutos). Los botones sirven para adelantar una etapa.
      </p>
    </>
  );
}
