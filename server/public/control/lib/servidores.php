<?php
declare(strict_types=1);

// Pestaña "Servidores" (COPAS.md §3): universos y sus servidores (jugadores, activos 1/7/30 días, estado de salud y
// gráfico de 30 días en SVG sin librerías), la Copa de Servidores actual (torneo, fase, tabla y cruces), los avisos de
// abandono con el plan de fusión (Aprobar escribiendo el nombre del servidor / Cancelar), crear un universo con N
// servidores y la administración de la copa (forzar fase, rejugar un cruce). Todo POST lleva CSRF y queda en auditoria.
// Usa las clases de los módulos (Universos, SaludServidores, Fusiones, Copas) si existen; si falta una, ese bloque dice
// "Módulo no instalado" y el resto sigue. Las lecturas que el contrato define como tablas (actividad_diaria,
// servidor_salud, copas, copa_servidores, copa_cruces, fusiones) se leen directo. Firmas supuestas:
// server/INTEGRAR_CONTROL_SERVIDORES.md
defined('ENVIVO_CONTROL') || exit;

use EnVivo\{Auditoria, Config, Control, Db, Fallo};

const CC_SRV_FASES = ['preparacion' => 'Preparación', 'batalla' => 'Batalla', 'cerrada' => 'Cerrada'];
const CC_SRV_DIAS = 30;
const CC_SRV_MAX_NUEVOS = 12;   // servidores por universo nuevo (máximo)

// ---------------------------------------------------------------------------------------------- ayudas
/** Primer método estático que exista en EnVivo\<clase> (o null si la clase o los métodos no existen). */
function cc_srv_metodo(string $clase, string ...$metodos): ?string
{
    $c = 'EnVivo\\' . $clase;
    try {
        if (!class_exists($c)) return null;
    } catch (\Throwable) {
        return null;
    }
    foreach ($metodos as $m) if (method_exists($c, $m) && (new \ReflectionMethod($c, $m))->isStatic() && (new \ReflectionMethod($c, $m))->isPublic()) return $m;
    return null;
}

/**
 * Llama a EnVivo\<clase>::<metodo> armando los argumentos por NOMBRE del parámetro ($valores: nombre => valor, sin
 * guiones bajos ni mayúsculas, ej. ['planid' => 3, 'quien' => 'control:x']). Un parámetro obligatorio sin nombre
 * conocido toma el valor de $posicion[i]. Así el panel tolera pequeñas diferencias de firma entre módulos.
 */
function cc_srv_llamar(string $clase, string $metodo, array $valores, array $posicion = []): mixed
{
    $c = 'EnVivo\\' . $clase;
    $args = [];
    foreach ((new \ReflectionMethod($c, $metodo))->getParameters() as $i => $p) {
        $k = strtolower(str_replace('_', '', $p->getName()));
        if (array_key_exists($k, $valores)) $args[$p->getName()] = $valores[$k];
        elseif ($p->isOptional()) continue;
        elseif (array_key_exists($i, $posicion)) $args[$p->getName()] = $posicion[$i];
        else throw new Fallo('El módulo ' . $clase . '::' . $metodo . ' pide un dato que el panel no conoce ($' . $p->getName() . ').', 500);
        $t = $p->getType();
        if ($t instanceof \ReflectionNamedType && $args[$p->getName()] !== null) {
            if ($t->getName() === 'int' && is_numeric($args[$p->getName()])) $args[$p->getName()] = (int) $args[$p->getName()];
            elseif ($t->getName() === 'string' && is_scalar($args[$p->getName()])) $args[$p->getName()] = (string) $args[$p->getName()];
        }
    }
    return $c::$metodo(...$args);
}

function cc_srv_no_instalado(string $que, string $falta, string $id = ''): string
{
    return '<div class="vacio" data-no-instalado="1"' . ($id !== '' ? ' id="' . e($id) . '"' : '') . '><b>' . e($que) . ': Módulo no instalado.</b><br><span class="tenue">' . e($falta) . '</span></div>';
}

/** Primer valor que exista entre varias claves posibles (los módulos pueden nombrarlas un poco distinto). */
function cc_srv_campo(array $a, array $claves, mixed $def = null): mixed
{
    foreach ($claves as $k) {
        if (str_contains($k, '.')) {
            [$x, $y] = explode('.', $k, 2);
            if (isset($a[$x]) && is_array($a[$x]) && array_key_exists($y, $a[$x])) return $a[$x][$y];
        } elseif (array_key_exists($k, $a) && $a[$k] !== null) {
            return $a[$k];
        }
    }
    return $def;
}

/** Nombre "normalizado" para la confirmación: minúsculas, sin tildes, solo letras y números ("Servidor 1 · Quito" = "servidor 1 quito"). */
function cc_srv_normalizar(string $s): string
{
    $s = mb_strtolower(trim($s));
    $s = strtr($s, ['á' => 'a', 'é' => 'e', 'í' => 'i', 'ó' => 'o', 'ú' => 'u', 'ü' => 'u', 'ñ' => 'n']);
    return (string) preg_replace('/[^a-z0-9]+/', '', $s);
}

function cc_srv_hora(mixed $h): string
{
    if ($h === null || $h === '') return '—';
    if (is_numeric($h)) return cc_fecha((int) $h);
    $t = strtotime((string) $h);
    return $t !== false && preg_match('/^\d{4}-\d{2}-\d{2}/', (string) $h) ? cc_fecha($t) : (string) $h;
}

function cc_srv_estado_chip(?string $estado): string
{
    if ($estado === null || $estado === '') return cc_chip('sin datos');
    return cc_chip($estado, ['sano' => 'ok', 'bajo' => 'aviso', 'abandono' => 'mal', 'fusionado' => '', 'cerrado' => ''][$estado] ?? '');
}

/** Gráfico chico de 30 días (SVG en línea, sin librerías; colores como atributos para cumplir la CSP). */
function cc_srv_sparkline(array $valores, string $titulo): string
{
    $W = 120; $H = 32; $m = 3;
    $n = count($valores);
    $max = max(1, ...array_map('floatval', $valores ?: [0]));
    $x = fn(int $i) => round($m + ($n > 1 ? $i * ($W - 2 * $m) / ($n - 1) : 0), 1);
    $y = fn(float $v) => round($H - $m - ($H - 2 * $m) * ($v / $max), 1);
    $pts = [];
    foreach (array_values($valores) as $i => $v) $pts[] = $x($i) . ',' . $y((float) $v);
    $ult = $n ? (float) end($valores) : 0.0;
    $tip = $titulo . ' · últimos ' . $n . ' días: máximo ' . cc_num(max(0, ...array_map('floatval', $valores ?: [0]))) . ', hoy ' . cc_num($ult);
    $svg = '<svg class="sparkline" width="' . $W . '" height="' . $H . '" viewBox="0 0 ' . $W . ' ' . $H . '" role="img" aria-label="' . e($tip) . '" data-tip="' . e($tip) . '">'
         . '<title>' . e($tip) . '</title>'
         . '<line x1="' . $m . '" x2="' . ($W - $m) . '" y1="' . ($H - $m) . '" y2="' . ($H - $m) . '" stroke="#2a3142" stroke-width="1"/>';
    if ($n > 1) $svg .= '<polyline points="' . implode(' ', $pts) . '" fill="none" stroke="#c08410" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>';
    if ($n > 0) $svg .= '<circle cx="' . $x($n - 1) . '" cy="' . $y($ult) . '" r="2.5" fill="#c08410"/>';
    return $svg . '</svg>';
}

// ---------------------------------------------------------------------------------------------- datos
/** Días 'Y-m-d' de los últimos $n días (hoy al final), en la zona del juego. */
function cc_srv_dias(int $n = CC_SRV_DIAS): array { return array_keys(cc_dias($n)); }

