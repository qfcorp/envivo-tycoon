-- Duelo de Productoras y Desafío Técnico del Día (server/INTEGRAR_DUELOS_DESAFIO.md).
-- Se aplica sola con Duelos::preparar() / Desafio::preparar() la primera vez que se usan (EnVivo\Migraciones::aplicar('duelos.sql')).
-- Todo con IF NOT EXISTS: se puede correr las veces que se quiera. Fechas: segundos Unix; días: 'YYYY-MM-DD' (America/Guayaquil).

-- ===================================================================== Duelo de Productoras
-- "Mejor equipo de duelo" de cada jugador: personal (resumen validado) + equipos del inventario del servidor.
-- El kit básico de duelo (igual para todos) no se guarda aquí: lo agrega el servidor en cada duelo.
CREATE TABLE IF NOT EXISTS duelo_equipos (
    jugador_id INTEGER PRIMARY KEY REFERENCES jugadores(id) ON DELETE CASCADE,
    servidor_id INTEGER NOT NULL,
    equipo_json TEXT NOT NULL,          -- {"personal":[{rol,habilidad,dueno}], "inventario":[{id,item,serie}]}
    resumen_json TEXT NOT NULL,         -- lo que ven los demás (cámaras, switcher, personal, poder)
    poder INTEGER NOT NULL DEFAULT 0,
    cambios INTEGER NOT NULL DEFAULT 0,
    actualizado INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS duelo_equipos_servidor ON duelo_equipos (servidor_id, poder);

-- Puntaje de duelo (tipo Elo) por temporada (mes calendario, 'YYYY-MM'). Al empezar una temporada se parte de la mitad
-- de la distancia a 1000 de la temporada anterior.
CREATE TABLE IF NOT EXISTS duelo_ratings (
    temporada TEXT NOT NULL,
    jugador_id INTEGER NOT NULL REFERENCES jugadores(id) ON DELETE CASCADE,
    servidor_id INTEGER NOT NULL,
    rating INTEGER NOT NULL DEFAULT 1000,
    mejor INTEGER NOT NULL DEFAULT 1000,
    ganados INTEGER NOT NULL DEFAULT 0,
    perdidos INTEGER NOT NULL DEFAULT 0,
    empates INTEGER NOT NULL DEFAULT 0,
    defensas_ganadas INTEGER NOT NULL DEFAULT 0,
    defensas_perdidas INTEGER NOT NULL DEFAULT 0,
    racha INTEGER NOT NULL DEFAULT 0,
    actualizado INTEGER NOT NULL,
    PRIMARY KEY (temporada, jugador_id)
);
CREATE INDEX IF NOT EXISTS duelo_ratings_ranking ON duelo_ratings (temporada, servidor_id, rating DESC);

-- Intentos de duelo por día: 5 gratis (+1 con VIP) y hasta 5 extra comprados con créditos (20 c/u).
CREATE TABLE IF NOT EXISTS duelo_cupos (
    jugador_id INTEGER NOT NULL REFERENCES jugadores(id) ON DELETE CASCADE,
    dia TEXT NOT NULL,
    usados INTEGER NOT NULL DEFAULT 0,
    extra INTEGER NOT NULL DEFAULT 0 CHECK (extra BETWEEN 0 AND 5),
    PRIMARY KEY (jugador_id, dia)
);

-- Cada duelo = un intento validado. El retador juega en vivo; el defensor es un "fantasma" (IA prudente con su equipo
-- guardado) que se calcula al crear el duelo con la MISMA semilla, el mismo contrato y el mismo contexto.
CREATE TABLE IF NOT EXISTS duelos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    temporada TEXT NOT NULL,
    dia TEXT NOT NULL,
    servidor_id INTEGER NOT NULL,
    retador_id INTEGER NOT NULL REFERENCES jugadores(id) ON DELETE CASCADE,
    defensor_id INTEGER NOT NULL REFERENCES jugadores(id) ON DELETE CASCADE,
    nivel TEXT NOT NULL CHECK (nivel IN ('facil', 'medio', 'dificil')),
    semilla INTEGER NOT NULL,
    contrato_json TEXT NOT NULL,
    contexto_json TEXT NOT NULL,
    intento_retador_json TEXT NOT NULL,     -- {seed, contrato, equipo, contexto, vip} tal como se entregó al juego
    intento_defensor_json TEXT NOT NULL,
    politica TEXT NOT NULL DEFAULT 'prudente',
    decisiones_defensor_json TEXT NOT NULL,
    calidad_defensor INTEGER NOT NULL,
    estrellas_defensor INTEGER NOT NULL,
    estado TEXT NOT NULL DEFAULT 'abierto' CHECK (estado IN ('abierto', 'validando', 'pendiente', 'cerrado')),
    decisiones_json TEXT,
    resultado_cliente_json TEXT,
    calidad_retador INTEGER,
    estrellas_retador INTEGER,
    validacion_json TEXT,                   -- respuesta completa del validador (para reclamos)
    version_logica TEXT,
    ganador TEXT CHECK (ganador IN ('retador', 'defensor', 'empate')),
    motivo TEXT,                            -- null | 'vencido' | 'jugada_imposible' | motivo del validador
    sospechoso INTEGER NOT NULL DEFAULT 0,
    rating_retador_antes INTEGER,
    rating_defensor_antes INTEGER,
    cambio_retador INTEGER,
    cambio_defensor INTEGER,
    fama_retador INTEGER NOT NULL DEFAULT 0,
    fama_defensor INTEGER NOT NULL DEFAULT 0,
    visto_defensor INTEGER NOT NULL DEFAULT 0,
    creado INTEGER NOT NULL,
    vence INTEGER NOT NULL,
    cerrado INTEGER
);
CREATE INDEX IF NOT EXISTS duelos_retador ON duelos (retador_id, id);
CREATE INDEX IF NOT EXISTS duelos_defensor ON duelos (defensor_id, id);
CREATE INDEX IF NOT EXISTS duelos_estado ON duelos (estado, vence);
CREATE INDEX IF NOT EXISTS duelos_par ON duelos (retador_id, defensor_id, dia);
CREATE INDEX IF NOT EXISTS duelos_sospechosos ON duelos (sospechoso, id) WHERE sospechoso = 1;

