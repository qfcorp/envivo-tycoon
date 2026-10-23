-- Analítica propia (sin SDK de terceros): server/src/Analitica.php, server/INTEGRAR_ANALITICA.md.
-- Eventos crudos (se guardan 90 días). La instalación es un número al azar del navegador (no es el celular ni la IP).
-- No se guarda la IP ni el navegador. jugador_id solo sale de la sesión del servidor (nunca de lo que manda el juego).
CREATE TABLE IF NOT EXISTS eventos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    instalacion TEXT NOT NULL,
    sesion TEXT NOT NULL,
    clave TEXT NOT NULL,
    jugador_id INTEGER,
    nombre TEXT NOT NULL,
    datos TEXT,
    t INTEGER NOT NULL,
    dia TEXT NOT NULL,
    recibido INTEGER NOT NULL
);
-- clave = número al azar de cada evento: si el juego manda el mismo lote dos veces (reintento), no se cuenta doble
CREATE UNIQUE INDEX IF NOT EXISTS eventos_clave ON eventos (instalacion, clave);
CREATE INDEX IF NOT EXISTS eventos_dia ON eventos (dia, instalacion);
CREATE INDEX IF NOT EXISTS eventos_instalacion ON eventos (instalacion, nombre, t);
CREATE INDEX IF NOT EXISTS eventos_jugador ON eventos (jugador_id, dia) WHERE jugador_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS eventos_t ON eventos (t);
CREATE INDEX IF NOT EXISTS eventos_nombre ON eventos (nombre, dia);

-- Una fila por instalación: primer día (cohorte), plataforma y país (CF-IPCountry) del primer contacto.
CREATE TABLE IF NOT EXISTS analitica_instalaciones (
    instalacion TEXT PRIMARY KEY,
    primer_t INTEGER NOT NULL,
    primer_dia TEXT NOT NULL,
    ultimo_dia TEXT NOT NULL,
    plataforma TEXT NOT NULL,
    pais TEXT,
    version TEXT,
    idioma TEXT,
    jugador_id INTEGER
);
CREATE INDEX IF NOT EXISTS analitica_inst_primer ON analitica_instalaciones (primer_dia);
CREATE INDEX IF NOT EXISTS analitica_inst_jugador ON analitica_instalaciones (jugador_id) WHERE jugador_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS analitica_inst_ultimo ON analitica_instalaciones (ultimo_dia);

-- Resúmenes (bin/analitica.php). plataforma y pais = '*' es "todas"; '--' = desconocido. Solo números, sin personas.
CREATE TABLE IF NOT EXISTS analitica_dia (
    dia TEXT NOT NULL,
    plataforma TEXT NOT NULL,
    pais TEXT NOT NULL,
    dau INTEGER NOT NULL DEFAULT 0,
    wau INTEGER NOT NULL DEFAULT 0,
    mau INTEGER NOT NULL DEFAULT 0,
    nuevas INTEGER NOT NULL DEFAULT 0,
    cuentas_nuevas INTEGER NOT NULL DEFAULT 0,
    sesiones INTEGER NOT NULL DEFAULT 0,
    sesiones_medidas INTEGER NOT NULL DEFAULT 0,
    duracion_total_s INTEGER NOT NULL DEFAULT 0,
    pagadores INTEGER NOT NULL DEFAULT 0,
    compras INTEGER NOT NULL DEFAULT 0,
    ingresos REAL NOT NULL DEFAULT 0,
    primer_evento_10m INTEGER NOT NULL DEFAULT 0,
    actualizado INTEGER NOT NULL,
    PRIMARY KEY (dia, plataforma, pais)
);
-- Retención por cohorte: tipo 'instalacion' (primer día de la instalación) o 'cuenta' (día en que se creó la cuenta).
-- d1/d7/d30 = cuántos de la cohorte volvieron ESE día (NULL: ese día todavía no termina).
CREATE TABLE IF NOT EXISTS analitica_cohortes (
    tipo TEXT NOT NULL,
    cohorte TEXT NOT NULL,
    plataforma TEXT NOT NULL,
    pais TEXT NOT NULL,
    tamano INTEGER NOT NULL DEFAULT 0,
    d1 INTEGER,
    d7 INTEGER,
    d30 INTEGER,
    actualizado INTEGER NOT NULL,
    PRIMARY KEY (tipo, cohorte, plataforma, pais)
);
-- Embudo de la guía del primer evento por cohorte de instalación (instalaciones que llegaron a cada paso).
CREATE TABLE IF NOT EXISTS analitica_embudo (
    cohorte TEXT NOT NULL,
    plataforma TEXT NOT NULL,
    pais TEXT NOT NULL,
    paso TEXT NOT NULL,
    instalaciones INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (cohorte, plataforma, pais, paso)
);
CREATE TABLE IF NOT EXISTS analitica_meta (
    clave TEXT PRIMARY KEY,
    valor TEXT NOT NULL
);

-- Cuenta borrada (Cuentas::borrar deja estado = 'borrado'): sus eventos y su instalación dejan de apuntar a la cuenta.
CREATE TRIGGER IF NOT EXISTS analitica_cuenta_borrada AFTER UPDATE OF estado ON jugadores
WHEN NEW.estado = 'borrado'
BEGIN
    UPDATE eventos SET jugador_id = NULL WHERE jugador_id = NEW.id;
    UPDATE analitica_instalaciones SET jugador_id = NULL WHERE jugador_id = NEW.id;
END;
