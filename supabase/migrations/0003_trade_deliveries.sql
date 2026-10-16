-- Seguimiento de entregas en el evento presencial.
-- En la fila (item_id, receives_item_id), delivered_at indica que receives_item_id ya llegó
-- al dueño de item_id. Cada juego intercambiado aparece una sola vez como receives_item_id,
-- así que hay exactamente un check por juego.

alter table public.trades
  add column delivered_at timestamptz,
  add column delivered_by uuid references public.profiles (id) on delete set null;

-- Los admins solo pueden tocar las columnas de entrega; el resto lo escribe service_role.
revoke update on public.trades from authenticated;
grant update (delivered_at, delivered_by) on public.trades to authenticated;

create policy trades_update on public.trades for update to authenticated
  using (public.is_admin() and public.event_status(event_id) = 'finished')
  with check (
    public.is_admin()
    and public.event_status(event_id) = 'finished'
    and (delivered_by is null or delivered_by = auth.uid())
  );
