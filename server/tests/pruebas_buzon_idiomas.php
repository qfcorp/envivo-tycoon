<?php
// SOLO PRUEBAS (nunca en el servidor del juego). Mensajes automáticos del buzón y avisos del sistema en el chat en los
// 10 idiomas (server/src/TextosSistema.php, Buzon::enviarPlantilla / Buzon::json, Chat::sistemaPlantilla / avisoPlantilla),
// con base SQLite TEMPORAL:
//   - todas las plantillas en los 10 idiomas, sin claves de más y con los mismos marcadores {..}; nombres por idioma completos
//   - el español sigue siendo el texto de siempre (columnas titulo/cuerpo/texto) y las difusiones del dueño no cambian
//   - quien lee con Accept-Language en / pt-BR ve el título y el texto en su idioma (buzón y chat); sin cabecera, español
//   - ningún Buzon::enviar con texto fijo en src/ y todas las claves que usa el código existen
// Uso:  php server/tests/pruebas_buzon_idiomas.php        (GUARDAR_TMP=1 para dejar la base)
if (PHP_SAPI !== 'cli') { http_response_code(404); exit; }
error_reporting(E_ALL);

$RAIZ = dirname(__DIR__, 2);
$TMP = sys_get_temp_dir() . '/envivo_buzon_idiomas_' . bin2hex(random_bytes(4));
mkdir($TMP . '/datos', 0777, true);
file_put_contents($TMP . '/config.env', "; SOLO PRUEBAS\nENVIVO_DB=$TMP/datos/envivo.sqlite\nENVIVO_ZONA=America/Guayaquil\nENVIVO_URL=http://127.0.0.1:1\n");
putenv('ENVIVO_CONFIG=' . $TMP . '/config.env');
$_SERVER['REMOTE_ADDR'] = '10.0.0.7';
require dirname(__DIR__) . '/src/arranque.php';

use EnVivo\{Buzon, Chat, Db, Festival, Invitaciones, Liga, Duelos, TextosSistema};

$OK = 0; $FALLAS = 0;
function titulo(string $t): void { echo "\n== $t\n"; }
function check(string $n, mixed $esperado, mixed $salio): void
{
    global $OK, $FALLAS;
    if ($esperado === $salio) { $OK++; echo "  OK    $n\n"; return; }
    $FALLAS++;
    echo "  FALLA $n — esperado " . json_encode($esperado, JSON_UNESCAPED_UNICODE) . ', salió ' . json_encode($salio, JSON_UNESCAPED_UNICODE) . "\n";
}
register_shutdown_function(function () use ($TMP) {
    if (getenv('GUARDAR_TMP') === '1') echo "Archivos de la prueba en $TMP\n";
    else exec('rm -rf ' . escapeshellarg($TMP));
});
function idioma(?string $al): void { if ($al === null) unset($_SERVER['HTTP_ACCEPT_LANGUAGE']); else $_SERVER['HTTP_ACCEPT_LANGUAGE'] = $al; }

