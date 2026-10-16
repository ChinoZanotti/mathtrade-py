// Busca juegos en BoardGameGeek (XML API 2). BGG exige un token de aplicación (BGG_TOKEN),
// por eso la consulta pasa por esta función y no desde el navegador.
// Los términos de la API piden cachear: cada búsqueda se guarda en `bgg_search_cache`
// y se reutiliza durante CACHE_DAYS antes de volver a consultar a BGG.
import { createClient } from 'npm:@supabase/supabase-js@2';
import { corsHeaders, json } from '../_shared/cors.ts';
import { searchDemoGames } from '../_shared/demo-games.ts';

const BGG = 'https://boardgamegeek.com/xmlapi2';
const CACHE_DAYS = 7;

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

function decode(s: string): string {
  return s
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&amp;/g, '&');
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

async function searchBgg(q: string): Promise<Game[]> {
  const searchXml = await fetchXml(`/search?type=boardgame&query=${encodeURIComponent(q)}`);
  const ids: number[] = [];
  for (const m of searchXml.matchAll(/<item\b[^>]*\bid="(\d+)"/g)) {
    const id = Number(m[1]);
    if (!ids.includes(id)) ids.push(id);
    if (ids.length >= 20) break;
  }
  if (!ids.length) return [];

  const thingXml = await fetchXml(`/thing?stats=1&id=${ids.join(',')}`);
  const games: (Game & { rated: number })[] = [];
  for (const block of thingXml.split(/<item\b/).slice(1)) {
    const id = Number(/\bid="(\d+)"/.exec(block)?.[1]);
    const name = /<name\b[^>]*type="primary"[^>]*value="([^"]*)"/.exec(block)?.[1];
    if (!id || !name) continue;
    const year = Number(/<yearpublished\b[^>]*value="(\d+)"/.exec(block)?.[1]) || null;
    const thumb = /<thumbnail>\s*([^<\s]+)\s*<\/thumbnail>/.exec(block)?.[1] ?? null;
    const rated = Number(/<usersrated\b[^>]*value="(\d+)"/.exec(block)?.[1]) || 0;
    games.push({ id, name: decode(name), year, thumbnail: thumb, rated });
  }
  // Los más conocidos primero, para que "Catan" no quede detrás de rarezas.
  games.sort((a, b) => b.rated - a.rated);
  return games.slice(0, 12).map(({ rated: _r, ...g }) => g);
}

async function readCache(key: string): Promise<Game[] | null> {
  const since = new Date(Date.now() - CACHE_DAYS * 86_400_000).toISOString();
  const { data, error } = await admin
    .from('bgg_search_cache')
    .select('results')
    .eq('query', key)
    .gte('fetched_at', since)
    .maybeSingle();
  if (error) console.error('Cache BGG (lectura):', error.message);
  return (data?.results as Game[] | undefined) ?? null;
}

async function writeCache(key: string, results: Game[]): Promise<void> {
  const { error } = await admin
    .from('bgg_search_cache')
    .upsert({ query: key, results, fetched_at: new Date().toISOString() });
  if (error) console.error('Cache BGG (escritura):', error.message);
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    const { query } = await req.json();
    const q = String(query ?? '').trim().replace(/\s+/g, ' ');
    if (q.length < 3 || q.length > 100) return json({ results: [] });

    // Modo de prueba: sin token, BGG rechaza las consultas. Se usa una lista fija y no se toca la cache.
    if (!Deno.env.get('BGG_TOKEN')) return json({ results: searchDemoGames(q), demo: true });

    // "Catan", "catan " y "CATAN" comparten la misma entrada de cache.
    const key = q.toLowerCase();
    const cached = await readCache(key);
    if (cached) return json({ results: cached });

    const results = await searchBgg(q);
    await writeCache(key, results);
    return json({ results });
  } catch (err) {
    console.error(err);
    return json({ error: 'No se pudo consultar BoardGameGeek' }, 502);
  }
});
