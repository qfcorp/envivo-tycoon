<?php
declare(strict_types=1);

namespace EnVivo;

/**
 * Error "esperado" para el jugador: lleva el texto, el código HTTP y datos extra (ej. 'codigo' => 'sin_creditos').
 * api.php lo convierte en { "ok": false, "error": texto, ...extra } con ese código HTTP.
 */
final class Fallo extends \RuntimeException
{
    public function __construct(string $texto, int $http = 400, public readonly array $extra = [])
    {
        parent::__construct($texto, $http);
    }

    public static function si(bool $condicion, string $texto, int $http = 400, array $extra = []): void
    {
        if ($condicion) throw new self($texto, $http, $extra);
    }
}
