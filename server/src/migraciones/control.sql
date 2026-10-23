-- Centro de Control (/control/). Lo único propio del panel: sus sesiones de entrada. Todo lo demás (auditoría, ajustes,
-- precios y ofertas, reembolsos, estado de las cuentas, soporte) vive en las tablas del servidor (auditoria, ajustes,
-- productos_ajustes, ofertas, compras, jugadores, soporte_*) y se usa con sus clases.
-- Se aplica con  EnVivo\Migraciones::aplicar('control.sql')  (Control::preparar() lo hace solo si falta la tabla).
-- Todo con IF NOT EXISTS: se puede correr las veces que se quiera. Fechas: segundos Unix.

-- Sesiones del panel (galleta envivo_control). En la base solo va el sha256 del código de la galleta.
CREATE TABLE IF NOT EXISTS control_sesiones (
    token_hash TEXT PRIMARY KEY,
    usuario TEXT NOT NULL,
    huella TEXT NOT NULL,                -- depende del usuario, del hash de la clave y del secreto TOTP: si cambia algo, todas las sesiones mueren
    csrf TEXT NOT NULL,                  -- código CSRF propio de esta sesión (va en cada formulario POST)
    creado INTEGER NOT NULL,
    ultimo INTEGER NOT NULL,             -- último uso (se cierra sola tras 2 horas sin uso)
    expira INTEGER NOT NULL,             -- máximo 12 horas
    ip TEXT,
    navegador TEXT,
    aviso TEXT                           -- mensaje para mostrar una vez después de una acción (POST -> redirección -> GET)
);
CREATE INDEX IF NOT EXISTS control_sesiones_expira ON control_sesiones (expira);
