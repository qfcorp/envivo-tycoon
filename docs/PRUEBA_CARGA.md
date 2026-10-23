# Prueba de carga: ¿aguanta el servidor 300 jugadores a la vez?

Con **k6** (gratis, de Grafana) se simulan jugadores con el juego abierto: cada uno pide el estado al entrar y cada
~minuto, lee el chat cada 3 a 20 segundos (como el juego), a veces escribe en el chat, una parte entra con correo y clave,
y un 30 % juega el **Desafío del día** (empezar + terminar: el servidor busca la semilla y repite la jugada en el
validador, que es lo más pesado del juego). El guion es `tests/carga/k6_juego.js`.

> ⚠️ **Nunca contra la base real con jugadores.** La prueba crea 300 cuentas `carga-0001@prueba.invalid…` y llena el
> chat. Se hace en una **copia** (paso 3) o en la laptop (paso 2). `preparar_cuentas.php` se niega a correr sobre
> `/var/lib/envivo/envivo.sqlite`.

---

## Paso 1. Instalar k6

- **Laptop Windows (PowerShell):** `winget install k6 --source winget`
- **Ubuntu (VPS o laptop qfcorp):**

```
sudo gpg -k; sudo gpg --no-default-keyring --keyring /usr/share/keyrings/k6-archive-keyring.gpg --keyserver hkp://keyserver.ubuntu.com:80 --recv-keys C5AD17C747E3415A3642D57D77C6C491D6AC1D69
echo "deb [signed-by=/usr/share/keyrings/k6-archive-keyring.gpg] https://dl.k6.io/deb stable main" | sudo tee /etc/apt/sources.list.d/k6.list
sudo apt-get update && sudo apt-get install -y k6
```

  (O sin apt: bajar `k6-v0.54.0-linux-amd64.tar.gz` de https://github.com/grafana/k6/releases y copiar `k6` a `/usr/local/bin`.)

Comprueba: `k6 version`.

---

## Paso 2. Ensayo local (en la laptop o una máquina de pruebas, 5 minutos)

Arma un juego temporal (base y configuración en una carpeta temporal), el validador y PHP con varios procesos, crea las
cuentas y corre la prueba corta (30 s subiendo a 300, 60 s arriba, 10 s bajando). No toca nada del sistema y al final borra todo.

```
bash tests/carga/correr_local.sh
```

Variables: `JUGADORES=100`, `MESETA=3m`, `PROCESOS=8` (procesos de PHP), `DESAFIO_PCT=30`, `LOGIN_PCT=10`.
Sirve para **comparar versiones** (antes y después de un cambio). Ojo: usa `php -S`, no nginx + php-fpm, y todo
(k6, PHP, Node) corre en la misma máquina: los números reales del VPS salen del paso 3.

---

## Paso 3. En el VPS, sobre una COPIA del juego, de madrugada (30 minutos)

Se usa el nginx y el grupo de PHP de verdad, pero con **otra base** (una copia), en un puerto que solo escucha en el VPS.
El ERP y TuPass siguen funcionando; hazlo a una hora sin gente (por ejemplo 3:00) porque usa CPU del mismo VPS.

> Este paso lo preparo yo contigo cuando quieras hacerlo (son varios comandos y hay que borrar la copia al final).
> Resumen de lo que se hace: copia de la base a `/var/tmp/envivo-carga/`, un `config.env` de prueba que apunta a esa
> copia, un sitio de nginx temporal en `127.0.0.1:8299` con la misma plantilla (`nginx-sitio.sh` con `LISTEN=` y el
> grupo de PHP del juego), las cuentas con `preparar_cuentas.php`, y k6 **en el mismo VPS** con
> `IP_POR_JUGADOR=1` (cada jugador con su propia IP en `CF-Connecting-IP`, así los límites por IP cuentan como en la
> realidad). Al final se borra el sitio temporal y la copia.

```
k6 run -e BASE=http://127.0.0.1:8299 -e CUENTAS=/var/tmp/envivo-carga/cuentas.json -e IP_POR_JUGADOR=1 -e SUBIDA=3m -e MESETA=10m tests/carga/k6_juego.js
```

---

## Cómo leer el resultado

Al final k6 muestra una tabla. Lo importante:

| Línea | Qué es | Bien |
|---|---|---|
| `errores_servidor` | % de respuestas 5xx o sin respuesta | **menos de 1 %** (✓) |
| `http_req_duration{ruta:estado}` | lo que tarda abrir el juego | p(95) **menos de 0,8 s** |
| `http_req_duration{ruta:chat}` | leer el chat | p(95) **menos de 0,5 s** |
| `http_req_duration{ruta:entrar}` | entrar con clave | p(95) menos de 1,5 s |
| `desafio_validacion_ms` | terminar el desafío (validador) | p(95) menos de 5 s |
| `limitados_429` | frenados por los límites | casi 0 (si hay muchos, los límites están muy bajos para tanta gente detrás de la misma IP) |
| `http_reqs` | peticiones por segundo que aguantó | ~30/s para 300 jugadores |

Con ✓ verde en todas: aguanta. Si algo sale en ✗ rojo, mándame la tabla completa y el final de
`/var/log/envivo-php-lento.log` y `/var/log/php8.3-fpm.log` (si dice `pm.max_children`, hay que subir los procesos de PHP
del juego: `sudo FPM_MAX_HIJOS=16 bash /var/www/envivo/server/deploy/instalar.sh`).

---

## Resultado del ensayo local (23-oct-2026)

Máquina de pruebas con **2 CPU compartidas** con otras pruebas (carga promedio ~40 durante el ensayo: un `password_hash`
tardaba 770 ms en vez de ~60 ms), con k6, PHP (`php -S`, 8 procesos) y el validador en esas mismas 2 CPU:

| Prueba | Errores 5xx | Peticiones/s | Chat p(50) / p(95) | Estado p(95) |
|---|---|---|---|---|
| 20 jugadores (30 % desafío) | 0 % | 2,4 | 3 ms / 15 ms | 107 ms |
| 300 jugadores sin desafío | 0 % | 26 | 7 ms / 6,5 s | 7,1 s |
| 300 jugadores, 30 % desafío | 0,7 % | 19 | 5,9 s / 11,6 s | 11,6 s |

Lectura: el guion funciona de punta a punta (cuentas, sesión, entrar, chat, desafío validado por el validador:
37 desafíos terminados, 0 errores de PHP). Con 300 jugadores esta máquina se **satura de CPU** (las peticiones esperan en
cola); lo que más CPU pide es buscar la semilla del desafío y repetir la jugada (Node) y `entrar` (bcrypt). Estos
números son un piso, no la capacidad del VPS: la prueba que vale es la del paso 3. Si allí sale lo mismo, las palancas
son (en orden): más procesos de PHP para el juego (`FPM_MAX_HIJOS`), poner la nube naranja (la caché de Cloudflare saca
los archivos del juego del VPS) y bajar la frecuencia del chat con el chat cerrado.
