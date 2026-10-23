<?php
declare(strict_types=1);

namespace EnVivo;

/**
 * Personal estrella, fichas de estrella y Pase de Copa (contrato: server/MONETIZACION.md; conexión: server/INTEGRAR_ESTRELLAS.md).
 *
 * PERSONAL ESTRELLA: figuras con nombre (parodias) de 5 roles: director, camarógrafo, operador de repeticiones, ingeniero de
 * audio (sonidista) y técnico de transmisión. Se contratan por N partidos de Copa o Duelos: con créditos (estrella_copa),
 * con fichas de estrella (la ruta gratis, 1 partido) o llegan del pase de temporada / VIP / regalos (otorgar()).
 *  - Cada jugador elige UNA estrella para su equipo de Copa y UNA para su equipo de Duelos (MAX_POR_EQUIPO, medido abajo).
 *  - En el equipo cuenta como nivel Internacional, habilidad 5 (aplicarAEquipo): reemplaza a la persona más floja de su
 *    rol (nunca al dueño). Se aplica DESPUÉS de revisar el equipo (Festival::revisarEquipo / Duelos::guardarEquipo):
 *    la revisión rechazaría la habilidad 5 por la fama y además borra el nivel.
 *  - Un partido se gasta cuando el equipo juega un cruce de copa o el jugador reta un duelo: consumir($j, $modo, $ref),
 *    idempotente (estrellas_usos UNIQUE). Defender un duelo (el fantasma) NO gasta partidos. Los contratos vencen a los
 *    VENCE_DIAS días.
 *
 * TECHO DE VENTAJA (MONETIZACION.md §1, 20–25 %): medido con la lógica real (server/eventos/batalla.js, prueba
 * server/tests/pruebas_estrellas.php). Un equipo de copa de 8 personas y 12 equipos con habilidad 4 hace ~49 de calidad:
 * solo el bono +12 ya es ~24 %. Una estrella director en el equipo suma ~+8,5 puntos (17 %). Por eso:
 *  - 1 estrella por equipo (con 3 estrellas el equipo solo ya sube 25–40 %).
 *  - PUNTOS_EQUIPO: lo que aporta cada rol dentro del equipo (medido y redondeado). El bono de la estrella completa hasta
 *    +6 en total: bonoCompetencia() = 6 − puntos (director 0, sonidista 0, técnico 0, camarógrafo 3, repeticiones 4).
 *  - bonoFinal(): el integrador recorta el bono de Ventajas a TOPE − puntos en el equipo, así lo pagado nunca pasa de
 *    +12 "equivalentes" (resultado medido: 22–24 % para cada rol; sin el recorte, la estrella director con sede llega a 29 %).
 *
 * FICHAS DE ESTRELLA (gratis): ganarFichas($j, $n, $ref) desde la Copa y el Desafío del día (tope FICHAS_DIA por día);
 *   con CATALOGO[clave]['fichas'] fichas se contrata 1 partido.
 *
 * PASE DE COPA (pase_copa): +5 intentos de preparación por día durante la copa de UNA semana. Créditos (PASE_CREDITOS) o
 *   $2.99 (producto de Compras, entregado por el gancho compra_aprobada). intentosExtra($j, $copaId) = pase + VIP
 *   (Vip::intentosExtra, máx. 3); limiteIntentos() = min(18, 10 + extra).
 *
 * Todo cobro va por Monedero::mover (libro movimientos_creditos) y queda en estrellas_contratos / pase_copa.
 * Ganchos para pruebas: Estrellas::$reloj (si no, Copas::ahora()), Estrellas::$vipExtra (reemplaza a Vip::intentosExtra).
 */
final class Estrellas
{
    public const MODOS = ['copa', 'duelo'];
    public const HABILIDAD = 5;
    public const NIVEL = 'internacional';
    public const MAX_POR_EQUIPO = 1;            // ajuste "estrellas_max_equipo" (1..3)
    public const BONO_MAX = 6;                  // parte "estrella" de Ventajas (MONETIZACION.md §1)
    public const TOPE_VENTAJAS = 12;            // Ventajas::TOPE si existe
    /** Puntos de calidad que suma cada rol dentro del equipo (medidos con batalla.js sobre un equipo de habilidad 4). */
    public const PUNTOS_EQUIPO = ['director' => 9, 'sonidista' => 6, 'tecnico_transmision' => 6, 'camarografo' => 3, 'operador_repeticion' => 2];
    public const PAQUETES = [1 => 1.0, 3 => 2.7, 5 => 4.25];   // precio por créditos = precio de 1 partido × factor
    public const VENCE_DIAS = 30;
    public const FICHAS_DIA = 12;               // fichas que se pueden ganar por día (ajuste "estrellas_fichas_dia")
    public const PASE_EXTRA = 5;
    public const PASE_CREDITOS = 300;           // ajuste "pase_copa_creditos"
    public const PASE_USD = 2.99;               // el precio real lo manda Catalogo/Centro de Control (producto pase_copa)
    public const VIP_EXTRA_MAX = 3;
    public const INTENTOS_TOPE = 18;            // 10 base + 3 VIP + 5 pase
    public const PERSONAS_COPA = 8;             // Festival::PERSONAS_MAX
    public const PERSONAS_DUELO = 12;           // Duelos::MAX_PERSONAL
    public const MORAL = 80;

