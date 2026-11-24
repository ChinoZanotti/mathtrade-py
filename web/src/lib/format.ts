import type { EventStatus } from './types';

export const CONDITIONS: { value: string; label: string }[] = [
  { value: 'nuevo', label: 'Nuevo (sellado)' },
  { value: 'como_nuevo', label: 'Como nuevo' },
  { value: 'buen_estado', label: 'Buen estado' },
  { value: 'mucho_uso', label: 'Con mucho uso' },
  { value: 'faltan_piezas', label: 'Faltan piezas' },
];

export const LANGUAGES = ['Español', 'Inglés', 'Portugués', 'Independiente del idioma', 'Otro'];

export const conditionLabel = (v: string) => CONDITIONS.find((c) => c.value === v)?.label ?? v;

export const STAGES: { status: EventStatus; label: string; hint: string }[] = [
  { status: 'upcoming', label: 'Inscripción', hint: 'Inscribite para participar' },
  { status: 'listing', label: 'Etapa 1 · Cargar juegos', hint: 'Publicá los juegos que ofrecés' },
  { status: 'wanting', label: 'Etapa 2 · Elegir cambios', hint: 'Elegí por qué juegos cambiarías cada uno' },
  { status: 'processing', label: 'Calculando', hint: 'Buscando los mejores intercambios' },
  { status: 'finished', label: 'Resultados', hint: 'Intercambios publicados' },
];

export const statusLabel = (s: EventStatus) => STAGES.find((x) => x.status === s)?.label ?? s;

/** Qué tiene que hacer el usuario ahora y qué viene después, según la etapa y si está inscripto. */
export function stageGuide(status: EventStatus, joined: boolean): { now: string; next: string | null; cta: string | null } {
  switch (status) {
    case 'upcoming':
      return joined
        ? { now: 'Ya estás inscripto. Te avisamos por email cuando empiece la carga de juegos.', next: 'Etapa 1: cargar tus juegos', cta: null }
        : { now: 'Inscribite para participar.', next: 'Etapa 1: cargar tus juegos', cta: 'Inscribite' };
    case 'listing':
      return joined
        ? { now: 'Cargá los juegos que querés ofrecer.', next: 'Etapa 2: elegir qué aceptás a cambio', cta: 'Cargá tus juegos' }
        : { now: 'Todavía podés inscribirte y cargar tus juegos.', next: 'Etapa 2: elegir qué aceptás a cambio', cta: 'Inscribite' };
    case 'wanting':
      return joined
        ? { now: 'Elegí qué juegos aceptás a cambio de cada uno de los tuyos.', next: 'Resultados: qué entregás y qué recibís', cta: 'Elegí tus cambios' }
        : { now: 'La inscripción ya cerró.', next: null, cta: null };
    case 'processing':
      return { now: 'Estamos calculando los intercambios.', next: 'Resultados: qué entregás y qué recibís', cta: null };
    case 'finished':
      return joined
        ? { now: 'Ya están los resultados: mirá qué entregás y qué recibís.', next: 'Entrega presencial de los juegos', cta: 'Mirá tus resultados' }
        : { now: 'El evento terminó.', next: null, cta: null };
  }
}

export function formatDate(iso: string): string {
  return new Intl.DateTimeFormat('es-PY', { day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(iso));
}

export function formatDateTime(iso: string): string {
  return new Intl.DateTimeFormat('es-PY', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(iso));
}

/** Próxima fecha prevista según la etapa actual (las etapas las avanza un admin, no la fecha). */
export function stageDeadline(e: { status: EventStatus; listing_starts_at: string; listing_ends_at: string; wanting_ends_at: string }) {
  if (e.status === 'upcoming') return { label: 'Comienzo previsto', date: e.listing_starts_at };
  if (e.status === 'listing') return { label: 'Cierre previsto de la carga de juegos', date: e.listing_ends_at };
  if (e.status === 'wanting') return { label: 'Cierre previsto de la elección de cambios', date: e.wanting_ends_at };
  return null;
}
