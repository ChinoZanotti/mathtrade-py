// Avanza las etapas de los eventos (y corre el algoritmo al cerrar la etapa 2).
//
// Dos formas de invocarla:
//  - Tarea programada (pg_cron): header `x-cron-secret` = CRON_SECRET. Procesa todos los eventos vencidos.
//  - Admin desde la web: JWT de un usuario admin + { event_id }. Fuerza el avance de ese evento.
import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2';
import { corsHeaders, json } from '../_shared/cors.ts';
import { APP_URL, escapeHtml, layout, sendEmails, type Mail } from '../_shared/email.ts';
import { findTrades, type MatchItem } from '../_shared/matcher.ts';

type Status = 'upcoming' | 'listing' | 'wanting' | 'processing' | 'finished';

interface EventRow {
  id: string;
  title: string;
  status: Status;
  listing_starts_at: string;
  listing_ends_at: string;
  wanting_ends_at: string;
}

const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
  auth: { persistSession: false },
});

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    const cronSecret = Deno.env.get('CRON_SECRET');
    const isCron = Boolean(cronSecret) && req.headers.get('x-cron-secret') === cronSecret;

    if (isCron) {
      const messages = await processDueEvents();
      return json({ message: messages.join(' ') || 'Nada para avanzar.' });
    }

    // Llamada desde la web: exigir un admin autenticado.
    const token = req.headers.get('Authorization')?.replace(/^Bearer /i, '');
    if (!token) return json({ error: 'No autorizado' }, 401);
    const { data: userData, error: userErr } = await admin.auth.getUser(token);
    if (userErr || !userData.user) return json({ error: 'No autorizado' }, 401);
    const { data: prof } = await admin.from('profiles').select('is_admin').eq('id', userData.user.id).maybeSingle();
    if (!prof?.is_admin) return json({ error: 'Solo administradores' }, 403);

    const { event_id } = await req.json();
    if (!event_id) return json({ error: 'Falta event_id' }, 400);
    const { data: ev } = await admin.from('events').select('*').eq('id', event_id).maybeSingle();
    if (!ev) return json({ error: 'Evento no encontrado' }, 404);
    const message = await advance(ev as EventRow, true);
    return json({ message: message ?? 'Este evento no tiene una etapa para avanzar.' });
  } catch (err) {
    console.error(err);
    return json({ error: err instanceof Error ? err.message : 'Error inesperado' }, 500);
  }
});

async function processDueEvents(): Promise<string[]> {
  const { data, error } = await admin.from('events').select('*').in('status', ['upcoming', 'listing', 'wanting']);
  if (error) throw error;
  const out: string[] = [];
  for (const ev of data as EventRow[]) {
    try {
      const m = await advance(ev, false);
      if (m) out.push(m);
    } catch (err) {
      console.error(`Evento ${ev.id}:`, err);
      out.push(`Error en "${ev.title}".`);
    }
  }
  return out;
}

