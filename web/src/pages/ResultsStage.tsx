import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabase';
import type { EventItem, TradeEvent, Trade } from '../lib/types';
import ItemCard from '../components/ItemCard';

interface Stats {
  numItems: number;
  numTrades: number;
  numGroups: number;
  groupSizes: number[];
}

export default function ResultsStage({ event, userId }: { event: TradeEvent; userId: string }) {
  const [items, setItems] = useState<EventItem[] | null>(null);
  const [trades, setTrades] = useState<Trade[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      const [it, tr, rs] = await Promise.all([
        supabase.from('event_items').select('*, profiles:profiles!owner_id(display_name)').eq('event_id', event.id),
        supabase.from('trades').select('*').eq('event_id', event.id).order('cycle_no').order('cycle_position'),
        supabase.from('event_results').select('stats').eq('event_id', event.id).maybeSingle(),
      ]);
      if (it.error || tr.error) return setError((it.error ?? tr.error)!.message);
      setItems(it.data as unknown as EventItem[]);
      setTrades(tr.data as Trade[]);
      setStats((rs.data?.stats as Stats | undefined) ?? null);
    })();
  }, [event.id]);

  const byId = useMemo(() => new Map((items ?? []).map((i) => [i.id, i])), [items]);
  // Para cada juego: quién lo recibe (el dueño del juego cuya fila "recibe" este).
  const receiverOf = useMemo(() => {
    const m = new Map<string, string>();
    for (const t of trades) m.set(t.receives_item_id, t.item_id);
    return m;
  }, [trades]);
  const tradeByItem = useMemo(() => new Map(trades.map((t) => [t.item_id, t])), [trades]);
  const cycles = useMemo(() => {
    const m = new Map<number, Trade[]>();
    for (const t of trades) m.set(t.cycle_no, [...(m.get(t.cycle_no) ?? []), t]);
    return [...m.values()];
  }, [trades]);

  if (error) return <p className="alert error">{error}</p>;
  if (!items) return <p className="muted">Cargando resultados…</p>;

  const myItems = items.filter((i) => i.owner_id === userId);
  const myTraded = myItems.filter((i) => tradeByItem.has(i.id));
  const myUntraded = myItems.filter((i) => !tradeByItem.has(i.id));

  return (
    <section>
      <h2>Resultados</h2>
      {stats && (
        <p className="muted">
          Se concretaron <strong>{stats.numTrades}</strong> intercambios de {stats.numItems} juegos, en {stats.numGroups}{' '}
          {stats.numGroups === 1 ? 'grupo' : 'grupos'}.
        </p>
      )}

      <h3>Tus intercambios</h3>
      {myItems.length === 0 && <p className="muted">No cargaste juegos en este evento.</p>}
      <div className="stack">
        {myTraded.map((mi) => {
          const t = tradeByItem.get(mi.id)!;
          const getting = byId.get(t.receives_item_id);
          const sendToItem = byId.get(receiverOf.get(mi.id) ?? '');
          return (
            <div key={mi.id} className="card trade">
              <div className="trade-col">
                <p className="small muted">Entregás</p>
                <ItemCard item={mi} mine showOwner={false} />
                {sendToItem && (
                  <p className="small">
                    Se lo enviás a <strong>{sendToItem.profiles?.display_name}</strong>
                  </p>
                )}
              </div>
              <div className="arrow" aria-hidden>
                ⇄
              </div>
              <div className="trade-col">
                <p className="small muted">Recibís</p>
                {getting && <ItemCard item={getting} />}
                {getting && (
                  <p className="small">
                    Te lo envía <strong>{getting.profiles?.display_name}</strong>
                  </p>
                )}
              </div>
            </div>
          );
        })}
        {myUntraded.map((mi) => (
          <div key={mi.id} className="card muted-card">
            <ItemCard item={mi} mine showOwner={false} />
            <p className="small muted">No hubo intercambio para este juego. Te lo quedás.</p>
          </div>
        ))}
      </div>

      <h3>Todos los ciclos</h3>
      <p className="small muted">En cada ciclo, cada persona envía su juego a la siguiente y recibe el de la anterior.</p>
      <div className="stack">
        {cycles.map((c, idx) => (
          <div key={idx} className="card">
            <p className="small muted">Ciclo {idx + 1} · {c.length} personas</p>
            <ul className="cycle">
              {c.map((t) => {
                const give = byId.get(t.item_id);
                const get = byId.get(t.receives_item_id);
                return (
                  <li key={t.item_id} className={give?.owner_id === userId ? 'me' : ''}>
                    <strong>{give?.profiles?.display_name}</strong> recibe <em>{get?.title}</em> de {get?.profiles?.display_name}
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </div>
    </section>
  );
}