    /** Personal estrella (parodias). creditos = 1 partido; fichas = 1 partido por la ruta gratis. */
    public const CATALOGO = [
        'varela' => ['nombre' => "Ricardo 'El Maestro' Varela", 'rol' => 'director', 'ciudad' => 'Buenos Aires', 'creditos' => 60, 'fichas' => 15],
        'solberg' => ['nombre' => "Ingrid 'La Batuta' Solberg", 'rol' => 'director', 'ciudad' => 'Oslo', 'creditos' => 60, 'fichas' => 15],
        'lupe' => ['nombre' => 'Lupe Zoom', 'rol' => 'camarografo', 'ciudad' => 'Guadalajara', 'creditos' => 30, 'fichas' => 8],
        'tano' => ['nombre' => "Gaetano 'Tano' Steady", 'rol' => 'camarografo', 'ciudad' => 'Nápoles', 'creditos' => 30, 'fichas' => 8],
        'camara_lenta' => ['nombre' => "Néstor 'Cámara Lenta' Ruiz", 'rol' => 'operador_repeticion', 'ciudad' => 'Montevideo', 'creditos' => 30, 'fichas' => 8],
        'rewind' => ['nombre' => "Kenji 'Rewind' Ota", 'rol' => 'operador_repeticion', 'ciudad' => 'Osaka', 'creditos' => 30, 'fichas' => 8],
        'decibel' => ['nombre' => "Marisol 'Decibel' Andrade", 'rol' => 'sonidista', 'ciudad' => 'Cuenca', 'creditos' => 45, 'fichas' => 12],
        'oido_de_oro' => ['nombre' => "Otto 'Oído de Oro' Brenner", 'rol' => 'sonidista', 'ciudad' => 'Viena', 'creditos' => 45, 'fichas' => 12],
        'cero_ping' => ['nombre' => "Valentina 'Cero Ping' Rojas", 'rol' => 'tecnico_transmision', 'ciudad' => 'Santiago', 'creditos' => 45, 'fichas' => 12],
        'satelite' => ['nombre' => "Duma 'Satélite' Okafor", 'rol' => 'tecnico_transmision', 'ciudad' => 'Lagos', 'creditos' => 45, 'fichas' => 12],
    ];
    public const ORIGENES = ['credito', 'fichas', 'pase', 'vip', 'regalo', 'entrega', 'compra', 'control'];
    public const TABLAS = ['estrellas_contratos', 'estrellas_usos', 'estrellas_asignadas', 'estrellas_fichas', 'pase_copa'];

    public static ?int $reloj = null;
    /** @var null|callable(int): int  Reemplaza a Vip::intentosExtra (pruebas). */
    public static $vipExtra = null;
    private static bool $listo = false;

    public static function ahora(): int { return self::$reloj ?? Copas::ahora(); }

    public static function preparar(): void
    {
        if (self::$listo) return;
        $ph = implode(',', array_fill(0, count(self::TABLAS), '?'));
        if ((int) Db::valor("SELECT COUNT(*) FROM sqlite_master WHERE type = 'table' AND name IN ($ph)", self::TABLAS) < count(self::TABLAS)) Migraciones::aplicar('estrellas.sql');
        self::$listo = true;
    }

    // ------------------------------------------------------------------ reglas (con ajustes del Centro de Control)
    private static function ajusteInt(string $k, int $def, int $min, int $max): int
    {
        $v = trim(Ajustes::get($k, ''));
        return $v !== '' && preg_match('/^\d{1,6}$/', $v) ? max($min, min($max, (int) $v)) : $def;
    }

    public static function maxPorEquipo(): int { return self::ajusteInt('estrellas_max_equipo', self::MAX_POR_EQUIPO, 1, 3); }
    public static function fichasDia(): int { return self::ajusteInt('estrellas_fichas_dia', self::FICHAS_DIA, 0, 100); }
    public static function precioPase(): int { return self::ajusteInt('pase_copa_creditos', self::PASE_CREDITOS, 1, 100000); }

    public static function modo(mixed $m): ?string
    {
        if (!is_string($m)) return null;
        $m = ['duelos' => 'duelo', 'copas' => 'copa'][$m] ?? $m;
        return in_array($m, self::MODOS, true) ? $m : null;
    }

    public static function existe(mixed $clave): bool { return is_string($clave) && isset(self::CATALOGO[$clave]); }

    /** Precio en créditos de un paquete (1, 3 o 5 partidos). */
    public static function precio(string $clave, int $partidos): int
    {
        return (int) round(self::CATALOGO[$clave]['creditos'] * self::PAQUETES[$partidos]);
    }

    /** Estrella de la semana (para entregas "comodin" del pase o del VIP): rota por semana ISO. */
    public static function estrellaDeLaSemana(?int $t = null): string
    {
        $k = array_keys(self::CATALOGO);
        return $k[((int) (new \DateTimeImmutable('@' . ($t ?? self::ahora())))->format('W')) % count($k)];
    }

    // ------------------------------------------------------------------ contratos y partidos
    /** Contratos vigentes (no revocados ni vencidos) con sus partidos usados. */
    private static function contratosVigentes(int $j, ?string $clave = null): array
    {
        $sql = 'SELECT c.*, (SELECT COUNT(*) FROM estrellas_usos u WHERE u.contrato_id = c.id) AS usados FROM estrellas_contratos c
                WHERE c.jugador_id = ? AND c.revocado IS NULL AND c.vence > ?' . ($clave !== null ? ' AND c.clave = ?' : '') . ' ORDER BY c.vence, c.id';
        return Db::todas($sql, $clave !== null ? [$j, self::ahora(), $clave] : [$j, self::ahora()]);
    }

    /** Partidos que le quedan a una estrella (suma de sus contratos vigentes). */
    public static function restantes(int $j, string $clave): int
    {
        self::preparar();
        $n = 0;
        foreach (self::contratosVigentes($j, $clave) as $c) $n += max(0, (int) $c['partidos'] - (int) $c['usados']);
        return $n;
    }

