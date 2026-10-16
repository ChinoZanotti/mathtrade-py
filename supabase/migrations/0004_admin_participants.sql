-- Panel de participantes para admins: inscriptos, emails y cantidad de juegos cargados.
-- El email vive en auth.users (no accesible desde el navegador), por eso se expone con
-- una función security definer que solo responde a admins. No toca item_wants.

create function public.admin_event_participants(p_event uuid)
returns table (user_id uuid, display_name text, email text, joined_at timestamptz, items bigint)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_admin() then
    raise exception 'Solo administradores';
  end if;
  return query
    select p.user_id, pr.display_name, u.email::text, p.joined_at, count(i.id)
    from public.event_participants p
    join public.profiles pr on pr.id = p.user_id
    join auth.users u on u.id = p.user_id
    left join public.event_items i on i.event_id = p.event_id and i.owner_id = p.user_id
    where p.event_id = p_event
    group by p.user_id, pr.display_name, u.email, p.joined_at;
end $$;

revoke execute on function public.admin_event_participants(uuid) from public, anon;
grant execute on function public.admin_event_participants(uuid) to authenticated;
