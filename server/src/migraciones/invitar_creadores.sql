-- "Invita a tu equipo" (src/Invitaciones.php) y "Productores Aliados" (src/Aliados.php). Ver server/INTEGRAR_INVITAR.md.
-- Seguro de correr otra vez (IF NOT EXISTS). Nada de esto convierte créditos en dinero: el pago a los creadores es aparte.

-- Una fila por cuenta que llegó con ?ref= (un jugador solo puede tener UN invitador).
-- estado 'bloqueada' = no da premios al invitador (mismo aparato, aparato repetido, demasiadas desde la misma conexión).
-- capitulo2 / dias3 / asociacion / activo = cuándo cumplió cada etapa (segundos Unix); null = todavía no.
CREATE TABLE IF NOT EXISTS invitaciones (
    invitado_id INTEGER PRIMARY KEY REFERENCES jugadores(id) ON DELETE CASCADE,
    invitador_id INTEGER NOT NULL REFERENCES jugadores(id) ON DELETE CASCADE,
    codigo TEXT NOT NULL,
    canal TEXT NOT NULL DEFAULT 'registro',
    instalacion TEXT,
    ip TEXT,
    estado TEXT NOT NULL DEFAULT 'ok' CHECK (estado IN ('ok', 'bloqueada')),
    motivo TEXT,
    bienvenida INTEGER NOT NULL DEFAULT 0,
    capitulo2 INTEGER,
    dias3 INTEGER,
    asociacion INTEGER,
    activo INTEGER,
    creado INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS invitaciones_invitador ON invitaciones (invitador_id, creado);
CREATE INDEX IF NOT EXISTS invitaciones_instalacion ON invitaciones (instalacion) WHERE instalacion IS NOT NULL;
CREATE INDEX IF NOT EXISTS invitaciones_ip ON invitaciones (ip, creado) WHERE ip IS NOT NULL;

-- Metas acumuladas ya entregadas (1, 3, 5 y 10 amigos activos): una vez por invitador y meta.
CREATE TABLE IF NOT EXISTS invitaciones_metas (
    invitador_id INTEGER NOT NULL REFERENCES jugadores(id) ON DELETE CASCADE,
    meta INTEGER NOT NULL,
    creado INTEGER NOT NULL,
    PRIMARY KEY (invitador_id, meta)
);

-- Distintivos cosméticos ganados (ej. 'letrero_dorado' por 10 amigos activos). Se ven en la vitrina (visitas).
CREATE TABLE IF NOT EXISTS distintivos (
    jugador_id INTEGER NOT NULL REFERENCES jugadores(id) ON DELETE CASCADE,
    clave TEXT NOT NULL,
    creado INTEGER NOT NULL,
    PRIMARY KEY (jugador_id, clave)
);

-- Creadores (Productores Aliados). codigo = normalizado (PRODUCTORJUAN), codigo_ver = como se escribe (PRODUCTOR-JUAN).
-- jugador_id = la cuenta del creador en el juego (insignia y créditos mensuales). porcentaje / creditos_mes null = por defecto.
CREATE TABLE IF NOT EXISTS aliados (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    codigo TEXT NOT NULL UNIQUE,
    codigo_ver TEXT NOT NULL,
    nombre TEXT NOT NULL,
    redes TEXT NOT NULL DEFAULT '',
    nivel INTEGER NOT NULL DEFAULT 1 CHECK (nivel BETWEEN 1 AND 5),
    jugador_id INTEGER REFERENCES jugadores(id) ON DELETE SET NULL,
    porcentaje REAL,
    creditos_mes INTEGER,
    activo INTEGER NOT NULL DEFAULT 1,
    notas TEXT NOT NULL DEFAULT '',
    creado INTEGER NOT NULL,
    actualizado INTEGER NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS aliados_jugador ON aliados (jugador_id) WHERE jugador_id IS NOT NULL;

-- Quién usó el código de qué creador (uno por cuenta: el primero que escribe). regalo = si recibió el regalo pequeño.
CREATE TABLE IF NOT EXISTS aliados_usos (
    jugador_id INTEGER PRIMARY KEY REFERENCES jugadores(id) ON DELETE CASCADE,
    aliado_id INTEGER NOT NULL REFERENCES aliados(id) ON DELETE CASCADE,
    canal TEXT NOT NULL,
    instalacion TEXT,
    ip TEXT,
    regalo INTEGER NOT NULL DEFAULT 0,
    motivo TEXT,
    creado INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS aliados_usos_aliado ON aliados_usos (aliado_id, creado);
CREATE INDEX IF NOT EXISTS aliados_usos_instalacion ON aliados_usos (instalacion) WHERE instalacion IS NOT NULL;
CREATE INDEX IF NOT EXISTS aliados_usos_ip ON aliados_usos (ip, creado) WHERE ip IS NOT NULL;

-- Créditos mensuales del creador para SU cuenta (una vez por mes 'AAAA-MM').
CREATE TABLE IF NOT EXISTS aliados_creditos (
    aliado_id INTEGER NOT NULL REFERENCES aliados(id) ON DELETE CASCADE,
    mes TEXT NOT NULL,
    jugador_id INTEGER NOT NULL,
    creditos INTEGER NOT NULL,
    creado INTEGER NOT NULL,
    PRIMARY KEY (aliado_id, mes)
);

-- Pagos en DINERO a los creadores (publicidad, aparte del juego): el panel solo calcula y anota "pagado".
CREATE TABLE IF NOT EXISTS aliados_pagos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    aliado_id INTEGER NOT NULL REFERENCES aliados(id) ON DELETE CASCADE,
    mes TEXT NOT NULL,
    compras INTEGER NOT NULL,
    ventas_usd REAL NOT NULL,
    porcentaje REAL NOT NULL,
    monto_usd REAL NOT NULL,
    nota TEXT NOT NULL DEFAULT '',
    pagado_en INTEGER NOT NULL,
    pagado_por TEXT NOT NULL,
    UNIQUE (aliado_id, mes)
);

-- Postulaciones desde /aliados.html (sin cuenta). Las ve el Centro de Control; también se avisa por correo a soporte.
CREATE TABLE IF NOT EXISTS aliados_postulaciones (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nombre TEXT NOT NULL,
    correo TEXT NOT NULL,
    redes TEXT NOT NULL,
    pais TEXT NOT NULL DEFAULT '',
    mensaje TEXT NOT NULL DEFAULT '',
    jugador_id INTEGER,
    ip TEXT,
    estado TEXT NOT NULL DEFAULT 'nueva' CHECK (estado IN ('nueva', 'revisada')),
    creado INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS aliados_postulaciones_estado ON aliados_postulaciones (estado, creado);
