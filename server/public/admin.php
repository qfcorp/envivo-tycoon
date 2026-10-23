<?php
// /admin.php quedó reemplazado por el Centro de Control /control/ (docs/INTEGRAR_CONTROL.md): entrada con formulario,
// segundo factor TOTP, lista de IPs, CSRF por sesión y las mismas acciones sobre las clases de server/src.
// Redirige ANTES de cualquier salida y sin leer nada de lo que mande el navegador (ni clave, ni formulario).
header('Location: /control/', true, 302);
header('Cache-Control: no-store');
exit;
