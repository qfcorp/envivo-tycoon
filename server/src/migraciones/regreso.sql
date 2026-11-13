-- Avisos por etapa y regreso del jugador (server/src/Regreso.php, server/INTEGRAR_REGRESO.md). Todo IF NOT EXISTS: seguro de correr otra vez.

-- Por jugador: zona horaria que manda el juego (para no avisar de noche en su hora), última vez que el juego llamó a
-- /api/regreso (señal de vida), código para darse de baja de los correos de regreso (sin sesión, desde el correo).
CREATE TABLE IF NOT EXISTS regreso_jugador (
    jugador_id INTEGER PRIMARY KEY REFERENCES jugadores(id) ON DELETE CASCADE,
    zona TEXT,                                  -- 'America/Guayaquil', 'Europe/Madrid'... (null = no se sabe: se usa la del juego)
    visto INTEGER,
    token_baja TEXT UNIQUE,                     -- 32 hex al azar, se crea al mandar el primer correo
    baja_correo INTEGER                         -- cuándo pidió no recibir más correos de regreso (null = los recibe)
);

-- Una fila por ausencia de 7+ días. "desde" = última señal de vida antes de irse. UNIQUE: una ausencia no se abre dos veces.
-- volvio = primera señal de vida después; reclamado = cuándo recibió el regalo (una vez por ausencia, lo da el servidor).
CREATE TABLE IF NOT EXISTS regreso_ausencias (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    jugador_id INTEGER NOT NULL REFERENCES jugadores(id) ON DELETE CASCADE,
    desde INTEGER NOT NULL,
    detectado INTEGER NOT NULL,
    volvio INTEGER,
    dias INTEGER,                               -- días fuera (al volver)
    correo INTEGER,                             -- cuándo salió el correo de los 7 días (uno por ausencia)
    reclamado INTEGER,
    regalo_json TEXT,                           -- lo que se entregó
    ventaja_hasta INTEGER,                      -- fin de los 3 días de ventaja
    oferta_producto TEXT,                       -- regreso_s / regreso_m / regreso_l (una sola vez)
    oferta_vence INTEGER,
    oferta_compra_id INTEGER,                   -- compra que la usó (ya no se puede comprar otra vez)
    UNIQUE (jugador_id, desde)
);
CREATE INDEX IF NOT EXISTS regreso_ausencias_jugador ON regreso_ausencias (jugador_id, volvio);

-- Cada aviso (push o correo) de este módulo, para no repetir y para el Centro de Control (enviados y cuántos volvieron).
CREATE TABLE IF NOT EXISTS regreso_avisos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    jugador_id INTEGER NOT NULL REFERENCES jugadores(id) ON DELETE CASCADE,
    tipo TEXT NOT NULL,                         -- dia1, dia2, dia3, liga2h, duelo2h, regreso3, regreso7, regreso14, correo7
    clave TEXT NOT NULL,
    canal TEXT NOT NULL DEFAULT 'push' CHECK (canal IN ('push', 'correo')),
    cola_id INTEGER,                            -- fila de push_cola
    estado TEXT NOT NULL DEFAULT 'cola' CHECK (estado IN ('cola', 'enviado', 'descartado')),
    creado INTEGER NOT NULL,
    enviado INTEGER,
    volvio INTEGER,                             -- primera señal de vida dentro de las 72 h siguientes al envío
    UNIQUE (jugador_id, clave)
);
CREATE INDEX IF NOT EXISTS regreso_avisos_tipo ON regreso_avisos (tipo, creado);
CREATE INDEX IF NOT EXISTS regreso_avisos_pend ON regreso_avisos (estado, volvio);

CREATE TABLE IF NOT EXISTS regreso_marcas (clave TEXT PRIMARY KEY, valor TEXT NOT NULL, actualizado INTEGER NOT NULL);