    /** Claves asignadas a un equipo (la más nueva primero), tengan o no partidos. */
    public static function asignadas(int $j, string $modo): array
    {
        self::preparar();
        return array_column(Db::todas('SELECT clave FROM estrellas_asignadas WHERE jugador_id = ? AND modo = ? ORDER BY asignado DESC, clave', [$j, $modo]), 'clave');
    }

    /**
     * Estrellas que juegan en el equipo de $modo: asignadas, con partidos (o que ya jugaron el partido $ref: así un cruce
     * que se vuelve a jugar sale igual), hasta maxPorEquipo().
     */
    public static function activas(int $j, string $modo, ?string $ref = null): array
    {
        $modo = self::modo($modo);
        if ($modo === null) return [];
        self::preparar();
        $o = [];
        foreach (self::asignadas($j, $modo) as $k) {
            if (!self::existe($k)) continue;
            $usada = $ref !== null && Db::valor('SELECT 1 FROM estrellas_usos WHERE jugador_id = ? AND modo = ? AND ref = ? AND clave = ?', [$j, $modo, $ref, $k]);
            if ($usada || self::restantes($j, $k) > 0) $o[] = $k;
            if (count($o) >= self::maxPorEquipo()) break;
        }
        return $o;
    }

    /**
     * Gasta 1 partido de cada estrella activa del equipo de $modo por el cruce/duelo $ref. Idempotente: con el mismo $ref
     * no gasta otra vez. Devuelve las claves que gastaron en ESTA llamada.
     */
    public static function consumir(int $j, string $modo, string $ref): array
    {
        $modo = self::modo($modo);
        if ($modo === null || $ref === '') return [];
        self::preparar();
        $ref = mb_substr($ref, 0, 120);
        return Db::tx(function () use ($j, $modo, $ref): array {
            $hecho = [];
            foreach (self::activas($j, $modo, $ref) as $k) {
                if (Db::valor('SELECT 1 FROM estrellas_usos WHERE jugador_id = ? AND modo = ? AND ref = ? AND clave = ?', [$j, $modo, $ref, $k])) continue;
                $c = null;
                foreach (self::contratosVigentes($j, $k) as $x) if ((int) $x['usados'] < (int) $x['partidos']) { $c = $x; break; }
                if ($c === null) continue;
                $n = Db::q('INSERT OR IGNORE INTO estrellas_usos (jugador_id, contrato_id, clave, modo, ref, creado) VALUES (?, ?, ?, ?, ?, ?)',
                    [$j, (int) $c['id'], $k, $modo, $ref, self::ahora()])->rowCount();
                if ($n) $hecho[] = $k;
            }
            return $hecho;
        });
    }

    // ------------------------------------------------------------------ en el equipo
    /**
     * El equipo con las estrellas activas adentro (nivel Internacional, habilidad 5). Acepta los dos formatos:
     *  - Copa / batalla.js: ['staff' => [{role, skill, morale, owner?, name?}], 'equip' => [...]]
     *  - Duelos (guardado): ['personal' => [{rol, habilidad, nivel, dueno}], 'inventario' => [...]]
     * Reemplaza a la persona más floja del mismo rol que no sea el dueño ni otra estrella; si no hay nadie de ese rol, la
     * suma (hasta 8 personas en copa, 12 en duelos) o reemplaza a la más floja del equipo. $ref: el cruce/duelo (ver activas()).
     */
    public static function aplicarAEquipo(int $j, array $equipo, string $modo, ?string $ref = null): array
    {
        $activas = self::activas($j, $modo, $ref);
        if (!$activas) return $equipo;
        $duelo = isset($equipo['personal']) && is_array($equipo['personal']);
        $lista = $duelo ? 'personal' : 'staff';
        if (!is_array($equipo[$lista] ?? null)) return $equipo;
        [$kRol, $kHab, $kDueno, $tope] = $duelo ? ['rol', 'habilidad', 'dueno', self::PERSONAS_DUELO] : ['role', 'skill', 'owner', self::PERSONAS_COPA];
        $gente = array_values($equipo[$lista]);
        $alias = CatalogoJuego::ROL_ALIAS;
        $rolDe = fn($p) => is_array($p) && is_string($p[$kRol] ?? null) ? ($alias[$p[$kRol]] ?? $p[$kRol]) : '';
        $libre = fn($p) => is_array($p) && ($p[$kDueno] ?? false) !== true && empty($p['estrella']);
        foreach ($activas as $k) {
            $e = self::CATALOGO[$k];
            $peor = function (bool $mismoRol) use ($gente, $e, $rolDe, $libre, $kHab): ?int {
                $i = null;
                foreach ($gente as $x => $p) {
                    if (!$libre($p) || ($mismoRol && $rolDe($p) !== $e['rol'])) continue;
                    if ($i === null || (int) ($p[$kHab] ?? 0) <= (int) ($gente[$i][$kHab] ?? 0)) $i = $x;
                }
                return $i;
            };
            $i = $peor(true);
            if ($i === null && count($gente) >= $tope) $i = $peor(false);
            $nueva = $duelo
                ? ['rol' => $e['rol'], 'habilidad' => self::HABILIDAD, 'nivel' => self::NIVEL, 'dueno' => false, 'estrella' => $k, 'nombre' => $e['nombre']]
                : ['role' => $e['rol'], 'skill' => self::HABILIDAD, 'tier' => self::NIVEL, 'morale' => (int) ($i !== null ? ($gente[$i]['morale'] ?? self::MORAL) : self::MORAL),
                   'name' => mb_substr($e['nombre'], 0, 40), 'estrella' => $k];
            if ($i !== null) $gente[$i] = $nueva;
            elseif (count($gente) < $tope) $gente[] = $nueva;
        }
        $equipo[$lista] = $gente;
        return $equipo;
    }

