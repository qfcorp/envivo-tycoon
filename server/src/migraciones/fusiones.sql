-- Salud de los servidores y fusión de servidores abandonados (server/COPAS.md §3, server/INTEGRAR_FUSIONES.md).
-- Clases: server/src/SaludServidores.php y server/src/Fusiones.php. Cron diario: server/bin/salud_servidores.php.
-- Todo con IF NOT EXISTS / WHERE NOT EXISTS: se puede correr las veces que se quiera. Fechas: segundos Unix;
-- días: 'YYYY-MM-DD' (America/Guayaquil). Nada de aquí borra ni cambia datos de otros módulos.

-- Servidor fusionado: cuándo y a cuál (fusionado_a). Un servidor fusionado queda abierto = 0 y no recibe a nadie.
ALTER TABLE servidores ADD COLUMN fusionado_en INTEGER;
ALTER TABLE servidores ADD COLUMN fusionado_a INTEGER;

-- Foto diaria de la salud de cada servidor (una fila por día y servidor; volver a sacarla la reemplaza).
CREATE TABLE IF NOT EXISTS servidor_salud (
    dia TEXT NOT NULL,
    servidor_id INTEGER NOT NULL,
    activos_1 INTEGER NOT NULL DEFAULT 0,
    activos_7 INTEGER NOT NULL DEFAULT 0,
    activos_14 INTEGER NOT NULL DEFAULT 0,
    activos_30 INTEGER NOT NULL DEFAULT 0,
    activos_7_antes INTEGER NOT NULL DEFAULT 0,   -- activos de la semana anterior (días -13 a -7): para la tendencia
    tendencia_pct INTEGER,                        -- (activos_7 - activos_7_antes) / activos_7_antes * 100; null sin semana anterior
    eventos INTEGER NOT NULL DEFAULT 0,
    mensajes INTEGER NOT NULL DEFAULT 0,
    asociaciones_activas INTEGER NOT NULL DEFAULT 0,
    jugadores INTEGER NOT NULL DEFAULT 0,
    estado TEXT NOT NULL CHECK (estado IN ('sano', 'bajo', 'abandono')),
    motivo TEXT,
    creado INTEGER NOT NULL,
    PRIMARY KEY (dia, servidor_id)
);
CREATE INDEX IF NOT EXISTS servidor_salud_servidor ON servidor_salud (servidor_id, dia);

-- Planes de fusión. 'plan' = sugerido o armado en el Centro de Control (solo lectura hasta que una persona lo apruebe);
-- 'ejecutada' = ya se movió todo; 'cancelada' = descartado. huella = resumen de los datos del plan: si cambian antes de
-- ejecutar (alguien cambió su alias, entró gente, etc.) la ejecución se niega y hay que armar el plan otra vez.
CREATE TABLE IF NOT EXISTS fusiones (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    origen INTEGER NOT NULL REFERENCES servidores(id),
    destino INTEGER NOT NULL REFERENCES servidores(id),
    estado TEXT NOT NULL DEFAULT 'plan' CHECK (estado IN ('plan', 'aprobada', 'ejecutada', 'cancelada')),
    plan_json TEXT NOT NULL,
    huella TEXT NOT NULL,
    sugerida INTEGER NOT NULL DEFAULT 0,          -- 1 = la armó la vigilancia diaria al entrar en abandono
    creado INTEGER NOT NULL,
    creado_por TEXT NOT NULL,
    ejecutada INTEGER,
    quien TEXT,                                   -- quién la aprobó y ejecutó (o la canceló)
    resultado_json TEXT,
    cancelada_en INTEGER,
    motivo TEXT
);
CREATE INDEX IF NOT EXISTS fusiones_estado ON fusiones (estado, id);
CREATE UNIQUE INDEX IF NOT EXISTS fusiones_una_pendiente ON fusiones (origen) WHERE estado IN ('plan', 'aprobada');

-- Cambios de servidor de cada jugador (fusión o traslado voluntario). Sirve para la regla "1 traslado cada 30 días"
-- y para el aviso_fusion de /api/estado (aviso_visto = cuándo lo cerró el jugador).
CREATE TABLE IF NOT EXISTS traslados (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    jugador_id INTEGER NOT NULL REFERENCES jugadores(id) ON DELETE CASCADE,
    origen INTEGER NOT NULL,
    destino INTEGER NOT NULL,
    motivo TEXT NOT NULL CHECK (motivo IN ('fusion', 'voluntario')),
    fusion_id INTEGER,
    alias_antes TEXT,
    alias_nuevo TEXT,
    asociacion_id INTEGER,
    asociacion_antes TEXT,                        -- "Nombre [SIG]" si la asociación cambió de nombre o siglas
    asociacion_nueva TEXT,
    aviso_visto INTEGER,
    creado INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS traslados_jugador ON traslados (jugador_id, motivo, creado);
CREATE INDEX IF NOT EXISTS traslados_fusion ON traslados (fusion_id);

-- Umbrales de salud (editables en el Centro de Control, tabla ajustes). Ver SaludServidores::UMBRALES.
INSERT INTO ajustes (clave, valor, actualizado) SELECT 'salud_bajo_activos7', '25', CAST(strftime('%s', 'now') AS INTEGER) WHERE NOT EXISTS (SELECT 1 FROM ajustes WHERE clave = 'salud_bajo_activos7');
INSERT INTO ajustes (clave, valor, actualizado) SELECT 'salud_bajo_caida_pct', '40', CAST(strftime('%s', 'now') AS INTEGER) WHERE NOT EXISTS (SELECT 1 FROM ajustes WHERE clave = 'salud_bajo_caida_pct');
INSERT INTO ajustes (clave, valor, actualizado) SELECT 'salud_abandono_activos14', '10', CAST(strftime('%s', 'now') AS INTEGER) WHERE NOT EXISTS (SELECT 1 FROM ajustes WHERE clave = 'salud_abandono_activos14');
INSERT INTO ajustes (clave, valor, actualizado) SELECT 'salud_abandono_activos7', '5', CAST(strftime('%s', 'now') AS INTEGER) WHERE NOT EXISTS (SELECT 1 FROM ajustes WHERE clave = 'salud_abandono_activos7');
INSERT INTO ajustes (clave, valor, actualizado) SELECT 'salud_gracia_dias', '14', CAST(strftime('%s', 'now') AS INTEGER) WHERE NOT EXISTS (SELECT 1 FROM ajustes WHERE clave = 'salud_gracia_dias');
