# Avisos por etapa y regreso del jugador («¡Volviste!»)

Ideas 3 y 7 de las propuestas (13-nov-2026). Todo se apaga por tipo en el Centro de Control → **Notificaciones** → bloque
«Avisos por etapa y regreso».

| Archivo | Qué es |
|---|---|
| `server/src/Regreso.php` | Detectores (etapa, regreso, Liga/Duelos), correo de los 7 días, ausencias, regalo, oferta, estadísticas, interruptores |
| `server/src/RegresoApi.php` | `/api/regreso`, `/api/regreso/reclamar`, `/api/regreso/baja` (contrato en `server/API.md`) |
| `server/src/migraciones/regreso.sql` | `regreso_jugador`, `regreso_ausencias`, `regreso_avisos`, `regreso_marcas` (se aplica sola) |
| `server/public/control/lib/regreso.php` | Bloque del Centro de Control (enviados, volvieron, interruptores) |
| `js/regreso.js` | Ventana «¡Volviste!», franja de Inicio y la extensión de la lógica (ventaja de 3 días) |
| Ganchos pequeños | `Push.php` (categorías, tope 2, silencio en la hora del jugador, el recordatorio viejo no se repite), `CorreoPlantillas.php` (plantilla `regreso`), `Catalogo.php` (3 ofertas), `Compras.php`, `arranque.php`, `api.php`, `bin/push_enviar.php`, `js/logic.js` (`limites → xpEvento`) |

## Qué sale y cuándo
| Tipo | Cuándo | Texto (ejemplo) |
|---|---|---|
| `dia1` | 20–30 h después de crear la cuenta (si no está jugando) | «Tu equipo está listo: llegaron contratos nuevos…» |
| `dia2` | 44–54 h, si no reclamó el premio diario hoy | «Tu premio del día 2 está listo» |
| `dia3` | 68–78 h | «MegaVisión anda cerca…» |
| `liga2h` / `duelo2h` | entre 2 h 30 y 2 h antes del cierre de la Liga (domingo) o de la temporada de Duelos (fin de mes) | «Faltan 2 h… vas en el puesto N» |
| `regreso3` / `regreso7` / `regreso14` | 3, 7 y 14 días sin entrar (nunca después de 30) | «Te guardamos un regalo de regreso: 100 créditos…» |
| `correo7` | un solo correo por ausencia a los 7 días (correo válido, sin baja, de día en su hora) | «Tu productora te extraña: regalo de créditos» + enlace de baja |

Reglas: máximo 2 avisos al día (`Push::TOPE_REGRESO`, y nunca más que `PUSH_MAX_DIA`), nada de 22:00 a 08:00 en la zona del jugador
(la manda el juego al abrir; sin zona, la del juego), 20 h entre dos avisos del módulo (Liga/Duelos no cuentan) y nunca un aviso
nuevo si otro sigue esperando en la cola, nunca el mismo aviso dos veces, textos sobre la partida (nada de «compra ahora»).
Textos (`Regreso::TEXTOS`) y correo (`CorreoPlantillas`, claves `g_*`) en los 10 idiomas: el del aparato suscrito que el jugador
usó hace menos tiempo (`Push::idiomaJugador`); sin aparato, español.

## «¡Volviste!»
- Ausencia = 7+ días sin señal de vida (la registra la tarea del cron; si el cron no corrió, `/api/regreso` la reconoce con la
  última llamada anterior del juego).
- Regalo según los días fuera: 7 → 100 créditos + $2.000 + 3 cables + 3 baterías; 14 → 150 + $5.000 + 5 + 5 + reparar todo;
  30 → 250 + $10.000 + 8 + 8 + reparar todo. Lo entrega el servidor una vez por ausencia (`UPDATE … WHERE reclamado IS NULL`),
  hasta 7 días después de volver.
- 3 días de ventaja: los contratos nuevos pagan +25 % y el personal gana doble experiencia. La aplica `js/regreso.js` como extensión
  de la lógica, solo mirando `s.regreso` (determinista). Los intentos en línea no aplican extensiones: el validador da lo mismo.
- Oferta de regreso (una sola vez, 72 h): `regreso_s` $0,99 (nunca pagó o compraba poco), `regreso_m` $4,99, `regreso_l` $9,99
  según la compra más grande de los últimos 365 días. **Crear en Play Console** con esos IDs (`docs/PUBLICAR_GOOGLE_PLAY.md`);
  mientras no existan, dentro de la app la oferta no se muestra (en la web sí).

## Cron
Ya está: `bin/push_enviar.php` (cada minuto) llama a `Regreso::tarea()` antes de vaciar la cola, también sin llaves VAPID (así
salen los correos). La revisión de todas las cuentas corre como mucho cada 5 minutos.

## Pruebas
`php server/tests/pruebas_regreso.php` (en `correr.sh`) y `node tests/test_regreso.js`.
