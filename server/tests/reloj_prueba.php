<?php
// SOLO PRUEBAS (nunca en el servidor del juego). Reloj congelado para los procesos hijos de una prueba
// ("php -S" con el enrutador de la prueba y los scripts de server/bin/), que no comparten la memoria del proceso de la prueba:
//   ENVIVO_PRUEBA_AHORA=<segundos Unix> php -d auto_prepend_file=server/tests/reloj_prueba.php ...
// congela Liga, Copas y Universos en ese instante (en "php -S" auto_prepend_file no corre para el enrutador: el enrutador de la prueba lo incluye con require). Sin la variable no hace nada.
// También da envReloj(): las variables de faketime (LD_PRELOAD, FAKETIME...) para pasarlas a los procesos hijos que se
// arrancan con un entorno propio, así "faketime 'AAAA-MM-DD HH:MM' php server/tests/pruebas_X.php" mueve el reloj de todos.
if (PHP_SAPI !== 'cli' && PHP_SAPI !== 'cli-server') { http_response_code(404); exit; }

if (!function_exists('envReloj')) {
    /** Variables de entorno de faketime presentes en este proceso (vacío si no se usa faketime). */
    function envReloj(): array
    {
        $o = [];
        foreach (getenv() as $k => $v) if ($k === 'LD_PRELOAD' || $k === 'DONT_FAKE_MONOTONIC' || str_starts_with($k, 'FAKETIME')) $o[$k] = $v;
        return $o;
    }
}

(static function (): void {
    $t = getenv('ENVIVO_PRUEBA_AHORA');
    if ($t === false || !preg_match('/^\d{9,11}$/', $t)) return;
    // Este archivo corre antes que server/src/arranque.php: carga las clases de server/src igual que su autoload
    spl_autoload_register(static function (string $clase): void {
        if (!str_starts_with($clase, 'EnVivo\\')) return;
        $f = dirname(__DIR__) . '/src/' . str_replace('\\', '/', substr($clase, 7)) . '.php';
        if (is_file($f)) require $f;
    });
    $t = (int) $t;
    if (class_exists(\EnVivo\Liga::class)) \EnVivo\Liga::fijarReloj($t);
    if (class_exists(\EnVivo\Copas::class)) \EnVivo\Copas::$reloj = $t;
    if (class_exists(\EnVivo\Universos::class)) \EnVivo\Universos::fijarReloj($t);
})();
