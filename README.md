<img src="web/public/brand/logo-horizontal.svg" alt="Math Trade PY" width="360">

# Math Trade

Los logos, isotipo y favicons están en [`web/public/brand/`](web/public/brand/).

Web app para organizar *Math Trades* de juegos de mesa: inscripción, carga de juegos (con datos de BoardGameGeek),
elección de cambios y cálculo automático de los intercambios (ciclos) que maximizan la cantidad de trades.

## Flujo

1. Los usuarios crean cuenta y se **inscriben** al evento.
2. **Etapa 1 (≈1 mes):** cada participante busca sus juegos en BGG y los carga con *estado* e *idioma* obligatorios y observaciones opcionales. Recibe un email al empezar.
3. **Etapa 2 (≈1 mes):** todos ven el catálogo completo (lo propio marcado como "Tuyo") y, por cada juego propio, marcan **todos** los juegos por los que lo cambiarían. Sin marcas = no se intercambia.
4. Al cerrar, se ejecuta el algoritmo y se publican los resultados (cada quien ve qué recibe y a quién envía). Los admins pueden descargar el archivo de entrada en formato TradeMaximizer para verificar el resultado con `tm.jar`.

## Estructura

| Carpeta | Contenido |
|---|---|
| `web/` | Frontend React + Vite + TypeScript |
| `supabase/migrations/` | Esquema Postgres + políticas RLS |
| `supabase/functions/bgg-search` | Proxy a la API de BGG (guarda el token) |
| `supabase/functions/advance-events` | Cambia de etapa, corre el algoritmo y manda emails |
| `supabase/functions/_shared/matcher.ts` | Algoritmo de matching (port de TradeMaximizer, algoritmo húngaro) |
| `supabase/cron.sql` | Tarea programada que revisa las fechas cada 15 min |
| `tests/` | Tests del algoritmo, comparados contra `tm.jar` |

## Puesta en marcha

1. **Supabase:** crear proyecto y ejecutar `supabase/migrations/0001_init.sql` en el SQL Editor (o `supabase db push`).
2. **Primer admin:** registrarte en la app y luego, en el SQL Editor:
   `update profiles set is_admin = true where id = (select id from auth.users where email = 'tu@email.com');`
3. **Secretos de las funciones** (`supabase secrets set ...`):
   - `BGG_TOKEN`: token de aplicación de BoardGameGeek (la API XML ahora lo exige; se solicita en https://boardgamegeek.com/applications).
   - `RESEND_API_KEY` y `EMAIL_FROM`: para los emails (https://resend.com; verificá tu dominio para enviar a cualquiera).
   - `APP_URL`: URL pública de la web (para los links de los emails).
   - `CRON_SECRET`: cadena larga aleatoria.
4. **Deploy de funciones:** `supabase functions deploy bgg-search advance-events`.
5. **Cron:** habilitar `pg_cron` y `pg_net`, editar y ejecutar `supabase/cron.sql`.
6. **Frontend:** `cp web/.env.example web/.env`, completar URL y anon key, `npm --prefix web install && npm --prefix web run dev`. 
7. **Deploy en Render:** New → Blueprint → elegir este repo (usa `render.yaml`: Static Site desde `web/`, reescritura de rutas a `index.html`). Cargar `VITE_SUPABASE_URL` y `VITE_SUPABASE_ANON_KEY` en el panel.
8. **Supabase Auth → URL Configuration:** Site URL = URL de Render; en Redirect URLs, esa URL y `http://localhost:5173/**`. El SMTP por defecto de Supabase manda pocos emails por hora: para pruebas se puede desactivar "Confirm email"; para uso real, configurar un SMTP propio (p. ej. Resend) y reactivarlo.

## Tests

```bash
npm test                                  # tests del algoritmo
TM_JAR=/ruta/tm.jar npm run test:jar      # además compara 40 casos aleatorios contra tm.jar (requiere Java)
```

## Notas de diseño

- Un juego propio se cambia por **uno** de los que marcás; un mismo usuario puede recibir varios juegos si ofreció varios. Dos juegos del mismo dueño nunca se intercambian entre sí.
- Las listas de deseos son privadas (solo las ve su dueño); el resultado muestra únicamente los cambios concretados.
- El algoritmo es O(n³) por iteración: con hasta unos cientos de juegos corre en segundos. Para eventos enormes (>1000 juegos) conviene correrlo fuera de la Edge Function.
- La tabla `item_wants.rank` ya admite prioridades (1 = más deseado) y el algoritmo las respeta; la interfaz todavía no las expone.
