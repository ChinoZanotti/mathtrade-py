-- Cache de búsquedas en BoardGameGeek.
-- Los términos de la XML API piden consultar desde el servidor y cachear los resultados,
-- así que `bgg-search` guarda acá cada búsqueda y la reutiliza mientras esté fresca.

create table public.bgg_search_cache (
  -- Texto buscado normalizado (minúsculas, espacios colapsados).
  query text primary key check (char_length(query) between 3 and 100),
  results jsonb not null,
  fetched_at timestamptz not null default now()
);
create index bgg_search_cache_fetched_idx on public.bgg_search_cache (fetched_at);

-- Solo la Edge Function (service_role) lee y escribe: RLS activada y sin políticas para usuarios.
alter table public.bgg_search_cache enable row level security;
revoke all on public.bgg_search_cache from anon, authenticated;
