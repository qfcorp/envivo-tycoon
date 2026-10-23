# Integrar: endurecimiento de producción (módulo ops)

Rama del ayudante de operación. Todo lo nuevo vive en `server/deploy/ops/`, `docs/` y `tests/carga/`; abajo, los
cambios en archivos **compartidos** (para revisar al unir).

## Archivos nuevos

| Archivo | Qué es |
|---|---|
| `server/deploy/ops/pool_fpm.sh` | Librería (se carga con `.`): grupo propio de PHP `[envivo]` (`/etc/php/8.3/fpm/pool.d/envivo.conf`, socket `/run/php/php8.3-fpm-envivo.sock`, `pm=dynamic`, tope por RAM 4–12 o `FPM_MAX_HIJOS`, `request_terminate_timeout=100s`, slowlog 5 s en `/var/log/envivo-php-lento.log`). `php-fpm8.3 -t` antes y después; si falla, deja todo como estaba y no recarga. Nunca toca `www.conf`. |
| `server/deploy/ops/cloudflare_ips.sh` + `cloudflare-ips.txt` | Rangos de Cloudflare → `/etc/nginx/snippets/envivo-cloudflare-realip.conf` (solo lo incluye el sitio del juego) y `/etc/nginx/conf.d/envivo-cloudflare-geo.conf` (`$envivo_desde_cf`). Cron `/etc/cron.d/envivo-cloudflare` (lunes 4:41). Valida, `nginx -t`, vuelve atrás. |
| `server/deploy/ops/mantenimiento.sh` | Modo mantenimiento del juego (`/etc/envivo/MANTENIMIENTO` → nginx 503 JSON en `/api/` y `/pago.php`; exentos `/api/salud`, `/api/plux/webhook`, `/api/plux/3ds`; `--discord` publica en el canal de estado). |
| `server/deploy/ops/probar_restauracion.sh` | Simulacro: restaura el último respaldo (restic `restore latest --path /var/backups/envivo` o local) a una carpeta temporal, `integrity_check`, conteos, tar de config, antigüedad; `ULTIMO_SIMULACRO`. |
| `tests/carga/k6_juego.js`, `preparar_cuentas.php`, `correr_local.sh` | Prueba de carga k6 (~300 jugadores: estado, chat cada 3–20 s, entrar, desafío empezar/terminar, salud). |
| `docs/CLOUDFLARE_PRODUCCION.md`, `docs/MONITOREO.md`, `docs/INCIDENTES.md`, `docs/PRUEBA_CARGA.md` | Guías en español para el dueño. |

## Cambios en archivos compartidos (mínimos)

| Archivo | Cambio |
|---|---|
| `server/public/api.php` | +1 línea antes del `match` (`if ($ruta === '/salud') api_salud($metodo);`, junto a los webhooks: sin sesión ni `X-Envivo`) y la función `api_salud()` (GET/HEAD → `{ok, servicio, db, mantenimiento, hora}`; 503 si la base no responde). |
| `server/deploy/nginx-sitio.sh` | IP real: `include` del snippet de Cloudflare si existe (si no, la lista fija de siempre, sin cambios); `solo_cf()` opcional (marca `/etc/envivo/solo-cloudflare`); bloque de mantenimiento a nivel server (`set`/`if`/`return 503` + `location @envivo_503`); 3 `limit_req` más en `/api/` (`envivo_error`, `envivo_eventos`, `envivo_api`). |
| `server/deploy/ops/nginx-envivo-limites.conf` | Zonas `envivo_error` (POST `/api/error(es)`, 30/min), `envivo_eventos` (POST `/api/eventos`, 60/min) y `envivo_api` (todo `/api/`, 20/s +200, sin contar 127.0.0.1). |
| `server/deploy/instalar.sh` | Paso 8b (grupo PHP → `SOCK`), paso 9 llama `cloudflare_ips.sh --instalar`, línea `9)` del RESULTADO, vuelve a la rama si la copia quedó en una versión anterior. |
| `server/deploy/actualizar.sh` | `--version COMMIT` y `--anterior` (rollback; solo commits de `origin/main`; usa el `comun.sh`/`pool_fpm.sh` de la versión actual), vuelve a la rama si estaba fuera, `/etc/envivo/versiones.log`, paso 5 `revisar_pool_fpm`. |
| `server/deploy/ops/salud_envivo.sh` | Revisa el socket del grupo del juego si existe; en mantenimiento avisa "MODO MANTENIMIENTO" (cada 12 h) en vez de "responde mal". |
| `server/deploy/ops/respaldo_envivo.sh` | Ping opcional a Healthchecks.io (`HC_RESPALDO=` en `ops.env`; `/fail` si falla). |
| `server/deploy/ops/envivo.logrotate` | `envivo-cloudflare.log` y `envivo-php-lento.log` (copytruncate). |
| `docs/OPERACION.md` | Paso 5 (simulacro), filas de avisos y comandos. `docs/DESPLIEGUE.md`: 1 fila + enlaces a las guías nuevas. |
| `tests/ensayo_vps.sh` | Checks nuevos: 1b (grupo PHP, www.conf intacto, Cloudflare, `/api/salud`, IP real), 7b (rollback), 8b (mantenimiento), 8c (simulacro local, roto y restic), 8d (cloudflare_ips y "solo Cloudflare"); limpieza de los archivos nuevos. |
| `tests/ensayo_vps.cjs` | El check de Liga sin asociación acepta la pantalla nueva (`data-liga="crear"/"unirme"`, desde de5b3ff): fallaba antes de este cambio. |

## Pruebas (23-oct-2026, este contenedor: Ubuntu 24.04, nginx 1.24, PHP 8.3, restic 0.16.4, k6 0.54.0)

- `tests/ensayo_vps.sh`: **87 OK, 0 fallas** (antes 57 OK + 1 falla ya existente del check de Liga, arreglada).
- `server/deploy/ops/probar_ops.sh`: **123 OK, 0 fallas**. `server/tests/correr.sh`: **75 OK, 0 fallas** (pruebas.php 639/0).
- `shellcheck -S warning` sin avisos en los scripts nuevos/cambiados.
- k6 local (`tests/carga/correr_local.sh`, 2 CPU compartidas, carga ~40): ver docs/PRUEBA_CARGA.md (20 jugadores sin
  errores; 300 satura la máquina de pruebas: 19–26 req/s, 0–0,7 % 5xx).

## Para el coordinador

- Si otro módulo agrega `/api/error` o `/api/eventos`, las zonas ya existen (por POST). Si usa otra ruta, sumarla en
  `nginx-envivo-limites.conf`.
- Un sitio nuevo bajo el dominio del juego que use PHP debe usar `$SOCK` (ya apunta al grupo propio).
