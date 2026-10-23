-- Tablas del Mega Festival (ver server/INTEGRAR_FESTIVAL.md). Se aplican solas desde Festival::preparar() si falta
-- alguna (todas con CREATE ... IF NOT EXISTS: correr esto otra vez no hace nada ni borra datos).
-- Fechas: segundos Unix, como el resto de la base. Nada de aquí cambia tablas de otros módulos.

-- Liga de festival de cada asociación (0 Bronce, 1 Plata, 2 Oro, 3 Diamante). Sube con 75 % o más, baja con menos de 25 %.
CREATE TABLE IF NOT EXISTS festival_ligas (
    asociacion_id INTEGER PRIMARY KEY,
    liga INTEGER NOT NULL DEFAULT 0 CHECK (liga BETWEEN 0 AND 3),
    actualizado INTEGER NOT NULL
);

-- Un festival por asociación y por ciclo (cada 2 días, ventana de 24 h). asociacion_id sin FK: si la asociación se
-- disuelve, el historial y los premios ya repartidos se quedan.
CREATE TABLE IF NOT EXISTS festival_instancias (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ciclo INTEGER NOT NULL,
    asociacion_id INTEGER NOT NULL,
    servidor_id INTEGER,
    nombre TEXT NOT NULL,                       -- "Mega Festival QFP"
    liga INTEGER NOT NULL,
    miembros INTEGER NOT NULL,                  -- tamaño usado para las metas (solo sube)
    semilla INTEGER NOT NULL,                   -- para los imprevistos del festival y las escenas (random_int)
    abre INTEGER NOT NULL,
    cierra INTEGER NOT NULL,
    estado TEXT NOT NULL DEFAULT 'abierto' CHECK (estado IN ('abierto', 'cerrado')),
    meta_total INTEGER NOT NULL DEFAULT 0,
    calidad_total INTEGER NOT NULL DEFAULT 0,   -- suma de lo que cuenta de cada escenario (tope: su meta)
    creado INTEGER NOT NULL,
    cerrado_en INTEGER,
    UNIQUE (ciclo, asociacion_id)
);
CREATE INDEX IF NOT EXISTS festival_instancias_estado ON festival_instancias (estado, cierra);
CREATE INDEX IF NOT EXISTS festival_instancias_asoc ON festival_instancias (asociacion_id, ciclo);

-- Los 6 escenarios de cada festival.
CREATE TABLE IF NOT EXISTS festival_escenarios (
    instancia_id INTEGER NOT NULL REFERENCES festival_instancias(id) ON DELETE CASCADE,
    n INTEGER NOT NULL CHECK (n BETWEEN 1 AND 6),
    semilla INTEGER NOT NULL,
    meta INTEGER NOT NULL,
    acumulado INTEGER NOT NULL DEFAULT 0,
    completado_en INTEGER,
    completado_por INTEGER,
    PRIMARY KEY (instancia_id, n)
);

