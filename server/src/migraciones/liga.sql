-- Tablas de la Liga Semanal de Productoras (server/src/Liga.php). Se aplican solas desde Liga::preparar() si falta
-- alguna (todas con CREATE ... IF NOT EXISTS: correr esto otra vez no hace nada ni borra datos).
-- Fechas: segundos Unix, como el resto de la base. Semana = fecha del lunes (America/Guayaquil), ej. '2026-10-19'.

-- Valores propios de la liga (ej. 'secreto' para firmar los intentos mientras no está el validador).
CREATE TABLE IF NOT EXISTS liga_ajustes (
    clave TEXT PRIMARY KEY,
    valor TEXT NOT NULL,
    actualizado INTEGER NOT NULL
);

-- Una fila por semana jugada. 'agrupada' = ya se armaron los grupos; 'cerrada' = ya se repartieron premios y ascensos.
CREATE TABLE IF NOT EXISTS liga_semanas (
    semana TEXT PRIMARY KEY,
    inicio INTEGER NOT NULL,
    fin INTEGER NOT NULL,                 -- lunes siguiente 00:00 (exclusivo): la semana termina el domingo 23:59:59
    estado TEXT NOT NULL DEFAULT 'abierta' CHECK (estado IN ('abierta', 'cerrada')),
    agrupada INTEGER NOT NULL DEFAULT 0,
    creada INTEGER NOT NULL,
    cerrada_en INTEGER
);

-- Liga actual de cada asociación: 0 Barrial · 1 Provincial · 2 Nacional · 3 Internacional · 4 Mundial.
CREATE TABLE IF NOT EXISTS liga_asociaciones (
    asociacion_id INTEGER PRIMARY KEY REFERENCES asociaciones(id) ON DELETE CASCADE,
    liga INTEGER NOT NULL DEFAULT 0 CHECK (liga BETWEEN 0 AND 4),
    desde INTEGER NOT NULL,
    mejor_liga INTEGER NOT NULL DEFAULT 0,
    semanas INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS liga_grupos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    semana TEXT NOT NULL,
    liga INTEGER NOT NULL,
    numero INTEGER NOT NULL,
    creado INTEGER NOT NULL,
    UNIQUE (semana, numero)
);
CREATE INDEX IF NOT EXISTS liga_grupos_semana ON liga_grupos (semana, liga);

-- Asociaciones inscritas en una semana (con su grupo y puntaje). nombre/siglas/color se copian por si la asociación
-- se borra a mitad de semana (el ranking sigue mostrándola).
CREATE TABLE IF NOT EXISTS liga_participantes (
    semana TEXT NOT NULL,
    asociacion_id INTEGER NOT NULL,
    grupo_id INTEGER NOT NULL REFERENCES liga_grupos(id),
    liga INTEGER NOT NULL,
    puntos INTEGER NOT NULL DEFAULT 0,
    tareas_completadas INTEGER NOT NULL DEFAULT 0,
    actualizado INTEGER NOT NULL,         -- cuándo cambió el puntaje (desempate: llegó primero)
    nombre TEXT NOT NULL,
    siglas TEXT NOT NULL,
    color TEXT NOT NULL,
    servidor_id INTEGER,
    posicion INTEGER,
    resultado TEXT CHECK (resultado IS NULL OR resultado IN ('sube', 'baja', 'queda')),
    liga_nueva INTEGER,
    PRIMARY KEY (semana, asociacion_id)
);
CREATE INDEX IF NOT EXISTS liga_participantes_grupo ON liga_participantes (grupo_id, puntos DESC, actualizado);

-- Encargos del tablero. n = número de encargo de esa asociación en esa semana (0..11 al empezar, 12.. los que reemplazan).
CREATE TABLE IF NOT EXISTS liga_tareas (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    semana TEXT NOT NULL,
    asociacion_id INTEGER NOT NULL,
    n INTEGER NOT NULL,
    plantilla TEXT NOT NULL,
    titulo TEXT NOT NULL,
    icono TEXT NOT NULL,
    criterio_json TEXT NOT NULL,
    meta INTEGER NOT NULL CHECK (meta BETWEEN 1 AND 50),
    puntos INTEGER NOT NULL,
    horas INTEGER NOT NULL,
    estado TEXT NOT NULL DEFAULT 'disponible' CHECK (estado IN ('disponible', 'tomada', 'completada', 'descartada')),
    jugador_id INTEGER,
    tomada_en INTEGER,
    vence_en INTEGER,
    avance INTEGER NOT NULL DEFAULT 0,
    completada_en INTEGER,
    visible_desde INTEGER NOT NULL,
    creado INTEGER NOT NULL,
    UNIQUE (semana, asociacion_id, n)
);
CREATE INDEX IF NOT EXISTS liga_tareas_tablero ON liga_tareas (semana, asociacion_id, estado);
CREATE INDEX IF NOT EXISTS liga_tareas_jugador ON liga_tareas (jugador_id, estado);