    // ------------------------------------------------------------------ bono de competencia (Ventajas)
    /** Puntos de calidad que las estrellas activas suman DENTRO del equipo (PUNTOS_EQUIPO, medidos). */
    public static function puntosEnEquipo(int $j, string $modo, ?string $ref = null): int
    {
        $n = 0;
        foreach (self::activas($j, $modo, $ref) as $k) $n += self::PUNTOS_EQUIPO[self::CATALOGO[$k]['rol']] ?? 0;
        return $n;
    }

    /** Bono de una estrella (lo que le falta a su aporte en el equipo para llegar a BONO_MAX). */
    public static function bonoDe(string $clave): int
    {
        return max(0, min(self::BONO_MAX, self::BONO_MAX - (self::PUNTOS_EQUIPO[self::CATALOGO[$clave]['rol']] ?? 0)));
    }

    /** Parte "estrella" de Ventajas::bono: 0..6 (solo copa y duelos; liga, festival y desafío: 0). */
    public static function bonoCompetencia(int $j, string $modo): int
    {
        if (self::modo($modo) === null) return 0;
        $n = 0;
        foreach (self::activas($j, $modo) as $k) $n += self::bonoDe($k);
        return max(0, min(self::BONO_MAX, $n));
    }

    /**
     * Recorte del bono total de Ventajas: lo pagado (bono + estrellas dentro del equipo) nunca pasa de TOPE (+12)
     * "equivalentes". Lo usa el integrador al poner el campo "bono" de cada equipo (copa) y del retador/fantasma (duelos).
     */
    public static function bonoFinal(int $j, string $modo, int $bonoVentajas, ?string $ref = null): int
    {
        $tope = self::TOPE_VENTAJAS;
        if (class_exists(Ventajas::class) && defined(Ventajas::class . '::TOPE')) $tope = (int) constant(Ventajas::class . '::TOPE');
        return max(0, min($bonoVentajas, $tope - self::puntosEnEquipo($j, $modo, $ref)));
    }

    // ------------------------------------------------------------------ fichas de estrella (ruta gratis)
    public static function fichas(int $j): int
    {
        self::preparar();
        return (int) Db::valor('SELECT COALESCE(SUM(cambio), 0) FROM estrellas_fichas WHERE jugador_id = ?', [$j]);
    }

    public static function fichasHoy(int $j): int
    {
        return (int) Db::valor("SELECT COALESCE(SUM(cambio), 0) FROM estrellas_fichas WHERE jugador_id = ? AND dia = ? AND motivo = 'ganada'", [$j, Monedero::diaLocal(self::ahora())]);
    }

    /**
     * Da fichas por jugar (Copa, Desafío del día...). Idempotente por $ref y con tope diario (fichasDia()).
     * Devuelve las fichas que dio en esta llamada (0 si ya se dieron o se llegó al tope).
     */
    public static function ganarFichas(int $j, int $n, string $ref): int
    {
        if ($n < 1 || $ref === '') return 0;
        self::preparar();
        $ref = 'ganada:' . mb_substr($ref, 0, 150);
        return Db::tx(function () use ($j, $n, $ref): int {
            if (Db::valor('SELECT 1 FROM estrellas_fichas WHERE ref = ?', [$ref])) return 0;
            $dar = max(0, min($n, 50, self::fichasDia() - self::fichasHoy($j)));
            Db::q("INSERT INTO estrellas_fichas (jugador_id, cambio, saldo, motivo, ref, dia, creado) VALUES (?, ?, ?, 'ganada', ?, ?, ?)",
                [$j, $dar, self::fichas($j) + $dar, $ref, Monedero::diaLocal(self::ahora()), self::ahora()]);
            return $dar;
        });
    }

    // ------------------------------------------------------------------ contratar, otorgar, asignar
    private static function contratoJson(array $c): array
    {
        $usados = (int) ($c['usados'] ?? Db::valor('SELECT COUNT(*) FROM estrellas_usos WHERE contrato_id = ?', [$c['id']]));
        return ['id' => (int) $c['id'], 'clave' => $c['clave'], 'partidos' => (int) $c['partidos'], 'usados' => $usados, 'restantes' => max(0, (int) $c['partidos'] - $usados),
                'origen' => $c['origen'], 'creditos' => (int) $c['creditos'], 'fichas' => (int) $c['fichas'], 'creado' => Db::iso((int) $c['creado']), 'vence' => Db::iso((int) $c['vence'])];
    }

    private static function crearContrato(int $j, string $clave, int $partidos, string $origen, string $ref, int $creditos = 0, int $fichas = 0): array
    {
        $t = self::ahora();
        Db::q('INSERT INTO estrellas_contratos (jugador_id, clave, partidos, origen, ref, creditos, fichas, creado, vence) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
            [$j, $clave, $partidos, $origen, $ref, $creditos, $fichas, $t, $t + self::VENCE_DIAS * 86400]);
        $c = Db::fila('SELECT * FROM estrellas_contratos WHERE id = ?', [Db::ultimoId()]);
        // Si un equipo no tiene estrella, la nueva entra sola (el jugador la cambia cuando quiera)
        foreach (self::MODOS as $m) if (!self::activas($j, $m)) self::poner($j, $m, $clave);
        return $c;
    }

    private static function exigirActiva(int $j): void
    {
        if (method_exists(Cuentas::class, 'exigirActiva')) Cuentas::exigirActiva($j);
    }