// =====================================================================
titulo('Plantillas: 10 idiomas, mismas claves y mismos marcadores');
check('Los 10 idiomas del juego', ['es', 'en', 'pt-BR', 'fr', 'de', 'it', 'ru', 'tr', 'id', 'zh-CN'], array_keys(TextosSistema::T));
check('Mismos idiomas que el resto del servidor (Push / CorreoPlantillas)', [true, true], [TextosSistema::IDIOMAS === \EnVivo\Push::IDIOMAS, TextosSistema::IDIOMAS === \EnVivo\CorreoPlantillas::IDIOMAS]);
$claves = array_keys(TextosSistema::T['es']);
$faltan = []; $sobran = []; $marcas = []; $vacios = [];
foreach (TextosSistema::T as $L => $tx) {
    foreach (array_diff($claves, array_keys($tx)) as $k) $faltan[] = "$L.$k";
    foreach (array_diff(array_keys($tx), $claves) as $k) $sobran[] = "$L.$k";
    foreach ($tx as $k => $t) {
        if (trim($t) === '') $vacios[] = "$L.$k";
        if (isset(TextosSistema::T['es'][$k]) && TextosSistema::marcadores($t) !== TextosSistema::marcadores(TextosSistema::T['es'][$k])) $marcas[] = "$L.$k";
    }
}
check('Ninguna plantilla falta en ningún idioma', [], $faltan);
check('Ninguna clave de más', [], $sobran);
check('Los mismos marcadores {..} en los 10 idiomas', [], $marcas);
check('Ningún texto vacío', [], $vacios);
check('Hay plantillas de buzón y de chat (más de 40)', true, count($claves) > 40);
$nom = [];
foreach (array_slice(TextosSistema::IDIOMAS, 1) as $L) {
    $n = TextosSistema::NOMBRES[$L] ?? [];
    $nom[] = array_keys($n['mes'] ?? []) === range(1, 12) && count($n['liga_semanal'] ?? []) === count(Liga::LIGAS) && count($n['liga_festival'] ?? []) === count(Festival::LIGAS);
}
check('Nombres por idioma completos (12 meses, ligas semanales y del festival) en los 9 idiomas', array_fill(0, 9, true), $nom);
check('Títulos del buzón caben en el máximo (' . Buzon::MAX_TITULO . ' caracteres, con marcadores cortos)', [], array_values(array_filter(
    array_merge(...array_map(fn($L) => array_map(fn($k) => "$L.$k", array_keys(array_filter(TextosSistema::T[$L], fn($t, $k) => str_ends_with($k, '_t') && mb_strlen($t) > Buzon::MAX_TITULO - 20, ARRAY_FILTER_USE_BOTH))), TextosSistema::IDIOMAS)))));

titulo('El código usa las plantillas (sin textos fijos en español)');
$src = '';
foreach (glob($RAIZ . '/server/src/*.php') as $f) if (basename($f) !== 'Buzon.php') $src .= file_get_contents($f);
check('Ningún Buzon::enviar( con texto fijo en src/ (todos con enviarPlantilla)', 0, preg_match_all('/Buzon::enviar\(/', $src));
check('Ningún INSERT directo de avisos en chat_mensajes fuera de Chat y GranProduccion', [], array_values(array_filter(array_map('basename', glob($RAIZ . '/server/src/*.php')),
    fn($b) => !in_array($b, ['Chat.php', 'GranProduccion.php', 'Db.php'], true) && str_contains((string) file_get_contents($RAIZ . '/server/src/' . $b), 'INSERT INTO chat_mensajes'))));
// primer argumento literal de la clave (las que se arman con . o ?: van en $dinamicas)
preg_match_all("/(?:enviarPlantilla\([^,()]+, |(?:sistema|aviso)Plantilla\([^,()]+(?:\([^()]*\))?, |TextosSistema::(?:texto|todos)\()'([a-z0-9_]+)'(?:, '([a-z0-9_]+)')?/", $src . file_get_contents($RAIZ . '/server/src/Buzon.php'), $m);
$usadas = array_values(array_unique(array_filter(array_merge($m[1], $m[2]), fn($k) => $k !== '' && !str_ends_with($k, '_'))));
$dinamicas = [];
foreach (array_keys(Invitaciones::ETAPAS) as $e) $dinamicas[] = 'inv_etapa_' . $e . '_c';
foreach (Invitaciones::DISTINTIVO_META as $d) $dinamicas[] = 'inv_meta_dist_' . $d;
foreach (['inv_meta1_t', 'inv_meta1_c', 'inv_meta_t', 'inv_meta_c', 'aliado_regalo_t', 'aliado_regalo_c', 'aliado_sin_regalo_t', 'aliado_sin_regalo_c', 'liga_sube', 'liga_baja',
    'regalos_cofre', 'regalos_cofre_anonimo', 'copa_aporte_campeon', 'copa_aporte', 'chat_silencio_dias', 'chat_silencio_horas', 'duelo_defensor', 'duelo_retador', 'duelo_empate', 'copa_campeon', 'copa_fin'] as $k) $dinamicas[] = $k;
