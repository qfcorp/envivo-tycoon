-- Buzón del juego y códigos de regalo (server/src/Buzon.php, BuzonApi.php; integración en server/INTEGRAR_BUZON.md).
-- Se aplica sola (Db::migrarModulos). Correr esto otra vez no hace nada ni borra datos.

-- Un envío del Centro de Control (difusión a todos / un servidor / un universo / filtros, o compensación a una lista).
-- filtro_json = los filtros con que se eligió a los jugadores; nuevos = 1: los que entren después (y cumplan el filtro)
-- también lo reciben mientras no venza. estado 'retirado': desaparece de los buzones donde no se reclamó.
CREATE TABLE IF NOT EXISTS buzon_envios (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    tipo TEXT NOT NULL DEFAULT 'aviso',
    remitente TEXT NOT NULL DEFAULT 'EN VIVO Tycoon',
    titulo TEXT NOT NULL,
    cuerpo TEXT NOT NULL DEFAULT '',
    adjuntos_json TEXT NOT NULL DEFAULT '[]',
    filtro_json TEXT NOT NULL DEFAULT '{}',
    nuevos INTEGER NOT NULL DEFAULT 0,
    destinatarios INTEGER NOT NULL DEFAULT 0,
    expira INTEGER,
    estado TEXT NOT NULL DEFAULT 'activo' CHECK (estado IN ('activo', 'retirado')),
    creado INTEGER NOT NULL,
    creado_por TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS buzon_envios_activos ON buzon_envios (estado, nuevos, expira);

-- Un mensaje en el buzón de un jugador. ref (opcional) hace la creación idempotente: el mismo (jugador, ref) no se repite.
-- estado: sin_leer -> leido -> reclamado (reclamado solo si tiene adjuntos). borrado = 1: el jugador lo quitó de su lista.
CREATE TABLE IF NOT EXISTS buzon (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    jugador_id INTEGER NOT NULL REFERENCES jugadores(id) ON DELETE CASCADE,
    envio_id INTEGER REFERENCES buzon_envios(id),
    tipo TEXT NOT NULL DEFAULT 'aviso',
    remitente TEXT NOT NULL DEFAULT 'EN VIVO Tycoon',
    titulo TEXT NOT NULL,
    cuerpo TEXT NOT NULL DEFAULT '',
    adjuntos_json TEXT NOT NULL DEFAULT '[]',
    ref TEXT,
    estado TEXT NOT NULL DEFAULT 'sin_leer' CHECK (estado IN ('sin_leer', 'leido', 'reclamado')),
    borrado INTEGER NOT NULL DEFAULT 0,
    creado INTEGER NOT NULL,
    leido INTEGER,
    reclamado INTEGER,
    expira INTEGER
);
CREATE INDEX IF NOT EXISTS buzon_jugador ON buzon (jugador_id, borrado, estado);
CREATE UNIQUE INDEX IF NOT EXISTS buzon_ref ON buzon (jugador_id, ref) WHERE ref IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS buzon_envio_jugador ON buzon (envio_id, jugador_id) WHERE envio_id IS NOT NULL;

-- Códigos de regalo. codigo en mayúsculas sin espacios ni guiones. usos_max 0 = sin límite. Siempre UNO por cuenta;
-- con lote (generador de códigos únicos para influencers) también UNO por cuenta en todo el lote. etiqueta = el
-- influencer o la campaña (para las estadísticas).
CREATE TABLE IF NOT EXISTS buzon_codigos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    codigo TEXT NOT NULL UNIQUE,
    titulo TEXT NOT NULL,
    mensaje TEXT NOT NULL DEFAULT '',
    adjuntos_json TEXT NOT NULL DEFAULT '[]',
    usos_max INTEGER NOT NULL DEFAULT 0,
    usos INTEGER NOT NULL DEFAULT 0,
    desde INTEGER,
    hasta INTEGER,
    etiqueta TEXT NOT NULL DEFAULT '',
    lote TEXT,
    activo INTEGER NOT NULL DEFAULT 1,
    creado INTEGER NOT NULL,
    creado_por TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS buzon_codigos_etiqueta ON buzon_codigos (etiqueta);
CREATE INDEX IF NOT EXISTS buzon_codigos_lote ON buzon_codigos (lote);

-- Cada canje (uno por código y cuenta). buzon_id = el mensaje con el premio. lote copiado para "uno por lote".
CREATE TABLE IF NOT EXISTS buzon_canjes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    codigo_id INTEGER NOT NULL REFERENCES buzon_codigos(id),
    jugador_id INTEGER NOT NULL REFERENCES jugadores(id) ON DELETE CASCADE,
    lote TEXT,
    etiqueta TEXT NOT NULL DEFAULT '',
    buzon_id INTEGER,
    canal TEXT NOT NULL DEFAULT 'juego',
    creado INTEGER NOT NULL,
    UNIQUE (codigo_id, jugador_id)
);
CREATE INDEX IF NOT EXISTS buzon_canjes_jugador ON buzon_canjes (jugador_id, lote);
CREATE INDEX IF NOT EXISTS buzon_canjes_etiqueta ON buzon_canjes (etiqueta, creado);

-- Borradores de difusión del Centro de Control (vista previa antes de enviar).
CREATE TABLE IF NOT EXISTS buzon_borradores (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    datos_json TEXT NOT NULL,
    creado INTEGER NOT NULL,
    creado_por TEXT NOT NULL DEFAULT '',
    enviado INTEGER
);
