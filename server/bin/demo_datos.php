<?php
declare(strict_types=1);

// DATOS DE DEMOSTRACIÓN de EN VIVO Tycoon: llena el servidor con productoras de mentira (perfil, asociaciones, chat,
// mercado, liga, duelos y Copa de Servidores) para mostrar un mundo "vivo" en una demo, y los BORRA todos después.
// Guía para el dueño: docs/DEMO_DATOS.md. ¡Borrar antes del lanzamiento real!
//
//   sudo -u www-data ENVIVO_CONFIG=/etc/envivo/config.env php server/bin/demo_datos.php --crear
//   sudo -u www-data ENVIVO_CONFIG=/etc/envivo/config.env php server/bin/demo_datos.php --estado
//   sudo -u www-data ENVIVO_CONFIG=/etc/envivo/config.env php server/bin/demo_datos.php --borrar
//
// Cómo se reconoce lo demo (doble marca, nunca se toca nada que no tenga las dos):
//   - tabla demo_marcas(tabla, id, extra, creado) que crea este script (y que --borrar elimina al final);
//   - correos @demo.envivo.local (nunca correos reales). Las cuentas demo NO pueden entrar: clave_hash = '!' + hash
//     de una clave al azar (password_verify siempre falla).
// Todo se crea con los métodos de las clases (Cuentas, Social, Chat, Monedero, Inventario, Mercado, Liga...) donde se
// puede, en UNA transacción. Excepciones (documentadas en docs/DEMO_DATOS.md): la fama se fija directo (el tope diario
// es contra trampas del cliente), los mensajes del chat pasan por Chat::prepararTexto (filtro) y se guardan con horas
// escalonadas, y las publicaciones del mercado se crean con las mismas sentencias de Mercado::publicar porque el mercado
// exige una compra pagada con dinero real y aquí NO se compra nada (los créditos son un ajuste manual auditado 'demo').

if (PHP_SAPI !== 'cli') { http_response_code(404); exit; }
require dirname(__DIR__) . '/src/arranque.php';

use EnVivo\{Auditoria, Catalogo, Chat, Config, Cuentas, Db, Duelos, Fallo, Liga, Mercado, Migraciones, Monedero, Social};

const DEMO_DOMINIO = '@demo.envivo.local';
const DEMO_QUIEN = 'demo_datos';

// ---------------------------------------------------------------------------------------------- datos inventados
// [alias (3-24), nombre de la persona, fama, grupo de servidor (0 = el más grande, 2 = el chico)]
const DEMO_PRODUCTORAS = [
    ['Andes Live Producciones', 'Camila Andrade', 72, 0], ['Pacífico Stream', 'Mateo Cevallos', 64, 0],
    ['Volcán TV', 'Valentina Ortiz', 58, 0], ['Cotopaxi Media', 'Sebastián Salazar', 51, 0],
    ['Mitad del Mundo Films', 'Daniela Paredes', 47, 0], ['Quilotoa Records', 'Joaquín Vélez', 40, 0],
    ['Chimborazo Broadcast', 'Isabella Mora', 36, 0], ['Guayas Visión', 'Martín Benítez', 30, 0],
    ['Cóndor Producciones', 'Renata Jaramillo', 25, 0], ['Galápagos HD', 'Nicolás Espinoza', 19, 0],
    ['Amazonía En Vivo', 'Antonella Rivas', 13, 0], ['Sierra Sonido', 'Tomás Guerrero', 8, 0],
    ['Malecón Live', 'Luciana Villacís', 68, 1], ['Manglar Stream', 'Emiliano Zambrano', 55, 1],
    ['Santa Ana Media', 'Sofía Carrasco', 44, 1], ['Río Guayas TV', 'Diego Montalvo', 37, 1],
    ['Puerto Eventos', 'Martina León', 29, 1], ['Salinas Sound', 'Gabriel Torres', 22, 1],
    ['Cerro Blanco Films', 'Paula Herrera', 15, 1], ['Faro Producciones', 'Samuel Cordero', 9, 1],
    ['Cajas Media', 'Victoria Ochoa', 70, 2], ['Tomebamba Live', 'Andrés Calle', 61, 2],
    ['Paute Visión', 'Emilia Crespo', 49, 2], ['Turi Stream', 'Felipe Vázquez', 38, 2],
];

// [nombre, siglas, color, ingreso, descripción, grupo de servidor, índices de DEMO_PRODUCTORAS (el 1.º preside, el 2.º es vice)]
const DEMO_ASOCIACIONES = [
    ['Liga de los Andes', 'ANL', '#2e86de', 'abierto', 'Productoras de la Sierra. Transmitimos todo lo que se mueve.', 0, [0, 3, 6, 9, 11]],
    ['Costa a Costa', 'CAC', '#e67e22', 'solicitud', 'Del Pacífico a la Amazonía: eventos grandes y en equipo.', 0, [1, 4, 7, 10]],
    ['Señal Directa', 'SDR', '#27ae60', 'abierto', 'Cero cortes, cero excusas. Bienvenidas productoras nuevas.', 0, [2, 5, 8]],
    ['Puerto Live Crew', 'PLC', '#8e44ad', 'abierto', 'La crew del puerto: conciertos, fútbol y malecón.', 1, [12, 15, 17, 19]],
    ['Manglar Unido', 'MGU', '#16a085', 'solicitud', 'Productoras de la costa que se ayudan en cada festival.', 1, [13, 14, 16, 18]],
    ['Austro Unido', 'AUS', '#c0392b', 'abierto', 'Somos pocos pero bien equipados. ¡Vamos por la Copa!', 2, [20, 22]],
    ['Cuenca Señal', 'CSN', '#d4ac0d', 'abierto', 'Transmisiones con calidad de exportación desde el Austro.', 2, [21, 23]],
];