check('El código usa más de 20 claves literales', true, count($usadas) > 20);
check('Todas las claves que usa el código existen en TextosSistema', [], array_values(array_diff(array_merge($usadas, $dinamicas), $claves)));

titulo('El español es el texto de siempre');
check('Bienvenida de invitación', ['🎁 Bienvenida de tu equipo', "Llegaste invitado por Ana. Aquí tienes un pack de bienvenida para empezar.\n¡Que tu primera transmisión salga perfecta!"],
    array_values(TextosSistema::buzon('inv_bienvenida_t', 'inv_bienvenida_c', ['alias' => 'Ana'])['es']));
check('Meta de 10 amigos con letrero', "¡Ya tienes 10 amigos activos en EN VIVO Tycoon!\nAdemás ganaste el letrero dorado de la sede: se ve en tu vitrina.",
    TextosSistema::texto('inv_meta_c', 'es', ['n' => 10, 'extra' => fn($L) => TextosSistema::texto('inv_meta_dist_letrero_dorado', $L)]));
check('Desafío (dinero con puntos de miles)', '🎯 Desafío Técnico del 2026-11-12: puesto 1 en tu servidor. Premio: $15.000, 5 Pases de Prensa y 3 batería(s).',
    TextosSistema::texto('desafio_top', 'es', ['dia' => '2026-11-12', 'puesto' => 1, 'pases' => 5, 'bat' => 3, 'dinero' => fn($L) => TextosSistema::numero(15000, $L)]));
check('Mismo dinero en inglés con coma', true, str_contains(TextosSistema::texto('desafio_top', 'en', ['dinero' => fn($L) => TextosSistema::numero(15000, $L)]), '$15,000'));
check('Marcador con arreglo por idioma (y respaldo al español)', ['🎬 Código de A', '🎬 Code from B', '🎬 Code von A'],
    [TextosSistema::texto('aliado_sin_regalo_t', 'es', ['nombre' => ['es' => 'A', 'en' => 'B']]), TextosSistema::texto('aliado_sin_regalo_t', 'en', ['nombre' => ['es' => 'A', 'en' => 'B']]),
     TextosSistema::texto('aliado_sin_regalo_t', 'de', ['nombre' => ['es' => 'A']])]);
check('Idioma desconocido o clave que no existe: español / la clave', ['Te aceptaron en la asociación.', 'no_existe'], [TextosSistema::texto('asoc_aceptado', 'xx'), TextosSistema::texto('no_existe', 'en')]);

// =====================================================================
Db::pdo();
Buzon::preparar();
$t0 = time();
$nuevo = function (string $nombre) use ($t0): int {
    Db::q('INSERT INTO jugadores (email, nombre, clave_hash, creado, servidor_id, ultimo_ingreso) VALUES (?, ?, ?, ?, 1, ?)',
        [strtolower(preg_replace('/\W+/', '.', $nombre)) . '@prueba.example', $nombre, password_hash('ClaveBuena1', PASSWORD_BCRYPT), $t0, $t0]);
    return Db::ultimoId();
};
$A = $nuevo('Ana Idiomas');

