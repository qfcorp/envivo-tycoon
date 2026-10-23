<?php
declare(strict_types=1);

// Escribe server/src/CatalogoJuego.php con los datos del juego que el servidor necesita para revisar lo que manda el
// jugador (Festival, Liga): los 14 roles, los equipos que se compran con dinero del juego (categoría, fama mínima,
// nombre) y los tipos de evento. Todo sale de js/datos.js (lo único que manda), con node.
// Correrlo cada vez que cambie js/datos.js:   php server/bin/catalogo_juego.php
// Revisar sin escribir (lo hace server/tests/correr.sh):   php server/bin/catalogo_juego.php --revisar   (sale 1 si está desfasado)

if (PHP_SAPI !== 'cli') { http_response_code(404); exit; }
$raiz = dirname(__DIR__, 2);
$destino = dirname(__DIR__) . '/src/CatalogoJuego.php';
$node = getenv('NODE_BIN') ?: trim((string) shell_exec('command -v node'));
if ($node === '') { fwrite(STDERR, "Falta node (o NODE_BIN)\n"); exit(2); }

$js = <<<'JS'
const d = require(process.argv[1]);
const T = d.TEXTOS;
const equipos = {};
for (const [k, v] of Object.entries(d.CATALOGO)) equipos[k] = { cat: v.cat, fama: v.minRep | 0, nombre: T['item.' + k + '.nombre'] || k };
const eventos = {};
for (const [k, v] of Object.entries(d.EVENTOS)) eventos[k] = { nombre: T['ev.' + k] || k, cams: v.cams, audio: !!v.audio, stream: +v.stream, outdoor: +v.outdoor, diff: v.diff, pay: v.pay, fama: v.minRep | 0, clientes: v.clients };
const exclusivos = {};
for (const k of ['dron4k', 'grua', 'unidad_movil', 'generador', 'vip_cam8k', 'vip_switcher', 'vip_satelital'].concat(Object.keys(d.CATALOGO).filter((x) => d.CATALOGO[x].exclusivo)))
  if (T['item.' + k + '.nombre']) exclusivos[k] = { nombre: T['item.' + k + '.nombre'], detalle: T['item.' + k + '.desc'] || '' };
process.stdout.write(JSON.stringify({ roles: d.ROLES_DATA.map((r) => r.key), alias: d.ROLE_ALIAS, equipos, eventos, exclusivos }));
JS;
$sal = shell_exec(escapeshellarg($node) . ' -e ' . escapeshellarg($js) . ' ' . escapeshellarg($raiz . '/js/datos.js') . ' 2>&1');
$d = json_decode((string) $sal, true);
if (!is_array($d) || empty($d['roles']) || empty($d['equipos']) || empty($d['eventos'])) { fwrite(STDERR, "No se pudo leer js/datos.js: $sal\n"); exit(2); }

$v = fn($x) => var_export($x, true);
$php = "<?php\ndeclare(strict_types=1);\n\nnamespace EnVivo;\n\n"
    . "/**\n * GENERADO por server/bin/catalogo_juego.php desde js/datos.js: NO editar a mano (correr ese script si cambia datos.js).\n"
    . " * Lo usan Festival y Liga para revisar roles, equipos y tipos de evento que manda el juego.\n */\nfinal class CatalogoJuego\n{\n"
    . '    /** Los roles del juego (claves nuevas). */' . "\n    public const ROLES = " . $v($d['roles']) . ";\n\n"
    . '    /** Claves viejas de rol -> nuevas (el juego todavía las acepta). */' . "\n    public const ROL_ALIAS = " . $v($d['alias']) . ";\n\n"
    . '    /** Equipos que se compran con dinero del juego: clave => [cat, fama (mínima), nombre]. */' . "\n    public const EQUIPOS = " . $v($d['equipos']) . ";\n\n"
    . '    /** Tipos de evento: clave => [nombre, cams [mín, máx], audio, stream, outdoor, diff, pay [mín, máx], fama, clientes]. */' . "\n    public const EVENTOS = " . $v($d['eventos']) . ";\n\n"
    . '    /** Nombres y detalles de los exclusivos que también están en Catalogo::PREMIUM (deben coincidir). */' . "\n    public const EXCLUSIVOS = " . $v($d['exclusivos']) . ";\n}\n";

$actual = is_file($destino) ? (string) file_get_contents($destino) : '';
if (in_array('--revisar', $argv, true)) {
    if ($actual === $php) { echo "CatalogoJuego.php al día con js/datos.js\n"; exit(0); }
    echo "CatalogoJuego.php DESFASADO de js/datos.js: corre  php server/bin/catalogo_juego.php\n"; exit(1);
}
if ($actual === $php) { echo "Sin cambios\n"; exit(0); }
file_put_contents($destino, $php);
echo 'Escrito ' . $destino . ': ' . count($d['roles']) . ' roles, ' . count($d['equipos']) . ' equipos, ' . count($d['eventos']) . " tipos de evento\n";
