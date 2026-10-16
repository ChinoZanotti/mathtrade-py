// Datos de prueba para recorrer un evento completo sin hacer todo a mano.
// Usa la service role key (se salta RLS): solo para desarrollo, nunca en producción.
//
//   npm run seed -- usuarios [cantidad]    crea usuarios prueba01@mathtrade.test, ... (clave: prueba1234)
//   npm run seed -- juegos [evento] [max]  los inscribe y les carga de 1 a max juegos (etapa 1)
//   npm run seed -- deseos [evento]        genera deseos al azar para sus juegos (etapa 2)
//   npm run seed -- borrar                 borra los usuarios de prueba y todo lo suyo
//
// [evento] es el id del evento; si se omite, se usa el último creado.
// Lee SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY de scripts/.env.
import { DEMO_GAMES } from '../supabase/functions/_shared/demo-games.ts';

const URL_BASE = process.env.SUPABASE_URL?.replace(/\/$/, '');
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!URL_BASE || !KEY) {
  console.error('Faltan SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY en scripts/.env (ver scripts/.env.example).');
  process.exit(1);
}

const DOMAIN = 'mathtrade.test';
const PASSWORD = 'prueba1234';
const CONDITIONS = ['nuevo', 'como_nuevo', 'buen_estado', 'buen_estado', 'mucho_uso'];
const LANGUAGES = ['Español', 'Español', 'Inglés', 'Independiente del idioma'];

const pick = <T>(xs: T[]): T => xs[Math.floor(Math.random() * xs.length)];
const shuffle = <T>(xs: T[]): T[] => {
  const a = [...xs];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};

