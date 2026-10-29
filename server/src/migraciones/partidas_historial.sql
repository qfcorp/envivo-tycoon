-- Historial de la partida en la nube (src/Partidas.php, API.md): red de seguridad por si un guardado pisa avance.
-- Por qué: la partida del dueño (fama 100) quedó pisada por el guardado de otro aparato (fama 9) y solo había los
-- respaldos de cada noche. Ahora, ANTES de cada guardado (en la misma transacción), la versión anterior se copia aquí.
-- Se puede aplicar las veces que sea (CREATE ... IF NOT EXISTS).
--  - rev, datos, actualizado, dispositivo: la versión tal como estaba en `partidas`.
--  - guardado_en: cuándo pasó al historial (cuándo la pisó la versión siguiente), segundos Unix.
--  - motivo: 'guardado' (normal), 'tomar' (la pisó un guardado con "tomar": true), 'retroceso' (la pisó una partida con
--    menos fama; con menos avance nunca se guarda), 'otro_avance' (la pisó otro aparato con versión vieja pero más
--    avance), 'nueva' (terminó en quiebra y el jugador empezó otra), 'antes_de_restaurar' (el panel restauró otra versión encima).
-- Se conservan por jugador: las últimas 30, la más nueva de cada día de los últimos 60 días y las de motivo
-- tomar / retroceso / otro_avance / nueva / antes_de_restaurar por 90 días (Partidas::podar). Al borrar la cuenta se borran también.

CREATE TABLE IF NOT EXISTS partidas_historial (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    jugador_id INTEGER NOT NULL REFERENCES jugadores(id) ON DELETE CASCADE,
    rev INTEGER NOT NULL,
    datos TEXT NOT NULL,
    actualizado INTEGER NOT NULL,
    dispositivo TEXT,
    guardado_en INTEGER NOT NULL,
    motivo TEXT NOT NULL DEFAULT 'guardado'
);
CREATE INDEX IF NOT EXISTS partidas_historial_jugador ON partidas_historial (jugador_id, id);
