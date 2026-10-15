# Math Trade (mathtrade-py)

Web app para organizar Math Trades de juegos de mesa (comunidad de Paraguay). Dueño del proyecto: Chino. Responder y comentar el código en **español**; la interfaz de usuario también está en español.

## Cómo funciona un evento
Etapas (`events.status`): `upcoming` → `listing` → `wanting` → `processing` → `finished`.
1. Los usuarios crean cuenta y se inscriben (`event_participants`).
2. `listing` (~1 mes): cada uno carga sus juegos (`event_items`), buscándolos en BGG. Estado e idioma obligatorios.
3. `wanting` (~1 mes): cada uno ve el catálogo y, por cada juego propio, marca los juegos por los que lo cambiaría (`item_wants`).
4. Al cerrar, `advance-events` corre el algoritmo y guarda `trades`, `event_results` y `event_inputs`.

## Stack
- `web/`: React 18 + Vite + TypeScript, react-router, `@supabase/supabase-js`. CSS plano con variables en `web/src/styles.css`. Estilo "Caja de juego" (colores tipo meeple, botones tipo ficha, color por etapa), **solo tema claro** (no agregar modo oscuro), títulos en Outfit y texto en Nunito (Google Fonts en `web/index.html`).
- `supabase/migrations/`: esquema Postgres + RLS (la seguridad vive acá, no en el frontend).
- `supabase/functions/`: Edge Functions en Deno (`bgg-search`, `advance-events`) y código compartido en `_shared/`.
- `tests/`: tests del algoritmo con `node:test`.

## Comandos
- `npm test`: tests del algoritmo (Node 22.18+ ejecuta `.ts` directamente).
- `TM_JAR=/ruta/tm.jar npm run test:jar`: además compara contra TradeMaximizer (requiere Java).
- `npm --prefix web install` y `npm --prefix web run dev`: frontend en desarrollo.
- `npm --prefix web run build`: typecheck (`tsc --noEmit`) + build. Debe pasar siempre.
- Edge Functions: `deno check supabase/functions/*/index.ts` para tipos; deploy con `supabase functions deploy <nombre>`.

## Reglas importantes
- `supabase/functions/_shared/matcher.ts` es el corazón: no usar dependencias, debe correr igual en Deno y Node. Todo cambio ahí exige `npm test` y, si es posible, `test:jar`.
- Semántica del matcher: un juego propio se cambia por **uno** de los que el dueño marcó; nunca se intercambia entre juegos del mismo dueño; `rank` opcional (1 = más deseado), sin rank todos cuestan igual.
- Las listas de deseos (`item_wants`) son **privadas**: solo las ve el dueño del juego. No exponerlas en consultas, resultados ni logs.
- Toda tabla nueva lleva RLS activada y políticas explícitas. Las escrituras de resultados solo las hace `service_role` desde la Edge Function.
- No subir secretos: `web/.env` está en `.gitignore`. Los secretos de las funciones (`BGG_TOKEN`, `RESEND_API_KEY`, `CRON_SECRET`, `APP_URL`, `EMAIL_FROM`) se configuran con `supabase secrets set`.
- La API de BGG exige token y se consulta solo desde `bgg-search`, nunca desde el navegador.
- Cambios de esquema: nueva migración numerada (`0002_...sql`), no editar `0001_init.sql` una vez desplegada.

## Pendientes / ideas
- UI para priorizar opciones por juego (la base de datos y el algoritmo ya soportan `rank`).
- Protección contra recibir copias duplicadas del mismo juego (equivalente a los "dummy items" de TradeMaximizer).
- Deploy: Supabase (base + funciones) y Render Static Site para `web/` (reescribir todas las rutas a `index.html`).
- Para eventos de más de ~1000 juegos, correr el algoritmo fuera de la Edge Function (es O(n³) por iteración).
