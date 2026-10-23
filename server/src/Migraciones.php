<?php
declare(strict_types=1);

namespace EnVivo;

/**
 * Aplica los archivos .sql de server/src/migraciones/ sobre una base que ya existe, sin borrar nada y las veces que se quiera.
 * - CREATE TABLE / CREATE INDEX / CREATE TRIGGER deben llevar IF NOT EXISTS (se ejecutan tal cual).
 * - ALTER TABLE x ADD COLUMN y ...: SQLite no tiene "ADD COLUMN IF NOT EXISTS", así que antes se mira PRAGMA table_info(x)
 *   y si la columna ya está, se salta. Si la tabla no existe, también se salta (no hay nada que cambiar).
 * - INSERT: usar "... WHERE NOT EXISTS (...)" en el propio .sql para no duplicar.
 * Todo el archivo va en UNA transacción (Db::tx): o se aplica completo o no se aplica nada.
 */
final class Migraciones
{
    public const CARPETA = __DIR__ . '/migraciones';

    /** Aplica un archivo (nombre dentro de migraciones/, ej. 'google.sql'). Devuelve las columnas agregadas ("tabla.columna"). */
    public static function aplicar(string $archivo): array
    {
        if (!preg_match('/^[a-z0-9_]+\.sql$/', $archivo)) throw new \InvalidArgumentException('Nombre de migración no válido: ' . $archivo);
        $f = self::CARPETA . '/' . $archivo;
        if (!is_file($f)) throw new \RuntimeException('No existe la migración ' . $archivo);
        return self::aplicarTexto((string) file_get_contents($f));
    }

    /** @return list<string> columnas agregadas */
    public static function aplicarTexto(string $sql): array
    {
        $agregadas = [];
        Db::tx(function () use ($sql, &$agregadas): void {
            foreach (self::sentencias($sql) as $s) {
                if (preg_match('/^ALTER\s+TABLE\s+"?(\w+)"?\s+ADD\s+(?:COLUMN\s+)?"?(\w+)"?\s/i', $s . ' ', $m)) {
                    $cols = self::columnas($m[1]);
                    if ($cols === null || isset($cols[strtolower($m[2])])) continue;
                    Db::pdo()->exec($s);
                    $agregadas[] = $m[1] . '.' . $m[2];
                    continue;
                }
                Db::pdo()->exec($s);
            }
        });
        return $agregadas;
    }

    /** Columnas de una tabla (en minúsculas), o null si la tabla no existe. @return array<string,true>|null */
    public static function columnas(string $tabla): ?array
    {
        if (!preg_match('/^\w+$/', $tabla)) return null;
        $filas = Db::todas('PRAGMA table_info(' . $tabla . ')');
        if (!$filas) return null;
        $o = [];
        foreach ($filas as $c) $o[strtolower((string) $c['name'])] = true;
        return $o;
    }

    /**
     * Separa el texto en sentencias por ";" (respeta textos entre comillas simples y quita los comentarios "--").
     * Los bloques BEGIN ... END de un trigger se mantienen juntos.
     * @return list<string>
     */
    public static function sentencias(string $sql): array
    {
        $o = [];
        $actual = '';
        $n = strlen($sql);
        $enTexto = false;
        $profundidad = 0;   // BEGIN ... END (triggers)
        for ($i = 0; $i < $n; $i++) {
            $ch = $sql[$i];
            if ($enTexto) {
                $actual .= $ch;
                if ($ch === "'") {
                    if ($i + 1 < $n && $sql[$i + 1] === "'") { $actual .= "'"; $i++; }
                    else $enTexto = false;
                }
                continue;
            }
            if ($ch === '-' && $i + 1 < $n && $sql[$i + 1] === '-') {
                while ($i < $n && $sql[$i] !== "\n") $i++;
                $actual .= "\n";
                continue;
            }
            if ($ch === "'") { $enTexto = true; $actual .= $ch; continue; }
            if (ctype_alpha($ch) && ($i === 0 || !ctype_alnum($sql[$i - 1]) && $sql[$i - 1] !== '_')) {
                if (preg_match('/\G(BEGIN|END)\b/Ai', $sql, $m, 0, $i)) {
                    $profundidad += strtoupper($m[1]) === 'BEGIN' ? 1 : -1;
                    if ($profundidad < 0) $profundidad = 0;
                }
            }
            if ($ch === ';' && $profundidad === 0) {
                if (trim($actual) !== '') $o[] = trim($actual);
                $actual = '';
                continue;
            }
            $actual .= $ch;
        }
        if (trim($actual) !== '') $o[] = trim($actual);
        return $o;
    }
}
