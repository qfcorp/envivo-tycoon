<?php
declare(strict_types=1);

namespace EnVivo;

/**
 * Universos (grupos de servidores que compiten en la Copa de Servidores) y reparto parejo de jugadores nuevos.
 * Contrato: server/COPAS.md §1. Tablas: src/migraciones/universos.sql.
 *
 * - Arranque (preparar): Universo 1 "Universo Andino" con UNIVERSO_SERVIDORES_INICIALES servidores (3 por defecto):
 *   Servidor 1 · Quito (ya existe), Servidor 2 · Guayaquil, Servidor 3 · Cuenca. Idempotente: solo completa lo que falta,
 *   nunca borra ni renombra. Sirve en una base que ya tiene jugadores en el Servidor 1 y en una base nueva.
 *   Lo corre bin/migrar.php (instalar/actualizar), y solas las funciones de lectura (servidoresDe, universoDe, resumen, crear).
 *   El registro de jugadores y /api/estado NO lo disparan (no cambian el reparto a mitad de una prueba o de un día).
 * - Reparto (asignar, desde Social::servidorParaNuevo): el universo activo más nuevo que tenga algún servidor abierto con cupo;
 *   dentro de él, el servidor con MENOS jugadores activos (7 días), empate -> menos jugadores en total, luego el id menor.
 *   Nunca a un servidor fusionado (fusionado_en) ni en 'abandono' según su última foto de salud (servidor_salud).
 *   Un servidor que llega a su capacidad se cierra a nuevos (abierto = 0). Si ningún servidor de ningún universo tiene cupo,
 *   se abre un universo nuevo con N servidores (queda en la auditoría como 'sistema').
 * - Actividad (marcarActivo): una fila por jugador y día en actividad_diaria; a lo más UNA escritura por jugador y día
 *   (más una por cada evento en línea validado, con $evento = true).
 *
 * Configuración (config.env, todo opcional):
 *   UNIVERSO_SERVIDORES_INICIALES=3        servidores con los que nace cada universo (1 a 12)
 *   UNIVERSO_CIUDADES=Quito,Guayaquil,...  ciudades para nombrar servidores: "Servidor <id> · <ciudad n.º id>" (por defecto Social::CIUDADES)
 *   UNIVERSO_NOMBRES=Universo Andino,...   nombres de los universos que se abren solos (por defecto self::NOMBRES)
 *   SERVIDOR_CAPACIDAD=1000                capacidad de los servidores nuevos (por defecto la del servidor más nuevo, o 1000)
 */
final class Universos
{
    public const NOMBRES = ['Universo Andino', 'Universo Pacífico', 'Universo Amazónico', 'Universo Galápagos', 'Universo Austral',
                            'Universo Volcánico', 'Universo Costero', 'Universo Estelar'];
    public const MAX_SERVIDORES = 12;
    public const DIAS_ACTIVO = 7;

    private static bool $preparado = false;
    /** @var array<string,true> "dia:jugador" ya marcados en esta petición */
    private static array $marcados = [];
    private static ?bool $hayFusion = null;
    private static ?bool $haySalud = null;
    private static ?int $reloj = null;

    // ------------------------------------------------------------------ reloj y configuración
    /** Solo pruebas: congela la hora (null = la de verdad). */
    public static function fijarReloj(?int $t): void { self::$reloj = $t; self::$marcados = []; }
    public static function ahora(): int { return self::$reloj ?? time(); }
    public static function hoy(): string { return date('Y-m-d', self::ahora()); }

    /** Primer día (incluido) de una ventana de $dias días que termina hoy: $dias = 1 es hoy, 7 la última semana. */
    public static function desde(int $dias): string { return date('Y-m-d', strtotime(self::hoy() . ' -' . max(0, $dias - 1) . ' days')); }

    /** Solo pruebas: olvida lo recordado en esta petición (como si empezara otra). */
    public static function reiniciar(): void { self::$preparado = false; self::$marcados = []; self::$hayFusion = null; self::$haySalud = null; }

    public static function servidoresIniciales(): int
    {
        $n = (int) Config::get('UNIVERSO_SERVIDORES_INICIALES', '3');
        return max(1, min(self::MAX_SERVIDORES, $n ?: 3));
    }