titulo('Buzón: el título y el texto en el idioma de quien lee');
check('La migración agregó buzon.textos_json', true, isset(\EnVivo\Migraciones::columnas('buzon')['textos_json']));
$mid = Buzon::enviarPlantilla($A, 'inv_bienvenida_t', 'inv_bienvenida_c', ['alias' => 'Beto'], [['tipo' => 'dinero', 'cantidad' => 500]], ['tipo' => 'regalo', 'ref' => 'prueba:bienvenida']);
$fila = Db::fila('SELECT * FROM buzon WHERE id = ?', [$mid]);
check('Las columnas siguen en español (compatibilidad)', ['🎁 Bienvenida de tu equipo', true], [$fila['titulo'], str_starts_with($fila['cuerpo'], 'Llegaste invitado por Beto.')]);
check('textos_json guarda los 10 idiomas', TextosSistema::IDIOMAS, array_keys(json_decode((string) $fila['textos_json'], true)));
$msg = function (?string $al) use ($A, $mid): array {
    idioma($al);
    foreach (Buzon::listar($A)['mensajes'] as $m) if ($m['id'] === $mid) return [$m['titulo'], $m['cuerpo']];
    return [];
};
[$tEn, $cEn] = $msg('en-US,en;q=0.9');
check('Accept-Language en: título en inglés', '🎁 Welcome from your team', $tEn);
check('… y el texto en inglés, con el alias y el salto de línea', "You were invited by Beto. Here's a welcome pack to get you started.\nMay your first broadcast go perfectly!", $cEn);
check('Accept-Language pt-BR: en portugués', '🎁 Boas-vindas da sua equipe', $msg('pt-BR')[0]);
check('Accept-Language zh: en chino (zh-CN)', '🎁 来自团队的欢迎礼', $msg('zh')[0]);
check('Accept-Language es-EC: en español', '🎁 Bienvenida de tu equipo', $msg('es-EC')[0]);
check('Sin Accept-Language: en español', '🎁 Bienvenida de tu equipo', $msg(null)[0]);
check('Idioma que el juego no tiene (ja): en español', '🎁 Bienvenida de tu equipo', $msg('ja')[0]);
idioma('en');
check('leer y reclamar también responden en inglés', ['🎁 Welcome from your team', '🎁 Welcome from your team'],
    [Buzon::leer($A, $mid)['mensaje']['titulo'], Buzon::reclamar($A, $mid)['mensaje']['titulo']]);
check('El mismo ref no se repite (idempotente)', null, Buzon::enviarPlantilla($A, 'inv_bienvenida_t', 'inv_bienvenida_c', ['alias' => 'Beto'], [], ['ref' => 'prueba:bienvenida']));

$r = Buzon::difundir(['tipo' => 'aviso', 'titulo' => 'Mantenimiento el lunes', 'cuerpo' => 'Escrito por el dueño', 'filtro' => ['alcance' => 'lista', 'lista' => (string) $A]], 'control:prueba');
$dif = array_values(array_filter(Buzon::listar($A)['mensajes'], fn($m) => $m['titulo'] === 'Mantenimiento el lunes'));
check('Difusión del dueño: queda tal cual la escribió (también en inglés) y sin textos_json', [1, 'Escrito por el dueño', null],
    [count($dif), $dif[0]['cuerpo'] ?? null, Db::valor('SELECT textos_json FROM buzon WHERE envio_id = ?', [$r['envio_id']])]);

Buzon::crearCodigo(['codigo' => 'IDIOMAS1', 'titulo' => 'Regalo del dueño', 'adjuntos' => [['tipo' => 'dinero', 'cantidad' => 100]]], 'control:prueba');
Buzon::crearCodigo(['codigo' => 'IDIOMAS2', 'titulo' => 'Otro regalo', 'mensaje' => 'Texto escrito a mano', 'adjuntos' => [['tipo' => 'dinero', 'cantidad' => 100]]], 'control:prueba');
$c1 = Buzon::canjear($A, 'idiomas1')['mensaje'];
$c2 = Buzon::canjear($A, 'idiomas2')['mensaje'];
check('Código sin texto: el título del dueño queda y el texto automático sale en inglés', ['Regalo del dueño', "Thanks for playing EN VIVO Tycoon! Here's the gift for code IDIOMAS1."], [$c1['titulo'], $c1['cuerpo']]);
check('… y en la base, en español', '¡Gracias por jugar EN VIVO Tycoon! Aquí está el regalo del código IDIOMAS1.', Db::valor('SELECT cuerpo FROM buzon WHERE id = ?', [$c1['id']]));
check('Código con texto escrito a mano: tal cual', ['Otro regalo', 'Texto escrito a mano'], [$c2['titulo'], $c2['cuerpo']]);