    /**
     * POST /api/estrellas/contratar {clave, modo: 'credito'|'fichas', partidos: 1|3|5, peticion?}
     * Créditos: paquetes de 1, 3 o 5 partidos. Fichas: 1 partido. "peticion" (8–64 letras/números) hace la compra
     * idempotente: la misma petición repetida no cobra dos veces.
     */
    public static function contratar(int $j, array $in): array
    {
        self::preparar();
        self::exigirActiva($j);
        $clave = $in['clave'] ?? null;
        Fallo::si(!self::existe($clave), 'Esa estrella no está en la agencia.', 404, ['codigo' => 'estrella_desconocida']);
        $modo = $in['modo'] ?? 'credito';
        Fallo::si(!in_array($modo, ['credito', 'fichas'], true), 'Elige cómo pagar: créditos o fichas de estrella.', 400, ['codigo' => 'modo_invalido']);
        $partidos = $in['partidos'] ?? 1;
        if (is_string($partidos) && ctype_digit($partidos)) $partidos = (int) $partidos;
        Fallo::si(!is_int($partidos) || !isset(self::PAQUETES[$partidos]), 'Elige 1, 3 o 5 partidos.', 400, ['codigo' => 'partidos_invalidos']);
        Fallo::si($modo === 'fichas' && $partidos !== 1, 'Con fichas se contrata 1 partido a la vez.', 400, ['codigo' => 'partidos_invalidos']);
        $pet = $in['peticion'] ?? null;
        Fallo::si($pet !== null && (!is_string($pet) || !preg_match('/^[A-Za-z0-9_-]{8,64}$/', $pet)), 'Petición no válida.', 400, ['codigo' => 'peticion_invalida']);
        Fallo::si(Limite::contar('estrellas:' . $j, 60), 'Vas muy rápido. Espera un momento.', 429, ['codigo' => 'limite']);
        $ref = 'estrella:' . $j . ':' . ($pet ?? bin2hex(random_bytes(8)));
        $r = Db::tx(function () use ($j, $clave, $modo, $partidos, $ref): array {
            $ya = Db::fila('SELECT * FROM estrellas_contratos WHERE ref = ?', [$ref]);
            if ($ya) return [$ya, true];
            if ($modo === 'credito') {
                $costo = self::precio($clave, $partidos);
                try {
                    Monedero::mover($j, -$costo, 'estrella_copa', 'estrella_copa:' . $clave . 'x' . $partidos . ':' . $ref);
                } catch (\RuntimeException $e) {
                    throw new Fallo('No tienes créditos suficientes. Necesitas ' . $costo . ' créditos.', 402, ['codigo' => 'sin_creditos', 'necesitas' => $costo, 'creditos' => Monedero::saldo($j)]);
                }
                return [self::crearContrato($j, $clave, $partidos, 'credito', $ref, $costo, 0), false];
            }
            $costo = (int) self::CATALOGO[$clave]['fichas'];
            $tengo = self::fichas($j);
            Fallo::si($tengo < $costo, 'Te faltan fichas de estrella: necesitas ' . $costo . ' y tienes ' . $tengo . '.', 402, ['codigo' => 'sin_fichas', 'necesitas' => $costo, 'fichas' => $tengo]);
            Db::q("INSERT INTO estrellas_fichas (jugador_id, cambio, saldo, motivo, ref, dia, creado) VALUES (?, ?, ?, 'gasto', ?, ?, ?)",
                [$j, -$costo, $tengo - $costo, 'gasto:' . $ref, Monedero::diaLocal(self::ahora()), self::ahora()]);
            return [self::crearContrato($j, $clave, 1, 'fichas', $ref, 0, $costo), false];
        });
        return ['ok' => true, 'repetida' => $r[1], 'contrato' => self::contratoJson($r[0]), 'estrellas' => self::estado($j)];
    }

    /**
     * Contrato de regalo (pase de temporada, VIP, regalos de asociación, Centro de Control). Idempotente por $ref.
     * $clave null = la estrella de la semana. Devuelve el contrato nuevo o null si ese $ref ya se entregó.
     */
    public static function otorgar(int $j, ?string $clave, int $partidos, string $origen, string $ref): ?array
    {
        self::preparar();
        $clave ??= self::estrellaDeLaSemana();
        if (!self::existe($clave)) throw new \InvalidArgumentException('Estrella desconocida: ' . $clave);
        $partidos = max(1, min(50, $partidos));
        $origen = in_array($origen, self::ORIGENES, true) ? $origen : 'regalo';
        $ref = 'otorgar:' . mb_substr($ref, 0, 180);
        return Db::tx(function () use ($j, $clave, $partidos, $origen, $ref): ?array {
            if (Db::valor('SELECT 1 FROM estrellas_contratos WHERE ref = ?', [$ref])) return null;
            return self::contratoJson(self::crearContrato($j, $clave, $partidos, $origen, $ref));
        });
    }

    /**
     * Entregas de tipo "estrella" (item = clave o "comodin", cantidad = partidos) que mandan el pase de temporada o el VIP
     * con Monedero::entregar: se vuelven contratos una sola vez (ref entrega:<id>).
     */
    public static function reclamarEntregas(int $j): int
    {
        self::preparar();
        $n = 0;
        foreach (Db::todas("SELECT id, item, cantidad, origen FROM entregas WHERE jugador_id = ? AND tipo = 'estrella' ORDER BY id", [$j]) as $e) {
            $o = (string) $e['origen'];
            $origen = str_starts_with($o, 'pase') ? 'pase' : (str_starts_with($o, 'vip') ? 'vip' : 'entrega');
            $k = self::existe($e['item']) ? (string) $e['item'] : null;
            if (self::otorgar($j, $k, (int) $e['cantidad'], $origen, 'entrega:' . $e['id']) !== null) $n++;
        }
        return $n;
    }