/** Avanza una etapa si corresponde (o siempre, con force). Devuelve un mensaje si hizo algo. */
async function advance(ev: EventRow, force: boolean): Promise<string | null> {
  const now = new Date();
  const nowIso = now.toISOString();

  if (ev.status === 'upcoming' && (force || now >= new Date(ev.listing_starts_at))) {
    const patch: Record<string, string> = { status: 'listing' };
    if (force && now < new Date(ev.listing_starts_at)) patch.listing_starts_at = nowIso;
    if (!(await claim(ev, 'upcoming', patch))) return null;
    const n = await notify(ev, `¡Empezó "${ev.title}"! Cargá tus juegos`, (name) =>
      layout(
        'Ya podés cargar tus juegos',
        `<p>Hola ${escapeHtml(name)}, empezó la <strong>etapa 1</strong> de <em>${escapeHtml(ev.title)}</em>.</p>
         <p>Buscá cada juego que querés ofrecer, indicá su estado y el idioma. Tenés tiempo hasta el <strong>${fmt(ev.listing_ends_at)}</strong>.</p>`,
        `${APP_URL}/events/${ev.id}`,
        'Cargar mis juegos',
      ),
    );
    return `"${ev.title}": comenzó la etapa 1 (${n} emails).`;
  }

  if (ev.status === 'listing' && (force || now >= new Date(ev.listing_ends_at))) {
    const patch: Record<string, string> = { status: 'wanting' };
    if (force && now < new Date(ev.listing_ends_at)) patch.listing_ends_at = nowIso;
    if (!(await claim(ev, 'listing', patch))) return null;
    const n = await notify(ev, `Etapa 2 de "${ev.title}": elegí tus cambios`, (name) =>
      layout(
        'Ya podés elegir tus cambios',
        `<p>Hola ${escapeHtml(name)}, se cerró la carga de juegos de <em>${escapeHtml(ev.title)}</em>.</p>
         <p>Ahora podés ver todos los juegos ofrecidos y marcar, para cada uno de los tuyos, por cuáles lo cambiarías. Tenés tiempo hasta el <strong>${fmt(ev.wanting_ends_at)}</strong>.</p>`,
        `${APP_URL}/events/${ev.id}`,
        'Elegir mis cambios',
      ),
    );
    return `"${ev.title}": comenzó la etapa 2 (${n} emails).`;
  }

  if (ev.status === 'wanting' && (force || now >= new Date(ev.wanting_ends_at))) {
    const patch: Record<string, string> = { status: 'processing' };
    if (force && now < new Date(ev.wanting_ends_at)) patch.wanting_ends_at = nowIso;
    if (!(await claim(ev, 'wanting', patch))) return null;
    try {
      const summary = await runMatching(ev);
      await admin.from('events').update({ status: 'finished' }).eq('id', ev.id);
      const n = await notify(ev, `Resultados de "${ev.title}"`, (name) =>
        layout(
          'Ya están los resultados',
          `<p>Hola ${escapeHtml(name)}, se publicaron los intercambios de <em>${escapeHtml(ev.title)}</em>.</p>
           <p>Entrá para ver qué juego te toca recibir y a quién tenés que enviar el tuyo.</p>`,
          `${APP_URL}/events/${ev.id}`,
          'Ver mis resultados',
        ),
      );
      return `"${ev.title}": ${summary} (${n} emails).`;
    } catch (err) {
      // Dejar el evento en la etapa 2 para poder reintentar.
      await admin.from('events').update({ status: 'wanting' }).eq('id', ev.id);
      throw err;
    }
  }
  return null;
}

/** Cambia de estado solo si nadie más lo hizo antes (evita doble ejecución y doble email). */
async function claim(ev: EventRow, from: Status, patch: Record<string, string>): Promise<boolean> {
  const { data, error } = await admin.from('events').update(patch).eq('id', ev.id).eq('status', from).select('id');
  if (error) throw error;
  return (data?.length ?? 0) > 0;
}

function fmt(iso: string): string {
  return new Intl.DateTimeFormat('es-PY', { day: 'numeric', month: 'long', timeZone: 'America/Asuncion' }).format(new Date(iso));
}

async function notify(ev: EventRow, subject: string, html: (name: string) => string): Promise<number> {
  const { data: parts } = await admin
    .from('event_participants')
    .select('user_id, profiles(display_name)')
    .eq('event_id', ev.id);
  const people = new Map<string, string>();
  for (const p of (parts ?? []) as unknown as { user_id: string; profiles: { display_name: string } | null }[]) {
    people.set(p.user_id, p.profiles?.display_name ?? '');
  }
  const emails = await emailsFor(admin, new Set(people.keys()));
  const mails: Mail[] = [...emails].map(([id, to]) => ({ to, subject, html: html(people.get(id) ?? '') }));
  const { sent } = await sendEmails(mails);
  return sent;
}