titulo('Chat: avisos del sistema en el idioma de quien lee');
$ult = fn(array $r) => end($r['mensajes'])['texto'] ?? null;
Chat::sistemaPlantilla($A, 'copa_aporte_campeon', ['copa' => 'Copa Planeta de Balompié', 'pts' => 120]);
idioma('en');
check('Copa (en): en inglés, con el nombre propio de la copa sin traducir', '🏆 Copa Planeta de Balompié: you contributed 120 points to your server, and it won the cup! Your trophy and rewards are already in the game.', $ult(Chat::leer($A, 'sistema', 0)));
idioma('es');
check('Copa (es): el texto de siempre', '🏆 Copa Planeta de Balompié: aportaste 120 puntos a tu servidor, ¡que salió campeón! Tu trofeo y tus premios ya están en el juego.', $ult(Chat::leer($A, 'sistema', 0)));
Chat::sancionar($A, 'silencio', 7200, 'spam', null);
idioma('de');
check('Silencio del chat (de): en alemán y el motivo del administrador tal cual', 'Du kannst 2 Stunde(n) lang nicht im Chat schreiben. Grund: spam', $ult(Chat::leer($A, 'sistema', 0)));
Chat::levantar($A);
Chat::avisoPlantilla('servidor:1', 'fusion_destino', ['n' => 12, 'origen' => 'Servidor 9', 'destino' => 'Servidor 1']);
idioma('fr');
check('Aviso del servidor (fusión) en francés', '🤝 Bienvenue aux 12 boîtes de prod de Servidor 9 ! Dès aujourd\'hui, elles jouent sur Servidor 1.', $ult(Chat::leer($A, 'servidor', 0)));
check('… y la columna texto en español', '🤝 ¡Bienvenidas las 12 productoras de Servidor 9! Desde hoy juegan en Servidor 1.', Db::valor("SELECT texto FROM chat_mensajes WHERE canal = 'servidor:1' ORDER BY id DESC LIMIT 1"));
idioma('ru');
Chat::sistemaPlantilla($A, 'liga_fin', ['asoc' => 'Los Pibes', 'puesto' => 1, 'n' => 8, 'fichas' => 30,
    'cambio' => fn($L) => TextosSistema::texto('liga_sube', $L, ['liga' => $L === 'es' ? Liga::LIGAS[1]['nombre'] : TextosSistema::nombre('liga_semanal', 1, $L)])]);
check('Liga (ru): con el nombre de la liga traducido', 'Недельная лига: Los Pibes заняла 1-е место из 8 и поднимается в лигу «Областная лига». Ты получил фишки лиги: 30.', $ult(Chat::leer($A, 'sistema', 0)));
check('Liga (es): el texto de siempre', 'Liga Semanal: Los Pibes terminó en el puesto 1 de 8 y sube a la Liga Provincial. Ganaste 30 fichas de liga.', Db::valor("SELECT texto FROM chat_mensajes WHERE canal = ? ORDER BY id DESC LIMIT 1", ['sistema:' . $A]));
idioma(null);
check('Mensajes de jugadores no se tocan (sin textos_json)', 0, (int) Db::valor('SELECT COUNT(*) FROM chat_mensajes WHERE jugador_id IS NOT NULL AND textos_json IS NOT NULL'));
check('Duelos::MESES y los meses traducidos tienen 12', [13, 12], [count(Duelos::MESES), count(TextosSistema::NOMBRES['en']['mes'])]);

echo "\n----------------------------------------\nPruebas del buzón en idiomas: $OK correctas, $FALLAS fallas\n";
exit($FALLAS ? 1 : 0);
