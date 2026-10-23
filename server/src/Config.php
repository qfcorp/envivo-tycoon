<?php
declare(strict_types=1);

namespace EnVivo;

/**
 * Configuración: archivo de texto FUERA del repositorio (por defecto /etc/envivo/config.env; en pruebas se cambia
 * con la variable de entorno ENVIVO_CONFIG). Formato: CLAVE=valor, una por línea; las líneas que empiezan con ; o #
 * son comentarios. Aquí nunca se escriben claves reales (el repositorio es público): ver server/config.env.ejemplo.
 */
final class Config
{
    public const RUTA_POR_DEFECTO = '/etc/envivo/config.env';

    /** @var array<string,string> */
    private static array $valores = [];
    private static bool $cargada = false;

    public static function ruta(): string
    {
        $r = getenv('ENVIVO_CONFIG');
        return is_string($r) && $r !== '' ? $r : self::RUTA_POR_DEFECTO;
    }

    public static function cargar(): void
    {
        if (self::$cargada) return;
        self::$cargada = true;
        $f = self::ruta();
        if (is_file($f) && is_readable($f)) self::$valores = self::leer((string) file_get_contents($f));
    }

    /** @return array<string,string> */
    public static function leer(string $texto): array
    {
        $o = [];
        foreach (preg_split('/\r\n|\r|\n/', $texto) ?: [] as $linea) {
            $linea = trim($linea);
            if ($linea === '' || $linea[0] === ';' || $linea[0] === '#') continue;
            if (!preg_match('/^([A-Z][A-Z0-9_]*)\s*=\s*(.*)$/', $linea, $m)) continue;
            $v = trim($m[2]);
            if (strlen($v) >= 2 && ($v[0] === '"' || $v[0] === "'") && $v[strlen($v) - 1] === $v[0]) $v = substr($v, 1, -1);
            $o[$m[1]] = $v;
        }
        return $o;
    }

    public static function get(string $clave, string $porDefecto = ''): string
    {
        $v = self::$valores[$clave] ?? '';
        return $v === '' ? $porDefecto : $v;
    }

    public static function zona(): string
    {
        $z = self::get('ENVIVO_ZONA', 'America/Guayaquil');
        return in_array($z, \DateTimeZone::listIdentifiers(), true) ? $z : 'America/Guayaquil';
    }

    public static function db(): string { return self::get('ENVIVO_DB', '/var/lib/envivo/envivo.sqlite'); }
}
