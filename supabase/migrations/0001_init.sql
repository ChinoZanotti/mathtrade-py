-- Math Trade: esquema inicial
-- Etapas de un evento: upcoming -> listing -> wanting -> processing -> finished


-- ───────────────────────── Perfiles ─────────────────────────
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null check (char_length(display_name) between 2 and 60),
  is_admin boolean not null default false,
  created_at timestamptz not null default now()
);

-- El perfil se crea solo al registrarse. El nombre viene de los metadatos del signUp.
create function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, display_name)
  values (
    new.id,
    coalesce(nullif(trim(new.raw_user_meta_data ->> 'display_name'), ''), split_part(new.email, '@', 1))
  );
  return new;
end $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ───────────────────────── Eventos ─────────────────────────
create type public.event_status as enum ('upcoming', 'listing', 'wanting', 'processing', 'finished');

create table public.events (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(title) between 3 and 120),
  description text not null default '',
  status public.event_status not null default 'upcoming',
  listing_starts_at timestamptz not null,
  listing_ends_at timestamptz not null,
  wanting_ends_at timestamptz not null,
  created_by uuid references public.profiles (id),
  created_at timestamptz not null default now(),
  check (listing_starts_at < listing_ends_at and listing_ends_at < wanting_ends_at)
);

create table public.event_participants (
  event_id uuid not null references public.events (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  joined_at timestamptz not null default now(),
  primary key (event_id, user_id)
);

-- ───────────────────────── Juegos ofrecidos (etapa 1) ─────────────────────────
create table public.event_items (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events (id) on delete cascade,
  owner_id uuid not null references public.profiles (id) on delete cascade,
  bgg_id integer not null,
  title text not null check (char_length(title) between 1 and 200),
  year_published integer,
  thumbnail_url text,
  condition text not null check (condition in ('nuevo', 'como_nuevo', 'buen_estado', 'mucho_uso', 'faltan_piezas')),
  language text not null check (char_length(language) between 1 and 40),
  notes text not null default '' check (char_length(notes) <= 500),
  created_at timestamptz not null default now(),
  foreign key (event_id, owner_id) references public.event_participants (event_id, user_id) on delete cascade
);
create index event_items_event_idx on public.event_items (event_id);
create index event_items_owner_idx on public.event_items (owner_id);

-- ───────────────────────── Listas de deseos (etapa 2) ─────────────────────────
-- Cada fila: "por mi juego item_id acepto recibir wanted_item_id".
-- rank es opcional (1 = más deseado) para priorizar entre opciones aceptables.
create table public.item_wants (
  item_id uuid not null references public.event_items (id) on delete cascade,
  wanted_item_id uuid not null references public.event_items (id) on delete cascade,
  rank integer check (rank is null or rank >= 1),
  primary key (item_id, wanted_item_id),
  check (item_id <> wanted_item_id)
);
create index item_wants_wanted_idx on public.item_wants (wanted_item_id);

create function public.check_want() returns trigger
language plpgsql as $$
declare a public.event_items; b public.event_items;
begin
  select * into a from public.event_items where id = new.item_id;
  select * into b from public.event_items where id = new.wanted_item_id;
  if a.event_id <> b.event_id then
    raise exception 'Los juegos deben ser del mismo evento';
  end if;
  if a.owner_id = b.owner_id then
    raise exception 'No podés elegir un juego propio como opción de cambio';
  end if;
  return new;
end $$;

create trigger item_wants_check before insert or update on public.item_wants
  for each row execute function public.check_want();

-- ───────────────────────── Resultados ─────────────────────────
-- Fila (item_id, receives_item_id): el dueño de item_id recibe receives_item_id.
create table public.trades (
  event_id uuid not null references public.events (id) on delete cascade,
  item_id uuid not null references public.event_items (id) on delete cascade,
  receives_item_id uuid not null references public.event_items (id) on delete cascade,
  cycle_no integer not null,
  cycle_position integer not null,
  primary key (event_id, item_id)
);

create table public.event_results (
  event_id uuid primary key references public.events (id) on delete cascade,
  stats jsonb not null,
  seed integer not null,
  ran_at timestamptz not null default now()
);

-- Archivo de entrada en formato TradeMaximizer para verificar el resultado. Solo admins.
create table public.event_inputs (
  event_id uuid primary key references public.events (id) on delete cascade,
  tm_input text not null
);

-- ───────────────────────── Funciones auxiliares para RLS ─────────────────────────
create function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select is_admin from public.profiles where id = auth.uid()), false)
$$;