    /** @return list<string> */
    private static function lista(string $clave, array $porDefecto): array
    {
        $l = array_values(array_filter(array_map(fn($x) => Social::limpiarTexto($x), explode(',', Config::get($clave))), fn($x) => $x !== ''));
        return $l ?: array_values($porDefecto);
    }

    public static function nombreServidor(int $id): string
    {
        $c = self::lista('UNIVERSO_CIUDADES', Social::CIUDADES);
        return 'Servidor ' . $id . ' · ' . $c[($id - 1) % count($c)];
    }

    private static function nombreUniverso(int $id): string
    {
        $l = self::lista('UNIVERSO_NOMBRES', self::NOMBRES);
        $vuelta = intdiv($id - 1, count($l));
        return $l[($id - 1) % count($l)] . ($vuelta > 0 ? ' ' . ($vuelta + 1) : '');
    }

    private static function capacidad(): int
    {
        $c = (int) Config::get('SERVIDOR_CAPACIDAD', '0');
        if ($c > 0) return $c;
        return (int) (Db::valor('SELECT capacidad FROM servidores ORDER BY id DESC LIMIT 1') ?? 1000) ?: 1000;
    }

    /** ¿Existe servidores.fusionado_en (la agrega fusiones.sql)? Los servidores fusionados no cuentan ni reciben jugadores. */
    private static function hayFusion(): bool
    {
        return self::$hayFusion ??= isset(Migraciones::columnas('servidores')['fusionado_en']);
    }

    private static function sinFusionados(string $alias = 's'): string { return self::hayFusion() ? " AND $alias.fusionado_en IS NULL" : ''; }

    /** ¿Existe servidor_salud (la agrega fusiones.sql)? */
    private static function haySalud(): bool
    {
        return self::$haySalud ??= (bool) Db::valor("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'servidor_salud'");
    }