    /** Pone $clave en el equipo de $modo (si el equipo está lleno, sale la más vieja). Dentro de tx. */
    private static function poner(int $j, string $modo, string $clave): void
    {
        Db::q('DELETE FROM estrellas_asignadas WHERE jugador_id = ? AND modo = ? AND clave = ?', [$j, $modo, $clave]);
        $otras = array_reverse(self::asignadas($j, $modo));   // la más vieja primero
        while (count($otras) >= self::maxPorEquipo()) Db::q('DELETE FROM estrellas_asignadas WHERE jugador_id = ? AND modo = ? AND clave = ?', [$j, $modo, array_shift($otras)]);
        $t = max(self::ahora(), 1 + (int) Db::valor('SELECT COALESCE(MAX(asignado), 0) FROM estrellas_asignadas WHERE jugador_id = ?', [$j]));
        Db::q('INSERT INTO estrellas_asignadas (jugador_id, modo, clave, asignado) VALUES (?, ?, ?, ?)', [$j, $modo, $clave, $t]);
    }

    /** POST /api/estrellas/asignar {clave, equipo: 'copa'|'duelo', quitar?: true} */
    public static function asignar(int $j, array $in): array
    {
        self::preparar();
        self::exigirActiva($j);
        $clave = $in['clave'] ?? null;
        Fallo::si(!self::existe($clave), 'Esa estrella no está en la agencia.', 404, ['codigo' => 'estrella_desconocida']);
        $modo = self::modo($in['equipo'] ?? null);
        Fallo::si($modo === null, 'Elige el equipo: copa o duelo.', 400, ['codigo' => 'equipo_invalido']);
        Db::tx(function () use ($j, $clave, $modo, $in): void {
            if (($in['quitar'] ?? false) === true) {
                Db::q('DELETE FROM estrellas_asignadas WHERE jugador_id = ? AND modo = ? AND clave = ?', [$j, $modo, $clave]);
                return;
            }
            Fallo::si(self::restantes($j, $clave) < 1, 'No tienes partidos con esa estrella. Contrátala primero.', 409, ['codigo' => 'sin_partidos']);
            self::poner($j, $modo, $clave);
        });
        return ['ok' => true, 'estrellas' => self::estado($j)];
    }

    // ------------------------------------------------------------------ Pase de Copa
    public static function semanaDeCopa(int $copaId): ?string
    {
        try { $s = Db::valor('SELECT semana FROM copas WHERE id = ?', [$copaId]); } catch (\Throwable) { $s = null; }
        return $s === null ? null : (string) $s;
    }

    public static function paseActivo(int $j, string $semana): bool
    {
        self::preparar();
        return (bool) Db::valor('SELECT 1 FROM pase_copa WHERE jugador_id = ? AND semana = ? AND revocado IS NULL', [$j, $semana]);
    }

    /** Intentos extra del VIP (Vip::intentosExtra si existe; máx. 3). */
    public static function vipExtra(int $j, int $copaId = 0): int
    {
        try {
            if (self::$vipExtra !== null) $v = (int) (self::$vipExtra)($j);
            elseif (class_exists(Vip::class) && method_exists(Vip::class, 'intentosExtra')) {
                $p = (new \ReflectionMethod(Vip::class, 'intentosExtra'))->getParameters();
                $args = [$j];
                if (isset($p[1])) {
                    $t = $p[1]->getType();
                    $args[] = $t instanceof \ReflectionNamedType && $t->getName() === 'int' ? $copaId : 'copa';
                }
                $v = (int) Vip::intentosExtra(...$args);
            } else $v = 0;
        } catch (\Throwable $e) {
            error_log('EN VIVO estrellas: Vip::intentosExtra ' . mb_substr($e->getMessage(), 0, 200));
            $v = 0;
        }
        return max(0, min(self::VIP_EXTRA_MAX, $v));
    }

    private static function extraSemana(int $j, string $semana, int $copaId = 0): int
    {
        return max(0, min(self::INTENTOS_TOPE - Copas::INTENTOS_DIA, (self::paseActivo($j, $semana) ? self::PASE_EXTRA : 0) + self::vipExtra($j, $copaId)));
    }

    /** Intentos de preparación extra por día en esa copa: pase (+5, solo su semana) + VIP (máx. 3). */
    public static function intentosExtra(int $j, int $copaId): int
    {
        $sem = self::semanaDeCopa($copaId) ?? Copas::semana(self::ahora())['id'];
        return self::extraSemana($j, $sem, $copaId);
    }

    /** Límite diario de intentos de copa para el jugador: min(18, 10 + extra). Es lo que usa el parche de Copas.php. */
    public static function limiteIntentos(int $j, int $copaId): int
    {
        return min(self::INTENTOS_TOPE, Copas::INTENTOS_DIA + self::intentosExtra($j, $copaId));
    }

    private static function precioPaseUsd(): float
    {
        try {
            $p = method_exists(Catalogo::class, 'producto') ? Catalogo::producto('pase_copa') : null;
            if (is_array($p) && isset($p['precio'])) return (float) $p['precio'];
        } catch (\Throwable) {}
        return self::PASE_USD;
    }

    public static function paseEstado(int $j): array
    {
        $t = self::ahora();
        $sem = Copas::semana($t)['id'];
        $fase = Copas::fase($t);
        $activo = self::paseActivo($j, $sem);
        $extra = self::extraSemana($j, $sem);
        return ['semana' => $sem, 'fase' => $fase, 'activo' => $activo, 'extra' => self::PASE_EXTRA, 'precio_creditos' => self::precioPase(),
                'precio_usd' => self::precioPaseUsd(), 'producto' => 'pase_copa', 'puede_comprar' => !$activo && $fase === 'preparacion',
                'intentos_base' => Copas::INTENTOS_DIA, 'intentos_max' => min(self::INTENTOS_TOPE, Copas::INTENTOS_DIA + $extra), 'vip_extra' => self::vipExtra($j),
                'tope' => self::INTENTOS_TOPE];
    }

