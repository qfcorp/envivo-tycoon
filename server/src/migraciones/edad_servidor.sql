-- Edad del servidor (server/src/EdadServidor.php, conexión en server/INTEGRAR_EDAD_SERVIDOR.md).
-- Se aplica sola (Db::migrarModulos) y se puede correr otra vez sin cambiar nada (CREATE ... IF NOT EXISTS, INSERT OR IGNORE).
--
-- clave 'corte': los servidores con servidores.creado <= corte son VETERANOS (todo lo de la línea de tiempo abierto: los
--   jugadores que ya existían no pierden nada). Se fija UNA sola vez, la primera vez que corre esta migración, en
--   "ahora + 24 h" (así los servidores que se crean en el mismo despliegue, por ejemplo los del Universo Andino, también
--   cuentan como veteranos). Se puede cambiar con EDAD_SERVIDOR_CORTE en config.env.
-- clave 'inicio:<servidor_id>': (opcional, Centro de Control) reinicia la línea de tiempo de un servidor desde esa fecha.
CREATE TABLE IF NOT EXISTS servidor_edad_ajustes (
    clave TEXT PRIMARY KEY,
    valor TEXT NOT NULL,
    actualizado INTEGER NOT NULL
);

INSERT OR IGNORE INTO servidor_edad_ajustes (clave, valor, actualizado)
    VALUES ('corte', CAST(CAST(strftime('%s', 'now') AS INTEGER) + 86400 AS TEXT), CAST(strftime('%s', 'now') AS INTEGER));