    /** Condición SQL: el servidor NO está en 'abandono' según su última foto de salud (SaludServidores). */
    private static function sinAbandono(string $alias = 's'): string
    {
        return self::haySalud() ? " AND NOT EXISTS (SELECT 1 FROM servidor_salud h WHERE h.servidor_id = $alias.id AND h.estado = 'abandono'
                                      AND h.dia = (SELECT MAX(h2.dia) FROM servidor_salud h2 WHERE h2.servidor_id = $alias.id))" : '';
    }

    // ------------------------------------------------------------------ arranque
    /**
     * Arranque idempotente: universo 1 "Universo Andino", los servidores sin universo pasan al más antiguo, y el universo 1
     * se completa hasta UNIVERSO_SERVIDORES_INICIALES servidores (nunca quita ni renombra). Devuelve los servidores creados.
     * @return list<int>
     */
    public static function preparar(bool $forzar = false): array
    {
        if (self::$preparado && !$forzar) return [];
        // Lo normal (ya arrancado): solo una lectura, sin tomar el turno de escritura
        $listo = fn() => Db::valor('SELECT 1 FROM universos WHERE id = 1') && !Db::valor('SELECT 1 FROM servidores WHERE universo_id IS NULL LIMIT 1')
                         && (int) Db::valor('SELECT COUNT(*) FROM servidores WHERE universo_id = 1') >= self::servidoresIniciales();
        if ($listo()) { self::$preparado = true; return []; }
        $creados = Db::tx(function (): array {
            if (!Db::valor('SELECT 1 FROM universos WHERE id = 1')) {
                Db::q("INSERT INTO universos (id, nombre, creado, activo) VALUES (1, ?, ?, 1)", [self::NOMBRES[0], self::ahora()]);
            }
            Db::q('UPDATE servidores SET universo_id = (SELECT MIN(id) FROM universos) WHERE universo_id IS NULL');
            if (!Db::valor('SELECT 1 FROM servidores WHERE id = 1')) {   // base rara sin el Servidor 1 (nunca pasa con Db.php)
                Db::q('INSERT INTO servidores (id, nombre, capacidad, abierto, creado, universo_id) VALUES (1, ?, ?, 1, ?, 1)', [self::nombreServidor(1), self::capacidad(), self::ahora()]);
            }
            $faltan = self::servidoresIniciales() - (int) Db::valor('SELECT COUNT(*) FROM servidores WHERE universo_id = 1');
            $o = [];
            for ($i = 0; $i < $faltan; $i++) $o[] = self::nuevoServidor(1);
            return $o;
        });
        self::$preparado = true;
        return $creados;
    }

    private static function nuevoServidor(int $universo, ?int $capacidad = null): int
    {
        $id = (int) Db::valor('SELECT COALESCE(MAX(id), 0) FROM servidores') + 1;
        Db::q('INSERT INTO servidores (id, nombre, capacidad, abierto, creado, universo_id) VALUES (?, ?, ?, 1, ?, ?)',
            [$id, self::nombreServidor($id), $capacidad ?? self::capacidad(), self::ahora(), $universo]);
        return $id;
    }

    // ------------------------------------------------------------------ crear universos
    /**
     * Abre un universo nuevo con $n servidores (Centro de Control, o solo cuando todo está lleno con $quien = 'sistema').
     * Queda en la auditoría. @return array{id:int, nombre:string, servidores:list<array>}
     */
    public static function crear(string $nombre, int $n, string $quien): array
    {
        $nombre = Social::limpiarTexto($nombre);
        Fallo::si(mb_strlen($nombre) < 3 || mb_strlen($nombre) > 40, 'El nombre del universo debe tener de 3 a 40 caracteres.', 400, ['codigo' => 'nombre']);
        Fallo::si($n < 1 || $n > self::MAX_SERVIDORES, 'Un universo nace con 1 a ' . self::MAX_SERVIDORES . ' servidores.', 400, ['codigo' => 'servidores']);
        Fallo::si(trim($quien) === '', 'Falta quién crea el universo.', 400, ['codigo' => 'quien']);
        self::preparar();
        $id = Db::tx(function () use ($nombre, $n, $quien): int {
            foreach (Db::todas('SELECT nombre FROM universos') as $u) {
                Fallo::si(Social::clave($u['nombre']) === Social::clave($nombre), 'Ya existe un universo con ese nombre.', 409, ['codigo' => 'nombre_ocupado']);
            }
            return self::crearEnTx($nombre, $n, $quien);
        });
        return ['id' => $id, 'nombre' => $nombre, 'servidores' => self::servidoresDe($id)];
    }

    private static function crearEnTx(string $nombre, int $n, string $quien): int
    {
        $cap = self::capacidad();
        Db::q('INSERT INTO universos (nombre, creado, activo) VALUES (?, ?, 1)', [$nombre, self::ahora()]);
        $id = Db::ultimoId();
        $sv = [];
        for ($i = 0; $i < $n; $i++) $sv[] = self::nuevoServidor($id, $cap);
        Auditoria::anotar($quien, 'universo_crear', 'Universo ' . $id . ' "' . $nombre . '" con ' . $n . ' servidores (' . implode(', ', array_map(fn($s) => self::nombreServidor($s), $sv)) . '), capacidad ' . $cap . ' cada uno');
        return $id;
    }

    // ------------------------------------------------------------------ reparto de jugadores nuevos
    /**
     * Servidor para un jugador que se registra (lo llama Social::servidorParaNuevo, dentro de Db::tx).
     * Cierra a nuevos los servidores llenos y abre un universo si ya no queda cupo en ninguno.
     */
    public static function asignar(): int
    {
        return Db::tx(function (): int {
            $s = self::elegir(true);
            if ($s !== null) return $s;
            $id = (int) Db::valor('SELECT COALESCE(MAX(id), 0) FROM universos') + 1;
            $nombre = self::nombreUniverso($id);
            if (Db::valor('SELECT 1 FROM universos WHERE nombre = ?', [$nombre])) $nombre .= ' ' . $id;   // ya usado a mano
            $u = self::crearEnTx($nombre, self::servidoresIniciales(), 'sistema');
            return (int) Db::valor('SELECT MIN(id) FROM servidores WHERE universo_id = ?', [$u]);
        });
    }

    /** Solo lectura: a qué servidor entraría ahora un jugador nuevo (null = se abriría un universo nuevo). */
    public static function siguiente(): ?int { return self::elegir(false); }

    private static function elegir(bool $escribir): ?int
    {
        $desde = self::desde(self::DIAS_ACTIVO);
        $min = (int) (Db::valor('SELECT MIN(id) FROM universos') ?? 0);   // un servidor sin universo (agregado a mano) cuenta en el primero
        foreach (Db::todas('SELECT id FROM universos WHERE activo = 1 ORDER BY id DESC') as $u) {
            $cands = [];
            foreach (Db::todas('SELECT s.id, s.capacidad,
                                       (SELECT COUNT(*) FROM jugadores j WHERE j.servidor_id = s.id) AS total,
                                       (SELECT COUNT(*) FROM jugadores j WHERE j.servidor_id = s.id
                                          AND EXISTS (SELECT 1 FROM actividad_diaria a WHERE a.jugador_id = j.id AND a.dia >= ?)) AS activos
                                FROM servidores s WHERE s.abierto = 1 AND ' . ((int) $u['id'] === $min ? '(s.universo_id = ? OR s.universo_id IS NULL)' : 's.universo_id = ?')
                                . self::sinFusionados() . self::sinAbandono(), [$desde, (int) $u['id']]) as $s) {
                if ((int) $s['total'] >= (int) $s['capacidad']) {
                    if ($escribir) Db::q('UPDATE servidores SET abierto = 0 WHERE id = ?', [$s['id']]);   // lleno: cerrado a nuevos jugadores
                    continue;
                }
                $cands[] = [(int) $s['activos'], (int) $s['total'], (int) $s['id']];
            }
            if ($cands) { sort($cands); return $cands[0][2]; }
        }
        return null;
    }

    // ------------------------------------------------------------------ actividad
    /**
     * Anota que el jugador jugó hoy. Barato: lo ya marcado en esta petición no consulta nada; si no, una lectura por clave
     * primaria y, solo la primera vez del día, una escritura. Con $evento = true (intento en línea validado) suma 1 a eventos
     * (una escritura por evento). Nunca lanza error (no debe romper /api/estado ni un intento). Devuelve si escribió.
     */
    public static function marcarActivo(int $jugador, bool $evento = false): bool
    {
        if ($jugador <= 0) return false;
        $dia = self::hoy();
        $k = $dia . ':' . $jugador;
        try {
            if ($evento) {
                Db::q('INSERT INTO actividad_diaria (dia, jugador_id, servidor_id, eventos) SELECT ?, id, servidor_id, 1 FROM jugadores WHERE id = ?
                       ON CONFLICT (dia, jugador_id) DO UPDATE SET eventos = eventos + 1, servidor_id = excluded.servidor_id', [$dia, $jugador]);
                self::$marcados[$k] = true;
                return true;
            }
            if (isset(self::$marcados[$k])) return false;
            self::$marcados[$k] = true;
            if (Db::valor('SELECT 1 FROM actividad_diaria WHERE dia = ? AND jugador_id = ?', [$dia, $jugador])) return false;
            return Db::q('INSERT OR IGNORE INTO actividad_diaria (dia, jugador_id, servidor_id, eventos) SELECT ?, id, servidor_id, 0 FROM jugadores WHERE id = ?', [$dia, $jugador])->rowCount() > 0;
        } catch (\Throwable) {
            return false;
        }
    }

    /** Jugadores que HOY son del servidor y jugaron en los últimos $dias días (1 = hoy, 7 = la semana). */
    public static function activos(int $servidor, int $dias = self::DIAS_ACTIVO): int
    {
        return (int) Db::valor('SELECT COUNT(*) FROM jugadores j WHERE j.servidor_id = ?
                                AND EXISTS (SELECT 1 FROM actividad_diaria a WHERE a.jugador_id = j.id AND a.dia >= ?)', [$servidor, self::desde($dias)]);
    }

    /** Eventos en línea validados de los jugadores del servidor en los últimos $dias días (según el servidor de cada día). */
    public static function eventos(int $servidor, int $dias = self::DIAS_ACTIVO): int
    {
        return (int) Db::valor('SELECT COALESCE(SUM(eventos), 0) FROM actividad_diaria WHERE servidor_id = ? AND dia >= ?', [$servidor, self::desde($dias)]);
    }

    // ------------------------------------------------------------------ lectura (para Copa, Salud/Fusión y Centro de Control)
    private static function servidorJson(array $s): array
    {
        $o = ['id' => (int) $s['id'], 'nombre' => $s['nombre'], 'universo_id' => $s['universo_id'] !== null ? (int) $s['universo_id'] : null,
              'capacidad' => (int) $s['capacidad'], 'abierto' => (bool) $s['abierto'], 'creado' => (int) $s['creado']];
        if (array_key_exists('fusionado_en', $s)) $o['fusionado_en'] = $s['fusionado_en'] !== null ? (int) $s['fusionado_en'] : null;
        return $o;
    }

    /**
     * Servidores de un universo, por id. Sin los fusionados (servidores.fusionado_en), salvo $conFusionados.
     * @return list<array{id:int, nombre:string, universo_id:int, capacidad:int, abierto:bool, creado:int}>
     */
    public static function servidoresDe(int $universo, bool $conFusionados = false): array
    {
        self::preparar();
        return array_map(fn($s) => self::servidorJson($s),
            Db::todas('SELECT s.* FROM servidores s WHERE s.universo_id = ?' . ($conFusionados ? '' : self::sinFusionados()) . ' ORDER BY s.id', [$universo]));
    }

    /** Universo de un servidor, o null. @return array{id:int, nombre:string, activo:bool, creado:int}|null */
    public static function universoDe(int $servidor): ?array
    {
        self::preparar();
        return self::universoSinPreparar($servidor);
    }

    private static function universoSinPreparar(int $servidor): ?array
    {
        $u = Db::fila('SELECT u.* FROM universos u JOIN servidores s ON s.universo_id = u.id WHERE s.id = ?', [$servidor]);
        return $u ? ['id' => (int) $u['id'], 'nombre' => $u['nombre'], 'activo' => (bool) $u['activo'], 'creado' => (int) $u['creado']] : null;
    }

    /**
     * Todos los universos (por id) con sus servidores (también los fusionados), jugadores y activos de 1 y 7 días, y a qué
     * servidor entraría ahora un jugador nuevo ('siguiente'; null en siguiente_servidor = se abriría un universo nuevo).
     */
    public static function resumen(): array
    {
        self::preparar();
        $d1 = self::desde(1); $d7 = self::desde(7);
        $sv = Db::todas('SELECT s.*,
                                (SELECT COUNT(*) FROM jugadores j WHERE j.servidor_id = s.id) AS jugadores,
                                (SELECT COUNT(*) FROM jugadores j WHERE j.servidor_id = s.id AND EXISTS (SELECT 1 FROM actividad_diaria a WHERE a.jugador_id = j.id AND a.dia >= ?)) AS activos_1,
                                (SELECT COUNT(*) FROM jugadores j WHERE j.servidor_id = s.id AND EXISTS (SELECT 1 FROM actividad_diaria a WHERE a.jugador_id = j.id AND a.dia >= ?)) AS activos_7
                         FROM servidores s ORDER BY s.id', [$d1, $d7]);
        $sig = self::siguiente();
        $o = [];
        foreach (Db::todas('SELECT * FROM universos ORDER BY id') as $u) {
            $mios = array_values(array_filter($sv, fn($s) => (int) $s['universo_id'] === (int) $u['id']));
            $lista = array_map(fn($s) => self::servidorJson($s) + ['jugadores' => (int) $s['jugadores'], 'activos_1' => (int) $s['activos_1'],
                                                                   'activos_7' => (int) $s['activos_7'], 'siguiente' => (int) $s['id'] === $sig], $mios);
            $o[] = ['id' => (int) $u['id'], 'nombre' => $u['nombre'], 'activo' => (bool) $u['activo'], 'creado' => (int) $u['creado'],
                    'abierto' => (bool) array_filter($lista, fn($s) => $s['abierto'] && ($s['fusionado_en'] ?? null) === null),
                    'jugadores' => array_sum(array_column($lista, 'jugadores')), 'activos_7' => array_sum(array_column($lista, 'activos_7')),
                    'servidores' => $lista];
        }
        return ['universos' => $o, 'siguiente_servidor' => $sig, 'servidores_iniciales' => self::servidoresIniciales(), 'dias_activo' => self::DIAS_ACTIVO];
    }

    // ------------------------------------------------------------------ /api/estado
    /**
     * Lo que /api/estado agrega: "universo": {id, nombre} | null. Con sesión, además marca al jugador como activo hoy
     * (una escritura por día). No dispara el arranque.
     */
    public static function estado(?int $jugador): array
    {
        if ($jugador === null) return ['universo' => null];
        self::marcarActivo($jugador);
        try {
            $sid = (int) Db::valor('SELECT servidor_id FROM jugadores WHERE id = ?', [$jugador]);
            $u = $sid > 0 ? self::universoSinPreparar($sid) : null;
        } catch (\Throwable) {
            $u = null;
        }
        return ['universo' => $u ? ['id' => $u['id'], 'nombre' => $u['nombre']] : null];
    }
}
