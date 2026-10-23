-- Copa de Servidores (server/COPAS.md §2, server/src/Copas.php). Todo IF NOT EXISTS: se puede aplicar las veces que sea.

CREATE TABLE IF NOT EXISTS copas (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    universo_id INTEGER NOT NULL,
    semana TEXT NOT NULL,                       -- 'YYYY-Www' (semana ISO, hora de Ecuador)
    torneo_key TEXT NOT NULL,
    nombre TEXT NOT NULL,
    fase TEXT NOT NULL DEFAULT 'preparacion' CHECK (fase IN ('preparacion', 'batalla', 'cerrada')),
    inicio INTEGER NOT NULL,                    -- lunes 00:00
    fin INTEGER NOT NULL,                       -- lunes siguiente 00:00
    creado INTEGER NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS copas_universo_semana ON copas (universo_id, semana);

CREATE TABLE IF NOT EXISTS copa_servidores (
    copa_id INTEGER NOT NULL REFERENCES copas(id) ON DELETE CASCADE,
    servidor_id INTEGER NOT NULL,
    puntos_prep INTEGER NOT NULL DEFAULT 0,
    puntos_tabla INTEGER NOT NULL DEFAULT 0,
    ganados INTEGER NOT NULL DEFAULT 0,
    empatados INTEGER NOT NULL DEFAULT 0,
    perdidos INTEGER NOT NULL DEFAULT 0,
    dif_calidad INTEGER NOT NULL DEFAULT 0,
    posicion INTEGER,
    PRIMARY KEY (copa_id, servidor_id)
);

CREATE TABLE IF NOT EXISTS copa_aportes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    copa_id INTEGER NOT NULL REFERENCES copas(id) ON DELETE CASCADE,
    jugador_id INTEGER NOT NULL,
    servidor_id INTEGER NOT NULL,
    asociacion_id INTEGER,
    puntos INTEGER NOT NULL,
    fuente TEXT NOT NULL,                       -- 'intento' (intento en línea validado)
    ref TEXT NOT NULL UNIQUE,                   -- 'intento:<id>': nunca suma dos veces
    creado INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS copa_aportes_copa ON copa_aportes (copa_id, servidor_id, jugador_id);

CREATE TABLE IF NOT EXISTS copa_equipos (
    copa_id INTEGER NOT NULL REFERENCES copas(id) ON DELETE CASCADE,
    jugador_id INTEGER NOT NULL,
    servidor_id INTEGER NOT NULL,
    equipo_json TEXT NOT NULL,
    poder INTEGER NOT NULL,
    registrado INTEGER NOT NULL,
    PRIMARY KEY (copa_id, jugador_id)
);
CREATE INDEX IF NOT EXISTS copa_equipos_servidor ON copa_equipos (copa_id, servidor_id, poder);

CREATE TABLE IF NOT EXISTS copa_cruces (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    copa_id INTEGER NOT NULL REFERENCES copas(id) ON DELETE CASCADE,
    ronda INTEGER NOT NULL,
    servidor_a INTEGER NOT NULL,
    servidor_b INTEGER NOT NULL,
    hora INTEGER NOT NULL,                      -- cuándo se juega (sábado)
    estado TEXT NOT NULL DEFAULT 'pendiente' CHECK (estado IN ('pendiente', 'jugado')),
    puntos_a INTEGER,
    puntos_b INTEGER,
    detalle_json TEXT                           -- {semilla, grupo, bono_a, bono_b, calidad_total_a/b, partidos, planteles}
);
CREATE INDEX IF NOT EXISTS copa_cruces_copa ON copa_cruces (copa_id, estado, hora);

CREATE TABLE IF NOT EXISTS copa_premios (
    copa_id INTEGER NOT NULL REFERENCES copas(id) ON DELETE CASCADE,
    jugador_id INTEGER NOT NULL,
    clave TEXT NOT NULL,                        -- 'campeon' | 'top10' | 'subcampeon' | 'participacion'
    entregado INTEGER NOT NULL,
    UNIQUE (copa_id, jugador_id, clave)
);

-- Propias del módulo (no están en COPAS.md): intentos en línea de la preparación y ajustes (secreto de la firma).
CREATE TABLE IF NOT EXISTS copa_intentos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    copa_id INTEGER NOT NULL REFERENCES copas(id) ON DELETE CASCADE,
    jugador_id INTEGER NOT NULL,
    servidor_id INTEGER NOT NULL,
    semilla INTEGER NOT NULL,
    contrato_json TEXT NOT NULL,
    equipo_json TEXT NOT NULL,
    contexto_json TEXT NOT NULL,
    vip INTEGER NOT NULL DEFAULT 0,
    estado TEXT NOT NULL DEFAULT 'jugando' CHECK (estado IN ('jugando', 'validando', 'pendiente', 'validado', 'rechazado', 'vencido')),
    decisiones_json TEXT,
    cliente_json TEXT,
    calidad INTEGER,
    estrellas INTEGER,
    puntos INTEGER NOT NULL DEFAULT 0,
    valido INTEGER,
    sospechoso INTEGER NOT NULL DEFAULT 0,
    motivo TEXT,
    version_logica TEXT,
    creado INTEGER NOT NULL,
    vence INTEGER NOT NULL,
    enviado INTEGER,
    validado_en INTEGER
);
CREATE INDEX IF NOT EXISTS copa_intentos_jugador ON copa_intentos (jugador_id, estado);
CREATE INDEX IF NOT EXISTS copa_intentos_copa ON copa_intentos (copa_id, estado);

CREATE TABLE IF NOT EXISTS copa_ajustes (
    clave TEXT PRIMARY KEY,
    valor TEXT NOT NULL,
    actualizado INTEGER NOT NULL
);
