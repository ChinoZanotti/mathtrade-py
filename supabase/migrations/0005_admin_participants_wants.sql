-- Panel de participantes: agrega cuántos juegos de cada participante ya tienen al menos
-- una opción de cambio elegida (etapa 2). Solo expone ese conteo, nunca qué juegos
-- eligió cada uno: las listas de item_wants siguen siendo privadas.
-- Cambia el tipo de retorno, por eso hay que borrar y recrear la función.

drop function public.admin_event_participants(uuid);

create function public.admin_event_participants(p_event uuid)
returns table (user_id uuid, display_name text, email text, joined_at timestamptz, items bigint, items_with_wants bigint)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_admin() then
    raise exception 'Solo administradores';
  end if;
  return query
    select p.user_id, pr.display_name, u.email::text, p.joined_at, count(i.id),
      count(i.id) filter (where exists (select 1 from public.item_wants w where w.item_id = i.id))
    from public.event_participants p
    join public.profiles pr on pr.id = p.user_id
    join auth.users u on u.id = p.user_id
    left join public.event_items i on i.event_id = p.event_id and i.owner_id = p.user_id
    where p.event_id = p_event
    group by p.user_id, pr.display_name, u.email, p.joined_at;
end $$;

revoke execute on function public.admin_event_participants(uuid) from public, anon;
grant execute on function public.admin_event_participants(uuid) to authenticated;
