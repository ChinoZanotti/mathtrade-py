import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

export const isConfigured = Boolean(url && key);

// Leer el hash ANTES de crear el cliente: supabase-js lo procesa y lo borra de la URL.
// Así detectamos si se entró desde un link de "Recuperar contraseña" (o si el link venció).
const hash = new URLSearchParams(typeof window !== 'undefined' ? window.location.hash.slice(1) : '');
export const recoveryInUrl = hash.get('type') === 'recovery';
export const authErrorInUrl = hash.get('error_code');

export const supabase = createClient(url ?? 'http://localhost:54321', key ?? 'missing-key');