// Mensajes del chat: [minutos atrás, índice de productora, canal 'servidor' | 'asociacion', texto]
const DEMO_CHAT = [
    [190, 0, 'servidor', '¡Buenas, productoras! ¿Quién se apunta al festival de este fin de semana?'],
    [176, 1, 'servidor', 'Nosotros vamos con 4 cámaras y el dron. ¡Que no se caiga el internet!'],
    [150, 4, 'servidor', 'Alguien tiene un generador de sobra? El de la última feria quedó en mantenimiento.'],
    [131, 2, 'servidor', 'Hoy transmitimos el clásico barrial, 5 estrellas o nada 💪'],
    [95, 7, 'servidor', '¡Felicitaciones a Liga de los Andes por subir de liga!'],
    [44, 9, 'servidor', 'Primera vez en un concierto grande, deséenme suerte 🎬'],
    [170, 0, 'asociacion', 'Equipo: esta semana vamos por la segunda bandera del tablero.'],
    [120, 3, 'asociacion', 'Ya tomé el encargo del lanzamiento de autos, lo saco hoy.'],
    [165, 1, 'asociacion', 'Bienvenida a la asociación, cualquier duda pregunten aquí.'],
    [88, 2, 'asociacion', 'Recuerden registrar su equipo para la Copa antes del viernes.'],
    [185, 12, 'servidor', '¡Saludos desde el puerto! El Servidor 2 viene con todo a la Copa.'],
    [140, 13, 'servidor', '¿Alguien para armar coalición en el próximo evento en línea?'],
    [100, 15, 'servidor', 'Tremenda la final de anoche, la grúa hizo magia.'],
    [61, 18, 'servidor', 'Busco camarógrafos para un evento grande, paga bien 🎥'],
    [150, 12, 'asociacion', 'Crew: mañana a las 8 pm todos conectados para el festival.'],
    [110, 13, 'asociacion', 'Ya aceptamos a dos productoras nuevas, ¡bienvenidas!'],
    [175, 20, 'servidor', 'Somos el servidor chico pero con buena preparación vamos a dar pelea.'],
    [128, 21, 'servidor', '¡Vamos Austro! Cada evento en línea suma para la Copa.'],
    [72, 22, 'servidor', 'Hoy saqué 5 estrellas en el desafío del día 🏆'],
    [160, 20, 'asociacion', 'Equipo, con 2 eventos más cada uno pasamos al primer lugar en preparación.'],
    [90, 21, 'asociacion', 'Listo, ya estoy registrado en la Copa ✅'],
];

// Mercado: [índice de productora, equipo, precio]. Los equipos VIP solo se canjean con VIP (se le dan 7 días al vendedor).
const DEMO_MERCADO = [
    [0, 'unidad_movil', 1650], [1, 'dron4k', 780], [2, 'grua', 1100], [5, 'generador', 320],
    [12, 'dron4k', 720], [13, 'vip_satelital', 1450], [15, 'generador', 290], [20, 'grua', 990],
];
const DEMO_VIP = [0, 12, 13, 20];   // productoras con distintivo VIP (7 días, no es una compra)

// Liga: encargos completados por asociación (índice de DEMO_ASOCIACIONES => cuántos)
const DEMO_LIGA = [0 => 6, 1 => 4, 2 => 3, 3 => 5, 4 => 3, 5 => 4, 6 => 2];
// Copa: puntos de preparación por productora (el servidor chico tiene pocos jugadores pero muy activos)
const DEMO_COPA_PUNTOS = [
    160, 150, 140, 135, 125, 120, 110, 100, 90, 80, 70, 60,     // servidor grande: 1.340
    180, 170, 160, 150, 140, 130, 120, 110,                     // servidor mediano: 1.160
    290, 270, 250, 230,                                         // servidor chico: 1.040
];

// ---------------------------------------------------------------------------------------------- ayudas
function salida(string $t): void { echo $t . "\n"; }
function nota(string $t): void { echo "  · " . $t . "\n"; }

function existeTabla(string $t): bool { return (bool) Db::valor("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?", [$t]); }
function columnas(string $t): array { return Migraciones::columnas($t) ?? []; }

