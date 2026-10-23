# Incidentes: qué hacer cuando algo sale mal (runbook)

Guía para cuando llega una alerta (Telegram del VPS, UptimeRobot, Healthchecks) o un jugador avisa que algo no anda.
Todo son comandos para copiar y pegar en PuTTY. **Nada de esto toca el ERP ni TuPass**, salvo donde se dice.

Regla de oro: **primero mira, después toca.** Y anota la hora de cada cosa que hagas (sirve para el informe del final
y, si hubo datos personales de por medio, la ley pide fechas).

---

## 0. Los primeros 5 minutos

```
curl -s --resolve juego.tukanec.com:443:127.0.0.1 https://juego.tukanec.com/api/salud ; echo
sudo DRY_RUN=1 salud_envivo.sh
systemctl is-active nginx php8.3-fpm envivo-validador ; ls /run/php/ ; df -h / /var/lib/envivo
```

| Lo que ves | Ve a |
|---|---|
| `/api/salud` no responde o da 502/503, o `salud_envivo.sh` dice "NO responde" / "socket de PHP" | 1 |
| Algo se rompió justo después de `actualizar.sh` | 3 |
| Pagos rechazados / "pagos fallidos" / Plux no contesta | 4 |
| Datos raros o borrados en la base, "database disk image is malformed" | 5 |
| Alguien pudo ver o llevarse datos de jugadores (correos, nombres, claves) | 6 |
| Ataque: miles de peticiones, "muchas peticiones frenadas por el límite" | 7 |
| Todo bien desde el VPS, pero UptimeRobot dice caído | Cloudflare/DNS/OVH: https://www.cloudflarestatus.com y https://www.status-ovhcloud.com |

Si vas a tardar en arreglarlo, **avisa ya** a los jugadores (sección 8) y enciende el **modo mantenimiento** (sección 2).

---

## 1. El juego no responde

1. **PHP del juego** (el juego tiene su propio grupo de PHP; el ERP y TuPass usan otro):

```
ls -l /run/php/php8.3-fpm-envivo.sock ; sudo tail -n 30 /var/log/php8.3-fpm.log ; sudo tail -n 20 /var/log/envivo-php-lento.log
```

   - `server reached pm.max_children setting` en el registro = el juego se quedó sin procesos de PHP (mucha gente o algo
     lento). Mira `envivo-php-lento.log` (dice qué estaba haciendo cada petición lenta). Si es solo mucha gente, súbelo:
     `sudo FPM_MAX_HIJOS=16 bash /var/www/envivo/server/deploy/instalar.sh`.
   - Para reiniciar PHP (es suave: el ERP y TuPass no pierden peticiones): `sudo systemctl reload php8.3-fpm`
2. **nginx:** `sudo nginx -t && sudo systemctl reload nginx`. Si `nginx -t` falla, **no** reinicies nginx (se caerían los
   3 sitios): mándame el mensaje.
3. **Validador de partidas** (eventos en línea, duelos, desafío): `sudo systemctl restart envivo-validador` y
   `sudo journalctl -u envivo-validador -n 30`. Si está caído, el juego sigue: las partidas quedan "pendientes" y se revisan solas después.
4. **Disco lleno** (`df -h` en 100 %): `sudo du -xh /var/log /var/backups | sort -h | tail -n 15` y mándamelo.
   No borres archivos de `/var/lib/envivo`.

---

## 2. Modo mantenimiento

Hay dos, según lo que necesites:

| | Qué frena | Cómo |
|---|---|---|
| **Mantenimiento de la tienda** | Solo las compras con dinero real (Plux y Google Play). El juego sigue. | Centro de Control → Ajustes → Mantenimiento de la tienda |
| **Mantenimiento del juego** | Todo `/api/` y `/pago.php` (nadie escribe en la base). | El comando de abajo |

```
sudo bash /var/www/envivo/server/deploy/ops/mantenimiento.sh on --minutos 30 --discord "Estamos haciendo un ajuste en el servidor. Tu partida está a salvo."
```

- Los jugadores ven "El juego está en mantenimiento…" y pueden seguir jugando sin conexión (la partida se guarda en el
  celular y se sube al volver).
- Siguen funcionando: `/api/salud` (dice `"mantenimiento":true`), los **avisos de pago de Plux** (un pago ya hecho no se
  pierde), y el Centro de Control. El chequeo de salud avisa cada 12 h que sigue encendido.
- Ver cómo está: `sudo bash /var/www/envivo/server/deploy/ops/mantenimiento.sh estado`
- Apagarlo:

```
sudo bash /var/www/envivo/server/deploy/ops/mantenimiento.sh off --discord "Listo, ya volvimos. ¡Gracias por la paciencia!"
```

> Si es un mantenimiento **programado**, pon antes un anuncio en el juego (Centro de Control → Ajustes → Anuncio en el
> juego, con fecha de fin) y pausa los monitores de UptimeRobot.

---

## 3. Volver a la versión anterior del juego (rollback)

Si algo se rompió justo después de `actualizar.sh`:

```
sudo bash /var/www/envivo/server/deploy/actualizar.sh --anterior
```

