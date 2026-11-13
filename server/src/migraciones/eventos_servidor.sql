-- Eventos de todo el servidor y calendario de adviento (server/src/EventosServidor.php, contrato en server/INTEGRAR_EVENTOS_SERVIDOR.md).
-- Seguro de correr otra vez. Las fechas de los eventos NO se guardan: salen del calendario (hora de Ecuador) y de los
-- cambios del Centro de Control (Ajustes "evs_config"). Instancia = "<clave>-<año en que empieza>", ej. "navidad-2026".

-- Libro de fichas de evento: + ganadas (diario, evento de la partida, juego en línea, adviento, ajuste) y − gastadas (tienda).
-- UNIQUE (instancia, jugador_id, ref): el mismo evento, el mismo día o la misma compra nunca cuentan dos veces.
-- aporte = lo que suma al objetivo común del servidor (servidor_id del jugador en ese momento).
CREATE TABLE IF NOT EXISTS evs_fichas (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    instancia TEXT NOT NULL,
    jugador_id INTEGER NOT NULL REFERENCES jugadores(id) ON DELETE CASCADE,
    servidor_id INTEGER NOT NULL DEFAULT 0,
    motivo TEXT NOT NULL CHECK (motivo IN ('diario', 'evento', 'en_linea', 'adviento', 'tienda', 'ajuste')),
    ref TEXT NOT NULL,
    fichas INTEGER NOT NULL,
    aporte INTEGER NOT NULL DEFAULT 0,
    dia TEXT NOT NULL,
    creado INTEGER NOT NULL,
    UNIQUE (instancia, jugador_id, ref)
);
CREATE INDEX IF NOT EXISTS evs_fichas_servidor ON evs_fichas (instancia, servidor_id);
CREATE INDEX IF NOT EXISTS evs_fichas_dia ON evs_fichas (instancia, jugador_id, dia, motivo);

-- Compras de la tienda de temporada (una fila por unidad; el tope por artículo se cuenta aquí).
CREATE TABLE IF NOT EXISTS evs_compras (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    instancia TEXT NOT NULL,
    jugador_id INTEGER NOT NULL REFERENCES jugadores(id) ON DELETE CASCADE,
    articulo TEXT NOT NULL,
    fichas INTEGER NOT NULL,
    creado INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS evs_compras_jugador ON evs_compras (instancia, jugador_id, articulo);

-- Meta del objetivo común por servidor: se calcula UNA vez (jugadores activos × días × factor) y queda fija, salvo que el
-- Centro de Control la cambie. cumplida = cuándo se llegó al 100 %.
CREATE TABLE IF NOT EXISTS evs_metas (
    instancia TEXT NOT NULL,
    servidor_id INTEGER NOT NULL,
    meta INTEGER NOT NULL,
    creado INTEGER NOT NULL,
    cumplida INTEGER,
    PRIMARY KEY (instancia, servidor_id)
);

-- Premios del objetivo común ya reclamados (uno por jugador, instancia e hito).
CREATE TABLE IF NOT EXISTS evs_premios_meta (
    instancia TEXT NOT NULL,
    jugador_id INTEGER NOT NULL REFERENCES jugadores(id) ON DELETE CASCADE,
    hito TEXT NOT NULL,
    creado INTEGER NOT NULL,
    PRIMARY KEY (instancia, jugador_id, hito)
);

-- Calendario de adviento (1 al 25 de diciembre): un regalo por día. recuperado = 1 si se reclamó al día siguiente.
CREATE TABLE IF NOT EXISTS evs_adviento (
    anio INTEGER NOT NULL,
    jugador_id INTEGER NOT NULL REFERENCES jugadores(id) ON DELETE CASCADE,
    dia INTEGER NOT NULL,
    recuperado INTEGER NOT NULL DEFAULT 0,
    creado INTEGER NOT NULL,
    PRIMARY KEY (anio, jugador_id, dia)
);

-- Decoraciones de sede de los eventos (son tuyas para siempre; el juego las pone en s.temporada.cosmeticos).
CREATE TABLE IF NOT EXISTS evs_cosmeticos (
    jugador_id INTEGER NOT NULL REFERENCES jugadores(id) ON DELETE CASCADE,
    clave TEXT NOT NULL,
    origen TEXT NOT NULL,
    creado INTEGER NOT NULL,
    PRIMARY KEY (jugador_id, clave)
);
