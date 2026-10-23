<?php
declare(strict_types=1);

namespace EnVivo;

/**
 * Ajustes que se cambian desde el Centro de Control (tabla ajustes):
 *  - mantenimiento (1/0) y mantenimiento_mensaje: bloquea las compras con dinero real (órdenes, pagos y Google Play).
 *  - anuncio_texto, anuncio_tipo (info|aviso|evento), anuncio_hasta (segundos Unix; vacío = sin fin): sale en /api/estado.
 */
final class Ajustes
{
    private static ?array $cache = null;

    public static function todos(): array
    {
        if (self::$cache !== null) return self::$cache;
        $o = [];
        try { foreach (Db::todas('SELECT clave, valor FROM ajustes') as $f) $o[$f['clave']] = $f['valor']; } catch (\Throwable) {}
        return self::$cache = $o;
    }

    public static function get(string $k, string $def = ''): string { return self::todos()[$k] ?? $def; }

    public static function set(string $k, string $v): void
    {
        Db::q('INSERT INTO ajustes (clave, valor, actualizado) VALUES (?, ?, ?) ON CONFLICT (clave) DO UPDATE SET valor = excluded.valor, actualizado = excluded.actualizado', [$k, $v, time()]);
        self::$cache = null;
    }

    /** Guarda varios valores en un solo paso y deja UNA línea en la auditoría con lo que cambió ("clave: antes -> después"). */
    public static function guardar(array $valores, string $quien, string $accion): void
    {
        Db::tx(function () use ($valores, $quien, $accion): void {
            $cambios = [];
            foreach ($valores as $k => $v) {
                $k = (string) $k; $v = (string) $v;
                Fallo::si(!preg_match('/^[a-z][a-z0-9_]{0,59}$/', $k), 'Ajuste no válido: ' . $k, 400, ['codigo' => 'ajuste_invalido']);
                $antes = self::get($k);
                if ($antes === $v) continue;
                self::set($k, $v);
                $cambios[] = $k . ': ' . mb_substr($antes, 0, 60) . ' -> ' . mb_substr($v, 0, 60);
            }
            if ($cambios) Auditoria::anotar($quien, $accion, implode(' · ', $cambios));
        });
    }

    public static function mantenimiento(): bool { return self::get('mantenimiento') === '1'; }

    public static function mensajeMantenimiento(): string
    {
        return self::get('mantenimiento_mensaje') ?: 'La tienda está en mantenimiento. Vuelve en un rato; tus créditos y compras están a salvo.';
    }

    /** Lanza Fallo 503 si las compras están bloqueadas por mantenimiento. */
    public static function exigirTiendaAbierta(): void
    {
        if (self::mantenimiento()) throw new Fallo(self::mensajeMantenimiento(), 503, ['codigo' => 'mantenimiento']);
    }

    /** Anuncio del sistema para /api/estado, o null. */
    public static function anuncio(): ?array
    {
        $t = self::get('anuncio_texto');
        if ($t === '') return null;
        $hasta = self::get('anuncio_hasta');
        if ($hasta !== '' && (int) $hasta <= time()) return null;
        return ['texto' => $t, 'tipo' => self::get('anuncio_tipo', 'info'), 'hasta' => $hasta === '' ? null : Db::iso((int) $hasta),
                'id' => substr(hash('sha256', $t . '|' . $hasta), 0, 12)];
    }
}