-- Cierre de temporada (una sola vez) y premios por puesto (top 10 por servidor).
CREATE TABLE IF NOT EXISTS duelo_temporadas_cerradas (
    temporada TEXT PRIMARY KEY,
    cerrada INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS duelo_premios (
    temporada TEXT NOT NULL,
    jugador_id INTEGER NOT NULL REFERENCES jugadores(id) ON DELETE CASCADE,
    servidor_id INTEGER NOT NULL,
    puesto INTEGER NOT NULL,
    rating INTEGER NOT NULL,
    detalle_json TEXT NOT NULL,
    creado INTEGER NOT NULL,
    PRIMARY KEY (temporada, jugador_id)
);

-- ===================================================================== Desafío Técnico del Día
-- Un desafío por día para TODOS los servidores: modificador fijo según el día de la semana, misma semilla base,
-- mismo contrato y la misma "maleta" (personal y equipos para elegir con un presupuesto).
CREATE TABLE IF NOT EXISTS desafio_dias (
    dia TEXT PRIMARY KEY,
    modificador TEXT NOT NULL,
    semilla_base INTEGER NOT NULL,
    contrato_json TEXT NOT NULL,
    creado INTEGER NOT NULL,
    cerrado INTEGER                     -- cuándo se entregaron los premios del ranking
);

CREATE TABLE IF NOT EXISTS desafio_intentos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    dia TEXT NOT NULL,
    servidor_id INTEGER NOT NULL,
    jugador_id INTEGER NOT NULL REFERENCES jugadores(id) ON DELETE CASCADE,
    numero INTEGER NOT NULL,            -- 1 (y 2 con VIP)
    seleccion_json TEXT NOT NULL,       -- {"personal":[ids], "equipos":[ids]} de la maleta
    variante INTEGER NOT NULL,          -- k: semilla = variante k de la semilla base (la primera que trae lo que pide el día)
    semilla INTEGER NOT NULL,
    intento_json TEXT NOT NULL,         -- {seed, contrato, equipo, contexto, vip:false} tal como se entregó al juego
    incidentes_json TEXT NOT NULL,
    estado TEXT NOT NULL DEFAULT 'abierto' CHECK (estado IN ('abierto', 'validando', 'pendiente', 'valido', 'invalido', 'vencido')),
    decisiones_json TEXT,
    resultado_cliente_json TEXT,
    calidad INTEGER,
    estrellas INTEGER,
    validacion_json TEXT,
    version_logica TEXT,
    sospechoso INTEGER NOT NULL DEFAULT 0,
    motivo TEXT,
    creado INTEGER NOT NULL,
    vence INTEGER NOT NULL,
    terminado INTEGER,
    UNIQUE (dia, jugador_id, numero)
);
CREATE INDEX IF NOT EXISTS desafio_ranking ON desafio_intentos (dia, servidor_id, estado, calidad DESC, terminado);
CREATE INDEX IF NOT EXISTS desafio_jugador ON desafio_intentos (jugador_id, dia);
CREATE INDEX IF NOT EXISTS desafio_estado ON desafio_intentos (estado, vence);

CREATE TABLE IF NOT EXISTS desafio_premios (
    dia TEXT NOT NULL,
    jugador_id INTEGER NOT NULL REFERENCES jugadores(id) ON DELETE CASCADE,
    tipo TEXT NOT NULL CHECK (tipo IN ('participacion', 'ranking')),
    servidor_id INTEGER NOT NULL,
    puesto INTEGER,
    detalle_json TEXT NOT NULL,
    creado INTEGER NOT NULL,
    PRIMARY KEY (dia, jugador_id, tipo)
);

-- ===================================================================== Pases de Prensa
-- Saldo del servidor (los usa el Mega Festival). Cada cambio queda en el libro; la suma del libro = el saldo.
CREATE TABLE IF NOT EXISTS pases_prensa (
    jugador_id INTEGER PRIMARY KEY REFERENCES jugadores(id) ON DELETE CASCADE,
    saldo INTEGER NOT NULL DEFAULT 0 CHECK (saldo >= 0),
    actualizado INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS pases_prensa_libro (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    jugador_id INTEGER NOT NULL REFERENCES jugadores(id) ON DELETE CASCADE,
    cambio INTEGER NOT NULL,
    saldo INTEGER NOT NULL,
    motivo TEXT NOT NULL,
    ref TEXT,
    creado INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS pases_prensa_libro_jugador ON pases_prensa_libro (jugador_id, id);