/**
 * Métricas por servidor leídas de las tablas: jugadores, activos 1/7/30 días y serie diaria de 30 días.
 * Fuente de actividad: actividad_diaria (contrato) o, si aún no existe, la tabla actividad del juego con jugadores.servidor_id.
 * @return array{0: array<int, array>, 1: string}  [servidor_id => métricas], fuente
 */
function cc_srv_metricas(): array
{
    $dias = cc_srv_dias();
    [$d30, $d7, $d1] = [$dias[0], $dias[count($dias) - 7], $dias[count($dias) - 1]];
    $o = [];
    foreach (Db::todas('SELECT servidor_id AS s, COUNT(*) AS n FROM jugadores WHERE servidor_id IS NOT NULL GROUP BY servidor_id') as $f) $o[(int) $f['s']]['jugadores'] = (int) $f['n'];
    if (Control::tabla('actividad_diaria')) {
        $fuente = 'actividad_diaria';
        $base = 'FROM actividad_diaria a WHERE a.dia >= ?';
        $srv = 'a.servidor_id';
    } elseif (Control::tabla('actividad')) {
        $fuente = 'actividad';
        $base = 'FROM actividad a JOIN jugadores j ON j.id = a.jugador_id WHERE a.dia >= ? AND j.servidor_id IS NOT NULL';
        $srv = 'j.servidor_id';
    } else {
        return [$o, ''];
    }
    foreach (Db::todas("SELECT $srv AS s, COUNT(DISTINCT CASE WHEN a.dia >= ? THEN a.jugador_id END) AS a1, COUNT(DISTINCT CASE WHEN a.dia >= ? THEN a.jugador_id END) AS a7,
                        COUNT(DISTINCT a.jugador_id) AS a30 $base GROUP BY $srv", [$d1, $d7, $d30]) as $f) {
        $o[(int) $f['s']] = ($o[(int) $f['s']] ?? []) + ['a1' => (int) $f['a1'], 'a7' => (int) $f['a7'], 'a30' => (int) $f['a30']];
    }
    $serie = [];
    foreach (Db::todas("SELECT $srv AS s, a.dia AS d, COUNT(DISTINCT a.jugador_id) AS n $base GROUP BY $srv, a.dia", [$d30]) as $f) $serie[(int) $f['s']][(string) $f['d']] = (int) $f['n'];
    foreach ($serie as $s => $porDia) $o[$s]['serie'] = array_map(fn($d) => $porDia[$d] ?? 0, $dias);
    return [$o, $fuente];
}

/**
 * Estado de salud por servidor: SaludServidores::resumen() si está, si no la última fila de servidor_salud.
 * @return array{0: array<int, array>|null, 1: string}  [servidor_id => [estado, a1, a7, a14, a30, serie?]] o null, fuente
 */
function cc_srv_salud(): array
{
    $nota = '';
    if (cc_srv_metodo('SaludServidores', 'resumen')) {
        try {
            $r = cc_srv_llamar('SaludServidores', 'resumen', []);
            $lista = is_array($r) ? (cc_srv_campo($r, ['servidores', 'lista']) ?? $r) : [];
            $dias = cc_srv_dias();
            $o = [];
            foreach ((array) $lista as $k => $f) {
                if (!is_array($f)) continue;
                $id = (int) cc_srv_campo($f, ['servidor_id', 'id', 'servidor.id'], is_int($k) && !array_is_list((array) $lista) ? $k : 0);
                if ($id <= 0) continue;
                $hist = cc_srv_campo($f, ['serie', 'historial', 'dias', 'serie_30']);
                $serie = null;
                if (is_array($hist) && $hist) {
                    $porDia = [];
                    foreach ($hist as $v) if (is_array($v) && isset($v['dia'])) $porDia[(string) $v['dia']] = (float) cc_srv_campo($v, ['activos_1', 'activos1', 'valor', 'v', 'n'], 0);
                    $serie = $porDia ? array_map(fn($d) => $porDia[$d] ?? 0, $dias)
                                     : array_values(array_map(fn($v) => is_array($v) ? (float) cc_srv_campo($v, ['activos_1', 'activos1', 'valor', 'v', 'n'], 0) : (float) $v, $hist));
                }
                $estado = cc_srv_campo($f, ['estado', 'salud.estado']);
                $o[$id] = ['estado' => is_string($estado) ? $estado : null,
                           'a1' => cc_srv_campo($f, ['activos_1', 'salud.activos_1']), 'a7' => cc_srv_campo($f, ['activos_7', 'salud.activos_7']),
                           'a14' => cc_srv_campo($f, ['activos_14', 'salud.activos_14']), 'a30' => cc_srv_campo($f, ['activos_30', 'salud.activos_30']), 'serie' => $serie];
            }
            return [$o, 'SaludServidores::resumen()'];
        } catch (\Throwable $e) {
            $nota = 'SaludServidores::resumen() falló (' . mb_substr($e->getMessage(), 0, 120) . '); ';
        }
    }
    if (Control::tabla('servidor_salud')) {
        $o = [];
        foreach (Db::todas('SELECT s.* FROM servidor_salud s JOIN (SELECT servidor_id, MAX(dia) AS dia FROM servidor_salud GROUP BY servidor_id) u ON u.servidor_id = s.servidor_id AND u.dia = s.dia') as $f) {
            $o[(int) $f['servidor_id']] = ['estado' => $f['estado'] ?? null, 'a1' => $f['activos_1'] ?? null, 'a7' => $f['activos_7'] ?? null, 'a14' => $f['activos_14'] ?? null, 'a30' => $f['activos_30'] ?? null, 'serie' => null];
        }
        return [$o, $nota . 'tabla servidor_salud'];
    }
    return [null, $nota];
}

/**
 * Universos con sus servidores, ya con métricas. Universos::resumen() si está; si no, las tablas universos/servidores
 * (si ya existen); si tampoco, null (y la pestaña muestra los servidores sueltos).
 */
function cc_srv_universos(array $metricas, ?array $salud): array
{
    $servTabla = [];
    $colU = Control::columna('servidores', 'universo_id');
    $colF = Control::columna('servidores', 'fusionado_en');
    foreach (Db::todas('SELECT * FROM servidores ORDER BY id') as $s) $servTabla[(int) $s['id']] = $s;
    $fuente = '';
    $univ = null;
    $nota = '';
    $r = null;
    if (cc_srv_metodo('Universos', 'resumen')) {
        try { $r = cc_srv_llamar('Universos', 'resumen', []); }
        catch (\Throwable $e) { $nota = 'Universos::resumen() falló (' . mb_substr($e->getMessage(), 0, 120) . '); '; }
    }
    if (is_array($r)) {
        $lista = is_array($r) ? (cc_srv_campo($r, ['universos']) ?? $r) : [];
        $univ = [];
        foreach ((array) $lista as $u) {
            if (!is_array($u)) continue;
            $servs = [];
            foreach ((array) cc_srv_campo($u, ['servidores', 'lista'], []) as $s) {
                if (is_array($s)) $servs[] = $s;
                elseif (is_numeric($s)) $servs[] = ['id' => (int) $s];
            }
            $univ[] = ['id' => (int) cc_srv_campo($u, ['id', 'universo_id'], 0), 'nombre' => (string) cc_srv_campo($u, ['nombre'], 'Universo'), 'activo' => cc_srv_campo($u, ['activo', 'abierto'], 1),
                       'creado' => cc_srv_campo($u, ['creado']), 'servidores' => $servs];
        }
        $fuente = 'Universos::resumen()';
    } elseif ($colU && Control::tabla('universos')) {
        $univ = [];
        foreach (Db::todas('SELECT * FROM universos ORDER BY id') as $u) {
            $univ[] = ['id' => (int) $u['id'], 'nombre' => (string) $u['nombre'], 'activo' => $u['activo'] ?? 1, 'creado' => $u['creado'] ?? null,
                       'servidores' => array_values(array_filter($servTabla, fn($s) => (int) $s['universo_id'] === (int) $u['id']))];
        }
        $fuente = $nota . 'tablas universos / servidores';
    }
    $completar = function (array $s) use ($servTabla, $metricas, $salud, $colF): array {
        $id = (int) cc_srv_campo($s, ['id', 'servidor_id'], 0);
        $t = $servTabla[$id] ?? [];
        $m = $metricas[$id] ?? [];
        $h = $salud[$id] ?? [];
        $num = fn(array $claves, string $mk, string $hk) => (int) (cc_srv_campo($s, $claves) ?? $m[$mk] ?? $h[$hk] ?? 0);
        $fus = cc_srv_campo($s, ['fusionado_en']) ?? ($colF ? ($t['fusionado_en'] ?? null) : null);
        $fusA = cc_srv_campo($s, ['fusionado_a']) ?? ($t['fusionado_a'] ?? null);
        return [
            'id' => $id, 'nombre' => (string) (cc_srv_campo($s, ['nombre']) ?? $t['nombre'] ?? ('Servidor ' . $id)),
            'abierto' => (int) (cc_srv_campo($s, ['abierto']) ?? $t['abierto'] ?? 1), 'capacidad' => (int) (cc_srv_campo($s, ['capacidad']) ?? $t['capacidad'] ?? 0),
            'fusionado_en' => $fus !== null && $fus !== '' ? (is_numeric($fus) ? (int) $fus : (int) strtotime((string) $fus)) : null,
            'fusionado_a' => $fusA !== null && $fusA !== '' ? (int) $fusA : null,
            'jugadores' => $num(['jugadores', 'total_jugadores', 'n_jugadores'], 'jugadores', 'jugadores'),
            'a1' => $num(['activos_1', 'activos1', 'activos.1'], 'a1', 'a1'), 'a7' => $num(['activos_7', 'activos7', 'activos.7'], 'a7', 'a7'), 'a30' => $num(['activos_30', 'activos30', 'activos.30'], 'a30', 'a30'),
            'estado' => $h['estado'] ?? cc_srv_campo($s, ['estado', 'salud']),
            'serie' => $m['serie'] ?? $h['serie'] ?? array_fill(0, CC_SRV_DIAS, 0),
        ];
    };
    $vistos = [];
    if ($univ !== null) {
        foreach ($univ as &$u) {
            $u['servidores'] = array_map($completar, $u['servidores']);
            foreach ($u['servidores'] as $s) $vistos[$s['id']] = true;
        }
        unset($u);
    }
    $sueltos = array_map($completar, array_values(array_filter($servTabla, fn($s) => !isset($vistos[(int) $s['id']]))));
    return [$univ, $sueltos, $fuente];
}

// ---------------------------------------------------------------------------------------------- pestaña
function cc_t_servidores(): string
{
    $h = '<h1>Servidores</h1>';
    $bloques = [];
    $avisos = 0;
    $faseCopa = '—';
    try {
        [$metricas, $fuenteAct] = cc_srv_metricas();
        try { [$salud, $fuenteSalud] = cc_srv_salud(); } catch (\Throwable $e) { error_log('EN VIVO servidores: salud ' . $e->getMessage()); [$salud, $fuenteSalud] = [null, '']; }
        try { [$univ, $sueltos, $fuenteUniv] = cc_srv_universos($metricas, $salud); } catch (\Throwable $e) { error_log('EN VIVO servidores: universos ' . $e->getMessage()); [$univ, $sueltos, $fuenteUniv] = [null, [], '']; }
        $bloques[] = cc_srv_bloque_universos($univ, $sueltos, $fuenteUniv, $salud, $fuenteSalud, $fuenteAct);
    } catch (\Throwable $e) {
        error_log('EN VIVO servidores: ' . get_class($e) . ' ' . $e->getMessage());
        $bloques[] = '<section class="panel" id="panel-universos"><h2>Universos</h2><div class="vacio">No se pudieron leer los servidores.</div></section>';
        $univ = null; $sueltos = [];
    }
    try { [$html, $faseCopa] = cc_srv_bloque_copa(); $bloques[] = $html; }
    catch (\Throwable $e) { error_log('EN VIVO servidores: copa ' . $e->getMessage()); $bloques[] = '<section class="panel" id="panel-copa"><h2>Copa de Servidores</h2><div class="vacio">No se pudo leer la copa.</div></section>'; }
    try { [$html, $avisos] = cc_srv_bloque_fusiones(); $bloques[] = $html; }
    catch (\Throwable $e) { error_log('EN VIVO servidores: fusiones ' . $e->getMessage()); $bloques[] = '<section class="panel" id="panel-fusiones"><h2>Avisos de abandono</h2><div class="vacio">No se pudieron leer las fusiones.</div></section>'; }
    $bloques[] = cc_srv_bloque_crear();

    $nUniv = $univ === null ? '—' : (string) count($univ);
    $todos = array_merge($sueltos, ...array_map(fn($u) => $u['servidores'], $univ ?? []));
    $abiertos = count(array_filter($todos, fn($s) => $s['abierto'] && $s['fusionado_en'] === null));
    $h .= '<div class="kpis kpis-chicos">' . cc_tarjeta('Universos', $nUniv, '', 'kpi-universos')
        . cc_tarjeta('Servidores', cc_num(count($todos)), $abiertos . ' abiertos a nuevos', 'kpi-servidores')
        . cc_tarjeta('Activos 7 días', cc_num(array_sum(array_column($todos, 'a7'))), 'todos los servidores', 'kpi-activos7')
        . cc_tarjeta('Avisos de abandono', (string) $avisos, 'Copa: ' . $faseCopa, 'kpi-avisos') . '</div>';
    return $h . implode('', $bloques);
}

function cc_srv_bloque_universos(?array $univ, array $sueltos, string $fuente, ?array $salud, string $fuenteSalud, string $fuenteAct): string
{
    $h = '<section class="panel" id="panel-universos"><h2>Universos y servidores</h2>';
    $notas = [];
    if ($fuente !== '') $notas[] = 'Universos: ' . $fuente;
    $notas[] = 'Salud: ' . ($fuenteSalud !== '' ? $fuenteSalud : 'Módulo no instalado');
    $notas[] = 'Actividad: ' . ($fuenteAct !== '' ? 'tabla ' . $fuenteAct : 'sin datos');
    $h .= '<p class="tenue">Activo = entró ese día (1 día = hoy). Gráfico: activos por día, últimos ' . CC_SRV_DIAS . ' días. ' . e(implode(' · ', $notas)) . '.</p>';
    if ($salud === null) $h .= cc_srv_no_instalado('Salud de los servidores', 'Falta SaludServidores::resumen() (src/SaludServidores.php) o la tabla servidor_salud: el estado sale "sin datos".', 'salud-no-instalado');
    if ($univ === null) {
        $h .= cc_srv_no_instalado('Universos', 'Falta Universos::resumen() (src/Universos.php) y la tabla universos. Se muestran los servidores que existen.', 'universos-no-instalado');
    } else {
        if (!$univ) $h .= '<div class="vacio">No hay universos todavía.</div>';
        foreach ($univ as $u) {
            $activo = !in_array($u['activo'], [0, '0', false], true);
            $h .= '<h3 id="universo-' . (int) $u['id'] . '">' . e($u['nombre']) . ' <span class="tenue">N° ' . (int) $u['id'] . '</span> ' . cc_chip($activo ? 'abierto' : 'cerrado a nuevos', $activo ? 'ok' : '')
                . ' <span class="tenue">' . count($u['servidores']) . ' servidores' . ($u['creado'] ? ' · desde ' . e(cc_fecha($u['creado'], false)) : '') . '</span></h3>';
            $h .= cc_srv_tabla_servidores($u['servidores'], 'tabla-servidores-u' . (int) $u['id']);
        }
    }
    if ($sueltos) {
        if ($univ !== null) $h .= '<h3>Sin universo</h3>';
        $h .= cc_srv_tabla_servidores($sueltos, 'tabla-servidores-sueltos');
    }
    return $h . '</section>';
}

function cc_srv_tabla_servidores(array $servs, string $id): string
{
    return cc_tabla(['Servidor · ' . CC_SRV_DIAS . ' días', 'Estado', 'Jugadores', 'Activos 1 / 7 / 30 d'], array_map(function ($s) {
        $chips = cc_srv_estado_chip($s['fusionado_en'] !== null ? 'fusionado' : ($s['estado'] !== null ? (string) $s['estado'] : null));
        if (!$s['abierto'] && $s['fusionado_en'] === null) $chips .= ' ' . cc_chip('cerrado');
        return ['<b>' . e($s['nombre']) . '</b><br><span class="tenue">N° ' . (int) $s['id'] . ($s['fusionado_en'] !== null ? ' · fusionado ' . e(cc_fecha($s['fusionado_en'], false)) . ($s['fusionado_a'] ? ' en N° ' . (int) $s['fusionado_a'] : '') : '') . '</span><br>' . cc_srv_sparkline($s['serie'], $s['nombre']),
            '<span data-estado="' . e((string) ($s['estado'] ?? '')) . '">' . $chips . '</span>',
            cc_num($s['jugadores']) . ($s['capacidad'] > 0 ? '<br><span class="tenue">de ' . cc_num($s['capacidad']) . '</span>' : ''),
            cc_num($s['a1']) . ' / ' . cc_num($s['a7']) . ' / ' . cc_num($s['a30'])];
    }, $servs), 'Sin servidores.', $id);
}

/** @return array{0: string, 1: string} html, fase de la copa más reciente */
function cc_srv_bloque_copa(): array
{
    $h = '<section class="panel" id="panel-copa"><h2>Copa de Servidores</h2>';
    if (!Control::tablas('copas', 'copa_servidores', 'copa_cruces')) {
        return [$h . cc_srv_no_instalado('Copa de Servidores', 'Faltan Copas (src/Copas.php) y sus tablas copas / copa_servidores / copa_cruces.', 'copa-no-instalada') . '</section>', '—'];
    }
    $colU = Control::columna('copas', 'universo_id');
    $copas = $colU ? Db::todas('SELECT c.* FROM copas c JOIN (SELECT universo_id, MAX(id) AS id FROM copas GROUP BY universo_id) u ON u.id = c.id ORDER BY c.universo_id')
                   : Db::todas('SELECT * FROM copas ORDER BY id DESC LIMIT 1');
    if (!$copas) return [$h . '<div class="vacio" id="copa-vacia">Todavía no hay copas. La abre la tarea programada (bin/copas.php) el lunes.</div></section>', '—'];
    $nombres = [];
    foreach (Db::todas('SELECT id, nombre FROM servidores') as $s) $nombres[(int) $s['id']] = (string) $s['nombre'];
    $univ = [];
    if (Control::tabla('universos')) foreach (Db::todas('SELECT id, nombre FROM universos') as $u) $univ[(int) $u['id']] = (string) $u['nombre'];
    $fase = (string) ($copas[0]['fase'] ?? '—');
    $metFase = cc_srv_metodo('Copas', 'forzarFase', 'cambiarFase', 'fijarFase') ?? (cc_srv_respaldo_fase() ? 'respaldo' : null);
    $metRejugar = cc_srv_metodo('Copas', 'rejugarCruce', 'rejugar') ?? (cc_srv_respaldo_rejugar() ? 'respaldo' : null);
    foreach ($copas as $c) {
        $cid = (int) $c['id'];
        $fase = (string) $c['fase'];
        $h .= '<h3 id="copa-' . $cid . '">' . e($c['nombre'] ?? $c['torneo_key'] ?? 'Copa') . ' ' . cc_chip(CC_SRV_FASES[$fase] ?? $fase, ['preparacion' => 'aviso', 'batalla' => 'mal', 'cerrada' => 'ok'][$fase] ?? '') . '</h3>'
            . '<p class="tenue">' . ($colU && isset($c['universo_id']) ? e($univ[(int) $c['universo_id']] ?? ('Universo N° ' . (int) $c['universo_id'])) . ' · ' : '')
            . 'Semana ' . e($c['semana'] ?? '—') . ' · torneo <code>' . e($c['torneo_key'] ?? '—') . '</code> · ' . e(cc_srv_hora($c['inicio'] ?? null)) . ' → ' . e(cc_srv_hora($c['fin'] ?? null)) . ' · copa N° ' . $cid . '</p>';
        $tabla = Db::todas('SELECT * FROM copa_servidores WHERE copa_id = ? ORDER BY COALESCE(posicion, 999), puntos_tabla DESC, dif_calidad DESC, puntos_prep DESC', [$cid]);
        $h .= cc_tabla(['#', 'Servidor', 'Pts', 'G-E-P', 'Dif. calidad', 'Preparación'], array_map(fn($f, $i) => [
            (int) ($f['posicion'] ?? 0) ?: $i + 1, e($nombres[(int) $f['servidor_id']] ?? ('Servidor ' . (int) $f['servidor_id'])), '<b>' . cc_num($f['puntos_tabla'] ?? 0) . '</b>',
            (int) ($f['ganados'] ?? 0) . '-' . (int) ($f['empatados'] ?? 0) . '-' . (int) ($f['perdidos'] ?? 0), cc_num($f['dif_calidad'] ?? 0), cc_num($f['puntos_prep'] ?? 0)], $tabla, array_keys($tabla)),
            'Sin servidores en esta copa.', 'tabla-copa-' . $cid);
        $cruces = Db::todas('SELECT * FROM copa_cruces WHERE copa_id = ? ORDER BY ronda, hora, id', [$cid]);
        $h .= '<h4>Cruces</h4>' . cc_tabla(['Ronda', 'Cruce', 'Hora', 'Estado', 'Resultado', ''], array_map(function ($x) use ($nombres, $metRejugar) {
            $det = json_decode((string) ($x['detalle_json'] ?? ''), true);
            $partidos = is_array($det) ? (array) ($det['partidos'] ?? []) : [];
            $res = $x['puntos_a'] !== null && $x['puntos_b'] !== null ? cc_num($x['puntos_a']) . ' – ' . cc_num($x['puntos_b']) : '—';
            if ($partidos) $res .= '<br><span class="tenue">' . count($partidos) . ' partidos</span>';
            $a = $nombres[(int) $x['servidor_a']] ?? ('N° ' . (int) $x['servidor_a']);
            $b = $nombres[(int) $x['servidor_b']] ?? ('N° ' . (int) $x['servidor_b']);
            $boton = $metRejugar ? cc_boton('servidores_copa_rejugar', ['cruce_id' => $x['id']], 'Rejugar', 'btn btn-chico btn-sec', '¿Rejugar el cruce ' . $a . ' vs ' . $b . '? Se recalcula con el motor y cambia la tabla.') : '';
            return [(int) $x['ronda'], e($a) . ' <span class="tenue">vs</span> ' . e($b), e(cc_srv_hora($x['hora'] ?? null)), cc_chip((string) $x['estado'], ['jugado' => 'ok', 'pendiente' => 'aviso', 'jugando' => 'mal'][$x['estado']] ?? ''), $res,
                '<div class="acciones">' . $boton . '</div>'];
        }, $cruces), 'Sin cruces todavía.', 'tabla-cruces-' . $cid);
        // Administración de la copa
        $h .= '<details class="ver-tabla" id="admin-copa-' . $cid . '"><summary>Administrar esta copa</summary>';
        if ($metFase === 'respaldo') $h .= '<p class="tenue">Sin Copas::forzarFase: la fase solo avanza (preparación → batalla como la tarea programada; cerrada juega los cruces pendientes y cierra con Copas::cerrar si ya terminó la batalla).</p>';
        if (!$metFase) $h .= cc_srv_no_instalado('Forzar fase', 'Falta Copas::forzarFase(int $copa, string $fase, string $quien).');
        else $h .= cc_form('servidores_copa_fase', ['copa_id' => $cid], 'form', '¿Forzar el cambio de fase de la copa? Queda en la auditoría.')
            . '<label>Forzar fase<select name="fase">' . cc_opciones(CC_SRV_FASES, $fase) . '</select></label><div class="botones"><button class="btn btn-sec" type="submit">Cambiar fase</button></div></form>';
        if (!$metRejugar) $h .= cc_srv_no_instalado('Rejugar un cruce', 'Falta Copas::rejugarCruce(int $cruce, string $quien).');
        elseif ($metRejugar === 'respaldo') $h .= '<p class="tenue">Sin Copas::rejugarCruce: "Rejugar" vuelve el cruce a pendiente (misma semilla) y lo juega con Copas::jugarCruce; si el motor no responde queda pendiente para la tarea programada.</p>';
        $h .= '</details>';
    }
    return [$h . '</section>', CC_SRV_FASES[$fase] ?? $fase];
}

/** Resumen legible de un plan de fusión (Fusiones::plan / fusiones.plan_json): resumen, bloqueos, advertencias y el JSON completo. */
function cc_srv_plan_resumen(array $plan): string
{
    $et = ['jugadores' => 'Jugadores a mover', 'activos' => 'Activos', 'activos_30' => 'Activos (30 días)', 'inactivos' => 'Inactivos', 'choques_alias' => 'Choques de alias', 'alias' => 'Alias renombrados',
           'asociaciones' => 'Asociaciones', 'choques_asociaciones' => 'Choques de asociaciones', 'mercado' => 'Mercado', 'publicaciones' => 'Publicaciones del mercado',
           'publicaciones_activas' => 'Publicaciones activas', 'en_curso' => 'Competencias en curso', 'competencias' => 'Competencias en curso', 'canales' => 'Canales de chat', 'chat' => 'Canales de chat',
           'rankings' => 'Rankings', 'bloqueos' => 'Bloqueos'];
    $texto = function (mixed $v): string {
        if (is_bool($v)) return $v ? 'sí' : 'no';
        if (is_scalar($v) || $v === null) return (string) ($v ?? '—');
        if (array_is_list($v)) return cc_num(count($v));
        $partes = [];
        foreach ($v as $kk => $vv) if (count($partes) < 6 && !in_array((string) $kk, ['ids', 'decision'], true)) $partes[] = str_replace('_', ' ', (string) $kk) . ': ' . (is_array($vv) ? count($vv) : (is_bool($vv) ? ($vv ? 'sí' : 'no') : (string) $vv));
        return implode(' · ', $partes) ?: '—';
    };
    $items = [];
    // Con "resumen" (Fusiones real) se muestran sus números; si no, cada clave del plan.
    $fuente = isset($plan['resumen']) && is_array($plan['resumen']) && !array_is_list($plan['resumen']) ? $plan['resumen'] : $plan;
    $omitir = ['origen', 'destino', 'id', 'plan_id', 'origen_id', 'destino_id', 'creado', 'estado', 'version', 'huella', 'generado', 'resumen', 'tablas', 'decisiones', 'advertencias', 'bloqueos'];
    if ($fuente !== $plan) $omitir = [];
    foreach ($fuente as $k => $v) {
        if (in_array((string) $k, $omitir, true) || count($items) >= 14) continue;
        $items[] = '<dt>' . e($et[$k] ?? ucfirst(str_replace('_', ' ', (string) $k))) . '</dt><dd>' . e(mb_substr($texto($v), 0, 300)) . '</dd>';
    }
    $h = $items ? '<dl class="datos">' . implode('', $items) . '</dl>' : '<p class="tenue">El plan no trae detalle.</p>';
    $lista = fn(mixed $l) => is_array($l) ? array_values(array_filter(array_map(fn($x) => is_array($x) ? (string) ($x['texto'] ?? $x['detalle'] ?? json_encode($x, JSON_UNESCAPED_UNICODE)) : (string) $x, $l), fn($x) => $x !== '')) : [];
    $bloq = $lista($plan['bloqueos'] ?? null);
    if ($bloq) $h .= '<div class="aviso aviso-error" data-bloqueos="' . count($bloq) . '"><b>Bloqueos (al armar el plan):</b><ul class="lista">' . implode('', array_map(fn($x) => '<li>' . e($x) . '</li>', $bloq)) . '</ul></div>';
    $adv = $lista($plan['advertencias'] ?? null);
    if ($adv) $h .= '<p class="tenue"><b>Advertencias:</b> ' . e(implode(' · ', array_slice($adv, 0, 8))) . '</p>';
    $json = (string) json_encode($plan, JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT);
    return $h . '<details class="ver-tabla"><summary>Ver el plan completo</summary><pre class="json">' . e(mb_substr($json, 0, 8000)) . '</pre></details>';
}

/** @return array{0: string, 1: int} html, avisos pendientes */
function cc_srv_bloque_fusiones(): array
{
    $h = '<section class="panel" id="panel-fusiones"><h2>Avisos de abandono y fusiones</h2>';
    if (!Control::tabla('fusiones')) return [$h . cc_srv_no_instalado('Fusiones', 'Faltan Fusiones (src/Fusiones.php) y la tabla fusiones.', 'fusiones-no-instaladas') . '</section>', 0];
    $nombres = [];
    foreach (Db::todas('SELECT id, nombre FROM servidores') as $s) $nombres[(int) $s['id']] = (string) $s['nombre'];
    $nom = fn($id) => $nombres[(int) $id] ?? ('Servidor N° ' . (int) $id);
    $ejecutar = cc_srv_metodo('Fusiones', 'ejecutar');
    $rearmar = cc_srv_metodo('Fusiones', 'crearPlan');
    $avisos = Db::todas("SELECT * FROM fusiones WHERE estado IN ('plan', 'aprobada') ORDER BY id");
    $h .= '<p class="tenue">Cuando un servidor entra en <b>abandono</b> se crea aquí un plan para mover a sus jugadores. La fusión nunca es automática: la aprueba una persona escribiendo el nombre del servidor. Nunca se borran datos de jugadores ni se tocan créditos o compras.</p>';
    if (!$ejecutar) $h .= cc_srv_no_instalado('Aprobar fusiones', 'Falta Fusiones::ejecutar(int $plan_id, string $quien) (src/Fusiones.php): se pueden ver y cancelar los planes, no ejecutarlos.', 'fusion-ejecutar-no-instalado');
    if (!$avisos) $h .= '<div class="vacio" id="sin-avisos">Ningún servidor en abandono.</div>';
    foreach ($avisos as $f) {
        $fid = (int) $f['id'];
        $plan = json_decode((string) ($f['plan_json'] ?? ''), true);
        $origen = $nom($f['origen']);
        $h .= '<article class="panel peligro" id="aviso-fusion-' . $fid . '"><h3>' . e($origen) . ' → ' . e($nom($f['destino'])) . ' ' . cc_chip((string) $f['estado'], 'aviso') . '</h3>'
            . '<p class="tenue">Plan N° ' . $fid . ' · creado ' . e(cc_fecha($f['creado'] ?? null)) . (!empty($f['quien']) ? ' · ' . e($f['quien']) : '') . '</p>'
            . (is_array($plan) ? cc_srv_plan_resumen($plan) : '<p class="tenue">Sin plan guardado.</p>');
        $h .= '<p class="acciones"><a class="btn btn-chico btn-sec" href="' . e(cc_url(['t' => 'servidores', 'plan_origen' => $f['origen'], 'plan_destino' => $f['destino']])) . '#plan-previo">Revisar el plan ahora</a>'
            . ($rearmar ? cc_boton('servidores_fusion_plan', ['origen' => $f['origen'], 'destino' => $f['destino']], 'Armar el plan otra vez', 'btn btn-chico btn-sec', '¿Rehacer el plan con los datos de ahora? Este plan queda reemplazado.') : '') . '</p>';
        $h .= '<div class="acciones-grid">';
        $h .= cc_form('servidores_fusion_aprobar', ['fusion_id' => $fid], 'form', '¿Fusionar ' . $origen . ' en ' . $nom($f['destino']) . '? Se mueven todos sus jugadores y el servidor se cierra.')
            . '<label>Para aprobar, escribe el nombre del servidor <b>' . e($origen) . '</b><input name="confirmar_nombre" required maxlength="120" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="' . e($origen) . '"></label>'
            . '<div class="botones"><button class="btn btn-peligro" type="submit"' . ($ejecutar ? '' : ' disabled') . '>Aprobar fusión</button></div></form>';
        $h .= cc_form('servidores_fusion_cancelar', ['fusion_id' => $fid], 'form', '¿Cancelar este plan de fusión?')
            . '<label>Motivo (opcional)<input name="motivo" maxlength="200"></label><div class="botones"><button class="btn btn-sec" type="submit">Cancelar plan</button></div></form>';
        $h .= '</div></article>';
    }
    // Avisos que deja la vigilancia diaria (tabla avisos del servidor, tipo servidor_abandono)
    if (Control::tabla('avisos')) {
        $av = Db::todas("SELECT * FROM avisos WHERE tipo = 'servidor_abandono' ORDER BY id DESC LIMIT 10");
        if ($av) $h .= '<details class="ver-tabla" id="avisos-vigilancia"><summary>Avisos de la vigilancia (' . count($av) . ')</summary>'
            . cc_tabla(['Fecha', 'Detalle'], array_map(fn($a) => [e(cc_fecha($a['creado'])), '<span class="largo">' . e(mb_substr((string) $a['detalle'], 0, 400)) . '</span>'], $av), '', 'tabla-avisos-vigilancia') . '</details>';
    }
    // Vista previa con otro destino (solo lectura: Fusiones::plan)
    $o = cc_get_int('plan_origen'); $d = cc_get_int('plan_destino');
    if (cc_srv_metodo('Fusiones', 'plan')) {
        $h .= '<details class="ver-tabla" id="plan-previo"' . ($o > 0 ? ' open' : '') . '><summary>Ver un plan con otro destino</summary><form method="get" action="' . CC_RUTA . '" class="form"><input type="hidden" name="t" value="servidores">'
            . '<label>Origen<select name="plan_origen">' . cc_opciones($nombres, (string) $o) . '</select></label><label>Destino<select name="plan_destino">' . cc_opciones($nombres, (string) $d) . '</select></label>'
            . '<div class="botones"><button class="btn btn-sec" type="submit">Ver plan</button></div></form>';
        if ($o > 0 && $d > 0) {
            try {
                $p = cc_srv_llamar('Fusiones', 'plan', ['origen' => $o, 'origenid' => $o, 'desde' => $o, 'destino' => $d, 'destinoid' => $d, 'hacia' => $d], [$o, $d]);
                $h .= '<h4>' . e($nom($o)) . ' → ' . e($nom($d)) . '</h4>' . (is_array($p) ? cc_srv_plan_resumen($p) : '<p class="tenue">El módulo no devolvió un plan.</p>')
                    . ($rearmar ? '<div class="botones">' . cc_boton('servidores_fusion_plan', ['origen' => $o, 'destino' => $d], 'Guardar como plan (para aprobar)', 'btn btn-sec', '¿Guardar este plan? Si ya había uno para ese servidor, queda reemplazado.') . '</div>' : '');
            } catch (\Throwable $e) {
                $h .= '<div class="aviso aviso-error">No se pudo calcular el plan: ' . e(mb_substr($e->getMessage(), 0, 300)) . '</div>';
            }
        }
        $h .= '</details>';
    }
    $hist = Db::todas("SELECT * FROM fusiones WHERE estado NOT IN ('plan', 'aprobada') ORDER BY id DESC LIMIT 10");
    if ($hist) {
        $h .= '<h3>Historial</h3>' . cc_tabla(['N°', 'Fusión', 'Estado', 'Fecha', 'Quién'], array_map(fn($f) => [(int) $f['id'], e($nom($f['origen'])) . ' → ' . e($nom($f['destino'])),
            cc_chip((string) $f['estado'], ['ejecutada' => 'ok', 'cancelada' => ''][$f['estado']] ?? ''), e(cc_fecha($f['ejecutada'] ?? $f['creado'] ?? null)), e($f['quien'] ?? '—')], $hist), '', 'tabla-fusiones-historial');
    }
    return [$h . '</section>', count($avisos)];
}

function cc_srv_bloque_crear(): string
{
    $n = max(1, min(CC_SRV_MAX_NUEVOS, (int) Config::get('UNIVERSO_SERVIDORES_INICIALES', '3')));
    $h = '<section class="panel" id="panel-crear-universo"><h2>Crear universo (' . $n . ' servidores)</h2>';
    if (!cc_srv_metodo('Universos', 'crear')) return $h . cc_srv_no_instalado('Crear universo', 'Falta Universos::crear(string $nombre, int $n, string $quien) (src/Universos.php).', 'crear-no-instalado') . '</section>';
    return $h . '<p class="tenue">Un universo nuevo nace con N servidores vacíos y abiertos; los jugadores nuevos entran al universo más nuevo. Compiten entre ellos en la Copa.</p>'
        . cc_form('servidores_universo_crear', [], 'form form-producto', '¿Crear un universo nuevo? Los jugadores nuevos empezarán a entrar ahí.')
        . '<label>Nombre<input name="nombre" required minlength="3" maxlength="40" placeholder="Universo Pacífico"></label>'
        . '<label>Servidores<input name="n" inputmode="numeric" pattern="[0-9]{1,2}" required value="' . $n . '"></label>'
        . '<div class="botones"><button class="btn" type="submit">Crear universo</button></div></form></section>';
}

/** Insignia de la pestaña: planes de fusión esperando aprobación. */
function cc_servidores_insignia(): int
{
    return Control::tabla('fusiones') ? (int) Db::valor("SELECT COUNT(*) FROM fusiones WHERE estado IN ('plan', 'aprobada')") : 0;
}

// ---------------------------------------------------------------------------------------------- acciones (POST)
function cc_a_servidores(string $accion, string $q): string
{
    return match ($accion) {
        'servidores_fusion_aprobar' => cc_srv_a_aprobar($q),
        'servidores_fusion_cancelar' => cc_srv_a_cancelar($q),
        'servidores_fusion_plan' => cc_srv_a_plan($q),
        'servidores_universo_crear' => cc_srv_a_crear($q),
        'servidores_copa_fase' => cc_srv_a_fase($q),
        'servidores_copa_rejugar' => cc_srv_a_rejugar($q),
        default => throw new Fallo('Acción desconocida.', 400),
    };
}

/** Corre una llamada a un módulo: los errores que no son Fallo se anotan y se muestran como Fallo (el panel no se cae). */
function cc_srv_modulo(string $q, string $accion, string $que, callable $f): mixed
{
    try {
        return $f();
    } catch (Fallo $e) {
        throw $e;
    } catch (\Throwable $e) {
        error_log('EN VIVO servidores: ' . $accion . ' ' . get_class($e) . ' ' . mb_substr($e->getMessage(), 0, 300));
        Auditoria::anotar($q, $accion . '_fallida', $que . ' · ' . mb_substr($e->getMessage(), 0, 300));
        throw new Fallo('No se pudo: ' . $e->getMessage(), 500);
    }
}

function cc_srv_fusion(int $id): array
{
    Fallo::si(!Control::tabla('fusiones'), 'Módulo no instalado: falta la tabla fusiones.', 409);
    $f = Db::fila('SELECT * FROM fusiones WHERE id = ?', [$id]);
    Fallo::si(!$f, 'Ese plan de fusión no existe.', 404);
    Fallo::si(!in_array($f['estado'], ['plan', 'aprobada'], true), 'El plan N° ' . $id . ' ya está ' . $f['estado'] . '.', 409);
    return $f;
}

function cc_srv_nombre(int $id): string { return (string) (Db::valor('SELECT nombre FROM servidores WHERE id = ?', [$id]) ?: 'Servidor N° ' . $id); }

function cc_srv_a_aprobar(string $q): string
{
    $id = cc_post_int('fusion_id');
    $f = cc_srv_fusion($id);
    $origen = cc_srv_nombre((int) $f['origen']);
    $destino = cc_srv_nombre((int) $f['destino']);
    $escrito = mb_substr(cc_post('confirmar_nombre'), 0, 120);
    if ($escrito === '' || cc_srv_normalizar($escrito) !== cc_srv_normalizar($origen)) {
        Auditoria::anotar($q, 'servidores_fusion_confirmacion_mala', 'Plan N° ' . $id . ' (' . $origen . ' → ' . $destino . '): el nombre escrito no coincide');
        throw new Fallo('Para aprobar la fusión escribe el nombre del servidor tal como aparece: ' . $origen . '. No se hizo nada.', 422);
    }
    Fallo::si(!cc_srv_metodo('Fusiones', 'ejecutar'), 'Módulo no instalado: falta Fusiones::ejecutar. No se hizo nada.', 409);
    $r = cc_srv_modulo($q, 'servidores_fusion_aprobar', 'Plan N° ' . $id . ' (' . $origen . ' → ' . $destino . ')',
        fn() => cc_srv_llamar('Fusiones', 'ejecutar', ['planid' => $id, 'plan' => $id, 'id' => $id, 'fusionid' => $id, 'fusion' => $id, 'quien' => $q], [$id, $q]));
    $movidos = is_array($r) ? cc_srv_campo($r, ['movidos', 'jugadores_movidos', 'jugadores']) : null;
    $movidos = is_array($movidos) ? count($movidos) : $movidos;
    Auditoria::anotar($q, 'servidores_fusion_aprobar', 'Plan N° ' . $id . ': ' . $origen . ' → ' . $destino . ' aprobado y ejecutado' . ($movidos !== null ? ' · ' . (int) $movidos . ' jugadores movidos' : ''));
    return 'Fusión aprobada: ' . $origen . ' → ' . $destino . ($movidos !== null ? ' (' . (int) $movidos . ' jugadores movidos)' : '') . '.';
}

function cc_srv_a_cancelar(string $q): string
{
    $id = cc_post_int('fusion_id');
    $f = cc_srv_fusion($id);
    $motivo = mb_substr(cc_post('motivo'), 0, 200);
    $txt = cc_srv_nombre((int) $f['origen']) . ' → ' . cc_srv_nombre((int) $f['destino']);
    if (cc_srv_metodo('Fusiones', 'cancelar')) {
        cc_srv_modulo($q, 'servidores_fusion_cancelar', 'Plan N° ' . $id, fn() => cc_srv_llamar('Fusiones', 'cancelar', ['planid' => $id, 'plan' => $id, 'id' => $id, 'fusionid' => $id, 'quien' => $q, 'motivo' => $motivo], [$id, $q]));
    } else {
        $n = Db::q("UPDATE fusiones SET estado = 'cancelada', quien = ? WHERE id = ? AND estado IN ('plan', 'aprobada')", [$q, $id])->rowCount();
        Fallo::si($n !== 1, 'El plan ya no se puede cancelar.', 409);
    }
    Auditoria::anotar($q, 'servidores_fusion_cancelar', 'Plan N° ' . $id . ': ' . $txt . ' cancelado' . ($motivo !== '' ? ' · motivo: ' . $motivo : ''));
    return 'Plan de fusión N° ' . $id . ' cancelado (' . $txt . ').';
}

function cc_srv_a_plan(string $q): string
{
    Fallo::si(!Control::tabla('fusiones') || !cc_srv_metodo('Fusiones', 'crearPlan'), 'Módulo no instalado: falta Fusiones::crearPlan.', 409);
    $o = cc_post_int('origen'); $d = cc_post_int('destino');
    Fallo::si($o <= 0 || $d <= 0 || $o === $d, 'Elige un servidor de origen y uno de destino distintos.', 422);
    $id = (int) cc_srv_modulo($q, 'servidores_fusion_plan', cc_srv_nombre($o) . ' → ' . cc_srv_nombre($d),
        fn() => cc_srv_llamar('Fusiones', 'crearPlan', ['origen' => $o, 'destino' => $d, 'quien' => $q, 'sugerida' => false], [$o, $d, $q]));
    Auditoria::anotar($q, 'servidores_fusion_plan', 'Plan N° ' . $id . ': ' . cc_srv_nombre($o) . ' → ' . cc_srv_nombre($d) . ' armado desde el panel');
    return 'Plan de fusión N° ' . $id . ' guardado: ' . cc_srv_nombre($o) . ' → ' . cc_srv_nombre($d) . '. Revísalo antes de aprobar.';
}

function cc_srv_a_crear(string $q): string
{
    $n = cc_post_int('n');
    Fallo::si($n < 1 || $n > CC_SRV_MAX_NUEVOS, 'El universo debe tener entre 1 y ' . CC_SRV_MAX_NUEVOS . ' servidores.', 422);
    $nombre = trim(mb_substr(cc_post('nombre'), 0, 60));
    Fallo::si(mb_strlen($nombre) < 3 || mb_strlen($nombre) > 40, 'El nombre del universo debe tener de 3 a 40 caracteres.', 422);
    Fallo::si(!cc_srv_metodo('Universos', 'crear'), 'Módulo no instalado: falta Universos::crear.', 409);
    $r = cc_srv_modulo($q, 'servidores_universo_crear', $n . ' servidores',
        fn() => cc_srv_llamar('Universos', 'crear', ['n' => $n, 'servidores' => $n, 'cantidad' => $n, 'num' => $n, 'numero' => $n, 'nservidores' => $n, 'total' => $n,
            'nombre' => $nombre, 'quien' => $q], [$nombre, $n, $q]));
    $uid = is_array($r) ? (int) cc_srv_campo($r, ['id', 'universo_id', 'universo.id'], 0) : (is_numeric($r) ? (int) $r : 0);
    Auditoria::anotar($q, 'servidores_universo_crear', 'Universo ' . ($uid ? 'N° ' . $uid . ' ' : '') . ($nombre !== '' ? '"' . $nombre . '" ' : '') . 'creado con ' . $n . ' servidores');
    return 'Universo ' . ($uid ? 'N° ' . $uid . ' ' : '') . 'creado con ' . $n . ' servidores.';
}

/** ¿Se puede avanzar la fase sin Copas::forzarFase? (con los métodos públicos jugarCruce y cerrar) */
function cc_srv_respaldo_fase(): bool { return (bool) (cc_srv_metodo('Copas', 'jugarCruce') && cc_srv_metodo('Copas', 'cerrar')); }
function cc_srv_respaldo_rejugar(): bool { return (bool) (cc_srv_metodo('Copas', 'jugarCruce') && cc_srv_metodo('Copas', 'recalcularTabla')); }

function cc_srv_a_fase(string $q): string
{
    Fallo::si(!Control::tabla('copas'), 'Módulo no instalado: falta la tabla copas.', 409);
    $id = cc_post_int('copa_id');
    $fase = cc_post('fase');
    Fallo::si(!isset(CC_SRV_FASES[$fase]), 'Fase desconocida.', 422);
    $c = Db::fila('SELECT * FROM copas WHERE id = ?', [$id]);
    Fallo::si(!$c, 'Esa copa no existe.', 404);
    Fallo::si($c['fase'] === $fase, 'La copa ya está en ' . CC_SRV_FASES[$fase] . '.', 409);
    $m = cc_srv_metodo('Copas', 'forzarFase', 'cambiarFase', 'fijarFase');
    $extra = '';
    if ($m) {
        cc_srv_modulo($q, 'servidores_copa_fase', 'Copa N° ' . $id . ' → ' . $fase,
            fn() => cc_srv_llamar('Copas', $m, ['copa' => $id, 'copaid' => $id, 'id' => $id, 'fase' => $fase, 'quien' => $q], [$id, $fase, $q]));
    } else {
        // Respaldo con lo público de Copas: la fase solo avanza (como la tarea programada).
        Fallo::si(!cc_srv_respaldo_fase(), 'Módulo no instalado: falta Copas::forzarFase.', 409);
        $orden = array_flip(array_keys(CC_SRV_FASES));
        Fallo::si($orden[$fase] < ($orden[$c['fase']] ?? 0), 'La fase de la copa solo avanza (falta Copas::forzarFase para volver atrás).', 409);
        if ($c['fase'] === 'preparacion') Db::q("UPDATE copas SET fase = 'batalla' WHERE id = ? AND fase = 'preparacion'", [$id]);
        if ($fase === 'cerrada') {
            $jug = 0;
            foreach (Db::todas("SELECT id FROM copa_cruces WHERE copa_id = ? AND estado = 'pendiente' ORDER BY hora, id", [$id]) as $x) {
                $jug += (int) (bool) cc_srv_modulo($q, 'servidores_copa_fase', 'Copa N° ' . $id . ' → cerrada (cruce ' . $x['id'] . ')', fn() => cc_srv_llamar('Copas', 'jugarCruce', ['id' => (int) $x['id'], 'cruce' => (int) $x['id']], [(int) $x['id']]));
            }
            $cerro = (bool) cc_srv_modulo($q, 'servidores_copa_fase', 'Copa N° ' . $id . ' → cerrada', fn() => cc_srv_llamar('Copas', 'cerrar', ['id' => $id, 'copa' => $id], [$id]));
            if (!$cerro) {
                Auditoria::anotar($q, 'servidores_copa_fase', 'Copa N° ' . $id . ': fase ' . $c['fase'] . ' → batalla (pedida: cerrada; ' . $jug . ' cruces jugados; Copas::cerrar no la cerró todavía)');
                throw new Fallo('La copa quedó en Batalla' . ($jug ? ' (' . $jug . ' cruces jugados)' : '') . ': Copas::cerrar solo cierra cuando terminó la batalla (sábado 20:00) y no quedan cruces pendientes.', 409);
            }
            $extra = $jug ? ' (' . $jug . ' cruces jugados antes de cerrar)' : '';
        }
    }
    Auditoria::anotar($q, 'servidores_copa_fase', 'Copa N° ' . $id . ' (' . ($c['nombre'] ?? '') . '): fase ' . $c['fase'] . ' → ' . $fase . ($m ? '' : ' [respaldo]') . $extra);
    return 'Copa N° ' . $id . ': fase cambiada a ' . CC_SRV_FASES[$fase] . $extra . '.';
}

function cc_srv_a_rejugar(string $q): string
{
    Fallo::si(!Control::tabla('copa_cruces'), 'Módulo no instalado: falta la tabla copa_cruces.', 409);
    $id = cc_post_int('cruce_id');
    $x = Db::fila('SELECT * FROM copa_cruces WHERE id = ?', [$id]);
    Fallo::si(!$x, 'Ese cruce no existe.', 404);
    $m = cc_srv_metodo('Copas', 'rejugarCruce', 'rejugar');
    Fallo::si(!$m && !cc_srv_respaldo_rejugar(), 'Módulo no instalado: falta Copas::rejugarCruce.', 409);
    $txt = cc_srv_nombre((int) $x['servidor_a']) . ' vs ' . cc_srv_nombre((int) $x['servidor_b']);
    if ($m) {
        $r = cc_srv_modulo($q, 'servidores_copa_rejugar', 'Cruce N° ' . $id . ' (' . $txt . ')',
            fn() => cc_srv_llamar('Copas', $m, ['cruce' => $id, 'cruceid' => $id, 'id' => $id, 'quien' => $q], [$id, $q]));
    } else {
        // Respaldo con lo público de Copas: vuelve a pendiente (detalle_json conserva la semilla) y lo juega con jugarCruce.
        $cid = (int) $x['copa_id'];
        Fallo::si((string) Db::valor('SELECT fase FROM copas WHERE id = ?', [$cid]) === 'cerrada', 'La copa ya cerró y entregó premios: no se rejuegan sus cruces.', 409);
        Db::q("UPDATE copa_cruces SET estado = 'pendiente', puntos_a = NULL, puntos_b = NULL WHERE id = ?", [$id]);
        $jugado = (bool) cc_srv_modulo($q, 'servidores_copa_rejugar', 'Cruce N° ' . $id . ' (' . $txt . ')', fn() => cc_srv_llamar('Copas', 'jugarCruce', ['id' => $id, 'cruce' => $id], [$id]));
        if (!$jugado) {
            cc_srv_llamar('Copas', 'recalcularTabla', ['copa' => $cid, 'id' => $cid], [$cid]);
            Auditoria::anotar($q, 'servidores_copa_rejugar', 'Cruce N° ' . $id . ' de la copa N° ' . $cid . ' (' . $txt . ') vuelto a pendiente: el motor no respondió, lo juega la tarea programada');
            return 'Cruce ' . $txt . ' vuelto a pendiente: el motor no respondió y la tarea programada lo jugará.';
        }
        $r = Db::fila('SELECT puntos_a, puntos_b FROM copa_cruces WHERE id = ?', [$id]);
    }
    $res = is_array($r) && isset($r['puntos_a'], $r['puntos_b']) ? ' → ' . $r['puntos_a'] . ' – ' . $r['puntos_b'] : '';
    Auditoria::anotar($q, 'servidores_copa_rejugar', 'Cruce N° ' . $id . ' de la copa N° ' . (int) $x['copa_id'] . ' (' . $txt . ') rejugado' . $res);
    return 'Cruce ' . $txt . ' rejugado' . $res . '.';
}
