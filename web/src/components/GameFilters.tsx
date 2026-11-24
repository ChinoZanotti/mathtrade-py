import type { ReactNode } from 'react';
import { CONDITIONS } from '../lib/format';
import type { EventItem } from '../lib/types';

export interface GameFilterValue {
  query: string;
  condition: string;
}

export const EMPTY_FILTER: GameFilterValue = { query: '', condition: '' };

export const isFiltering = (f: GameFilterValue) => f.query.trim() !== '' || f.condition !== '';

/** ¿El juego pasa el filtro? Busca en título, dueño e idioma. */
export function matchesFilter(item: EventItem, f: GameFilterValue): boolean {
  if (f.condition && item.condition !== f.condition) return false;
  const q = f.query.trim().toLowerCase();
  if (!q) return true;
  return (
    item.title.toLowerCase().includes(q) ||
    (item.profiles?.display_name ?? '').toLowerCase().includes(q) ||
    item.language.toLowerCase().includes(q)
  );
}

/** Barra de búsqueda + filtro por estado. `children` agrega controles extra al final. */
export default function GameFilters({
  value,
  onChange,
  children,
}: {
  value: GameFilterValue;
  onChange: (v: GameFilterValue) => void;
  children?: ReactNode;
}) {
  return (
    <div className="toolbar">
      <input
        className="search"
        value={value.query}
        onChange={(e) => onChange({ ...value, query: e.target.value })}
        placeholder="Buscar por título, dueño o idioma…"
        aria-label="Buscar juegos"
      />
      <select value={value.condition} onChange={(e) => onChange({ ...value, condition: e.target.value })} aria-label="Filtrar por estado">
        <option value="">Estado: todos</option>
        {CONDITIONS.map((c) => (
          <option key={c.value} value={c.value}>
            {c.label}
          </option>
        ))}
      </select>
      {children}
    </div>
  );
}
