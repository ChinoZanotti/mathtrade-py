// Busca juegos en BoardGameGeek (XML API 2). BGG exige un token de aplicación (BGG_TOKEN),
// por eso la consulta pasa por esta función y no desde el navegador.
// Los términos de la API piden cachear: cada búsqueda se guarda en `bgg_search_cache`
// y se reutiliza durante CACHE_DAYS antes de volver a consultar a BGG.
//
// Resultados paginados ("Ver más"): la búsqueda se ordena por coincidencia de nombre
// (`rankSearch`) y se guardan hasta MAX_CANDIDATES ids. Cada página pide a `/thing`
// solo los juegos que todavía no están en la cache.
import { createClient } from 'npm:@supabase/supabase-js@2';
import { corsHeaders, json } from '../_shared/cors.ts';
import { searchDemoGames } from '../_shared/demo-games.ts';
import { type Candidate, decode, MAX_CANDIDATES, rankSearch } from '../_shared/bgg-rank.ts';

const BGG = 'https://boardgamegeek.com/xmlapi2';
const CACHE_DAYS = 7;
const PAGE_SIZE = 12;
const MAX_PAGE = Math.ceil(MAX_CANDIDATES / PAGE_SIZE) - 1;

const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
  auth: { persistSession: false },
});

interface Game {
  id: number;
  name: string;
  year: number | null;
  thumbnail: string | null;
}

function bggFetch(path: string): Promise<Response> {
  const token = Deno.env.get('BGG_TOKEN');
  return fetch(`${BGG}${path}`, {
    headers: { Accept: 'application/xml', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
  });
}

async function fetchXml(path: string): Promise<string> {
  // BGG responde 202 mientras prepara la respuesta: reintentar unas veces.
  for (let attempt = 0; attempt < 4; attempt++) {
    const res = await bggFetch(path);
    if (res.status === 202) {
      await new Promise((r) => setTimeout(r, 800));
      continue;
    }
    if (!res.ok) throw new Error(`BGG respondió ${res.status}`);
    return await res.text();
  }
  throw new Error('BGG no respondió a tiempo');
}

type RatedGame = Game & { rated: number };

/** Lo que se guarda en `bgg_search_cache.results`. El formato viejo (un array) se ignora. */
interface CacheEntry {
  v: 2;
  candidates: Candidate[];
  games: Record<string, RatedGame>;
}

async function searchCandidates(q: string): Promise<Candidate[]> {
  const xml = await fetchXml(`/search?type=boardgame&query=${encodeURIComponent(q)}`);
  return rankSearch(xml, q);
}

async function fetchThings(ids: number[]): Promise<RatedGame[]> {
  if (!ids.length) return [];
  const thingXml = await fetchXml(`/thing?stats=1&id=${ids.join(',')}`);
  const games: RatedGame[] = [];
  for (const block of thingXml.split(/<item\b/).slice(1)) {
    const id = Number(/\bid="(\d+)"/.exec(block)?.[1]);
    const name = /<name\b[^>]*type="primary"[^>]*value="([^"]*)"/.exec(block)?.[1];
    if (!id || !name) continue;
    const year = Number(/<yearpublished\b[^>]*value="(\d+)"/.exec(block)?.[1]) || null;
    const thumb = /<thumbnail>\s*([^<\s]+)\s*<\/thumbnail>/.exec(block)?.[1] ?? null;
    const rated = Number(/<usersrated\b[^>]*value="(\d+)"/.exec(block)?.[1]) || 0;
    games.push({ id, name: decode(name), year, thumbnail: thumb, rated });
  }
  return games;
}

async function readCache(key: string): Promise<CacheEntry | null> {
  const since = new Date(Date.now() - CACHE_DAYS * 86_400_000).toISOString();
  const { data, error } = await admin
    .from('bgg_search_cache')
    .select('results')
    .eq('query', key)
    .gte('fetched_at', since)
    .maybeSingle();
  if (error) console.error('Cache BGG (lectura):', error.message);
  const entry = data?.results as CacheEntry | undefined;
  return entry && entry.v === 2 ? entry : null;
}

async function writeCache(key: string, entry: CacheEntry, fresh: boolean): Promise<void> {
  // Al agregar páginas se conserva fetched_at: la cache vence a los CACHE_DAYS de la búsqueda original.
  const row = fresh
    ? { query: key, results: entry, fetched_at: new Date().toISOString() }
    : { query: key, results: entry };
  const { error } = await admin.from('bgg_search_cache').upsert(row);
  if (error) console.error('Cache BGG (escritura):', error.message);
}

function parsePage(raw: unknown): number {
  const n = Number(raw ?? 0);
  return Number.isInteger(n) && n >= 0 && n <= MAX_PAGE ? n : 0;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    const body = await req.json();
    const q = String(body?.query ?? '').trim().replace(/\s+/g, ' ');
    if (q.length < 3 || q.length > 100) return json({ results: [], hasMore: false });
    const page = parsePage(body?.page);
    const from = page * PAGE_SIZE;
    const to = from + PAGE_SIZE;

    // Modo de prueba: sin token, BGG rechaza las consultas. Se usa una lista fija y no se toca la cache.
    if (!Deno.env.get('BGG_TOKEN')) {
      const all = searchDemoGames(q).slice(0, MAX_CANDIDATES);
      return json({ results: all.slice(from, to), hasMore: all.length > to, demo: true });
    }

    // "Catan", "catan " y "CATAN" comparten la misma entrada de cache.
    const key = q.toLowerCase();
    const cached = await readCache(key);
    const fresh = !cached;
    const entry: CacheEntry = cached ?? { v: 2, candidates: await searchCandidates(q), games: {} };

    const pageCands = entry.candidates.slice(from, to);
    const missing = pageCands.filter((c) => !entry.games[c.id]).map((c) => c.id);
    if (missing.length) {
      for (const g of await fetchThings(missing)) entry.games[g.id] = g;
    }
    if (fresh || missing.length) await writeCache(key, entry, fresh);

    // Dentro de la página: primero el que mejor coincide; a igual coincidencia, el más conocido.
    const results = pageCands
      .map((c) => ({ c, g: entry.games[c.id] }))
      .filter((x): x is { c: Candidate; g: RatedGame } => Boolean(x.g))
      .sort((a, b) => a.c.score - b.c.score || b.g.rated - a.g.rated)
      .map(({ g: { rated: _r, ...g } }) => g);
    return json({ results, hasMore: entry.candidates.length > to });
  } catch (err) {
    console.error(err);
    return json({ error: 'No se pudo consultar BoardGameGeek' }, 502);
  }
});
