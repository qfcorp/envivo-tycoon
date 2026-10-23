<?php
declare(strict_types=1);

namespace EnVivo;

/**
 * Filtro del chat y de los nombres públicos (alias, asociaciones):
 *  - Groserías: lista editable en el panel (tabla chat_palabras). Se compara sin tildes, sin mayúsculas, con los trucos
 *    comunes (números por letras: "put4", letras repetidas: "puuuta", puntos en medio: "p.u.t.a", letras sueltas: "p u t a").
 *    Las palabras de la lista también cuentan en plural ("pendejos", "huevones").
 *  - Datos de contacto: enlaces, correos y números de teléfono (9 o más dígitos, o +593): nadie debe sacar a los
 *    jugadores (muchos son menores) del juego.
 */
final class Filtro
{
    /** Lista inicial (Ecuador). Se copia a la base en la migración; después se edita en el panel. */
    public const PALABRAS_INICIALES = [
        'verga', 'vergas', 'vergazo', 'careverga', 'mamaverga', 'puta', 'puto', 'putas', 'putos', 'putamadre', 'puta madre',
        'hijueputa', 'hijo de puta', 'hijodeputa', 'hdp', 'chucha', 'chuchatumadre', 'chucha tu madre', 'chuchesumadre',
        'conchatumadre', 'conchetumadre', 'mierda', 'cabron', 'cabrona', 'cojudo', 'cojuda', 'pendejo', 'pendeja',
        'maricon', 'marica', 'huevon', 'guevon', 'webon', 'mamahuevo', 'mama huevo', 'malparido', 'malparida', 'culo',
        'culero', 'culera', 'gonorrea', 'zorra', 'perra', 'imbecil', 'estupido', 'estupida', 'idiota', 'mongol', 'mongolico',
        'retrasado', 'longo', 'longa', 'puneta', 'pajero', 'pajera', 'pija', 'pinga', 'joder', 'jodete', 'follar', 'sidoso',
        'violar', 'violador', 'matate', 'suicidate', 'nazi', 'negro de mierda', 'indio de mierda', 'cholo de mierda', 'pito',
    ];

    private static ?array $patrones = null;

    /** Sin tildes, en minúsculas y con los números/símbolos que se usan como letras. */
    public static function normalizar(string $t): string
    {
        $t = mb_strtolower($t, 'UTF-8');
        $t = strtr($t, ['á' => 'a', 'à' => 'a', 'ä' => 'a', 'â' => 'a', 'é' => 'e', 'è' => 'e', 'ë' => 'e', 'ê' => 'e', 'í' => 'i', 'ì' => 'i',
            'ï' => 'i', 'î' => 'i', 'ó' => 'o', 'ò' => 'o', 'ö' => 'o', 'ô' => 'o', 'ú' => 'u', 'ù' => 'u', 'ü' => 'u', 'û' => 'u', 'ñ' => 'n', 'ç' => 'c',
            '0' => 'o', '1' => 'i', '3' => 'e', '4' => 'a', '5' => 's', '7' => 't', '@' => 'a', '$' => 's', '!' => 'i', '|' => 'i']);
        // Letras sueltas separadas por espacios ("p u t a") se juntan
        $t = preg_replace_callback('/(?<![\p{L}])(?:\p{L}[ ]+){2,}\p{L}(?![\p{L}])/u', fn($m) => str_replace(' ', '', $m[0]), $t) ?? $t;
        return $t;
    }

    /** Una palabra de la lista lista para guardar (minúsculas, sin tildes, un solo espacio). */
    public static function limpiarPalabra(string $p): string
    {
        $p = mb_strtolower(trim($p), 'UTF-8');
        $p = strtr($p, ['á' => 'a', 'é' => 'e', 'í' => 'i', 'ó' => 'o', 'ú' => 'u', 'ü' => 'u', 'ñ' => 'n']);
        $p = preg_replace('/[^a-z ]+/', '', $p) ?? '';
        return trim(preg_replace('/ +/', ' ', $p) ?? '');
    }