-- Cada intento ("turno") en un escenario. La semilla sale de random_int() y se usa UNA sola vez.
-- contrato/equipo/contexto los pone el servidor; del juego solo llegan decisiones (y el resultado que dice, para comparar).
CREATE TABLE IF NOT EXISTS festival_intentos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    instancia_id INTEGER NOT NULL REFERENCES festival_instancias(id) ON DELETE CASCADE,
    ciclo INTEGER NOT NULL,
    escenario INTEGER NOT NULL,
    jugador_id INTEGER NOT NULL REFERENCES jugadores(id) ON DELETE CASCADE,
    semilla INTEGER NOT NULL UNIQUE,
    contrato_json TEXT NOT NULL,
    equipo_json TEXT NOT NULL,
    contexto_json TEXT NOT NULL,
    vip INTEGER NOT NULL DEFAULT 0,
    incidente TEXT,                              -- imprevisto del festival que había al empezar
    estado TEXT NOT NULL DEFAULT 'jugando' CHECK (estado IN ('jugando', 'validando', 'pendiente', 'validado', 'invalido', 'vencido')),
    decisiones_json TEXT,
    cliente_json TEXT,
    calidad INTEGER,
    estrellas INTEGER,
    aporte INTEGER NOT NULL DEFAULT 0,           -- lo que sumó al escenario (tope: lo que le faltaba para su meta)
    valido INTEGER,
    coincide INTEGER,
    sospechoso INTEGER NOT NULL DEFAULT 0,
    motivo TEXT,
    via TEXT,
    version_logica TEXT,
    reintentos INTEGER NOT NULL DEFAULT 0,
    creado INTEGER NOT NULL,
    expira INTEGER NOT NULL,
    enviado INTEGER,
    validado_en INTEGER
);
CREATE INDEX IF NOT EXISTS festival_intentos_inst ON festival_intentos (instancia_id, estado, escenario);
CREATE INDEX IF NOT EXISTS festival_intentos_jugador ON festival_intentos (jugador_id, ciclo, estado);
CREATE INDEX IF NOT EXISTS festival_intentos_estado ON festival_intentos (estado, enviado);

-- Hitos de calidad del festival (25 / 50 / 75 / 100 %).
CREATE TABLE IF NOT EXISTS festival_hitos (
    instancia_id INTEGER NOT NULL REFERENCES festival_instancias(id) ON DELETE CASCADE,
    pct INTEGER NOT NULL,
    alcanzado_en INTEGER NOT NULL,
    alcanzado_por INTEGER,
    PRIMARY KEY (instancia_id, pct)
);

-- Libro de Pases de Prensa: cada cambio (+ misión, VIP, compra; - intento). El saldo es la suma.
-- ref única por jugador = idempotencia ("diario:2026-10-23", "vip:2026-10-23", "mision:x:2026-10-23", "intento:12", "compra:2026-10-23:1").
CREATE TABLE IF NOT EXISTS festival_pases (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    jugador_id INTEGER NOT NULL REFERENCES jugadores(id) ON DELETE CASCADE,
    cambio INTEGER NOT NULL,
    saldo INTEGER NOT NULL,
    motivo TEXT NOT NULL CHECK (motivo IN ('diario', 'vip', 'mision', 'compra', 'intento', 'ajuste')),
    ref TEXT NOT NULL,
    dia TEXT NOT NULL,
    creado INTEGER NOT NULL,
    UNIQUE (jugador_id, ref)
);
CREATE INDEX IF NOT EXISTS festival_pases_dia ON festival_pases (jugador_id, dia, motivo);

-- Fichas del festival (moneda de premio). Libro con ref única por jugador.
CREATE TABLE IF NOT EXISTS festival_fichas (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    jugador_id INTEGER NOT NULL REFERENCES jugadores(id) ON DELETE CASCADE,
    cambio INTEGER NOT NULL,
    saldo INTEGER NOT NULL,
    motivo TEXT NOT NULL,
    ref TEXT NOT NULL,
    creado INTEGER NOT NULL,
    UNIQUE (jugador_id, ref)
);

-- Premios repartidos al cerrar (uno por jugador, tipo y clave: repartir dos veces no duplica nada).
CREATE TABLE IF NOT EXISTS festival_premios (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    instancia_id INTEGER NOT NULL REFERENCES festival_instancias(id) ON DELETE CASCADE,
    jugador_id INTEGER NOT NULL REFERENCES jugadores(id) ON DELETE CASCADE,
    tipo TEXT NOT NULL CHECK (tipo IN ('aporte', 'puesto', 'hito', 'escenario')),
    clave TEXT NOT NULL,
    entregas_json TEXT NOT NULL DEFAULT '[]',
    fichas INTEGER NOT NULL DEFAULT 0,
    creado INTEGER NOT NULL,
    UNIQUE (instancia_id, jugador_id, tipo, clave)
);
CREATE INDEX IF NOT EXISTS festival_premios_jugador ON festival_premios (jugador_id, instancia_id);
