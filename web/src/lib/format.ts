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

/** Próxima fecha límite según la etapa actual. */
export function stageDeadline(e: { status: EventStatus; listing_starts_at: string; listing_ends_at: string; wanting_ends_at: string }) {
  if (e.status === 'upcoming') return { label: 'Comienza', date: e.listing_starts_at };
  if (e.status === 'listing') return { label: 'Cierra la carga de juegos', date: e.listing_ends_at };
  if (e.status === 'wanting') return { label: 'Cierra la elección de cambios', date: e.wanting_ends_at };
  return null;
}
