// Orden de los resultados de búsqueda de BGG según cuánto se parece el nombre a lo buscado.
// BGG devuelve cientos de coincidencias para nombres cortos ("Trio") en un orden que no
// sirve: sin esto, el juego exacto podía quedar fuera de los que se muestran.
// Sin dependencias: corre igual en Deno y Node (lo usan `bgg-search` y los tests).

export const MAX_CANDIDATES = 60;

export interface Candidate {
  id: number;
  /** 0 = nombre idéntico … 4 = contiene el texto en cualquier lugar. Menor es mejor. */
  score: number;
}

/** Minúsculas, sin tildes y con los espacios colapsados. */
export function norm(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .trim()
    .replace(/\s+/g, ' ');
}

/** Decodifica las entidades XML que usa BGG en los nombres. */
export function decode(s: string): string {
  return s
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&amp;/g, '&');
}

const isWordChar = (c: string | undefined) => c !== undefined && /[\p{L}\p{N}]/u.test(c);

/** Qué tan bien coincide un nombre con la búsqueda (ambos se normalizan acá). */
export function matchScore(name: string, query: string): number {
  const n = norm(name);
  const q = norm(query);
  if (!q) return 4;
  if (n === q) return 0;
  if (n.startsWith(q)) return isWordChar(n[q.length]) ? 2 : 1;
  for (let i = n.indexOf(q); i >= 0; i = n.indexOf(q, i + 1)) {
    if (!isWordChar(n[i - 1]) && !isWordChar(n[i + q.length])) return 3;
  }
  return 4;
}

/**
 * Lee el XML de `/search` de BGG y devuelve los ids ordenados por coincidencia.
 * Un mismo juego puede venir varias veces (una por nombre alternativo): vale su mejor nombre.
 * El orden es estable: a igual puntaje se respeta el orden de BGG.
 */
export function rankSearch(xml: string, query: string, max = MAX_CANDIDATES): Candidate[] {
  const best = new Map<number, number>();
  for (const block of xml.split(/<item\b/).slice(1)) {
    const id = Number(/\bid="(\d+)"/.exec(block)?.[1]);
    const name = /<name\b[^>]*\bvalue="([^"]*)"/.exec(block)?.[1];
    if (!id || name === undefined) continue;
    const score = matchScore(decode(name), query);
    const prev = best.get(id);
    if (prev === undefined || score < prev) best.set(id, score);
  }
  return [...best]
    .map(([id, score], pos) => ({ id, score, pos }))
    .sort((a, b) => a.score - b.score || a.pos - b.pos)
    .slice(0, max)
    .map(({ id, score }) => ({ id, score }));
}
