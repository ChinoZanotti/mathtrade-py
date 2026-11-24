-- Correcciones de la revisión de seguridad (Case, 2026-11-24).

-- ───────── 1. Cada participante ve solo sus propios intercambios ─────────
-- Antes cualquier participante leía todos los trades del evento por la API (la interfaz
-- los ocultaba, pero RLS no). Con los ciclos completos se podía deducir "el dueño de X
-- marcó a Y", es decir, parte de las listas de deseos, que son privadas.
-- Ahora: los admins ven todo; un participante ve la fila de lo que recibe
-- (item_id es suyo) y la fila de quien recibe su juego (receives_item_id es suyo).
-- Es justo lo que necesita ResultsStage.
drop policy trades_select on public.trades;
create policy trades_select on public.trades for select to authenticated using (
  public.event_status(event_id) = 'finished' and (
    public.is_admin()
    or public.item_owner(item_id) = auth.uid()
    or public.item_owner(receives_item_id) = auth.uid()
  )
);

-- ───────── 2. check_want no debe depender de lo que el usuario puede ver ─────────
-- Antes corría con el RLS del usuario: si el juego deseado era de un evento que no veía,
-- el select devolvía NULL, las comparaciones daban NULL y el insert pasaba.
-- Con security definer lee los dos juegos siempre y rechaza si falta alguno.
create or replace function public.check_want() returns trigger
language plpgsql security definer set search_path = public as $$
declare a public.event_items; b public.event_items;
begin
  select * into a from public.event_items where id = new.item_id;
  select * into b from public.event_items where id = new.wanted_item_id;
  if a.id is null or b.id is null or a.event_id is distinct from b.event_id then
    raise exception 'Los juegos deben ser del mismo evento';
  end if;
  if a.owner_id = b.owner_id then
    raise exception 'No podés elegir un juego propio como opción de cambio';
  end if;
  return new;
end $$;

-- Limpieza: borrar deseos que ya hayan quedado cruzando eventos o apuntando a un juego propio.
delete from public.item_wants w
using public.event_items a, public.event_items b
where a.id = w.item_id
  and b.id = w.wanted_item_id
  and (a.event_id <> b.event_id or a.owner_id = b.owner_id);
