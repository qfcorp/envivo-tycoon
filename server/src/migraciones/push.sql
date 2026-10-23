-- Notificaciones Web Push (server/src/Push.php, server/INTEGRAR_PUSH.md). Todo IF NOT EXISTS: se puede aplicar las veces que sea.

-- Una fila por aparato (navegador / app de Android) suscrito. El endpoint lo da el servicio de push del navegador.
CREATE TABLE IF NOT EXISTS push_suscripciones (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    jugador_id INTEGER NOT NULL REFERENCES jugadores(id) ON DELETE CASCADE,
    endpoint TEXT NOT NULL UNIQUE,
    p256dh TEXT NOT NULL,                       -- llave pública del aparato (base64url, 65 bytes)
    auth TEXT NOT NULL,                         -- secreto de autenticación del aparato (base64url, 16 bytes)
    dispositivo TEXT,                           -- id al azar que guarda el juego en ese aparato
    idioma TEXT NOT NULL DEFAULT 'es',
    categorias_json TEXT NOT NULL,              -- {"obra":true,"copa":true,...,"ofertas":false}
    navegador TEXT,
    ultimo_texto TEXT,                          -- último texto enviado a este aparato (nunca el mismo dos veces seguidas)
    fallos INTEGER NOT NULL DEFAULT 0,          -- fallos seguidos (se reinicia con un envío bueno)
    creado INTEGER NOT NULL,
    actualizado INTEGER NOT NULL,
    visto INTEGER NOT NULL,                     -- última vez que el juego abrió en este aparato (actividad)
    ultimo_ok INTEGER
);
CREATE INDEX IF NOT EXISTS push_suscripciones_jugador ON push_suscripciones (jugador_id);

-- Cola de avisos. "clave" evita encolar dos veces lo mismo (obra:12, copa:3:batalla, premio:2026-10-24...).
CREATE TABLE IF NOT EXISTS push_cola (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    jugador_id INTEGER NOT NULL REFERENCES jugadores(id) ON DELETE CASCADE,
    categoria TEXT NOT NULL,
    clave TEXT NOT NULL,
    plantilla TEXT,                             -- textos por idioma de PushTextos (o null = titulo/cuerpo tal cual)
    vars_json TEXT,
    titulo TEXT,
    cuerpo TEXT,
    url TEXT NOT NULL DEFAULT '/',
    prioridad INTEGER NOT NULL DEFAULT 1,
    forzar INTEGER NOT NULL DEFAULT 0,          -- 1 = prueba del Centro de Control: sin horario ni tope
    estado TEXT NOT NULL DEFAULT 'pendiente' CHECK (estado IN ('pendiente', 'enviado', 'descartado', 'fallido')),
    motivo TEXT,
    intentos INTEGER NOT NULL DEFAULT 0,
    creado INTEGER NOT NULL,
    enviar_desde INTEGER NOT NULL,
    vence INTEGER NOT NULL,
    enviado INTEGER
);
CREATE UNIQUE INDEX IF NOT EXISTS push_cola_clave ON push_cola (jugador_id, clave);
CREATE INDEX IF NOT EXISTS push_cola_pendientes ON push_cola (estado, enviar_desde);

-- Cada intento de envío a un aparato (para las estadísticas del Centro de Control).
CREATE TABLE IF NOT EXISTS push_envios (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    cola_id INTEGER,
    suscripcion_id INTEGER,
    jugador_id INTEGER NOT NULL,
    categoria TEXT NOT NULL,
    http INTEGER NOT NULL,                      -- 0 = sin respuesta (red)
    ok INTEGER NOT NULL,
    creado INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS push_envios_creado ON push_envios (creado);

-- Por jugador: cuántos avisos lleva hoy (día de Guayaquil) y cuándo fue el último.
CREATE TABLE IF NOT EXISTS push_jugador (
    jugador_id INTEGER PRIMARY KEY REFERENCES jugadores(id) ON DELETE CASCADE,
    dia TEXT NOT NULL,
    enviados_dia INTEGER NOT NULL DEFAULT 0,
    ofertas_dia INTEGER NOT NULL DEFAULT 0,
    ultimo_envio INTEGER
);

-- Marcas de los detectores (fase de cada copa ya avisada, etc.).
CREATE TABLE IF NOT EXISTS push_marcas (clave TEXT PRIMARY KEY, valor TEXT NOT NULL, actualizado INTEGER NOT NULL);
