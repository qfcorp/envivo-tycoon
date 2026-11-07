-- Conector del Panel Tukan Central (/tukan_central.php, src/ConectorCentral.php): cada token sirve una sola vez.
-- Se guarda el nonce con su vencimiento; los vencidos se borran solos. Se puede correr muchas veces.
CREATE TABLE IF NOT EXISTS tukan_central_nonces (
    nonce TEXT PRIMARY KEY,
    exp INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS tukan_central_nonces_exp ON tukan_central_nonces (exp);
