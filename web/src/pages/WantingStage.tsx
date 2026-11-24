import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '../lib/supabase';
import type { EventItem, TradeEvent, Want } from '../lib/types';
import ItemCard from '../components/ItemCard';
import GameFilters, { EMPTY_FILTER, isFiltering, matchesFilter, type GameFilterValue } from '../components/GameFilters';
import SkeletonItems from '../components/Skeleton';

// Cuánto tiempo queda disponible "Deshacer" después de quitar todos los elegidos.
const UNDO_MS = 8000;

type Tab = 'wants' | 'catalog';
type View = 'all' | 'picked' | 'unpicked';

const VIEWS: { value: View; label: string }[] = [
  { value: 'all', label: 'Todos' },
  { value: 'picked', label: 'Elegidos' },
  { value: 'unpicked', label: 'Sin elegir' },
];

const opciones = (n: number) => `${n} ${n === 1 ? 'opción elegida' : 'opciones elegidas'}`;

export default function WantingStage({ event, userId }: { event: TradeEvent; userId: string }) {
  const [items, setItems] = useState<EventItem[] | null>(null);
  const [wants, setWants] = useState<Map<string, Set<string>>>(new Map());
  const [tab, setTab] = useState<Tab>('wants');
  const [activeId, setActiveId] = useState<string | null>(null);
  const [reviewing, setReviewing] = useState(false);
  const [filter, setFilter] = useState<GameFilterValue>(EMPTY_FILTER);
  const [catalogFilter, setCatalogFilter] = useState<GameFilterValue>(EMPTY_FILTER);
  const [view, setView] = useState<View>('all');
  const [error, setError] = useState<string | null>(null);
  // Cambios en vuelo, por "juegoPropio:juegoAjeno": evita dobles clics y alimenta el indicador de guardado.
  const [pending, setPending] = useState<Set<string>>(new Set());
  const [saveFailed, setSaveFailed] = useState(false);
  // Último "Quitar todos", para poder deshacerlo durante unos segundos.
  const [undo, setUndo] = useState<{ itemId: string; title: string; ids: string[] } | null>(null);
  const undoTimer = useRef<number>();
  const step2Ref = useRef<HTMLDivElement>(null);
  const topRef = useRef<HTMLElement>(null);

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
    // Entra con el primer juego propio ya seleccionado (decisión de Chino).
    setActiveId((cur) => cur ?? all.find((i) => i.owner_id === userId)?.id ?? null);
  }, [event.id, userId]);

  useEffect(() => {
    void load();
  }, [load]);

  const mine = useMemo(() => (items ?? []).filter((i) => i.owner_id === userId), [items, userId]);
  const others = useMemo(() => (items ?? []).filter((i) => i.owner_id !== userId), [items, userId]);
  const activeIdx = mine.findIndex((i) => i.id === activeId);
  const active = activeIdx >= 0 ? mine[activeIdx] : null;
  const prev = activeIdx > 0 ? mine[activeIdx - 1] : null;
  const next = activeIdx >= 0 && activeIdx < mine.length - 1 ? mine[activeIdx + 1] : null;
  const withWants = mine.filter((m) => (wants.get(m.id)?.size ?? 0) > 0).length;

  const visible = useMemo(() => {
    const picked = (activeId && wants.get(activeId)) || new Set<string>();
    return others.filter((o) => {
      if (view === 'picked' && !picked.has(o.id)) return false;
      if (view === 'unpicked' && picked.has(o.id)) return false;
      return matchesFilter(o, filter);
    });
  }, [others, filter, view, wants, activeId]);

  const catalogVisible = useMemo(() => (items ?? []).filter((i) => matchesFilter(i, catalogFilter)), [items, catalogFilter]);

  const activeWants = (activeId && wants.get(activeId)) || new Set<string>();
  const filtering = isFiltering(filter) || view !== 'all';

  function scrollTo(el: HTMLElement | null) {
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    el?.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' });
  }

  function choose(id: string, scroll: boolean) {
    setActiveId(id);
    setReviewing(false);
    if (scroll) requestAnimationFrame(() => scrollTo(step2Ref.current));
  }

  function openReview() {
    setReviewing(true);
    requestAnimationFrame(() => scrollTo(topRef.current));
  }

  async function toggle(wantedId: string) {
    if (!activeId) return;
    const itemId = activeId; // fijo: el usuario puede cambiar de juego mientras se guarda
    const key = `${itemId}:${wantedId}`;
    if (pending.has(key)) return;
    const had = wants.get(itemId)?.has(wantedId) ?? false;
    setError(null);
    setSaveFailed(false);
    const apply = (add: boolean) =>
      setWants((prevMap) => {
        const nextMap = new Map(prevMap);
        const set = new Set(nextMap.get(itemId) ?? []);
        if (add) set.add(wantedId);
        else set.delete(wantedId);
        nextMap.set(itemId, set);
        return nextMap;
      });
    apply(!had); // optimista
    setPending((p) => new Set(p).add(key));
    const { error } = had
      ? await supabase.from('item_wants').delete().eq('item_id', itemId).eq('wanted_item_id', wantedId)
      : await supabase.from('item_wants').insert({ item_id: itemId, wanted_item_id: wantedId });
    setPending((p) => {
      const n = new Set(p);
      n.delete(key);
      return n;
    });
    if (error) {
      apply(had); // revertir
      setSaveFailed(true);
      setError(`No se pudo guardar el cambio. Probá de nuevo. (${error.message})`);
    }
  }

  /** Cambia todas las opciones de un juego propio de una vez (para "Quitar todos" y "Deshacer"). */
  async function replaceAll(itemId: string, ids: string[], op: () => PromiseLike<{ error: { message: string } | null }>) {
    const key = `${itemId}:*`;
    const before = new Set(wants.get(itemId) ?? []);
    setError(null);
    setSaveFailed(false);
    setWants((prevMap) => new Map(prevMap).set(itemId, new Set(ids))); // optimista
    setPending((p) => new Set(p).add(key));
    const { error } = await op();
    setPending((p) => {
      const n = new Set(p);
      n.delete(key);
      return n;
    });
    if (error) {
      setWants((prevMap) => new Map(prevMap).set(itemId, before)); // revertir
      setSaveFailed(true);
      setError(`No se pudo guardar el cambio. Probá de nuevo. (${error.message})`);
      return false;
    }
    return true;
  }

  // Sin confirmación: se quita al instante y se ofrece "Deshacer" durante unos segundos.
  async function clearAll() {
    if (!active || !activeWants.size) return;
    const itemId = active.id;
    const ids = [...activeWants];
    const ok = await replaceAll(itemId, [], () => supabase.from('item_wants').delete().eq('item_id', itemId));
    if (!ok) return;
    window.clearTimeout(undoTimer.current);
    setUndo({ itemId, title: active.title, ids });
    undoTimer.current = window.setTimeout(() => setUndo(null), UNDO_MS);
  }

  async function undoClear() {
    if (!undo) return;
    window.clearTimeout(undoTimer.current);
    setUndo(null);
    // `rank` vuelve vacío: hoy la interfaz no permite cargarlo.
    await replaceAll(undo.itemId, undo.ids, () =>
      supabase.from('item_wants').insert(undo.ids.map((wanted_item_id) => ({ item_id: undo.itemId, wanted_item_id }))),
    );
  }

  useEffect(() => () => window.clearTimeout(undoTimer.current), []);

  function clearFilters() {
    setFilter(EMPTY_FILTER);
    setView('all');
  }

  if (!items) return <SkeletonItems label="Cargando juegos…" />;

  const titleOf = new Map(items.map((i) => [i.id, i.title]));

  return (
    <section ref={topRef} className="wanting-stage">
      <div className="wanting-head">
        <div>
          <h2>Etapa 2 · Elegí qué aceptás a cambio de cada uno de tus juegos</h2>
          <p className="muted">
            Si marcás varios, tu juego se cambia por <strong>uno solo</strong> de ellos. Si no marcás nada, ese juego se queda con vos.
          </p>
        </div>
        {mine.length > 0 && (
          <span className={`save-status ${pending.size ? 'saving' : saveFailed ? 'failed' : ''}`} role="status">
            {pending.size ? 'Guardando…' : saveFailed ? 'No se pudo guardar el último cambio' : '✓ Todos tus cambios están guardados'}
          </span>
        )}
      </div>

      <div className="tabs">
        <button aria-pressed={tab === 'wants'} className={tab === 'wants' ? 'on' : ''} onClick={() => setTab('wants')}>
          Mis elecciones
        </button>
        <button aria-pressed={tab === 'catalog'} className={tab === 'catalog' ? 'on' : ''} onClick={() => setTab('catalog')}>
          Catálogo completo ({items.length})
        </button>
      </div>

      {error && (
        <p className="alert error" role="alert">
          {error}
        </p>
      )}

      {tab === 'catalog' && (
        <>
          <GameFilters value={catalogFilter} onChange={setCatalogFilter} />
          <div className="showing">
            <span aria-live="polite">
              {isFiltering(catalogFilter) ? `Mostrando ${catalogVisible.length} de ${items.length} juegos` : `Mostrando ${items.length} juegos`}
            </span>
            {isFiltering(catalogFilter) && (
              <button className="link-btn" onClick={() => setCatalogFilter(EMPTY_FILTER)}>
                Limpiar filtros
              </button>
            )}
          </div>
          <div className="stack">
            {catalogVisible.map((it) => (
              <ItemCard key={it.id} item={it} mine={it.owner_id === userId} />
            ))}
            {catalogVisible.length === 0 && items.length > 0 && <p className="muted">Ningún juego coincide con el filtro. Probá quitar alguno.</p>}
          </div>
        </>
      )}

      {tab === 'wants' && mine.length === 0 && (
        <p className="alert">No cargaste juegos en este evento, así que no hay nada para elegir. Podés mirar el catálogo completo.</p>
      )}

      {tab === 'wants' && mine.length > 0 && reviewing && (
        <div className="card review">
          <h3>Tus elecciones</h3>
          <p className="muted">
            No tenés que hacer nada más: todo ya está guardado. Podés cambiar tus elecciones hasta que cierre la etapa.
          </p>
          <ul className="review-list">
            {mine.map((m) => {
              const set = wants.get(m.id) ?? new Set<string>();
              return (
                <li key={m.id} className="review-row">
                  <div className="review-body">
                    <div className="item-title">{m.title}</div>
                    {set.size > 0 ? (
                      <p className="small">
                        <span className="s has">✓ {opciones(set.size)}:</span>{' '}
                        <span className="muted">
                          {[...set]
                            .map((id) => titleOf.get(id) ?? '')
                            .filter(Boolean)
                            .sort((a, b) => a.localeCompare(b, 'es'))
                            .join(', ')}
                        </span>
                      </p>
                    ) : (
                      <p className="small s none">● Sin opciones: este juego no se va a cambiar</p>
                    )}
                  </div>
                  <button className="btn small" onClick={() => choose(m.id, true)}>
                    Editar
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {tab === 'wants' && mine.length > 0 && !reviewing && (
        <div className="wanting">
          {/* Paso 1: qué juego propio doy */}
          <aside className="card mine-panel">
            <h3 className="step-title">
              <span className="step-num" aria-hidden>
                1
              </span>{' '}
              Elegí el juego que vas a dar
            </h3>
            <ul className="mine-list">
              {mine.map((m) => {
                const n = wants.get(m.id)?.size ?? 0;
                const on = m.id === activeId;
                return (
                  <li key={m.id}>
                    <button className={`mine-game ${on ? 'on' : ''}`} aria-current={on ? 'true' : undefined} onClick={() => choose(m.id, true)}>
                      {m.thumbnail_url ? (
                        <img src={m.thumbnail_url} alt="" loading="lazy" className="thumb small" />
                      ) : (
                        <span className="thumb small placeholder" aria-hidden>
                          🎲
                        </span>
                      )}
                      <span className="mine-game-body">
                        <span className="t">{m.title}</span>
                        <span className={`s ${n ? 'has' : 'none'}`}>{n ? `✓ ${opciones(n)}` : '● Sin opciones todavía'}</span>
                        {on && <span className="here">▶ Estás eligiendo para este juego</span>}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
            <p className="progress-note">
              {withWants} de {mine.length} {mine.length === 1 ? 'juego' : 'juegos'} con opciones
            </p>
            <div
              className="progress pink"
              role="progressbar"
              aria-label="Juegos con opciones"
              aria-valuemin={0}
              aria-valuemax={mine.length}
              aria-valuenow={withWants}
            >
              <span style={{ width: `${(withWants / mine.length) * 100}%` }} />
            </div>
            <p className="small muted save-hint">Tus elecciones se guardan solas. Podés volver cuando quieras hasta que cierre la etapa.</p>
            <button className="btn block" onClick={openReview}>
              Listo, revisar mis elecciones
            </button>
          </aside>

          {/* Paso 2: qué acepto a cambio */}
          <div className="choose" ref={step2Ref}>
            <h3 className="step-title">
              <span className="step-num" aria-hidden>
                2
              </span>{' '}
              Marcá los juegos que aceptarías a cambio
            </h3>

            {active && (
              <div className="choose-head">
                {active.thumbnail_url ? (
                  <img src={active.thumbnail_url} alt="" className="thumb small" />
                ) : (
                  <span className="thumb small placeholder" aria-hidden>
                    🎲
                  </span>
                )}
                <p className="big">
                  Cambio mi <strong>{active.title}</strong> por uno de estos
                </p>
                <p className="count-badge" aria-live="polite">
                  {activeWants.size}
                  <small>{activeWants.size === 1 ? 'elegido' : 'elegidos'}</small>
                </p>
              </div>
            )}

            <GameFilters value={filter} onChange={setFilter}>
              <div className="segmented" role="group" aria-label="Mostrar">
                {VIEWS.map((v) => (
                  <button key={v.value} aria-pressed={view === v.value} className={view === v.value ? 'on' : ''} onClick={() => setView(v.value)}>
                    {v.label}
                  </button>
                ))}
              </div>
            </GameFilters>
            <div className="showing">
              <span aria-live="polite">
                {filtering ? `Mostrando ${visible.length} de ${others.length} juegos` : `Mostrando ${others.length} juegos`}
              </span>
              {filtering && (
                <button className="link-btn" onClick={clearFilters}>
                  Limpiar filtros
                </button>
              )}
              {activeWants.size > 0 && (
                <button className="btn ghost small danger clear-all" onClick={() => void clearAll()}>
                  Quitar todos los elegidos
                </button>
              )}
            </div>

            {others.length === 0 && <p className="muted">Todavía no hay juegos de otros participantes.</p>}
            <div className="stack">
              {active &&
                visible.map((o) => {
                  const on = activeWants.has(o.id);
                  const busy = pending.has(`${active.id}:${o.id}`) || pending.has(`${active.id}:*`);
                  return (
                    <ItemCard
                      key={o.id}
                      item={o}
                      selected={on}
                      onClick={busy ? undefined : () => void toggle(o.id)}
                      actions={
                        <label className={`pick ${on ? 'on' : ''}`}>
                          <input type="checkbox" checked={on} disabled={busy} onChange={() => void toggle(o.id)} />
                          {on ? 'Elegido' : 'Elegir'}
                          <span className="sr-only">
                            {' '}
                            {o.title} a cambio de {active.title}
                          </span>
                        </label>
                      }
                    />
                  );
                })}
              {visible.length === 0 && others.length > 0 && <p className="muted">Ningún juego coincide con el filtro. Probá quitar alguno.</p>}
            </div>

            <div className="pager">
              {prev ? (
                <button className="btn ghost" onClick={() => choose(prev.id, true)}>
                  ← Anterior: {prev.title}
                </button>
              ) : (
                <span />
              )}
              {next ? (
                <button className="btn primary" onClick={() => choose(next.id, true)}>
                  Siguiente juego: {next.title} →
                </button>
              ) : (
                <button className="btn primary" onClick={openReview}>
                  Listo, revisar mis elecciones
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      <div className="toast-region" role="status">
        {undo && (
          <div className="toast">
            <span>
              Quitaste {undo.ids.length === 1 ? '1 opción' : `${undo.ids.length} opciones`} de <strong>{undo.title}</strong>.
            </span>
            <button className="btn small" onClick={() => void undoClear()}>
              Deshacer
            </button>
          </div>
        )}
      </div>
    </section>
  );
}