async function api<T = unknown>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`${URL_BASE}${path}`, {
    ...init,
    headers: {
      apikey: KEY!,
      Authorization: `Bearer ${KEY}`,
      'Content-Type': 'application/json',
      ...(init.headers as Record<string, string> | undefined),
    },
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${init.method ?? 'GET'} ${path.split('?')[0]} → ${res.status}: ${text}`);
  return (text ? JSON.parse(text) : null) as T;
}

const rest = <T = unknown>(path: string, init: RequestInit = {}) => api<T>(`/rest/v1/${path}`, init);

interface AuthUser {
  id: string;
  email?: string;
}

async function testUsers(): Promise<AuthUser[]> {
  const out: AuthUser[] = [];
  for (let page = 1; page <= 20; page++) {
    const data = await api<{ users: AuthUser[] }>(`/auth/v1/admin/users?page=${page}&per_page=1000`);
    out.push(...data.users.filter((u) => u.email?.endsWith(`@${DOMAIN}`)));
    if (data.users.length < 1000) break;
  }
  return out.sort((a, b) => a.email!.localeCompare(b.email!));
}

interface EventRow {
  id: string;
  title: string;
  status: string;
}

async function getEvent(id: string | undefined): Promise<EventRow> {
  const q = id ? `id=eq.${encodeURIComponent(id)}` : 'order=created_at.desc&limit=1';
  const rows = await rest<EventRow[]>(`events?select=id,title,status&${q}`);
  if (!rows.length) throw new Error(id ? `No existe el evento ${id}` : 'No hay eventos creados');
  return rows[0];
}

function requireStatus(ev: EventRow, status: string, hint: string) {
  if (ev.status !== status) throw new Error(`"${ev.title}" está en "${ev.status}". ${hint}`);
}

async function users(count: number) {
  const existing = new Set((await testUsers()).map((u) => u.email));
  let created = 0;
  for (let i = 1; i <= count; i++) {
    const n = String(i).padStart(2, '0');
    const email = `prueba${n}@${DOMAIN}`;
    if (existing.has(email)) continue;
    await api('/auth/v1/admin/users', {
      method: 'POST',
      body: JSON.stringify({ email, password: PASSWORD, email_confirm: true, user_metadata: { display_name: `Prueba ${n}` } }),
    });
    created++;
  }
  console.log(`Usuarios de prueba: ${created} creados, ${existing.size} ya existían. Clave de todos: ${PASSWORD}`);
}

async function items(eventId: string | undefined, max: number) {
  const ev = await getEvent(eventId);
  requireStatus(ev, 'listing', 'Los juegos se cargan en la etapa 1: avanzalo desde Admin.');
  const us = await testUsers();
  if (!us.length) throw new Error('No hay usuarios de prueba: corré primero `npm run seed -- usuarios`.');

  await rest('event_participants?on_conflict=event_id,user_id', {
    method: 'POST',
    headers: { Prefer: 'resolution=ignore-duplicates' },
    body: JSON.stringify(us.map((u) => ({ event_id: ev.id, user_id: u.id }))),
  });

  // Solo a quienes todavía no cargaron nada, para poder correrlo más de una vez.
  const have = await rest<{ owner_id: string }[]>(`event_items?select=owner_id&event_id=eq.${ev.id}`);
  const withItems = new Set(have.map((r) => r.owner_id));
  const rows: Record<string, unknown>[] = [];
  for (const u of us) {
    if (withItems.has(u.id)) continue;
    const n = 1 + Math.floor(Math.random() * max);
    for (const g of shuffle(DEMO_GAMES).slice(0, n)) {
      rows.push({
        event_id: ev.id,
        owner_id: u.id,
        bgg_id: g.id,
        title: g.name,
        year_published: g.year,
        thumbnail_url: g.thumbnail,
        condition: pick(CONDITIONS),
        language: pick(LANGUAGES),
      });
    }
  }
  if (rows.length) await rest('event_items', { method: 'POST', body: JSON.stringify(rows) });
  console.log(`"${ev.title}": ${us.length} usuarios de prueba inscriptos, ${rows.length} juegos nuevos.`);
}

async function wants(eventId: string | undefined) {
  const ev = await getEvent(eventId);
  requireStatus(ev, 'wanting', 'Los deseos se eligen en la etapa 2: avanzalo desde Admin.');
  const testIds = new Set((await testUsers()).map((u) => u.id));
  const all = await rest<{ id: string; owner_id: string }[]>(`event_items?select=id,owner_id&event_id=eq.${ev.id}`);
  const mine = all.filter((it) => testIds.has(it.owner_id));
  if (!mine.length) throw new Error('Los usuarios de prueba no tienen juegos en este evento.');

  // Se reemplazan los deseos anteriores de los usuarios de prueba (los tuyos no se tocan).
  for (let i = 0; i < mine.length; i += 100) {
    const ids = mine.slice(i, i + 100).map((it) => it.id).join(',');
    await rest(`item_wants?item_id=in.(${ids})`, { method: 'DELETE' });
  }
  const rows: Record<string, unknown>[] = [];
  for (const it of mine) {
    const others = all.filter((o) => o.owner_id !== it.owner_id);
    const k = Math.min(others.length, 2 + Math.floor(Math.random() * 7));
    for (const w of shuffle(others).slice(0, k)) rows.push({ item_id: it.id, wanted_item_id: w.id });
  }
  for (let i = 0; i < rows.length; i += 500) {
    await rest('item_wants', { method: 'POST', body: JSON.stringify(rows.slice(i, i + 500)) });
  }
  console.log(`"${ev.title}": ${rows.length} deseos para ${mine.length} juegos de prueba.`);
}

async function remove() {
  const us = await testUsers();
  for (const u of us) await api(`/auth/v1/admin/users/${u.id}`, { method: 'DELETE' });
  console.log(`Borrados ${us.length} usuarios de prueba (con sus inscripciones, juegos y deseos).`);
}

const [cmd, a, b] = process.argv.slice(2);
try {
  if (cmd === 'usuarios') await users(Number(a) || 8);
  else if (cmd === 'juegos') await items(a, Number(b) || 3);
  else if (cmd === 'deseos') await wants(a);
  else if (cmd === 'borrar') await remove();
  else {
    console.log('Uso: npm run seed -- usuarios [cantidad] | juegos [evento] [max] | deseos [evento] | borrar');
    process.exit(1);
  }
} catch (err) {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
}