-- Lo que hizo cada jugador por cada asociación en la semana (límite de encargos y quién recibe premios).
CREATE TABLE IF NOT EXISTS liga_miembro_semana (
    semana TEXT NOT NULL,
    jugador_id INTEGER NOT NULL,
    asociacion_id INTEGER NOT NULL,
    tareas_usadas INTEGER NOT NULL DEFAULT 0,
    tareas_completadas INTEGER NOT NULL DEFAULT 0,
    puntos INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (semana, jugador_id, asociacion_id)
);
CREATE INDEX IF NOT EXISTS liga_miembro_asoc ON liga_miembro_semana (semana, asociacion_id);

-- Intentos de evento de la liga: el servidor entrega semilla + contrato y guarda el equipo registrado; el juego manda
-- sus decisiones. modo 'firma' (por ahora: se acepta lo que dice el juego si el intento lleva la firma del servidor)
-- o 'repeticion' (server/validador repite la jugada). Las decisiones se guardan SIEMPRE para poder revalidar después.
CREATE TABLE IF NOT EXISTS liga_intentos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    jugador_id INTEGER NOT NULL,
    tarea_id INTEGER NOT NULL REFERENCES liga_tareas(id),
    semana TEXT NOT NULL,
    semilla INTEGER NOT NULL,
    contrato_json TEXT NOT NULL,
    equipo_json TEXT NOT NULL,
    contexto_json TEXT NOT NULL,
    vip INTEGER NOT NULL DEFAULT 0,
    estado TEXT NOT NULL DEFAULT 'emitido' CHECK (estado IN ('emitido', 'validado', 'firmado', 'pendiente', 'rechazado', 'vencido')),
    modo TEXT,
    decisiones_json TEXT,
    cliente_json TEXT,
    resultado_json TEXT,
    calidad INTEGER,
    estrellas INTEGER,
    cuenta INTEGER NOT NULL DEFAULT 0,    -- 1 = sumó avance al encargo
    sospechoso INTEGER NOT NULL DEFAULT 0,
    motivo TEXT,
    version_logica TEXT,
    creado INTEGER NOT NULL,
    vence INTEGER NOT NULL,
    cerrado INTEGER
);
CREATE INDEX IF NOT EXISTS liga_intentos_jugador ON liga_intentos (jugador_id, estado);
CREATE INDEX IF NOT EXISTS liga_intentos_estado ON liga_intentos (estado, id);

-- Fichas de liga: saldo + libro (cada cambio con motivo y referencia única, así un premio nunca se paga dos veces).
CREATE TABLE IF NOT EXISTS liga_fichas (
    jugador_id INTEGER PRIMARY KEY REFERENCES jugadores(id) ON DELETE CASCADE,
    saldo INTEGER NOT NULL DEFAULT 0 CHECK (saldo >= 0)
);
CREATE TABLE IF NOT EXISTS liga_fichas_mov (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    jugador_id INTEGER NOT NULL REFERENCES jugadores(id) ON DELETE CASCADE,
    cambio INTEGER NOT NULL,
    saldo INTEGER NOT NULL,
    motivo TEXT NOT NULL,                 -- bandera, posicion, tienda, manual
    ref TEXT NOT NULL,
    semana TEXT,
    creado INTEGER NOT NULL,
    UNIQUE (jugador_id, ref)
);

-- Compras en la tienda de la liga (para los límites por semana) y cosméticos que tiene cada jugador.
CREATE TABLE IF NOT EXISTS liga_compras (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    jugador_id INTEGER NOT NULL REFERENCES jugadores(id) ON DELETE CASCADE,
    articulo TEXT NOT NULL,
    fichas INTEGER NOT NULL,
    entrega_id INTEGER,
    semana TEXT NOT NULL,
    creado INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS liga_compras_jugador ON liga_compras (jugador_id, semana, articulo);
CREATE TABLE IF NOT EXISTS liga_cosmeticos (
    jugador_id INTEGER NOT NULL REFERENCES jugadores(id) ON DELETE CASCADE,
    cosmetico TEXT NOT NULL,
    creado INTEGER NOT NULL,
    PRIMARY KEY (jugador_id, cosmetico)
);
