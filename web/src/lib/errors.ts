/** Convierte errores de Supabase/red en mensajes claros en español para mostrar al usuario. */
export function friendlyError(err: unknown, fallback = 'No pudimos completar la acción. Probá de nuevo.'): string {
  const e = (typeof err === 'object' && err ? err : { message: String(err ?? '') }) as { message?: string; code?: string };
  const msg = e.message ?? '';
  // El detalle técnico queda en la consola para poder diagnosticar.
  if (msg) console.error('[mathtrade]', e.code ?? '', msg);

  if (/failed to fetch|networkerror|network request failed|load failed/i.test(msg)) {
    return 'No pudimos conectarnos. Revisá tu conexión a internet y probá de nuevo.';
  }
  if (/jwt expired|invalid jwt|refresh token/i.test(msg)) {
    return 'Tu sesión venció. Recargá la página y volvé a ingresar.';
  }
  if (e.code === '42501' || /row-level security|permission denied/i.test(msg)) {
    return 'No se pudo guardar: puede que la etapa ya haya cerrado o que no tengas permiso para esto. Recargá la página.';
  }
  if (e.code === '23505' || /duplicate key/i.test(msg)) {
    return 'Eso ya estaba guardado.';
  }
  return fallback;
}