create function public.event_status(p_event uuid) returns public.event_status
language sql stable security definer set search_path = public as $$
  select status from public.events where id = p_event
$$;

create function public.is_participant(p_event uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.event_participants where event_id = p_event and user_id = auth.uid())
$$;

create function public.item_owner(p_item uuid) returns uuid
language sql stable security definer set search_path = public as $$
  select owner_id from public.event_items where id = p_item
$$;

create function public.item_event(p_item uuid) returns uuid
language sql stable security definer set search_path = public as $$
  select event_id from public.event_items where id = p_item
$$;

-- ───────────────────────── RLS ─────────────────────────
alter table public.profiles enable row level security;
alter table public.events enable row level security;
alter table public.event_participants enable row level security;
alter table public.event_items enable row level security;
alter table public.item_wants enable row level security;
alter table public.trades enable row level security;
alter table public.event_results enable row level security;
alter table public.event_inputs enable row level security;

-- profiles: nombres visibles para usuarios logueados; cada uno edita solo su nombre.
create policy profiles_select on public.profiles for select to authenticated using (true);
create policy profiles_update on public.profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());
revoke update on public.profiles from authenticated;
grant update (display_name) on public.profiles to authenticated;

-- events: lectura para todos los logueados; escritura solo admins.
create policy events_select on public.events for select to authenticated using (true);
create policy events_insert on public.events for insert to authenticated with check (public.is_admin());
create policy events_update on public.events for update to authenticated
  using (public.is_admin()) with check (public.is_admin());
create policy events_delete on public.events for delete to authenticated using (public.is_admin());

-- participantes: la lista es visible; cada uno se inscribe/baja a sí mismo.
create policy participants_select on public.event_participants for select to authenticated using (true);
create policy participants_insert on public.event_participants for insert to authenticated
  with check (user_id = auth.uid() and public.event_status(event_id) in ('upcoming', 'listing'));
create policy participants_delete on public.event_participants for delete to authenticated
  using (
    user_id = auth.uid()
    and public.event_status(event_id) in ('upcoming', 'listing')
  );

-- juegos: durante la etapa 1 cada uno ve solo los suyos; desde la etapa 2 los participantes ven todos.
create policy items_select on public.event_items for select to authenticated using (
  owner_id = auth.uid()
  or public.is_admin()
  or (public.is_participant(event_id) and public.event_status(event_id) in ('wanting', 'processing', 'finished'))
);
create policy items_insert on public.event_items for insert to authenticated with check (
  owner_id = auth.uid() and public.event_status(event_id) = 'listing'
);
create policy items_update on public.event_items for update to authenticated
  using (owner_id = auth.uid() and public.event_status(event_id) = 'listing')
  with check (owner_id = auth.uid() and public.event_status(event_id) = 'listing');
create policy items_delete on public.event_items for delete to authenticated
  using (owner_id = auth.uid() and public.event_status(event_id) = 'listing');

-- wantlists: privadas, solo las ve el dueño del juego; editables solo en la etapa 2.
create policy wants_select on public.item_wants for select to authenticated
  using (public.item_owner(item_id) = auth.uid());
create policy wants_insert on public.item_wants for insert to authenticated
  with check (
    public.item_owner(item_id) = auth.uid()
    and public.event_status(public.item_event(item_id)) = 'wanting'
  );
create policy wants_update on public.item_wants for update to authenticated
  using (public.item_owner(item_id) = auth.uid() and public.event_status(public.item_event(item_id)) = 'wanting')
  with check (public.item_owner(item_id) = auth.uid() and public.event_status(public.item_event(item_id)) = 'wanting');
create policy wants_delete on public.item_wants for delete to authenticated
  using (
    public.item_owner(item_id) = auth.uid()
    and public.event_status(public.item_event(item_id)) = 'wanting'
  );

-- resultados: visibles para los participantes una vez finalizado el evento.
create policy trades_select on public.trades for select to authenticated using (
  public.event_status(event_id) = 'finished' and (public.is_participant(event_id) or public.is_admin())
);
create policy results_select on public.event_results for select to authenticated using (
  public.event_status(event_id) = 'finished' and (public.is_participant(event_id) or public.is_admin())
);
create policy inputs_select on public.event_inputs for select to authenticated using (public.is_admin());

-- Quién recibe mi juego: los nombres de los otros dueños salen de profiles + event_items (ya visibles al finalizar).
-- Las escrituras en trades/event_results/event_inputs las hace solo la Edge Function con service_role.
