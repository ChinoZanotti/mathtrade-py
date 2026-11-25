import { useEffect, useRef, useState } from 'react';
import { supabase } from '../lib/supabase';
import type { BggResult } from '../lib/types';
import PoweredByBgg from './PoweredByBgg';

interface Props {
  onPick: (game: BggResult) => void;
  autoFocus?: boolean;
}

const MIN_CHARS = 3;

/** Buscador de juegos en BoardGameGeek (vía Edge Function `bgg-search`, que guarda el token). */
export default function BggSearch({ onPick, autoFocus }: Props) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<BggResult[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [demo, setDemo] = useState(false);
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const seq = useRef(0);

  useEffect(() => {
    const q = query.trim();
    // Cada cambio invalida la búsqueda en vuelo, también al borrar: así no reaparecen resultados viejos.
    const mine = ++seq.current;
    setPage(0);
    setHasMore(false);
    setLoadingMore(false);
    if (q.length < MIN_CHARS) {
      setResults([]);
      setError(null);
      setBusy(false);
      return;
    }
    setBusy(true); // evita mostrar "Sin resultados" mientras se espera el debounce
    const t = setTimeout(async () => {
      setError(null);
      const { data, error } = await supabase.functions.invoke('bgg-search', { body: { query: q } });
      if (mine !== seq.current) return; // llegó una búsqueda más nueva
      setBusy(false);
      if (error || !data?.results) {
        setError('No pudimos consultar BoardGameGeek. Probá de nuevo en unos segundos.');
        return;
      }
      setResults(data.results as BggResult[]);
      setHasMore(Boolean(data.hasMore));
      setDemo(Boolean(data.demo));
    }, 600); // espera a que termine de escribir: menos consultas a BGG
    return () => clearTimeout(t);
  }, [query]);

  async function loadMore() {
    const mine = seq.current;
    const next = page + 1;
    setLoadingMore(true);
    setError(null);
    const { data, error } = await supabase.functions.invoke('bgg-search', { body: { query: query.trim(), page: next } });
    if (mine !== seq.current) return; // cambió la búsqueda mientras cargaba
    setLoadingMore(false);
    if (error || !data?.results) {
      setError('No pudimos traer más resultados. Probá de nuevo en unos segundos.');
      return;
    }
    const more = data.results as BggResult[];
    setResults((prev) => [...prev, ...more.filter((g) => !prev.some((p) => p.id === g.id))]);
    setPage(next);
    setHasMore(Boolean(data.hasMore));
  }

  return (
    <div className="bgg">
      <label className="field">
        <span>Buscá el juego en BoardGameGeek</span>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Ej: Catan, Azul, Wingspan…"
          autoFocus={autoFocus}
          aria-describedby="bgg-search-status"
        />
      </label>
      {demo && <p className="alert">Modo de prueba: la búsqueda usa una lista fija de juegos hasta que se configure el token de BGG.</p>}
      <div id="bgg-search-status" role="status">
        {query.trim().length > 0 && query.trim().length < MIN_CHARS && <p className="small muted">Escribí al menos {MIN_CHARS} letras para buscar.</p>}
        {busy && <p className="small muted">Buscando…</p>}
        {!busy && !error && query.trim().length >= MIN_CHARS && (
          <p className="small muted">
            {results.length === 0
              ? 'Sin resultados. Probá con otro nombre o con el título en inglés.'
              : `${results.length} ${results.length === 1 ? 'resultado' : 'resultados'}: elegí tu juego.`}
            {results.length > 0 && !hasMore && ' ¿No está? Probá con el nombre completo o en inglés.'}
          </p>
        )}
      </div>
      {error && (
        <p className="alert error" role="alert">
          {error}
        </p>
      )}
      <div className="bgg-credit small muted">
        Datos de juegos de BoardGameGeek <PoweredByBgg />
      </div>
      <ul className="bgg-results">
        {results.map((g) => (
          <li key={g.id}>
            <button type="button" onClick={() => onPick(g)}>
              {g.thumbnail ? <img src={g.thumbnail} alt="" className="thumb small" /> : <div className="thumb small placeholder">🎲</div>}
              <span>
                {g.name} {g.year ? <span className="muted">({g.year})</span> : null}
              </span>
            </button>
          </li>
        ))}
      </ul>
      {hasMore && !busy && (
        <button type="button" className="btn small bgg-more" onClick={() => void loadMore()} disabled={loadingMore}>
          {loadingMore ? 'Cargando…' : 'Ver más resultados'}
        </button>
      )}
    </div>
  );
}
