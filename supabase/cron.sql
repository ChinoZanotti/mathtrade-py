-- Tarea programada: cada 15 minutos revisa si algún evento debe pasar de etapa.
-- Ejecutalo UNA vez en el SQL Editor de Supabase, reemplazando los valores marcados.
-- Antes: Database > Extensions > habilitar pg_cron y pg_net.

select cron.schedule(
  'mathtrade-advance-events',
  '*/15 * * * *',
  $$
  select net.http_post(
    url := 'https://TU-PROYECTO.supabase.co/functions/v1/advance-events',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', 'EL-MISMO-VALOR-QUE-CRON_SECRET'),
    body := '{}'::jsonb
  );
  $$
);