    public static function olvidarLista(): void { self::$patrones = null; }

    /** Expresión de una palabra: cada letra se puede repetir y puede llevar . - _ * entre letras. */
    private static function patron(string $palabra): string
    {
        $partes = [];
        foreach (explode(' ', $palabra) as $w) {
            preg_match_all('/(.)\1*/', $w, $runs);
            $letras = array_map(fn($r) => preg_quote($r[0], '/') . '{' . strlen($r) . ',}', $runs[0]);
            $partes[] = implode('[._\-*,~]*', $letras);
        }
        return '(?<![a-z])' . implode('[^a-z]+', $partes) . '(?:e?s)?(?![a-z])';
    }

    private static function patrones(): array
    {
        if (self::$patrones !== null) return self::$patrones;
        $lista = [];
        try { $lista = Db::todas('SELECT palabra FROM chat_palabras ORDER BY palabra'); } catch (\Throwable) {}
        $ps = [];
        foreach ($lista as $f) { $w = self::limpiarPalabra((string) $f['palabra']); if ($w !== '') $ps[] = self::patron($w); }
        // En bloques (una expresión gigante podría pasar el límite de PCRE)
        return self::$patrones = array_map(fn($b) => '/' . implode('|', $b) . '/u', array_chunk($ps, 60));
    }

    public static function tieneGroseria(string $texto): bool
    {
        // Se revisa con y sin cambiar números/símbolos por letras ("Verga!" no debe volverse "vergai")
        $formas = array_unique([self::normalizar($texto), self::normalizar(preg_replace('/[0-9@$!|]+/', ' ', $texto) ?? $texto)]);
        foreach (self::patrones() as $p) foreach ($formas as $n) if (preg_match($p, $n)) return true;
        return false;
    }

    /** ¿Trae un enlace, un correo o un teléfono? */
    public static function tieneContacto(string $texto): bool
    {
        $t = mb_strtolower($texto, 'UTF-8');
        // Enlaces: "http", "www." o "algo.com" (punto pegado: "Gracias. Me voy" no es un enlace) o "algo punto com"
        $tld = 'com|net|org|ec|io|gg|ly|me|tv|co|xyz|app|info|link|site|online|store|biz|es|top|live|shop|club|lat|pe|mx|ar|cl|us';
        if (preg_match('#https?:|www\s*\.|\b[a-z0-9-]{2,}\.(' . $tld . ')(?![a-z])|\b[a-z0-9-]{2,}\s+punto\s+(com|net|org|ec)\b#u', $t)) return true;
        // Correos: "a@b.com" o "a arroba b punto com" ("@todos" sin dominio no cuenta)
        if (preg_match('/[a-z0-9._%+-]+\s*(@|\(at\)|\barroba\b)\s*[a-z0-9-]+(\.[a-z]{2,}|\s+punto\s+[a-z]{2,})/u', $t)) return true;
        if (preg_match('/\+\s*5\s*9\s*3/', $t)) return true;
        if (preg_match_all('/(?<![\d$])\d(?:[\s.\-()\/]*\d){8,}/', $t, $m)) return true;   // 9 o más dígitos (no si empieza con $)
        if (preg_match('/\b(whatsapp|wasap|wsp|telegram|instagram|insta|tiktok|facebook|discord)\s*[:#]?\s*@?[a-z0-9._]{3,}/u', $t)) return true;
        return false;
    }

    /** Lanza Fallo si el texto no se puede publicar. */
    public static function revisar(string $texto, string $que = 'Tu mensaje'): void
    {
        Fallo::si(self::tieneContacto($texto), $que . ' no puede llevar enlaces, correos ni números de teléfono.', 400, ['codigo' => 'contacto']);
        Fallo::si(self::tieneGroseria($texto), $que . ' tiene palabras que no están permitidas en el juego.', 400, ['codigo' => 'groseria']);
    }
}