Vuelve el **programa** a la versión que había antes de la última actualización (la lista está en
`/etc/envivo/versiones.log`). Para elegir otra: mira la lista y usa su código:

```
git -C /var/www/envivo log --oneline -15 origin/main
sudo bash /var/www/envivo/server/deploy/actualizar.sh --version abc1234
```

- Solo acepta versiones que están en GitHub (rama `main`). Reinicia el validador si cambió la lógica y recarga PHP.
- **La base de datos NO vuelve atrás** (las cuentas, compras y partidas de hoy se quedan). Las tablas nuevas que haya
  creado la versión mala no molestan a la vieja. Si la versión mala **dañó datos**, además ve a la sección 5.
- Con Cloudflare en naranja: **purga la caché** (docs/CLOUDFLARE_PRODUCCION.md, paso 5).
- Cuando el arreglo ya esté en GitHub, vuelve a lo último con el comando normal: `sudo bash /var/www/envivo/server/deploy/actualizar.sh`

---

## 4. Plux o Google Play caídos (pagos)

**Plux** (tarjetas): síntomas: alerta "pagos fallidos", jugadores que dicen que la tarjeta "no pasa".

1. Mira las últimas compras: Centro de Control → Compras (estado y paso de Plux).
2. Pregunta a soporte de Plux si tienen una caída (es la misma cuenta y la misma integración de TuPass: si TuPass
   también falla, es Plux).
3. Mientras Plux no funcione: **Mantenimiento de la tienda** (sección 2), con un mensaje como
   "Los pagos con tarjeta están en pausa por un problema del banco. Tus créditos están a salvo."
4. Cuando vuelva: apágalo. Los pagos que quedaron "pendientes" se aclaran con el aviso de Plux; los que en Plux salen
   **pagados** pero en el juego no, aparecen como "avisos nuevos" en el Centro de Control: acredítalos a mano desde ahí.

**Google Play** (compras de la app de Android): el servidor reintenta solo cada 6 horas (`google_anulados.php`). Si
Google tiene una caída (https://status.cloud.google.com), no hay que hacer nada; si dura horas, usa el mantenimiento de
la tienda. Los reembolsos y contracargos de Google se descuentan solos cuando Google vuelve.

---

## 5. Restaurar la base de datos

⚠️ Todo lo que pasó **después** del respaldo elegido se pierde (cuentas nuevas, compras, partidas). Antes, **escríbeme**.

```
sudo bash /var/www/envivo/server/deploy/ops/mantenimiento.sh on --discord "Mantenimiento de emergencia: volvemos en unos minutos."
sudo respaldo_envivo.sh --listar
sudo respaldo_envivo.sh --restaurar envivo-AAAAMMDD-HHMMSS.sqlite.gz
sudo bash /var/www/envivo/server/deploy/ops/probar_restauracion.sh --local
sudo bash /var/www/envivo/server/deploy/ops/mantenimiento.sh off
```

`--restaurar` revisa el respaldo, guarda **antes** una copia de la base actual y pide escribir **SI**.

**Si el respaldo bueno solo está en la laptop (restic):**

```
sudo restic -r sftp:respaldo.qfradioec.com:/erp_qf --password-file /etc/restic/password_erp_qf restore latest --path /var/backups/envivo --target /var/tmp/restic-envivo --include /var/backups/envivo/diario
sudo ls /var/tmp/restic-envivo/var/backups/envivo/diario/
sudo respaldo_envivo.sh --restaurar /var/tmp/restic-envivo/var/backups/envivo/diario/envivo-AAAAMMDD-HHMMSS.sqlite.gz
sudo rm -rf /var/tmp/restic-envivo
```

**Compras perdidas:** las compras pagadas en Plux después de la hora del respaldo no están en la base restaurada.
Búscalas en el panel de Plux (por hora) y acredita esos créditos a mano desde el Centro de Control (Jugadores → créditos).

---

## 6. Brecha de datos personales (Ecuador, LOPDP)

Es "brecha" (vulneración de seguridad) cuando alguien que no debía pudo **ver, copiar, cambiar o borrar** datos de
jugadores: correos, nombres, alias, IPs, mensajes del chat, historial de compras. (El juego **no guarda números de
tarjeta**: eso lo maneja Plux.)

**Plazos de la Ley Orgánica de Protección de Datos Personales (arts. 43 y 46) — confírmalos con tu abogado:**

| A quién | Cuándo | Qué |
|---|---|---|
| **Superintendencia de Protección de Datos Personales** y **ARCOTEL** | Lo antes posible y **a más tardar en 5 días** (término: días hábiles) desde que te enteras | Notificación de la vulneración |
| **Los jugadores afectados** | **En 3 días** (término) si la brecha puede poner en riesgo sus derechos (por ejemplo, se filtraron correos y claves) | Aviso claro, en lenguaje sencillo, con qué hacer |

### Pasos

1. **Cortar** (la primera hora):
   - Si sigue pasando: modo mantenimiento (sección 2).
   - Cambiar las claves que pudieron verse, en `sudo nano /etc/envivo/config.env` (**no** borres el archivo): clave y
     código del Centro de Control (`ENVIVO_ADMIN_CLAVE_HASH` y `ENVIVO_ADMIN_TOTP`, docs/DESPLIEGUE.md paso 6), claves de
     Plux (pide unas nuevas a Plux), `DISCORD_BOT_TOKEN`, `VALIDADOR_CLAVE` (déjala vacía, borra `/etc/envivo/validador.clave` y
     corre `actualizar.sh`: pone una nueva en los dos), y la llave de Google Play (`/etc/envivo/google-play.json`). Después: `sudo systemctl reload php8.3-fpm`.
   - Cerrar la sesión de todos los jugadores (tendrán que entrar otra vez):
     `sudo -u www-data sqlite3 /var/lib/envivo/envivo.sqlite "DELETE FROM sesiones;"`
2. **Guardar evidencia** (antes de que roten los registros):
   `sudo tar -czf /root/incidente-$(date +%Y%m%d-%H%M).tar.gz /var/log/nginx /var/log/envivo-*.log /var/log/php8.3-fpm.log /etc/envivo/versiones.log`
3. **Medir:** qué datos, de cuántos jugadores, desde cuándo, cómo entraron. Anota todo con fecha y hora.
4. **Notificar a la Superintendencia y a ARCOTEL** (5 días hábiles). La notificación debe decir, como mínimo:
   - qué pasó (naturaleza de la vulneración) y cuándo te enteraste;
   - qué tipos de datos y **cuántos titulares** (aproximado) están afectados;
   - nombre y contacto del responsable (QF Producciones / RUC, correo de soporte) y del delegado de protección de datos si lo hay;
   - las consecuencias probables para los jugadores;
   - qué medidas tomaste y vas a tomar.
5. **Avisar a los jugadores** (3 días hábiles si hay riesgo): por correo, anuncio en el juego y Discord (plantilla en la
   sección 8). Lista de correos de las cuentas activas:
   `sudo -u www-data sqlite3 -csv /var/lib/envivo/envivo.sqlite "SELECT email, nombre FROM jugadores WHERE estado = 'activo'" > /root/afectados.csv`
   (guárdala solo el tiempo necesario y bórrala después).
6. **Registro del incidente:** guarda la línea de tiempo, qué se notificó y cuándo (la Superintendencia puede pedirlo).

---

## 7. Ataque (muchas peticiones, robots)

- nginx ya frena por IP (entrar, registro, pago, chat, y un tope general de `/api/`): mira cuántos frenó en la última hora
  con `sudo DRY_RUN=1 salud_envivo.sh`.
- Con Cloudflare en naranja: Security → Settings → **Security Level: I'm Under Attack** por unas horas (frena también a
  Plux: avisa en la tienda), o una regla de bloqueo por país/IP en Security → WAF → Custom rules.
