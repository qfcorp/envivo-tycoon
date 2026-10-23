<?php
declare(strict_types=1);

namespace EnVivo;

/**
 * Puente PHP → Node para los eventos en línea ("el servidor tira los dados", server/validador/README.md).
 * - validar($intento): repite el intento en el validador (server/validador/). Primero el servicio HTTP en 127.0.0.1
 *   (VALIDADOR_URL + VALIDADOR_CLAVE); si no responde, el modo consola (node server/validador/validador.js).
 *   Si alguien agrega una clase EnVivo\Validador con validar(array): array, se usa esa (un solo lugar para todo).
 * - motor($peticion): server/eventos/motor.js (fantasma del defensor de un duelo y semilla del Desafío del Día).
 * Nunca lanza por un Node caído: devuelve ['ok'/'valido' => false, 'detalle'|'motivo' => 'validador_caido'].
 * Configuración (/etc/envivo/config.env): VALIDADOR_URL, VALIDADOR_CLAVE, NODE_BIN (por defecto /usr/bin/node o "node").
 */
final class Repeticion
{
    /** SOLO PRUEBAS: reemplaza a Node (fn(string $tipo, array $datos): array). */
    public static ?\Closure $doble = null;

    public static function scriptValidador(): string { return dirname(__DIR__) . '/validador/validador.js'; }
    public static function scriptMotor(): string { return dirname(__DIR__) . '/eventos/motor.js'; }

    public static function node(): string
    {
        $n = Config::get('NODE_BIN');
        if ($n !== '') return $n;
        foreach (['/usr/bin/node', '/usr/local/bin/node'] as $f) if (is_executable($f)) return $f;
        return 'node';   // proc_open con lista busca en el PATH
    }

    /** Repite un intento {seed, contrato, equipo, contexto, vip, decisiones, cliente_resultado}. */
    public static function validar(array $intento): array
    {
        if (self::$doble) return (self::$doble)('validar', $intento);
        if (class_exists(__NAMESPACE__ . '\\Validador') && method_exists(__NAMESPACE__ . '\\Validador', 'validar')) {
            return \call_user_func([__NAMESPACE__ . '\\Validador', 'validar'], $intento);
        }
        $json = json_encode($intento, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
        if ($json === false) return ['valido' => false, 'calidad' => null, 'estrellas' => null, 'detalle' => ['motivo' => 'json_invalido']];
        $url = rtrim(Config::get('VALIDADOR_URL', 'http://127.0.0.1:8790'), '/');
        $clave = Config::get('VALIDADOR_CLAVE');
        if ($clave !== '' && function_exists('curl_init')) {
            $ch = curl_init($url . '/validar');
            curl_setopt_array($ch, [
                CURLOPT_POST => true, CURLOPT_POSTFIELDS => $json, CURLOPT_RETURNTRANSFER => true,
                CURLOPT_HTTPHEADER => ['Content-Type: application/json', 'X-Validador-Clave: ' . $clave],
                CURLOPT_CONNECTTIMEOUT_MS => 500, CURLOPT_TIMEOUT_MS => 2000, CURLOPT_PROXY => '', CURLOPT_NOSIGNAL => true,
            ]);
            $cuerpo = curl_exec($ch);
            $codigo = (int) curl_getinfo($ch, CURLINFO_RESPONSE_CODE);
            curl_close($ch);
            if (is_string($cuerpo) && ($codigo === 200 || $codigo === 400)) {
                $r = json_decode($cuerpo, true);
                if (is_array($r)) return $r + ['via' => 'http'];
            }
            if ($codigo === 401) error_log('EN VIVO: la clave del validador no coincide (VALIDADOR_CLAVE)');
        }
        $r = self::consola(self::scriptValidador(), $json, 4000);
        if ($r === null) return ['valido' => false, 'calidad' => null, 'estrellas' => null, 'detalle' => ['motivo' => 'validador_caido']];
        return $r + ['via' => 'consola'];
    }

    /** Llama a server/eventos/motor.js. Devuelve su respuesta o ['ok' => false, 'motivo' => 'validador_caido']. */
    public static function motor(array $peticion): array
    {
        if (self::$doble) return (self::$doble)('motor', $peticion);
        $json = json_encode($peticion, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
        if ($json === false) return ['ok' => false, 'motivo' => 'json_invalido'];
        return self::consola(self::scriptMotor(), $json, 6000) ?? ['ok' => false, 'motivo' => 'validador_caido'];
    }

    /** node <script> < json  → arreglo, o null si no se pudo (Node no está, tardó demasiado o respondió mal). */
    private static function consola(string $script, string $json, int $ms): ?array
    {
        if (!is_file($script)) { error_log('EN VIVO: no existe ' . $script); return null; }
        $proc = @proc_open([self::node(), $script], [0 => ['pipe', 'r'], 1 => ['pipe', 'w'], 2 => ['pipe', 'w']], $tubos);
        if (!is_resource($proc)) { error_log('EN VIVO: no se pudo arrancar Node (NODE_BIN)'); return null; }
        fwrite($tubos[0], $json);
        fclose($tubos[0]);
        stream_set_blocking($tubos[1], false);
        $salida = '';
        $fin = microtime(true) + $ms / 1000;
        while (microtime(true) < $fin) {
            $leer = [$tubos[1]]; $nada = null;
            if (@stream_select($leer, $nada, $nada, 0, 100000)) {
                $t = fread($tubos[1], 65536);
                if ($t !== false) $salida .= $t;
            }
            if (feof($tubos[1])) break;
        }
        $listo = feof($tubos[1]);
        $err = stream_get_contents($tubos[2]);
        fclose($tubos[1]); fclose($tubos[2]);
        if (!$listo) { proc_terminate($proc, 9); proc_close($proc); error_log('EN VIVO: Node tardó demasiado (' . basename($script) . ')'); return null; }
        proc_close($proc);
        $r = json_decode(trim($salida), true);
        if (!is_array($r)) { error_log('EN VIVO: respuesta inválida de ' . basename($script) . ': ' . mb_substr((string) $err, 0, 300)); return null; }
        return $r;
    }
}
