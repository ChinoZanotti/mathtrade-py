import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/auth';
import { formatDateTime } from '../lib/format';
import type { EventItem, TradeEvent, Trade } from '../lib/types';

type Filter = 'pending' | 'delivered' | 'all';

const FILTERS: { value: Filter; label: string }[] = [
  { value: 'pending', label: 'Pendientes' },
  { value: 'delivered', label: 'Entregados' },
  { value: 'all', label: 'Todos' },
];

// Una entrega: el juego `item` lo lleva su dueño y lo recibe el dueño de `trade.item_id`.
interface Delivery {
  trade: Trade;
  item: EventItem;
  giver: string;
  receiver: string;
}

const norm = (s: string) => s.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();

export default function AdminTrades() {
  const { id } = useParams();
  const { session } = useAuth();
  const userId = session!.user.id;
  const [event, setEvent] = useState<TradeEvent | null>(null);
  const [items, setItems] = useState<EventItem[] | null>(null);
  const [trades, setTrades] = useState<Trade[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<Filter>('pending');
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const [ev, it, tr] = await Promise.all([
      supabase.from('events').select('*').eq('id', id!).maybeSingle(),
      supabase.from('event_items').select('*, profiles:profiles!owner_id(display_name)').eq('event_id', id!),
      supabase.from('trades').select('*').eq('event_id', id!).order('cycle_no').order('cycle_position'),
    ]);
    setLoading(false);
    if (ev.error || !ev.data) return setError('No encontramos el evento.');
    if (it.error || tr.error) return setError((it.error ?? tr.error)!.message);
    setError(null);
    setEvent(ev.data as TradeEvent);
    setItems(it.data as unknown as EventItem[]);
    setTrades(tr.data as Trade[]);
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  const deliveries = useMemo<Delivery[]>(() => {
    const byId = new Map((items ?? []).map((i) => [i.id, i]));
    const out: Delivery[] = [];
    for (const t of trades) {
      const item = byId.get(t.receives_item_id);
      const receiverItem = byId.get(t.item_id);
      if (!item || !receiverItem) continue;
      out.push({
        trade: t,
        item,
        giver: item.profiles?.display_name ?? '—',
        receiver: receiverItem.profiles?.display_name ?? '—',
      });
    }
    return out;
  }, [items, trades]);

  // Agrupadas por quien entrega, en orden alfabético.
  const groups = useMemo(() => {
    const q = norm(query.trim());
    const m = new Map<string, Delivery[]>();
    for (const d of deliveries) {
      const done = Boolean(d.trade.delivered_at);
      if ((filter === 'pending' && done) || (filter === 'delivered' && !done)) continue;
      if (q && !norm(`${d.giver} ${d.receiver} ${d.item.title}`).includes(q)) continue;
      m.set(d.giver, [...(m.get(d.giver) ?? []), d]);
    }
    return [...m.entries()]
      .sort(([a], [b]) => a.localeCompare(b, 'es'))
      .map(([giver, list]) => ({ giver, list: list.sort((a, b) => a.item.title.localeCompare(b.item.title, 'es')) }));
  }, [deliveries, query, filter]);

  const pendingByGiver = useMemo(() => {
    const m = new Map<string, number>();
    for (const d of deliveries) if (!d.trade.delivered_at) m.set(d.giver, (m.get(d.giver) ?? 0) + 1);
    return m;
  }, [deliveries]);

  async function toggle(t: Trade) {
    const patch = t.delivered_at
      ? { delivered_at: null, delivered_by: null }
      : { delivered_at: new Date().toISOString(), delivered_by: userId };
    const update = (p: Pick<Trade, 'delivered_at' | 'delivered_by'>) =>
      setTrades((prev) => prev.map((x) => (x.item_id === t.item_id ? { ...x, ...p } : x)));
    update(patch);
    const { data, error } = await supabase
      .from('trades')
      .update(patch)
      .eq('event_id', t.event_id)
      .eq('item_id', t.item_id)
      .select('item_id');
    if (error || !data?.length) {
      update({ delivered_at: t.delivered_at, delivered_by: t.delivered_by });
      setError(error?.message ?? 'No se pudo guardar la entrega (¿tenés permisos de administrador?).');
    }
  }

  if (error && !event) return <p className="alert error">{error}</p>;
  if (!event || !items) return <p className="muted">Cargando…</p>;

  const total = deliveries.length;
  const delivered = deliveries.filter((d) => d.trade.delivered_at).length;

  return (
    <>
      <p className="small">
        <Link to="/admin">← Administrar</Link>
      </p>
      <h1>Intercambios y entregas</h1>
      <p className="muted">
        <Link to={`/events/${event.id}`}>{event.title}</Link>
      </p>
      {error && <p className="alert error">{error}</p>}

      {event.status !== 'finished' ? (
        <p className="alert">Este evento todavía no tiene resultados.</p>
      ) : (
        <>
          <div className="card callout">
            <div className="row between">
              <p className="delivery-progress">
                <strong>{delivered}</strong> de {total} juegos entregados
              </p>
              <button className="btn ghost small" disabled={loading} onClick={() => void load()}>
                Actualizar
              </button>
            </div>
            <div className="progress" aria-hidden>
              <span style={{ width: total ? `${(delivered / total) * 100}%` : 0 }} />
            </div>
          </div>

          <div className="toolbar">
            <input
              className="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar por persona o juego…"
              aria-label="Buscar entregas"
            />
          </div>
          <div className="chips-row">
            {FILTERS.map((f) => (
              <button key={f.value} className={`chip ${filter === f.value ? 'on' : ''}`} onClick={() => setFilter(f.value)}>
                {f.label}
              </button>
            ))}
          </div>

          {groups.length === 0 && (
            <p className="muted">{total === 0 ? 'No hubo intercambios en este evento.' : 'No hay entregas que coincidan.'}</p>
          )}
          <div className="stack">
            {groups.map(({ giver, list }) => {
              const pending = pendingByGiver.get(giver) ?? 0;
              return (
                <div key={giver} className="card">
                  <div className="row between">
                    <h3 className="delivery-giver">{giver}</h3>
                    <span className={`pill ${pending ? '' : 'ok'}`}>{pending ? `${pending} por entregar` : 'Todo entregado ✓'}</span>
                  </div>
                  <ul className="deliveries">
                    {list.map((d) => (
                      <li key={d.trade.item_id} className={d.trade.delivered_at ? 'done' : ''}>
                        <label>
                          <input type="checkbox" checked={Boolean(d.trade.delivered_at)} onChange={() => void toggle(d.trade)} />
                          {d.item.thumbnail_url ? (
                            <img src={d.item.thumbnail_url} alt="" loading="lazy" className="thumb small" />
                          ) : (
                            <span className="thumb small placeholder" aria-hidden>
                              🎲
                            </span>
                          )}
                          <span className="delivery-body">
                            <span className="delivery-title">{d.item.title}</span>
                            <span className="small muted">
                              → <strong>{d.receiver}</strong>
                              {d.trade.delivered_at && <> · entregado {formatDateTime(d.trade.delivered_at)}</>}
                            </span>
                          </span>
                        </label>
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })}
          </div>
        </>
      )}
    </>
  );
}