- Si todavía estás en nube gris y el ataque es grande: pon la nube naranja (docs/CLOUDFLARE_PRODUCCION.md, paso 6).

---

## 8. Comunicación (plantillas)

Por dónde: **Discord** (`#estado`, o `mantenimiento.sh --discord "..."`), **anuncio en el juego** (Centro de Control →
Ajustes → Anuncio en el juego; solo se ve si la API responde) y **correo** (para brechas o cuando la cuenta del jugador
está en juego).

**Caída:**
> 🔴 Estamos teniendo un problema con el servidor de EN VIVO Tycoon. Tu partida está guardada en tu celular y tus compras
> están a salvo. Te avisamos aquí apenas vuelva.

**Mantenimiento programado:**
> 🛠️ El [día] de [hora] a [hora] (hora de Ecuador) haremos mantenimiento. Podrás jugar sin conexión; los eventos en línea,
> el chat y la tienda vuelven al terminar.

**Pagos:**
> 💳 Los pagos con tarjeta están en pausa por un problema del procesador de pagos. Si te cobraron y no te llegaron los
> créditos, escríbenos desde Ayuda y soporte en el juego: lo revisamos uno por uno.

**Volvimos:**
> ✅ Listo, todo funciona otra vez. ¡Gracias por la paciencia!

**Brecha (correo a los jugadores):**
> Asunto: Aviso de seguridad sobre tu cuenta de EN VIVO Tycoon
>
> Hola [nombre]: el [fecha] detectamos que [qué pasó, en una frase sencilla]. Los datos que pudieron verse son: [correo,
> nombre…]. Tu clave se guarda cifrada y nunca guardamos números de tarjeta. Ya [qué hicimos: cerramos el acceso,
> cambiamos las claves del servidor, cerramos todas las sesiones]. Te recomendamos: cambiar tu clave en el juego y, si
> usas la misma clave en otros sitios, cambiarla también allí. Si tienes dudas, escríbenos a [correo de soporte].
> — QF Producciones (RUC [RUC]), responsable de tus datos en EN VIVO Tycoon.

---

## 9. Después del incidente (informe corto)

Escribe (o mándame para que lo escriba) en 5 líneas: **qué pasó**, **desde cuándo y hasta cuándo**, **a cuántos
jugadores afectó**, **por qué pasó** y **qué cambiamos para que no se repita**. Si hubo compras perdidas, cuántas y si
ya se devolvieron los créditos.
