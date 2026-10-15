import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabase';
import type { EventItem, TradeEvent, Want } from '../lib/types';
import ItemCard from '../components/ItemCard';

type Tab = 'wants' | 'catalog';

export default function WantingStage({ event, userId }: { event: TradeEvent; userId: string }) {
  const [items, setItems] = useState<EventItem[] | null>(null);
  const [wants, setWants] = useState<Map<string, Set<string>>>(new Map());
  const [tab, setTab] = useState<Tab>('wants');
  const [activeId, setActiveId] = useState<string | null>(null);
  const [filter, setFilter] = useState('');
  const [onlySelected, setOnlySelected] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const { data, error } = await supabase
      .from('event_items')
      .select('*, profiles:profiles!owner_id(display_name)')
      .eq('event_id', event.id)
      .order('title');
    if (error) return setError(error.message);
    const all = data as unknown as EventItem[];
    setItems(all);
    const mineIds = all.filter((i) => i.owner_id === userId).map((i) => i.id);
    if (mineIds.length) {
      const w = await supabase.from('item_wants').select('item_id, wanted_item_id, rank').in('item_id', mineIds);
      if (w.error) return setError(w.error.message);
      const map = new Map<string, Set<string>>();
      for (const r of w.data as Want[]) {
        if (!map.has(r.item_id)) map.set(r.item_id, new Set());
        map.get(r.item_id)!.add(r.wanted_item_id);
      }
      setWants(map);
    }
    setActiveId((cur) => cur ?? all.find((i) => i.owner_id === userId)?.id ?? null);
  }, [event.id, userId]);

  useEffect(() => {
    void load();
  }, [load]);

  const mine = useMemo(() => (items ?? []).filter((i) => i.owner_id === userId), [items, userId]);
  const others = useMemo(() => (items ?? []).filter((i) => i.owner_id !== userId), [items, userId]);
  const active = mine.find((i) => i.id === activeId) ?? null;
  const activeWants = (activeId && wants.get(activeId)) || new Set<string>();

  const visible = useMemo(() => {
    const q = filter.trim().toLowerCase();
    return others.filter((o) => {
      if (onlySelected && !activeWants.has(o.id)) return false;
      if (!q) return true;
      return (
        o.title.toLowerCase().includes(q) ||
        (o.profiles?.display_name ?? '').toLowerCase().includes(q) ||
        o.language.toLowerCase().includes(q)
      );
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [others, filter, onlySelected, wants, activeId]);

  async function toggle(wantedId: string) {
    if (!activeId) return;
    const had = activeWants.has(wantedId);
    setError(null);
    const apply = (add: boolean) =>
      setWants((prev) => {
        const next = new Map(prev);
        const set = new Set(next.get(activeId) ?? []);
        if (add) set.add(wantedId);
        else set.delete(wantedId);
        next.set(activeId, set);
        return next;
      });
    apply(!had); // optimista
    const { error } = had
      ? await supabase.from('item_wants').delete().eq('item_id', activeId).eq('wanted_item_id', wantedId)
      : await supabase.from('item_wants').insert({ item_id: activeId, wanted_item_id: wantedId });
    if (error) {
      apply(had); // revertir
      setError(error.message);
    }
  }

  async function clearAll() {
    if (!activeId || !activeWants.size) return;
    if (!confirm('¿Quitar todas las opciones elegidas para este juego?')) return;
    const { error } = await supabase.from('item_wants').delete().eq('item_id', activeId);
    if (error) return setError(error.message);
    setWants((prev) => new Map(prev).set(activeId, new Set()));
  }

  if (!items) return <p className="muted">Cargando juegos…</p>;

  return (
    <section>
      <h2>Etapa 2 · Elegí por qué juegos cambiarías los tuyos</h2>
      <p className="muted">
        Para cada juego que ofreciste, marcá <strong>todos</strong> los juegos que aceptarías recibir a cambio. Si ninguno te interesa, dejalo sin marcar y
        no se intercambiará. Un juego tuyo solo se cambia por <strong>uno</strong> de los que marques.
      </p>

      <div className="tabs" role="tablist">
        <button role="tab" aria-selected={tab === 'wants'} className={tab === 'wants' ? 'on' : ''} onClick={() => setTab('wants')}>
          Mis elecciones
        </button>
        <button role="tab" aria-selected={tab === 'catalog'} className={tab === 'catalog' ? 'on' : ''} onClick={() => setTab('catalog')}>
          Catálogo completo ({items.length})
        </button>
      </div>

      {error && <p className="alert error">{error}</p>}

      {tab === 'catalog' && (
        <div className="stack">
          {items.map((it) => (
            <ItemCard key={it.id} item={it} mine={it.owner_id === userId} />
          ))}
        </div>
      )}

      {tab === 'wants' && (
        <>
          {mine.length === 0 ? (
            <p className="alert">No cargaste juegos en este evento, así que no hay nada para elegir. Podés mirar el catálogo completo.</p>
          ) : (
            <>
              <p className="small muted">Tu juego a cambiar:</p>
              <div className="chips-row">
                {mine.map((m) => (
                  <button key={m.id} className={`chip ${m.id === activeId ? 'on' : ''}`} onClick={() => setActiveId(m.id)}>
                    {m.title} <span className="count">{wants.get(m.id)?.size ?? 0}</span>
                  </button>
                ))}
              </div>

              {active && (
                <>
                  <div className="card callout">
                    <p className="small muted">Cambiaría</p>
                    <ItemCard item={active} mine />
                    <p>
                      por <strong>cualquiera</strong> de estos ({activeWants.size} elegidos):
                    </p>
                  </div>

                  <div className="toolbar">
                    <input
                      className="search"
                      value={filter}
                      onChange={(e) => setFilter(e.target.value)}
                      placeholder="Filtrar por título, dueño o idioma…"
                      aria-label="Filtrar juegos"
                    />
                    <label className="check">
                      <input type="checkbox" checked={onlySelected} onChange={(e) => setOnlySelected(e.target.checked)} /> Solo elegidos
                    </label>
                    <button className="btn ghost small" onClick={() => void clearAll()} disabled={!activeWants.size}>
                      Quitar todos
                    </button>
                  </div>

                  {others.length === 0 && <p className="muted">Todavía no hay juegos de otros participantes.</p>}
                  <div className="stack">
                    {visible.map((o) => {
                      const on = activeWants.has(o.id);
                      return (
                        <ItemCard
                          key={o.id}
                          item={o}
                          selected={on}
                          onClick={() => void toggle(o.id)}
                          actions={<span className={`tick ${on ? 'on' : ''}`}>{on ? '✓ Elegido' : 'Elegir'}</span>}
                        />
                      );
                    })}
                    {visible.length === 0 && others.length > 0 && <p className="muted">Ningún juego coincide con el filtro.</p>}
                  </div>
                </>
              )}
            </>
          )}
        </>
      )}
    </section>
  );
}
