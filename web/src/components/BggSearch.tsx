import { useEffect, useRef, useState } from 'react';
import { supabase } from '../lib/supabase';
import type { BggResult } from '../lib/types';
import PoweredByBgg from './PoweredByBgg';

interface Props {
  onPick: (game: BggResult) => void;
}

/** Buscador de juegos en BoardGameGeek (vía Edge Function `bgg-search`, que guarda el token). */
export default function BggSearch({ onPick }: Props) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<BggResult[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [demo, setDemo] = useState(false);
  const seq = useRef(0);

  useEffect(() => {
    const q = query.trim();
    if (q.length < 3) {
      setResults([]);
      setError(null);
      return;
    }
    const mine = ++seq.current;
    const t = setTimeout(async () => {
      setBusy(true);
      setError(null);
      const { data, error } = await supabase.functions.invoke('bgg-search', { body: { query: q } });
      if (mine !== seq.current) return; // llegó una búsqueda más nueva
      setBusy(false);
      if (error || !data?.results) {
        setError('No pudimos consultar BoardGameGeek. Probá de nuevo en unos segundos.');
        return;
      }
      setResults(data.results as BggResult[]);
      setDemo(Boolean(data.demo));
    }, 600); // espera a que termine de escribir: menos consultas a BGG
    return () => clearTimeout(t);
  }, [query]);

  return (
    <div className="bgg">
      <label className="field">
        <span>Buscá el juego en BoardGameGeek</span>
        <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Ej: Catan, Azul, Wingspan…" />
      </label>
      {demo && <p className="alert">Modo de prueba: la búsqueda usa una lista fija de juegos hasta que se configure el token de BGG.</p>}
      {busy && <p className="small muted">Buscando…</p>}
      {error && <p className="alert error">{error}</p>}
      {!busy && !error && query.trim().length >= 3 && results.length === 0 && <p className="small muted">Sin resultados.</p>}
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
    </div>
  );
}
