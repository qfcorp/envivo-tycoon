-- Promociones de regalo con cupo (server/src/BlackFriday.php, contrato en server/API.md "Black Friday"). Seguro de correr otra vez.
-- Una fila por cuenta que reclamó: UNIQUE (promo, jugador_id) = una vez por cuenta aunque lleguen dos peticiones a la vez;
-- UNIQUE (promo, instalacion) = una vez por instalación del juego (NULL no choca: /canjear.html no la manda).
-- El cupo (100) se revisa dentro de Db::tx (BEGIN IMMEDIATE: un solo escritor a la vez), así nunca pasa del tope.
CREATE TABLE IF NOT EXISTS promo_reclamos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    promo TEXT NOT NULL,
    jugador_id INTEGER NOT NULL REFERENCES jugadores(id) ON DELETE CASCADE,
    canal TEXT NOT NULL DEFAULT 'juego' CHECK (canal IN ('juego', 'codigo', 'web')),
    instalacion TEXT,
    ip TEXT,
    vip_antes INTEGER,
    vip_hasta INTEGER NOT NULL,
    creado INTEGER NOT NULL,
    UNIQUE (promo, jugador_id),
    UNIQUE (promo, instalacion)
);
CREATE INDEX IF NOT EXISTS promo_reclamos_ip ON promo_reclamos (promo, ip);
