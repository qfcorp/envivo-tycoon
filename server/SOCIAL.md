# Servidores, asociaciones y chat (amplía server/API.md)

Diseño completo en el documento "Eventos en línea entre productoras". Esto es el contrato técnico.
Todo con sesión; POST con cabecera `X-Envivo: 1`.

## Servidores (reinos)
- Tabla `servidores` (id, nombre "Servidor 1 · Quito", capacidad 1000, abierto, creado).
- Al registrarse, el jugador entra al servidor abierto más nuevo. Campo `jugadores.servidor_id`.
- `/api/estado` agrega `"servidor": { "id": 1, "nombre": "Servidor 1 · Quito" }` y
  `"asociacion": { "id": 4, "nombre": "...", "siglas": "QFP", "color": "#ff3b3b", "cargo": "presidente" } | null`.

## Perfil público de productora
`jugadores.alias` (nombre de la productora, único por servidor, 3–24 caracteres, filtrado) y `jugadores.fama_publica`
(el juego la sube con la partida; tope de cambio por día para evitar trampas).
- `POST /api/perfil` `{ "alias", "fama" }`.

## Asociaciones
- Tablas `asociaciones` (id, servidor_id, nombre, siglas 3 letras, color, logo_json, descripcion, ingreso 'abierto'|'solicitud', creado)
  y `asociacion_miembros` (asociacion_id, jugador_id, cargo 'presidente'|'vicepresidente'|'socio', desde).
- Máximo 20 miembros. Un jugador, una asociación. Crear cuesta $5.000 del juego (lo descuenta el juego; el servidor
  pide `pagado_en_juego: true`) o es gratis con VIP activo.
- `GET /api/asociaciones?buscar=` (del servidor del jugador) · `POST /api/asociaciones/crear` · `POST /api/asociaciones/unirse {id}`
  · `POST /api/asociaciones/salir` · `POST /api/asociaciones/cargo {jugador_id, cargo}` (presidente) ·
  `POST /api/asociaciones/expulsar {jugador_id}` (presidente / vice) · `POST /api/asociaciones/solicitud {jugador_id, aceptar}`.
- Si el presidente sale, pasa al vicepresidente más antiguo o al socio más antiguo.

## Chat
- Tabla `chat_mensajes` (id, canal 'servidor:<id>' | 'asociacion:<id>' | 'coalicion:<id>' | 'sistema:<id>', jugador_id,
  texto ≤ 300, creado, oculto) · `chat_reportes` · `chat_bloqueos` (jugador_id, bloqueado_id) · `chat_sanciones` (jugador_id, hasta, motivo).
- `GET /api/chat?canal=servidor&desde=<id>` → mensajes nuevos (máx. 50) con `{id, alias, siglas, cargo, vip, texto, creado}`;
  el juego consulta cada 3 s mientras el chat está abierto y cada 20 s en segundo plano (contador de no leídos).
- `POST /api/chat` `{ "canal": "servidor"|"asociacion", "texto" }` → 1 mensaje cada 3 s por jugador (429 si no);
  filtro de groserías (lista editable en el panel); rechaza enlaces, correos y números de teléfono; sancionado → 403 con hasta cuándo.
- `POST /api/chat/reportar {mensaje_id, motivo}` · `POST /api/chat/bloquear {jugador_id}` (los mensajes de bloqueados no llegan).
- Mensajes rápidos predefinidos: `POST /api/chat` `{ "canal", "rapido": "vamos_festival" }` (lista fija en el servidor).
- Se borran a los 30 días (tarea diaria).
- Panel admin: reportes pendientes, ocultar mensaje, silenciar jugador por 1 h / 24 h / 7 días, expulsar del chat, editar lista de palabras.

## Coaliciones (eventos multialianza)
- Tabla `coaliciones` (id, evento_id, nombre) y `coalicion_miembros` (coalicion_id, asociacion_id), máx. 4 asociaciones.
  Canal de chat `coalicion:<id>` activo solo durante el evento.

## Copas internacionales (servidor contra servidor)
Diseño en el documento "Eventos en línea entre productoras" (sección Copas internacionales).
- Tablas `copas` (id, torneo_key, nombre, temporada, fase 'inscripcion'|'preparacion'|'emparejamiento'|'batalla'|'cerrada', fechas),
  `copa_selecciones` (copa_id, servidor_id, capitan_jugador_id, puntos), `copa_aportes` (copa_id, jugador_id, asociacion_id, puntos, fuente, creado),
  `copa_llaves` (copa_id, ronda, servidor_a, servidor_b, ganador).
- Torneos con nombres inventados (nunca nombres, siglas ni logos reales): Copa Planeta de Balompié (FGB), Copa de los Libertadores
  del Sur (CSC), Liga Estelar de Clubes (UEC), Mundial de Aro y Tablero (FMA), Juegos de los Cinco Continentes, Gran Premio Fórmula Veloz,
  La Pelea del Siglo, El Gran Tazón.
- Los puntos de preparación vienen de intentos de evento validados por el servidor (semilla + repetición de la jugada; ver
  "Reglas para que nadie haga trampa"). El servidor ganador recibe un contrato internacional especial para todos sus jugadores.
- Canal de chat `seleccion:<copa_id>:<servidor_id>` durante la copa.
