-- Errores del juego en los celulares de los jugadores (js/errores.js -> POST /api/error; server/INTEGRAR_ERRORES.md).
-- Sin servicios de terceros: todo queda en esta base. Todo IF NOT EXISTS: se puede aplicar las veces que sea.
-- Fechas: segundos Unix. Se borra lo que tenga más de 30 días (php server/bin/errores.php, todos los días).

-- Un grupo por "huella" (mensaje normalizado + archivo + línea): cuántas veces, primera y última vez, y si está resuelto.
CREATE TABLE IF NOT EXISTS errores_grupos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    huella TEXT NOT NULL UNIQUE,
    mensaje TEXT NOT NULL,
    archivo TEXT NOT NULL DEFAULT '',
    linea INTEGER NOT NULL DEFAULT 0,
    total INTEGER NOT NULL DEFAULT 0,
    primero INTEGER NOT NULL,
    ultimo INTEGER NOT NULL,
    resuelto INTEGER,                 -- cuándo se marcó resuelto (NULL = abierto)
    resuelto_por TEXT,
    nota TEXT,
    version_resuelto TEXT,            -- la versión más nueva en que se había visto al marcarlo resuelto
    reabierto INTEGER                 -- volvió a pasar después de marcarlo resuelto
);
CREATE INDEX IF NOT EXISTS errores_grupos_ultimo ON errores_grupos (ultimo);

-- Cada vez que pasó (sin datos personales: la dirección va sin parámetros, la IP solo como huella para el límite).
CREATE TABLE IF NOT EXISTS errores_cliente (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    grupo_id INTEGER NOT NULL REFERENCES errores_grupos(id) ON DELETE CASCADE,
    creado INTEGER NOT NULL,
    mensaje TEXT NOT NULL,
    pila TEXT NOT NULL DEFAULT '',
    archivo TEXT NOT NULL DEFAULT '',
    linea INTEGER NOT NULL DEFAULT 0,
    columna INTEGER NOT NULL DEFAULT 0,
    url TEXT NOT NULL DEFAULT '',
    version TEXT NOT NULL DEFAULT '',
    idioma TEXT NOT NULL DEFAULT '',
    plataforma TEXT NOT NULL DEFAULT 'web',
    memoria TEXT NOT NULL DEFAULT '',
    conexion TEXT NOT NULL DEFAULT '',
    ultimo_paso TEXT NOT NULL DEFAULT '',
    contexto TEXT NOT NULL DEFAULT '',
    tipo TEXT NOT NULL DEFAULT 'error',   -- error | promesa | manual
    navegador TEXT NOT NULL DEFAULT '',
    jugador_id INTEGER REFERENCES jugadores(id) ON DELETE SET NULL,
    ip_huella TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS errores_cliente_grupo ON errores_cliente (grupo_id, creado);
CREATE INDEX IF NOT EXISTS errores_cliente_creado ON errores_cliente (creado);
