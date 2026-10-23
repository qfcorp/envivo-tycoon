-- Universos y actividad diaria (server/src/Universos.php, contrato en server/COPAS.md §1).
-- Se aplica sola (Db::migrarModulos) cada vez que cambia algún archivo de migraciones/; correr esto otra vez no hace
-- nada ni borra datos (CREATE ... IF NOT EXISTS, ALTER con revisión de columna, INSERT ... WHERE NOT EXISTS).
-- Los servidores 2, 3... del Universo Andino NO se crean aquí: los agrega Universos::preparar() (lee la configuración
-- UNIVERSO_SERVIDORES_INICIALES, que un .sql no puede leer). La columna servidores.fusionado_en es de fusiones.sql.

-- Grupo de servidores que compiten entre sí en la Copa de Servidores. activo = 0: universo retirado (sin copa).
CREATE TABLE IF NOT EXISTS universos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nombre TEXT NOT NULL,
    creado INTEGER NOT NULL,
    activo INTEGER NOT NULL DEFAULT 1
);

ALTER TABLE servidores ADD COLUMN universo_id INTEGER REFERENCES universos(id);
CREATE INDEX IF NOT EXISTS servidores_universo ON servidores (universo_id, abierto);

-- Universo 1 (el primero): en una base que ya existe se lleva a los servidores que ya había (Servidor 1 · Quito).
INSERT INTO universos (id, nombre, creado, activo)
    SELECT 1, 'Universo Andino', CAST(strftime('%s', 'now') AS INTEGER), 1
    WHERE NOT EXISTS (SELECT 1 FROM universos);
UPDATE servidores SET universo_id = (SELECT MIN(id) FROM universos) WHERE universo_id IS NULL;

-- Un día jugado por jugador (dia 'YYYY-MM-DD' en la hora del juego). servidor_id = su servidor ese día.
-- eventos = intentos en línea validados ese día (Universos::marcarActivo($j, true)).
CREATE TABLE IF NOT EXISTS actividad_diaria (
    dia TEXT NOT NULL,
    jugador_id INTEGER NOT NULL REFERENCES jugadores(id) ON DELETE CASCADE,
    servidor_id INTEGER,
    eventos INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (dia, jugador_id)
);
CREATE INDEX IF NOT EXISTS actividad_diaria_jugador ON actividad_diaria (jugador_id, dia);
CREATE INDEX IF NOT EXISTS actividad_diaria_servidor ON actividad_diaria (servidor_id, dia);

-- Base que ya existía: los días de la tabla vieja "actividad" (DAU/MAU del Centro de Control) de los últimos 31 días
-- pasan a actividad_diaria, así el reparto y la salud de los servidores no arrancan "a ciegas". INSERT OR IGNORE: una vez.
INSERT OR IGNORE INTO actividad_diaria (dia, jugador_id, servidor_id, eventos)
    SELECT a.dia, a.jugador_id, j.servidor_id, 0 FROM actividad a JOIN jugadores j ON j.id = a.jugador_id
    WHERE a.dia >= date('now', '-31 day');
