-- Partida en la nube con versión (compare-and-swap) y "un solo dispositivo activo" por cuenta (src/Partidas.php, API.md).
-- Se puede aplicar las veces que sea (Migraciones.php salta las columnas que ya existen).
--  - partidas.rev: sube en 1 con cada guardado. El juego manda la versión de la que partió ("base"); si en la nube hay
--    una más nueva (otro celular o pestaña guardó), el servidor responde 409 partida_desactualizada y no pisa nada.
--  - partidas.dispositivo: código al azar de la pestaña que guardó (NULL = juego viejo, sin versión).
--  - partida_activa: la pestaña/dispositivo que está jugando ahora. Solo ese puede guardar; los demás reciben
--    409 otro_dispositivo y muestran "Tu partida se abrió en otro dispositivo".

ALTER TABLE partidas ADD COLUMN rev INTEGER NOT NULL DEFAULT 0;
ALTER TABLE partidas ADD COLUMN dispositivo TEXT;

CREATE TABLE IF NOT EXISTS partida_activa (
    jugador_id INTEGER PRIMARY KEY REFERENCES jugadores(id) ON DELETE CASCADE,
    dispositivo TEXT NOT NULL,
    desde INTEGER NOT NULL      -- cuándo tomó la partida (segundos Unix)
);