    /** Da el pase de una semana (una vez: si ya hay uno vigente esa semana, no hace nada). Dentro de tx. */
    private static function darPase(int $j, string $semana, string $origen, string $ref, int $creditos = 0, ?int $compra = null): bool
    {
        if (Db::valor('SELECT 1 FROM pase_copa WHERE ref = ?', [$ref]) || self::paseActivo($j, $semana)) return false;
        Db::q('INSERT INTO pase_copa (jugador_id, semana, origen, ref, creditos, compra_id, creado) VALUES (?, ?, ?, ?, ?, ?, ?)',
            [$j, $semana, $origen, $ref, $creditos, $compra, self::ahora()]);
        return true;
    }

    /** POST /api/pase_copa/comprar {modo?: 'credito'} → con créditos, solo en la preparación de la copa de esta semana. */
    public static function comprarPase(int $j, array $in): array
    {
        self::preparar();
        self::exigirActiva($j);
        $modo = $in['modo'] ?? 'credito';
        Fallo::si($modo === 'dinero', 'El Pase de Copa con dinero se compra en la tienda.', 400, ['codigo' => 'usa_tienda', 'producto' => 'pase_copa']);
        Fallo::si($modo !== 'credito', 'Elige cómo pagar.', 400, ['codigo' => 'modo_invalido']);
        $t = self::ahora();
        Fallo::si(Copas::fase($t) !== 'preparacion', 'El Pase de Copa se compra de lunes a viernes, durante la preparación.', 409, ['codigo' => 'fase']);
        Fallo::si(Limite::contar('estrellas:' . $j, 60), 'Vas muy rápido. Espera un momento.', 429, ['codigo' => 'limite']);
        $sem = Copas::semana($t)['id'];
        $precio = self::precioPase();
        $saldo = Db::tx(function () use ($j, $sem, $precio): int {
            Fallo::si(self::paseActivo($j, $sem), 'Ya tienes el Pase de Copa de esta semana.', 409, ['codigo' => 'ya_tienes']);
            $ref = 'pase_copa:' . $j . ':' . $sem . ':' . bin2hex(random_bytes(4));
            try {
                $s = Monedero::mover($j, -$precio, 'pase_copa', $ref);
            } catch (\RuntimeException $e) {
                throw new Fallo('No tienes créditos suficientes. Necesitas ' . $precio . ' créditos.', 402, ['codigo' => 'sin_creditos', 'necesitas' => $precio, 'creditos' => Monedero::saldo($j)]);
            }
            self::darPase($j, $sem, 'credito', $ref, $precio);
            return $s;
        });
        return ['ok' => true, 'creditos' => $saldo, 'pase_copa' => self::paseEstado($j), 'estrellas' => self::estado($j)];
    }

    /** Ganchos de Compras (MONETIZACION.md §2). Una línea en arranque.php: \EnVivo\Estrellas::registrar(); */
    public static function registrar(): void
    {
        if (!class_exists(Ganchos::class) || !method_exists(Ganchos::class, 'en')) return;
        Ganchos::en('compra_aprobada', fn(array $d) => self::alComprar($d));
        Ganchos::en('compra_revertida', fn(array $d) => self::alRevertir($d));
    }

    /** compra_aprobada: pase_copa ($2.99) → pase de esta semana (o de la próxima si ya terminó la preparación). */
    public static function alComprar(array $d): bool
    {
        if (($d['producto'] ?? '') !== 'pase_copa') return false;
        $j = (int) ($d['jugador_id'] ?? 0); $id = (int) ($d['compra_id'] ?? 0);
        if ($j < 1 || $id < 1) return false;
        self::preparar();
        $t = self::ahora();
        $sem = Copas::fase($t) === 'preparacion' ? Copas::semana($t)['id'] : Copas::semana(Copas::semana($t)['fin'] + 3600)['id'];
        return Db::tx(fn() => self::darPase($j, $sem, 'dinero', 'compra:' . $id, 0, $id));
    }

    /** compra_revertida (reembolso o contracargo): se quita el pase y los contratos que dio esa compra. */
    public static function alRevertir(array $d): int
    {
        $id = (int) ($d['compra_id'] ?? 0);
        if ($id < 1) return 0;
        self::preparar();
        $t = self::ahora();
        return Db::q('UPDATE pase_copa SET revocado = ? WHERE compra_id = ? AND revocado IS NULL', [$t, $id])->rowCount()
            + Db::q('UPDATE estrellas_contratos SET revocado = ? WHERE ref = ? AND revocado IS NULL', [$t, 'otorgar:compra:' . $id])->rowCount();
    }

    // ------------------------------------------------------------------ Duelos: rivales de poder parecido
    /** Poder de duelo con las estrellas adentro (Duelos::resumenEquipo). 0 sin equipo. */
    public static function poderDuelo(int $j, ?array $equipo = null): int
    {
        if ($equipo === null) {
            $f = Db::valor('SELECT equipo_json FROM duelo_equipos WHERE jugador_id = ?', [$j]);
            $equipo = $f === null ? null : json_decode((string) $f, true);
        }
        if (!is_array($equipo) || !is_array($equipo['personal'] ?? null)) return 0;
        try {
            $eq = self::aplicarAEquipo($j, $equipo, 'duelo');
            $eq['inventario'] = array_values(array_filter($eq['inventario'] ?? [], fn($x) => is_array($x) && isset(Duelos::EQUIPOS[$x['item'] ?? ''])));
            return (int) Duelos::resumenEquipo($eq, Monedero::vipActivo($j))['poder'];
        } catch (\Throwable) {
            return 0;
        }
    }

