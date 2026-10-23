-- Aceptación de los Términos y la Política de privacidad (server/src/Terminos.php, server/INTEGRAR_CUENTA.md). Seguro de correr otra vez.
-- Una fila por jugador y versión de los términos. email_hash = sha256 del correo de ese momento: si la cuenta cambia de dueño
-- (transferencia oficial, cambia el correo) el nuevo dueño debe aceptar otra vez. No se guarda la IP.
CREATE TABLE IF NOT EXISTS cuenta_terminos (
    jugador_id INTEGER NOT NULL REFERENCES jugadores(id) ON DELETE CASCADE,
    version TEXT NOT NULL,
    email_hash TEXT NOT NULL,
    edad_minima INTEGER NOT NULL,
    origen TEXT NOT NULL,          -- registro · juego (ventana dentro del juego)
    aceptado INTEGER NOT NULL,     -- fecha (segundos)
    PRIMARY KEY (jugador_id, version, email_hash)
);
CREATE INDEX IF NOT EXISTS cuenta_terminos_jugador ON cuenta_terminos (jugador_id, aceptado);