async function emailsFor(client: SupabaseClient, ids: Set<string>): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  for (let page = 1; page <= 50 && out.size < ids.size; page++) {
    const { data, error } = await client.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw error;
    for (const u of data.users) if (ids.has(u.id) && u.email) out.set(u.id, u.email);
    if (data.users.length < 1000) break;
  }
  return out;
}

async function runMatching(ev: EventRow): Promise<string> {
  const { data: itemRows, error: e1 } = await admin
    .from('event_items')
    .select('id, owner_id, title, profiles(display_name)')
    .eq('event_id', ev.id)
    .order('created_at');
  if (e1) throw e1;
  const rows = (itemRows ?? []) as unknown as { id: string; owner_id: string; title: string; profiles: { display_name: string } | null }[];
  const ids = rows.map((r) => r.id);

  const wants = new Map<string, string[]>();
  for (let i = 0; i < ids.length; i += 200) {
    const { data, error } = await admin.from('item_wants').select('item_id, wanted_item_id').in('item_id', ids.slice(i, i + 200));
    if (error) throw error;
    for (const w of data ?? []) {
      const list = wants.get(w.item_id as string) ?? [];
      list.push(w.wanted_item_id as string);
      wants.set(w.item_id as string, list);
    }
  }

  const items: MatchItem[] = rows.map((r) => ({
    id: r.id,
    owner: r.owner_id,
    wants: (wants.get(r.id) ?? []).map((id) => ({ id })),
  }));

  // El algoritmo es O(n³) por iteración: menos iteraciones cuando hay muchos juegos.
  const n = items.length;
  const iterations = n <= 150 ? 30 : n <= 400 ? 5 : 1;
  const seed = Math.floor(Math.random() * 2 ** 31);
  const result = findTrades(items, { seed, iterations });

  // Archivo de entrada en formato TradeMaximizer, para que cualquiera pueda verificar el resultado.
  const code = new Map(rows.map((r, i) => [r.id, `G${String(i + 1).padStart(4, '0')}`]));
  const clean = (s: string) => s.replace(/[()\r\n]/g, ' ').trim();
  const lines = ['#! SMALL-STEP=0 LINEAR-PRIORITIES REQUIRE-COLONS REQUIRE-USERNAMES HIDE-ERRORS', '', '!BEGIN-OFFICIAL-NAMES'];
  for (const r of rows) lines.push(`${code.get(r.id)} ${clean(r.title)}`);
  lines.push('!END-OFFICIAL-NAMES', '');
  for (const r of rows) {
    const w = (wants.get(r.id) ?? []).map((id) => code.get(id)).filter(Boolean);
    lines.push(`(${clean(r.profiles?.display_name ?? r.owner_id)}) ${code.get(r.id)} : ${w.join(' ')}`);
  }

  // Reemplazar resultados previos (por si se reintenta).
  await admin.from('trades').delete().eq('event_id', ev.id);
  const tradeRows: Record<string, unknown>[] = [];
  result.cycles.forEach((cycle, c) => {
    cycle.forEach((itemId, pos) => {
      tradeRows.push({
        event_id: ev.id,
        item_id: itemId,
        receives_item_id: result.receives[itemId],
        cycle_no: c + 1,
        cycle_position: pos + 1,
      });
    });
  });
  for (let i = 0; i < tradeRows.length; i += 500) {
    const { error } = await admin.from('trades').insert(tradeRows.slice(i, i + 500));
    if (error) throw error;
  }
  {
    const { error } = await admin.from('event_results').upsert({ event_id: ev.id, stats: result.stats, seed, ran_at: new Date().toISOString() });
    if (error) throw error;
  }
  {
    const { error } = await admin.from('event_inputs').upsert({ event_id: ev.id, tm_input: lines.join('\n') + '\n' });
    if (error) throw error;
  }
  return `${result.stats.numTrades} intercambios de ${result.stats.numItems} juegos en ${result.stats.numGroups} grupos`;
}