function prepararMarcas(): void
{
    Db::pdo()->exec('CREATE TABLE IF NOT EXISTS demo_marcas (tabla TEXT NOT NULL, id INTEGER NOT NULL, extra TEXT, creado INTEGER NOT NULL, PRIMARY KEY (tabla, id))');
}
function marcar(string $tabla, int $id, ?string $extra = null): void
{
    Db::q('INSERT OR IGNORE INTO demo_marcas (tabla, id, extra, creado) VALUES (?, ?, ?, ?)', [$tabla, $id, $extra, time()]);
}
/** @return list<int> */
function marcados(string $tabla): array
{
    if (!existeTabla('demo_marcas')) return [];
    return array_map('intval', array_column(Db::todas('SELECT id FROM demo_marcas WHERE tabla = ? ORDER BY id', [$tabla]), 'id'));
}
/** Jugadores demo = marcados Y con correo @demo.envivo.local (las dos cosas). */
function jugadoresDemo(): array
{
    if (!existeTabla('demo_marcas')) return [];
    return array_map('intval', array_column(Db::todas("SELECT j.id FROM jugadores j JOIN demo_marcas m ON m.tabla = 'jugadores' AND m.id = j.id
                                                       WHERE j.email LIKE ? ESCAPE '\\' ORDER BY j.id", ['%' . str_replace('_', '\\_', DEMO_DOMINIO)]), 'id'));
}
function emailDemo(int $i): string { return sprintf('productora%02d', $i + 1) . DEMO_DOMINIO; }
function enLista(array $ids): string { return $ids ? implode(',', array_map('intval', $ids)) : '0'; }

/** Corre $f en un SAVEPOINT: si falla, deshace solo ese paso y sigue (para las partes opcionales). */
function paso(string $nombre, callable $f): mixed
{
    $sp = 'demo_' . preg_replace('/\W/', '_', $nombre);
    Db::pdo()->exec("SAVEPOINT $sp");
    try {
        $r = $f();
        Db::pdo()->exec("RELEASE $sp");
        return $r;
    } catch (\Throwable $e) {
        Db::pdo()->exec("ROLLBACK TO $sp");
        Db::pdo()->exec("RELEASE $sp");
        nota("$nombre: se saltó (" . $e->getMessage() . ')');
        return null;
    }
}

/** Los servidores donde van las productoras demo: los del universo activo (si existe Universos) o los primeros abiertos. */
function servidoresDemo(): array
{
    $cols = columnas('servidores');
    $sinFusion = isset($cols['fusionado_en']) ? ' AND fusionado_en IS NULL' : '';
    if (existeTabla('universos') && isset($cols['universo_id'])) {
        $u = Db::valor('SELECT id FROM universos' . (isset(columnas('universos')['activo']) ? ' WHERE activo = 1' : '') . ' ORDER BY id LIMIT 1');
        if ($u !== null) {
            $ids = array_map('intval', array_column(Db::todas("SELECT id FROM servidores WHERE universo_id = ?$sinFusion ORDER BY id LIMIT 3", [$u]), 'id'));
            if ($ids) return $ids;
        }
    }
    $ids = array_map('intval', array_column(Db::todas("SELECT id FROM servidores WHERE abierto = 1$sinFusion ORDER BY id LIMIT 3"), 'id'));
    return $ids ?: array_map('intval', array_column(Db::todas('SELECT id FROM servidores ORDER BY id LIMIT 3'), 'id'));
}

function claseCopas(): ?string
{
    return class_exists('EnVivo\\Copas') && existeTabla('copas') ? 'EnVivo\\Copas' : null;
}

/** Copa de esta semana del universo de ese servidor (Copas::asegurarCopa la crea si falta), o null. */
function copaActual(int $servidor): ?array
{
    $c = claseCopas();
    if ($c === null || !method_exists($c, 'asegurarCopa') || !method_exists($c, 'universoDeServidor')) return null;
    $u = $c::universoDeServidor($servidor);
    return $u === null ? null : $c::asegurarCopa($u);
}

/** Preparación de cada servidor = suma de sus aportes (la misma cuenta que Copas::recalcularPrep). */
function recalcularPrep(int $copa): void
{
    Db::q('UPDATE copa_servidores SET puntos_prep = (SELECT COALESCE(SUM(a.puntos), 0) FROM copa_aportes a WHERE a.copa_id = copa_servidores.copa_id AND a.servidor_id = copa_servidores.servidor_id) WHERE copa_id = ?', [$copa]);
}

/** Equipo de copa {staff, equip} con lo que permite la fama (mismas reglas que Festival::revisarEquipo). */
function equipoCopa(int $fama): array
{
    $hab = $fama < 15 ? 3 : ($fama < 40 ? 4 : 5);
    $staff = [['role' => 'director', 'skill' => $hab, 'owner' => true], ['role' => 'camarografo', 'skill' => $hab], ['role' => 'camarografo', 'skill' => max(1, $hab - 1)],
              ['role' => 'sonidista', 'skill' => max(1, $hab - 1)], ['role' => 'tecnico_transmision', 'skill' => $hab]];
    $cam = $fama >= 45 ? 'cam_zony_hdk_3200' : ($fama >= 28 ? 'cam_zony_pxv_z760' : ($fama >= 12 ? 'cam_cine' : ($fama >= 4 ? 'cam_pro' : 'cam_basic')));
    $equip = [['type' => $cam], ['type' => $cam], ['type' => 'cam_basic'], ['type' => $fama >= 12 ? 'sw_vmax_pro_pc' : 'switch_basic'],
              ['type' => 'sop_tripode_basico'], ['type' => 'sop_tripode_basico'], ['type' => 'lente_kit_mft']];
    return ['staff' => $staff, 'equip' => $equip];
}

// ---------------------------------------------------------------------------------------------- --crear
function crear(): int
{
    prepararMarcas();
    if (class_exists('EnVivo\\Universos') && method_exists('EnVivo\\Universos', 'preparar')) {
        $nuevos = \EnVivo\Universos::preparar();   // arranque idempotente del universo (lo mismo que hace la API al empezar)
        if ($nuevos) nota('Universos: se crearon los servidores ' . implode(', ', $nuevos) . ' del universo (arranque normal de Universos.php).');
    } else nota('Universos: todavía no está Universos.php; se usan los servidores que haya.');
    $servs = servidoresDemo();
    if (!$servs) { salida('ERROR: no hay ningún servidor en la base.'); return 1; }
    if (count($servs) < 3) nota('Hay ' . count($servs) . ' servidor(es) (todavía no está Universos con 3): las productoras de los otros grupos van al último servidor disponible.');
    $srv = fn(int $g): int => $servs[min($g, count($servs) - 1)];
    $hoy = Monedero::diaLocal();
    $t0 = time();
    $res = Db::tx(function () use ($srv, $hoy, $t0): array {
        $n = ['productoras' => 0, 'asociaciones' => 0, 'miembros' => 0, 'chat' => 0, 'creditos' => 0, 'publicaciones' => 0, 'liga' => 0, 'duelos' => 0, 'copa' => 0];
        // 1. Productoras: cuenta (Cuentas::registrar), servidor, clave inservible, perfil (Social::guardarPerfil), fama, partida
        $ids = [];
        foreach (DEMO_PRODUCTORAS as $i => [$alias, $nombre, $fama, $g]) {
            $email = emailDemo($i);
            $j = Cuentas::porEmail($email);
            if ($j) {
                if (!in_array((int) $j['id'], marcados('jugadores'), true)) throw new \RuntimeException("$email existe pero no tiene la marca demo: no se toca.");
                $ids[$i] = (int) $j['id'];
                continue;
            }
            $id = Cuentas::registrar($email, $nombre, bin2hex(random_bytes(24)));
            marcar('jugadores', $id);
            // Clave inservible: '!' delante del hash -> password_verify nunca da true (nadie puede entrar con esta cuenta)
            Db::q('UPDATE jugadores SET clave_hash = ?, servidor_id = ?, creado = ?, ultimo_ingreso = ? WHERE id = ?',
                ['!' . password_hash(bin2hex(random_bytes(32)), PASSWORD_BCRYPT), $srv($g), $t0 - (40 - $i) * 86400, $t0 - ($i % 6) * 3600, $id]);
            Social::guardarPerfil($id, ['alias' => $alias]);
            // Fama pública directa (el tope de +15 por día es contra trampas del juego; aquí es un perfil inventado)
            Db::q('UPDATE jugadores SET fama_publica = ?, fama_dia = ?, fama_inicio_dia = ? WHERE id = ?', [$fama, $hoy, $fama, $id]);
            Db::q('INSERT OR IGNORE INTO partidas (jugador_id, datos, actualizado) VALUES (?, ?, ?)',
                [$id, json_encode(['demo' => true, 'chapter' => min(9, intdiv($fama, 10)), 'fama' => $fama], JSON_UNESCAPED_UNICODE), $t0 - ($i % 6) * 3600]);
            if (in_array($i, DEMO_VIP, true)) Monedero::sumarVip($id, 7);
            if (class_exists('EnVivo\\Universos') && method_exists('EnVivo\\Universos', 'marcarActivo')) {
                paso('actividad_' . $i, fn() => \EnVivo\Universos::marcarActivo($id));
            }
            $ids[$i] = $id;
            $n['productoras']++;
        }

        // 2. Asociaciones (Social::crear / unirse / solicitud / cargo)
        $asocs = [];
        foreach (DEMO_ASOCIACIONES as $k => [$nombre, $siglas, $color, $ingreso, $desc, $g, $miembros]) {
            $pres = $ids[$miembros[0]];
            $sid = (int) Db::valor('SELECT servidor_id FROM jugadores WHERE id = ?', [$pres]);
            $ya = Db::fila('SELECT a.id FROM asociaciones a JOIN demo_marcas m ON m.tabla = \'asociaciones\' AND m.id = a.id WHERE a.servidor_id = ? AND a.siglas = ?', [$sid, $siglas]);
            if ($ya) { $asocs[$k] = (int) $ya['id']; continue; }
            if (Social::miembro($pres)) { nota("Asociación $siglas: la presidenta demo ya está en otra asociación, se salta."); continue; }
            // Si un jugador real ya usa ese nombre o esas siglas en el servidor (p. ej. se quedó con una asociación demo), se salta
            if (paso('asociacion_' . $siglas, fn() => Social::crear($pres, ['nombre' => $nombre, 'siglas' => $siglas, 'color' => $color, 'descripcion' => $desc, 'ingreso' => $ingreso, 'pagado_en_juego' => true])) === null) continue;
            $aid = (int) Social::miembro($pres)['asociacion_id'];
            marcar('asociaciones', $aid);
            Db::q('UPDATE asociaciones SET creado = ? WHERE id = ?', [$t0 - (30 - $k) * 86400, $aid]);
            $asocs[$k] = $aid;
            $n['asociaciones']++;
            foreach (array_slice($miembros, 1) as $x => $mi) {
                $j = $ids[$mi];
                if (Social::miembro($j)) continue;
                $r = Social::unirse($j, $aid);
                if (($r['estado'] ?? '') === 'solicitud') Social::solicitud($pres, $j, true);
                if ($x === 0) Social::cargo($pres, $j, 'vicepresidente');
                $n['miembros']++;
            }
        }

        // 3. Chat (texto por el filtro de Chat::prepararTexto; horas escalonadas para que parezca una conversación)
        if (!marcados('chat_mensajes')) {
            $orden = DEMO_CHAT;
            usort($orden, fn($a, $b) => $b[0] <=> $a[0]);   // del más viejo al más nuevo (los id suben con la hora)
            foreach ($orden as [$min, $pi, $canal, $texto]) {
                $j = $ids[$pi];
                if ($canal === 'asociacion' && !Social::miembro($j)) continue;
                $c = Chat::canal($j, $canal);
                $txt = Chat::prepararTexto($texto);
                Db::q('INSERT INTO chat_mensajes (canal, jugador_id, texto, rapido, creado) VALUES (?, ?, ?, NULL, ?)', [$c, $j, $txt, $t0 - $min * 60]);
                marcar('chat_mensajes', Db::ultimoId());
                $n['chat']++;
            }
        }

        // 4. Mercado: créditos con ajuste manual auditado (motivo "demo"), canje con Monedero::gastar (crea el equipo en el
        //    inventario con su número de serie) y publicación con las mismas sentencias de Mercado::publicar.
        if (!marcados('mercado_publicaciones')) {
            foreach (DEMO_MERCADO as $x => [$pi, $item, $precio]) {
                $j = $ids[$pi];
                $p = Catalogo::premium($item);
                if (!$p || !$p['activo']) { nota("Mercado: $item no está activo en la tienda, se salta."); continue; }
                if (!empty($p['vip']) && !Monedero::vipActivo($j)) Monedero::sumarVip($j, 7);
                $costo = (int) $p['creditos'];
                $falta = max(0, $costo - Monedero::saldo($j));
                if ($falta > 0) {
                    try {
                        Monedero::ajusteManual($j, $falta, 'demo: créditos de demostración para publicar en el mercado (se borran con demo_datos.php --borrar)', DEMO_QUIEN);
                    } catch (Fallo $e) {
                        if (($e->extra['codigo'] ?? '') !== 'tope_dia') throw $e;
                        // Tope diario del Centro de Control: igual queda en el libro como 'manual' y en la auditoría como demo
                        Monedero::mover($j, $falta, 'manual', 'control:demo: créditos de demostración (fuera del tope diario)');
                        Auditoria::anotar(DEMO_QUIEN, 'creditos_dar', $falta . ' créditos: demo (fuera del tope diario)', $j);
                    }
                    $n['creditos'] += $falta;
                }
                // Número de serie de ese tipo ANTES del primer canje demo (al borrar se vuelve a ese número)
                marcar('series', crc32($item), json_encode(['item' => $item, 'antes' => (int) (Db::valor('SELECT ultima FROM series WHERE item = ?', [$item]) ?? 0)]));
                [, , $inv] = Monedero::gastar($j, $item);
                if (!$inv) continue;
                $precio = Mercado::precio($precio, $item);
                $pub = $t0 - (6 + $x * 5) * 3600;
                Db::q("UPDATE inventario SET estado = 'publicado', actualizado = ? WHERE id = ? AND estado = 'bodega'", [$pub, $inv['id']]);
                Db::q("INSERT INTO mercado_publicaciones (inventario_id, vendedor_id, item, serie, precio, estado, publicado, vence) VALUES (?, ?, ?, ?, ?, 'activa', ?, ?)",
                    [$inv['id'], $j, $item, $inv['serie'], $precio, $pub, $pub + Mercado::DIAS * 86400]);
                marcar('mercado_publicaciones', Db::ultimoId());
                marcar('inventario', (int) $inv['id'], $item);
                $n['publicaciones']++;
            }
        }

        // 5. Liga Semanal: inscribir las asociaciones (Liga::inscribir) y avanzar su tablero de la semana
        if (class_exists(Liga::class) && method_exists(Liga::class, 'asegurarSemana')) {
            paso('liga', function () use ($asocs, $ids, $t0, &$n): void {
                $sem = Liga::asegurarSemana()['semana'];
                foreach ($asocs as $k => $aid) {
                    $part = Liga::inscribir($sem, $aid);
                    marcar('liga_grupos', (int) $part['grupo_id']);
                    if (Db::valor('SELECT 1 FROM demo_marcas WHERE tabla = ? AND id = ?', ['liga:' . $sem, $aid])) continue;
                    marcar('liga:' . $sem, $aid);
                    $miembros = array_map('intval', array_column(Db::todas('SELECT jugador_id FROM asociacion_miembros WHERE asociacion_id = ? ORDER BY desde, jugador_id', [$aid]), 'jugador_id'));
                    $tareas = Db::todas("SELECT * FROM liga_tareas WHERE semana = ? AND asociacion_id = ? AND estado = 'disponible' ORDER BY n LIMIT ?", [$sem, $aid, DEMO_LIGA[$k] ?? 2]);
                    foreach ($tareas as $x => $ta) {
                        $j = $miembros[$x % count($miembros)];
                        $cuando = $t0 - (DEMO_LIGA[$k] - $x) * 2700 - $k * 600;
                        Db::q("UPDATE liga_tareas SET estado = 'completada', jugador_id = ?, tomada_en = ?, avance = meta, completada_en = ? WHERE id = ? AND estado = 'disponible'",
                            [$j, $cuando - 1800, $cuando, $ta['id']]);
                        Db::q('UPDATE liga_participantes SET puntos = puntos + ?, tareas_completadas = tareas_completadas + 1, actualizado = ? WHERE semana = ? AND asociacion_id = ?',
                            [(int) $ta['puntos'], $cuando, $sem, $aid]);
                        Db::q('INSERT INTO liga_miembro_semana (semana, jugador_id, asociacion_id, tareas_usadas, tareas_completadas, puntos) VALUES (?, ?, ?, 1, 1, ?)
                               ON CONFLICT (semana, jugador_id, asociacion_id) DO UPDATE SET tareas_usadas = tareas_usadas + 1, tareas_completadas = tareas_completadas + 1, puntos = puntos + excluded.puntos',
                            [$sem, $j, $aid, (int) $ta['puntos']]);
                        $n['liga']++;
                    }
                }
            });
        } else nota('Liga: no está Liga.php, se salta.');

        // 6. Duelo de Productoras: filas del ranking de la temporada (sin "equipo de duelo": nadie real puede retar a una demo)
        if (class_exists(Duelos::class)) {
            paso('duelos', function () use ($ids, $t0, &$n): void {
                Duelos::preparar();
                $temp = Duelos::temporada();
                foreach ($ids as $i => $j) {
                    $fama = DEMO_PRODUCTORAS[$i][2];
                    $rating = 940 + $fama * 5 + ($i * 37) % 60;
                    $g = 3 + intdiv($fama, 6); $p = 2 + ($i % 5);
                    $nuevo = Db::q('INSERT OR IGNORE INTO duelo_ratings (temporada, jugador_id, servidor_id, rating, mejor, ganados, perdidos, empates, defensas_ganadas, defensas_perdidas, racha, actualizado)
                                    SELECT ?, id, servidor_id, ?, ?, ?, ?, ?, ?, ?, ?, ? FROM jugadores WHERE id = ?',
                        [$temp, $rating, $rating + 15, $g, $p, $i % 3, intdiv($g, 2), intdiv($p, 2), $i % 4, $t0 - ($i % 8) * 1800, $j])->rowCount();
                    $n['duelos'] += $nuevo;
                }
            });
        } else nota('Duelos: no está Duelos.php, se salta.');

        // 7. Copa de Servidores: aportes de preparación (ref única 'demo:copa:...') y equipos de copa con Copas::registrarEquipo
        $copa = claseCopas() ? paso('copa_buscar', fn() => copaActual($srv(0))) : null;
        if (claseCopas() === null) nota('Copa: todavía no está Copas.php (o su tabla), se salta.');
        elseif (!$copa) nota('Copa: no se encontró la copa de esta semana, se salta.');
        elseif ($copa['fase'] !== 'preparacion') nota('Copa: la copa está en fase "' . $copa['fase'] . '": solo se cargan puntos en la preparación (lunes a viernes).');
        else {
            paso('copa', function () use ($copa, $ids, $t0, &$n): void {
                $cid = (int) $copa['id'];
                marcar('copas', $cid);
                foreach ($ids as $i => $j) {
                    $f = Db::fila('SELECT j.servidor_id, m.asociacion_id FROM jugadores j LEFT JOIN asociacion_miembros m ON m.jugador_id = j.id WHERE j.id = ?', [$j]);
                    $n['copa'] += Db::q('INSERT OR IGNORE INTO copa_aportes (copa_id, jugador_id, servidor_id, asociacion_id, puntos, fuente, ref, creado) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
                        [$cid, $j, (int) $f['servidor_id'], $f['asociacion_id'] === null ? null : (int) $f['asociacion_id'], DEMO_COPA_PUNTOS[$i] ?? 100, 'demo',
                         'demo:copa:' . $cid . ':' . $j, $t0 - ($i % 10) * 1200])->rowCount();
                }
                recalcularPrep($cid);
                $equipos = 0;
                foreach ($ids as $i => $j) {
                    if (Db::valor('SELECT 1 FROM copa_equipos WHERE copa_id = ? AND jugador_id = ?', [$cid, $j])) continue;
                    if (paso('copa_equipo_' . $i, fn() => \EnVivo\Copas::registrarEquipo($j, equipoCopa(DEMO_PRODUCTORAS[$i][2]))) !== null) $equipos++;
                }
                nota("Copa N° $cid ({$copa['nombre']}): " . $n['copa'] . " aportes y $equipos equipos de copa nuevos.");
            });
        }
        return $n;
    });
    salida('Datos demo creados (lo que ya existía no se duplica):');
    foreach ($res as $k => $v) salida(sprintf('  %-14s +%d', $k, $v));
    salida('Las cuentas demo NO pueden entrar al juego. Para quitar todo:  php server/bin/demo_datos.php --borrar');
    estado();
    return 0;
}

// ---------------------------------------------------------------------------------------------- --estado
/** Columnas que guardan el id de un jugador (en cualquier tabla). */
const COLUMNAS_JUGADOR = ['jugador_id', 'retador_id', 'defensor_id', 'vendedor_id', 'comprador_id', 'reportante_id', 'bloqueado_id', 'capitan_jugador_id'];

/** Cuántas filas de cada tabla apuntan a estos jugadores / asociaciones: ['tabla.columna' => n]. */
function referencias(array $jug, array $asoc): array
{
    $o = [];
    foreach (Db::todas("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE 'demo_%' ORDER BY name") as $t) {
        $tabla = (string) $t['name'];
        if (!preg_match('/^\w+$/', $tabla)) continue;
        foreach (array_keys(columnas($tabla)) as $c) {
            $ids = in_array($c, COLUMNAS_JUGADOR, true) ? $jug : ($c === 'asociacion_id' ? $asoc : null);
            if ($tabla === 'jugadores' || $tabla === 'asociaciones' || !$ids) continue;
            $n = (int) Db::valor("SELECT COUNT(*) FROM \"$tabla\" WHERE \"$c\" IN (" . enLista($ids) . ')');
            if ($n > 0) $o["$tabla.$c"] = $n;
        }
    }
    $canales = array_merge(array_map(fn($j) => 'sistema:' . $j, $jug), array_map(fn($a) => 'asociacion:' . $a, $asoc));
    if ($canales) {
        $n = (int) Db::valor('SELECT COUNT(*) FROM chat_mensajes WHERE canal IN (' . implode(',', array_fill(0, count($canales), '?')) . ')', $canales);
        if ($n > 0) $o['chat_mensajes.canal'] = $n;
    }
    return $o;
}

function estado(): int
{
    $jug = jugadoresDemo();
    $sueltos = (int) Db::valor("SELECT COUNT(*) FROM jugadores WHERE email LIKE ? ESCAPE '\\'" . ($jug ? ' AND id NOT IN (' . enLista($jug) . ')' : ''), ['%' . str_replace('_', '\\_', DEMO_DOMINIO)]);
    if (!$jug) {
        salida('No hay datos demo en esta base' . (existeTabla('demo_marcas') ? ' (queda la tabla demo_marcas: --borrar la quita)' : '') . '.');
        if ($sueltos > 0) salida("  ¡Ojo! hay $sueltos cuenta(s) con correo " . DEMO_DOMINIO . ' SIN la marca demo: este script no las toca.');
        return 0;
    }
    $asoc = array_values(array_filter(marcados('asociaciones'), fn($a) => (bool) Db::valor('SELECT 1 FROM asociaciones WHERE id = ?', [$a])));
    salida('Datos demo en la base:');
    foreach (Db::todas('SELECT s.id, s.nombre, COUNT(j.id) AS n FROM jugadores j JOIN servidores s ON s.id = j.servidor_id WHERE j.id IN (' . enLista($jug) . ') GROUP BY s.id ORDER BY s.id') as $s)
        salida(sprintf('  %-28s %2d productoras demo', $s['nombre'], $s['n']));
    $l = fn(string $sql) => (int) Db::valor($sql);
    $J = enLista($jug); $A = enLista($asoc);
    salida('  asociaciones           ' . count($asoc) . ' (' . $l("SELECT COUNT(*) FROM asociacion_miembros WHERE asociacion_id IN ($A)") . ' miembros, '
        . $l("SELECT COUNT(*) FROM asociacion_miembros WHERE asociacion_id IN ($A) AND jugador_id NOT IN ($J)") . ' reales)');
    salida('  mensajes de chat       ' . $l("SELECT COUNT(*) FROM chat_mensajes WHERE jugador_id IN ($J)"));
    salida('  equipos (inventario)   ' . $l("SELECT COUNT(*) FROM inventario WHERE jugador_id IN ($J)"));
    salida('  publicaciones activas  ' . $l("SELECT COUNT(*) FROM mercado_publicaciones WHERE vendedor_id IN ($J) AND estado = 'activa'")
        . ' (vendidas a jugadores reales: ' . $l("SELECT COUNT(*) FROM mercado_publicaciones WHERE vendedor_id IN ($J) AND estado = 'vendida' AND comprador_id NOT IN ($J)") . ')');
    salida('  créditos demo (libro)  ' . $l("SELECT COALESCE(SUM(cambio), 0) FROM movimientos_creditos WHERE jugador_id IN ($J) AND cambio > 0") . ' dados, saldo actual '
        . $l("SELECT COALESCE(SUM(creditos - deuda), 0) FROM jugadores WHERE id IN ($J)"));
    if (existeTabla('liga_participantes')) salida('  liga (esta semana)     ' . $l("SELECT COUNT(*) FROM liga_participantes WHERE asociacion_id IN ($A)") . ' inscripciones, '
        . $l("SELECT COALESCE(SUM(puntos), 0) FROM liga_participantes WHERE asociacion_id IN ($A)") . ' puntos');
    if (existeTabla('duelo_ratings')) salida('  duelos (ranking)       ' . $l("SELECT COUNT(*) FROM duelo_ratings WHERE jugador_id IN ($J)"));
    if (existeTabla('copa_aportes')) salida('  copa (aportes)         ' . $l("SELECT COUNT(*) FROM copa_aportes WHERE jugador_id IN ($J)") . ' aportes, '
        . $l("SELECT COALESCE(SUM(puntos), 0) FROM copa_aportes WHERE jugador_id IN ($J)") . ' puntos');
    $ref = referencias($jug, $asoc);
    salida('  filas que apuntan a lo demo: ' . array_sum($ref) . ' en ' . count($ref) . ' columnas (todas se borran con --borrar)');
    if ($sueltos > 0) salida("  ¡Ojo! hay $sueltos cuenta(s) con correo " . DEMO_DOMINIO . ' SIN la marca demo: este script no las toca.');
    salida('  RECUERDA: borrar los datos demo antes del lanzamiento real (--borrar).');
    return 0;
}

// ---------------------------------------------------------------------------------------------- --borrar
function borrar(): int
{
    if (!existeTabla('demo_marcas')) { salida('No hay datos demo (no existe la tabla demo_marcas). Nada que borrar.'); return 0; }
    $jug = jugadoresDemo();
    $J = enLista($jug);
    $r = Db::tx(function () use ($jug, $J): array {
        Db::pdo()->exec('PRAGMA defer_foreign_keys = ON');   // las llaves se revisan al confirmar (COMMIT), no fila por fila
        $o = ['productoras' => count($jug)];
        $asocDemo = array_values(array_filter(marcados('asociaciones'), fn($a) => (bool) Db::valor('SELECT 1 FROM asociaciones WHERE id = ?', [$a])));
        // Asociaciones: si un jugador real entró a una, se queda (con él/ella de presidente, como en Social::salir); si no, se borra
        $borrarA = []; $quedan = [];
        foreach ($asocDemo as $a) {
            $reales = (int) Db::valor("SELECT COUNT(*) FROM asociacion_miembros WHERE asociacion_id = ? AND jugador_id NOT IN ($J)", [$a]);
            if ($reales === 0) { $borrarA[] = $a; continue; }
            $quedan[] = $a;
            $pres = Db::valor("SELECT 1 FROM asociacion_miembros WHERE asociacion_id = ? AND cargo = 'presidente' AND jugador_id NOT IN ($J)", [$a]);
            if (!$pres) {
                $sig = Db::valor("SELECT jugador_id FROM asociacion_miembros WHERE asociacion_id = ? AND jugador_id NOT IN ($J)
                                  ORDER BY CASE cargo WHEN 'vicepresidente' THEN 0 ELSE 1 END, desde, jugador_id LIMIT 1", [$a]);
                Db::q("UPDATE asociacion_miembros SET cargo = 'presidente' WHERE jugador_id = ?", [$sig]);
            }
        }
        $A = enLista($borrarA);
        $o['asociaciones'] = count($borrarA);
        $o['asociaciones_con_reales_que_quedan'] = count($quedan);
        // Mercado: lo que un jugador REAL compró a una demo se queda (su equipo y su compra); la publicación queda sin vendedor
        $o['ventas_a_reales_conservadas'] = (int) Db::valor("SELECT COUNT(*) FROM mercado_publicaciones WHERE vendedor_id IN ($J) AND estado = 'vendida' AND comprador_id IS NOT NULL AND comprador_id NOT IN ($J)");
        Db::q("UPDATE mercado_publicaciones SET vendedor_id = NULL WHERE vendedor_id IN ($J) AND estado = 'vendida' AND comprador_id IS NOT NULL AND comprador_id NOT IN ($J)");
        $o['publicaciones'] = Db::q("DELETE FROM mercado_publicaciones WHERE vendedor_id IN ($J) OR inventario_id IN (SELECT id FROM inventario WHERE jugador_id IN ($J))")->rowCount();
        $o['inventario'] = Db::q("DELETE FROM inventario WHERE jugador_id IN ($J)")->rowCount();
        // Chat: mensajes de las demo, avisos del sistema para ellas y el canal de las asociaciones que se borran
        $canales = array_merge(array_map(fn($j) => 'sistema:' . $j, $jug), array_map(fn($a) => 'asociacion:' . $a, $borrarA));
        $o['chat'] = Db::q("DELETE FROM chat_mensajes WHERE jugador_id IN ($J)")->rowCount();
        if ($canales) $o['chat'] += Db::q('DELETE FROM chat_mensajes WHERE canal IN (' . implode(',', array_fill(0, count($canales), '?')) . ')', $canales)->rowCount();
        // Liga: intentos y encargos de las asociaciones demo; en las que quedan, los encargos hechos por demo quedan sin jugador
        $grupos = marcados('liga_grupos');
        if (existeTabla('liga_tareas')) {
            if (existeTabla('liga_intentos')) Db::q("DELETE FROM liga_intentos WHERE jugador_id IN ($J) OR tarea_id IN (SELECT id FROM liga_tareas WHERE asociacion_id IN ($A))");
            Db::q("UPDATE liga_tareas SET jugador_id = NULL WHERE jugador_id IN ($J) AND asociacion_id NOT IN ($A)");
        }
        // Todas las demás tablas (también las de módulos nuevos): filas de jugadores demo y de asociaciones demo borradas
        $o['otras_filas'] = 0;
        foreach (Db::todas("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE 'demo_%' ORDER BY name") as $t) {
            $tabla = (string) $t['name'];
            if (!preg_match('/^\w+$/', $tabla) || in_array($tabla, ['jugadores', 'asociaciones', 'mercado_publicaciones'], true)) continue;
            foreach (array_keys(columnas($tabla)) as $c) {
                if (in_array($c, COLUMNAS_JUGADOR, true) && $jug) $o['otras_filas'] += Db::q("DELETE FROM \"$tabla\" WHERE \"$c\" IN ($J)")->rowCount();
                elseif ($c === 'asociacion_id' && $borrarA) $o['otras_filas'] += Db::q("DELETE FROM \"$tabla\" WHERE asociacion_id IN ($A)")->rowCount();
            }
        }
        // Copa: la preparación de cada servidor se vuelve a sumar sin los aportes demo (ya borrados arriba)
        if (existeTabla('copa_servidores')) foreach (marcados('copas') as $cid) recalcularPrep($cid);
        if ($grupos && existeTabla('liga_grupos')) Db::q('DELETE FROM liga_grupos WHERE id IN (' . enLista($grupos) . ') AND NOT EXISTS (SELECT 1 FROM liga_participantes p WHERE p.grupo_id = liga_grupos.id)');
        Db::q("DELETE FROM asociaciones WHERE id IN ($A)");
        Db::q("DELETE FROM jugadores WHERE id IN ($J)");
        // Números de serie: se vuelven al último que queda (sin bajar nunca de un número que tenga un equipo real)
        foreach (Db::todas("SELECT extra FROM demo_marcas WHERE tabla = 'series'") as $m) {
            $x = json_decode((string) $m['extra'], true);
            if (!is_array($x) || !is_string($x['item'] ?? null)) continue;
            $max = (int) (Db::valor('SELECT MAX(serie) FROM inventario WHERE item = ?', [$x['item']]) ?? 0);
            $nuevo = max($max, (int) ($x['antes'] ?? 0));
            if ($nuevo === 0) Db::q('DELETE FROM series WHERE item = ?', [$x['item']]);
            else Db::q('UPDATE series SET ultima = ? WHERE item = ? AND ultima > ?', [$nuevo, $x['item'], $nuevo]);
        }
        if (Db::valor("SELECT 1 FROM demo_marcas WHERE tabla = 'asociaciones'") && $quedan)
            Auditoria::anotar(DEMO_QUIEN, 'demo_asociacion_queda', 'Asociaciones demo con jugadores reales que se quedan: ' . implode(', ', $quedan));
        Db::pdo()->exec('DROP TABLE demo_marcas');
        Auditoria::anotar(DEMO_QUIEN, 'demo_borrado', 'Datos de demostración borrados: ' . json_encode($o, JSON_UNESCAPED_UNICODE));
        return $o;
    });
    salida('Datos demo BORRADOS (una sola transacción):');
    foreach ($r as $k => $v) salida(sprintf('  %-36s %d', $k, $v));
    $fk = Db::todas('PRAGMA foreign_key_check');
    $ic = (string) Db::valor('PRAGMA integrity_check');
    salida('  revisión de llaves (foreign_key_check): ' . ($fk ? count($fk) . ' PROBLEMAS' : 'ok'));
    salida('  integridad de la base (integrity_check): ' . $ic);
    return $fk || $ic !== 'ok' ? 1 : 0;
}

// ---------------------------------------------------------------------------------------------- principal
$modo = $argv[1] ?? '';
if (!in_array($modo, ['--crear', '--borrar', '--estado'], true)) {
    fwrite(STDERR, "Uso: php server/bin/demo_datos.php --crear | --estado | --borrar\n(ver docs/DEMO_DATOS.md)\n");
    exit(2);
}
$dir = dirname(Config::db());
if (!is_dir($dir)) { fwrite(STDERR, "ERROR: no existe la carpeta de la base $dir (¿falta ENVIVO_CONFIG=/etc/envivo/config.env?).\n"); exit(1); }
if (function_exists('posix_geteuid') && posix_geteuid() === 0 && (int) fileowner($dir) !== 0) {
    fwrite(STDERR, "ERROR: no lo corras como root. Usa:  sudo -u www-data ENVIVO_CONFIG=/etc/envivo/config.env php " . __FILE__ . " $modo\n");
    exit(1);
}
try {
    Db::pdo();
    exit(match ($modo) { '--crear' => crear(), '--borrar' => borrar(), '--estado' => estado() });
} catch (\Throwable $e) {
    fwrite(STDERR, 'ERROR: ' . $e->getMessage() . ' (no se guardó nada de este paso)' . "\n");
    exit(1);
}