    /**
     * Rivales sugeridos para retar: productoras del mismo servidor con equipo de duelo, primero las de poder parecido
     * (±20 % del mío, con estrellas) y dentro de eso las de puntaje más cercano en la tabla de la temporada (duelo_ratings).
     * Filas con las columnas que usa Duelos::rivalJson (id, alias, nombre, fama_publica, vip_hasta, resumen_json, poder, rt)
     * más poder_efectivo y parecido.
     */
    public static function rivalesSugeridos(int $j, int $limite = 12): array
    {
        Duelos::preparar();
        self::preparar();
        $sid = (int) Db::valor('SELECT servidor_id FROM jugadores WHERE id = ?', [$j]);
        $t = Duelos::temporada();
        $miRt = (int) (Db::valor('SELECT rating FROM duelo_ratings WHERE temporada = ? AND jugador_id = ?', [$t, $j]) ?? Duelos::RATING_INICIAL);
        $mio = self::poderDuelo($j);
        $cols = Migraciones::columnas('jugadores') ?? [];
        $activa = isset($cols['estado']) ? " AND (j.estado IS NULL OR j.estado = 'activo')" : '';
        $filas = Db::todas('SELECT j.id, j.alias, j.nombre, j.fama_publica, j.vip_hasta, e.resumen_json, e.equipo_json, e.poder, COALESCE(r.rating, ?) AS rt
                            FROM duelo_equipos e JOIN jugadores j ON j.id = e.jugador_id LEFT JOIN duelo_ratings r ON r.jugador_id = j.id AND r.temporada = ?
                            WHERE j.servidor_id = ? AND j.id <> ?' . $activa . ' ORDER BY ABS(COALESCE(r.rating, ?) - ?), e.actualizado DESC LIMIT 200',
            [Duelos::RATING_INICIAL, $t, $sid, $j, Duelos::RATING_INICIAL, $miRt]);
        foreach ($filas as &$f) {
            $eq = json_decode((string) $f['equipo_json'], true);
            $f['poder_efectivo'] = is_array($eq) ? self::poderDuelo((int) $f['id'], $eq) : (int) $f['poder'];
            $f['parecido'] = $mio > 0 && abs($f['poder_efectivo'] - $mio) <= 0.2 * $mio;
            unset($f['equipo_json']);
        }
        unset($f);
        usort($filas, fn($a, $b) => [(int) !$a['parecido'], abs((int) $a['rt'] - $miRt), abs($a['poder_efectivo'] - $mio), (int) $a['id']]
            <=> [(int) !$b['parecido'], abs((int) $b['rt'] - $miRt), abs($b['poder_efectivo'] - $mio), (int) $b['id']]);
        return array_slice($filas, 0, max(1, $limite));
    }

    // ------------------------------------------------------------------ GET /api/estrellas
    public static function estado(int $j): array
    {
        self::preparar();
        try { self::reclamarEntregas($j); } catch (\Throwable $e) { error_log('EN VIVO estrellas: entregas ' . mb_substr($e->getMessage(), 0, 200)); }
        $vig = self::contratosVigentes($j);
        $porClave = [];
        foreach ($vig as $c) {
            $r = max(0, (int) $c['partidos'] - (int) $c['usados']);
            if ($r < 1) continue;
            $p = &$porClave[$c['clave']];
            $p['restantes'] = ($p['restantes'] ?? 0) + $r;
            $p['vence'] = isset($p['vence']) ? min($p['vence'], (int) $c['vence']) : (int) $c['vence'];
            unset($p);
        }
        $asig = []; $act = [];
        foreach (self::MODOS as $m) { $asig[$m] = self::asignadas($j, $m); $act[$m] = self::activas($j, $m); }
        $cat = [];
        foreach (self::CATALOGO as $k => $e) {
            $cat[] = ['clave' => $k, 'nombre' => $e['nombre'], 'rol' => $e['rol'], 'ciudad' => $e['ciudad'], 'habilidad' => self::HABILIDAD, 'nivel' => self::NIVEL,
                'precios' => array_map(fn($n) => ['partidos' => $n, 'creditos' => self::precio($k, $n)], array_keys(self::PAQUETES)),
                'fichas' => (int) $e['fichas'], 'puntos_equipo' => self::PUNTOS_EQUIPO[$e['rol']] ?? 0, 'bono' => self::bonoDe($k),
                'restantes' => (int) ($porClave[$k]['restantes'] ?? 0), 'vence' => isset($porClave[$k]['vence']) ? Db::iso($porClave[$k]['vence']) : null,
                'asignada' => ['copa' => in_array($k, $act['copa'], true), 'duelo' => in_array($k, $act['duelo'], true)]];
        }
        $t = self::ahora();
        $fase = Copas::fase($t);
        return [
            'ok' => true,
            'catalogo' => $cat,
            'contratos' => array_values(array_map([self::class, 'contratoJson'], array_filter($vig, fn($c) => (int) $c['usados'] < (int) $c['partidos']))),
            'asignadas' => $act, 'asignadas_todas' => $asig,
            'fichas' => self::fichas($j), 'fichas_hoy' => self::fichasHoy($j), 'fichas_dia' => self::fichasDia(),
            'creditos' => Monedero::saldo($j),
            'bono' => ['copa' => self::bonoCompetencia($j, 'copa'), 'duelo' => self::bonoCompetencia($j, 'duelo')],
            'pase_copa' => self::paseEstado($j),
            'copa' => ['semana' => Copas::semana($t)['id'], 'fase' => $fase, 'activa' => $fase === 'preparacion' || $fase === 'batalla'],
            'reglas' => ['max_por_equipo' => self::maxPorEquipo(), 'habilidad' => self::HABILIDAD, 'nivel' => self::NIVEL, 'bono_max' => self::BONO_MAX,
                         'vence_dias' => self::VENCE_DIAS, 'paquetes' => array_keys(self::PAQUETES)],
        ];
    }
}
