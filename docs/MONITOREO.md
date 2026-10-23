# Monitor externo: que te avisen si el juego se cae (gratis)

El chequeo de salud del VPS (`salud_envivo.sh`, docs/OPERACION.md) corre **dentro** del VPS: si el VPS entero se apaga,
se queda sin internet o se cae nginx para todos, no puede avisar. Por eso también hace falta un vigilante **de afuera**.
Son dos servicios gratis; 15 minutos en total. Nada de esto toca el ERP ni TuPass.

| Qué | Servicio (gratis) | Cada cuánto | Te avisa por |
|---|---|---|---|
| ¿El juego responde? (`/api/salud`: PHP y la base) | **UptimeRobot** | 5 minutos | correo y Telegram |
| ¿Se hizo el respaldo de la noche? | **Healthchecks.io** | 1 vez al día | correo (y Telegram) |

---

## 1. La dirección que se vigila: `/api/salud`

Ya existe en el juego. Pruébala en el navegador: `https://juego.tukanec.com/api/salud`. Debe mostrar algo así:

```
{"ok":true,"servicio":"envivo","db":"ok","mantenimiento":false,"hora":1792790241}
```

- `ok:true` = nginx, PHP (el grupo del juego) y la base de datos responden.
- Si la base no responde, da **503** con `"ok":false`. Si nginx o PHP están caídos, no contesta o da 502.
- No pide cuenta, no guarda nada y no muestra datos de nadie. Pasa por Cloudflare sin desafío (regla 1 de
  docs/CLOUDFLARE_PRODUCCION.md).
- Con el modo mantenimiento encendido (docs/INCIDENTES.md) sigue respondiendo `ok:true` pero con `"mantenimiento":true`.

---

## 2. UptimeRobot: ¿el juego responde? (10 minutos)

1. Entra a **https://uptimerobot.com** → *Register for FREE* (con tu correo de siempre) y confirma el correo.
2. **Telegram (opcional, recomendado):** *Integrations & API* (o *Alert Contacts*) → *Add* → **Telegram** → te da un
   enlace: ábrelo en el celular, pulsa *Iniciar* en el bot de UptimeRobot. Queda como contacto de alerta.
3. *+ New monitor*:
   - **Monitor type:** `Keyword`
   - **Friendly name:** `EN VIVO Tycoon - API`
   - **URL:** `https://juego.tukanec.com/api/salud`
   - **Keyword:** `"ok":true`   ·   **Alert when:** *Keyword does not exist* (o "Keyword not found")
   - **Monitoring interval:** `5 minutes`
   - **Alert contacts:** tu correo y Telegram.
   - (Si aparece *Advanced settings* → *HTTP method*, déjalo en `GET`; *Timeout* 30 s.)
   - *Create monitor*.
4. Otro monitor igual pero **Monitor type `HTTP(s)`**, nombre `EN VIVO Tycoon - pagina`, URL `https://juego.tukanec.com/`.
   (Este avisa si se cae Cloudflare/el certificado aunque la API ande.)
5. **Probar que avisa** (sin apagar nada): edita el monitor *API* y cambia la keyword a `"ok":falso`. En 5 a 10 minutos
   te debe llegar "Monitor is DOWN" al correo y a Telegram. Vuelve a poner `"ok":true` y te llega "Monitor is UP".
6. **(Opcional) Página de estado para los jugadores:** *Status pages* → *Create status page* → elige los 2 monitores →
   te da una dirección pública (por ejemplo `stats.uptimerobot.com/xxxx`). Ponla en el canal de Discord `#estado`.

> Cuando hagas mantenimiento programado: en UptimeRobot, *Pause* en los dos monitores, y *Resume* al terminar.

---

## 3. Healthchecks.io: ¿se hizo el respaldo? (5 minutos)

El respaldo de la 1:30 (`respaldo_envivo.sh`) puede avisar a Healthchecks cada vez que sale bien. Si una noche **no**
avisa (VPS apagado, disco lleno, script roto), Healthchecks te escribe aunque el VPS no pueda.

1. Entra a **https://healthchecks.io** → *Sign Up* (gratis, hasta 20 chequeos) → confirma el correo.
2. *Add Check*:
   - **Name:** `EN VIVO respaldo 1:30`
   - **Schedule:** *Cron* → `30 1 * * *` · **Time zone:** `America/Guayaquil` · **Grace time:** `2 hours`
   - Guarda. Copia la dirección **Ping URL** (algo como `https://hc-ping.com/1234abcd-....`).
3. *Integrations* → agrega **Email** (ya viene) y, si quieres, **Telegram**.
4. En el VPS, pon la dirección en los ajustes del respaldo (cambia la dirección por la tuya):

```
echo "HC_RESPALDO=https://hc-ping.com/PEGA-AQUI-TU-CODIGO" | sudo tee -a /etc/envivo/ops.env > /dev/null
```

5. Pruébalo ahora (no esperes a la 1:30):

```
sudo respaldo_envivo.sh
```

   En Healthchecks el chequeo debe pasar a verde (**up**) en unos segundos. Si el respaldo falla, el script avisa a
   `.../fail` y Healthchecks lo marca en rojo de inmediato.

---

## 4. Qué hacer cuando llega un aviso

Sigue **docs/INCIDENTES.md** (runbook). Lo primero, desde PuTTY:

```
curl -s --resolve juego.tukanec.com:443:127.0.0.1 https://juego.tukanec.com/api/salud ; echo ; sudo DRY_RUN=1 salud_envivo.sh
```

- Si el primer comando responde `ok:true` pero UptimeRobot dice caído: el problema está **afuera** del VPS (Cloudflare,
  DNS, red de OVH). Mira https://www.cloudflarestatus.com y https://www.status-ovhcloud.com.
- Si no responde: el problema está en el VPS → docs/INCIDENTES.md, sección 1.
