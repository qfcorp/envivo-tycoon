<?php
declare(strict_types=1);

namespace EnVivo;

/**
 * Soporte dentro del juego (ver server/SOPORTE.md). El soporte es SOLO por el juego ("Ayuda y soporte") y por correo.
 * - Casos con categoría, asunto, la compra (opcional, del mismo jugador) y un diagnóstico pequeño que manda el juego.
 * - Límites: 5 casos sin cerrar por jugador y 10 mensajes por hora.
 * - El Centro de Control responde (con respuestas rápidas editables), cierra y reabre.
 */
final class Soporte
{
    public const CATEGORIAS = ['pago', 'cuenta', 'error', 'sugerencia', 'reporte', 'otro'];
    public const MAX_ABIERTOS = 5;
    public const MENSAJES_HORA = 10;
    public const MAX_TEXTO = 2000;
    public const MAX_DIAGNOSTICO = 4096;

    public static function contacto(): array
    {
        return ['ok' => true, 'correo' => Config::get('SOPORTE_CORREO'), 'horario' => Config::get('SOPORTE_HORARIO')];
    }

    public static function sinLeer(int $jugador): int
    {
        return (int) Db::valor("SELECT COUNT(*) FROM soporte_mensajes m JOIN soporte_casos c ON c.id = m.caso_id WHERE c.jugador_id = ? AND m.autor = 'soporte' AND m.leido = 0", [$jugador]);
    }

    /** Quita del diagnóstico lo que pueda ser sensible y lo deja pequeño. */
    public static function diagnostico(mixed $d): ?string
    {
        if ($d === null) return null;
        Fallo::si(!is_array($d), 'El diagnóstico debe ser un objeto.', 400, ['codigo' => 'diagnostico_invalido']);
        $limpio = function ($v, int $prof) use (&$limpio) {
            if ($prof > 3) return null;
            if (is_array($v)) {
                $o = [];
                foreach (array_slice($v, 0, 40, true) as $k => $x) {
                    if (is_string($k) && preg_match('/clave|password|pass|token|tarjeta|card|cvv|email|correo|cedula|telefono|phone|cookie|sesion/i', $k)) continue;
                    $o[is_string($k) ? mb_substr($k, 0, 40) : $k] = $limpio($x, $prof + 1);
                }
                return $o;
            }
            if (is_string($v)) return mb_substr(preg_replace('/\d[\d \-]{10,22}\d/', '[oculto]', $v) ?? '', 0, 300);
            return is_scalar($v) ? $v : null;
        };
        $j = (string) json_encode($limpio($d, 0), JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
        Fallo::si(strlen($j) > self::MAX_DIAGNOSTICO, 'El diagnóstico es demasiado grande (máximo 4 KB).', 413, ['codigo' => 'diagnostico_grande']);
        return $j;
    }

    private static function texto(mixed $t): string
    {
        $t = is_string($t) ? trim(preg_replace("/[\\x00-\\x08\\x0B\\x0C\\x0E-\\x1F\\x7F]/u", '', $t) ?? '') : '';
        Fallo::si($t === '', 'Escribe tu mensaje.', 400, ['codigo' => 'vacio']);
        Fallo::si(mb_strlen($t) > self::MAX_TEXTO, 'El mensaje tiene máximo ' . self::MAX_TEXTO . ' caracteres.', 400, ['codigo' => 'largo']);
        return $t;
    }

    private static function limiteMensajes(int $jugador): void
    {
        if (Limite::contar('soporte:' . $jugador, self::MENSAJES_HORA, 60)) throw new Fallo('Enviaste muchos mensajes a soporte en la última hora. Espera un rato; ya los estamos leyendo.', 429, ['codigo' => 'limite_intentos']);
    }

    private static function casoJson(array $c): array
    {
        $msgs = Db::todas('SELECT * FROM soporte_mensajes WHERE caso_id = ? ORDER BY id', [$c['id']]);
        return ['id' => (int) $c['id'], 'categoria' => $c['categoria'], 'asunto' => $c['asunto'], 'estado' => $c['estado'],
                'compra_id' => $c['compra_id'] === null ? null : (int) $c['compra_id'], 'creado' => Db::iso((int) $c['creado']), 'actualizado' => Db::iso((int) $c['actualizado']),
                'sin_leer' => count(array_filter($msgs, fn($m) => $m['autor'] === 'soporte' && !(int) $m['leido'])),
                'mensajes' => array_map(fn($m) => ['id' => (int) $m['id'], 'autor' => $m['autor'], 'texto' => $m['texto'], 'creado' => Db::iso((int) $m['creado'])], $msgs)];
    }

    public static function listar(int $jugador): array
    {
        return ['ok' => true, 'casos' => array_map([self::class, 'casoJson'], Db::todas('SELECT * FROM soporte_casos WHERE jugador_id = ? ORDER BY actualizado DESC, id DESC LIMIT 50', [$jugador])),
                'categorias' => self::CATEGORIAS];
    }

    public static function crear(int $jugador, array $in): array
    {
        $cat = is_string($in['categoria'] ?? null) ? $in['categoria'] : '';
        Fallo::si(!in_array($cat, self::CATEGORIAS, true), 'Elige una categoría.', 400, ['codigo' => 'categoria_invalida']);
        $asunto = Social::limpiarTexto($in['asunto'] ?? '');
        Fallo::si($asunto === '' || mb_strlen($asunto) > 80, 'Escribe el asunto (máximo 80 caracteres).', 400, ['codigo' => 'asunto_invalido']);
        $texto = self::texto($in['mensaje'] ?? '');
        $compra = null;
        if (isset($in['compra_id']) && $in['compra_id'] !== null) {
            $compra = is_int($in['compra_id']) ? $in['compra_id'] : (is_string($in['compra_id']) && ctype_digit($in['compra_id']) ? (int) $in['compra_id'] : 0);
            Fallo::si(!Db::valor('SELECT 1 FROM compras WHERE id = ? AND jugador_id = ?', [$compra, $jugador]), 'Esa compra no es de tu cuenta.', 400, ['codigo' => 'compra_ajena']);
        }
        $diag = self::diagnostico($in['diagnostico'] ?? null);
        $abiertos = (int) Db::valor("SELECT COUNT(*) FROM soporte_casos WHERE jugador_id = ? AND estado <> 'cerrado'", [$jugador]);
        Fallo::si($abiertos >= self::MAX_ABIERTOS, 'Ya tienes ' . self::MAX_ABIERTOS . ' casos abiertos. Responde en uno de ellos o espera a que los cerremos.', 409, ['codigo' => 'max_casos']);
        self::limiteMensajes($jugador);
        return Db::tx(function () use ($jugador, $cat, $asunto, $texto, $compra, $diag): array {
            $t = time();
            Db::q("INSERT INTO soporte_casos (jugador_id, categoria, asunto, estado, compra_id, diagnostico_json, creado, actualizado) VALUES (?, ?, ?, 'abierto', ?, ?, ?, ?)", [$jugador, $cat, $asunto, $compra, $diag, $t, $t]);
            $id = Db::ultimoId();
            Db::q("INSERT INTO soporte_mensajes (caso_id, autor, texto, creado) VALUES (?, 'jugador', ?, ?)", [$id, $texto, $t]);
            return ['ok' => true, 'caso' => self::casoJson(Db::fila('SELECT * FROM soporte_casos WHERE id = ?', [$id]))];
        });
    }

    private static function casoDe(int $jugador, int $caso): array
    {
        $c = Db::fila('SELECT * FROM soporte_casos WHERE id = ? AND jugador_id = ?', [$caso, $jugador]);
        Fallo::si(!$c, 'Ese caso no existe.', 404, ['codigo' => 'caso_no_existe']);
        return $c;
    }

    /** El jugador responde: si estaba respondido o cerrado, se reabre. */
    public static function responder(int $jugador, int $caso, mixed $mensaje): array
    {
        $c = self::casoDe($jugador, $caso);
        $texto = self::texto($mensaje);
        if ($c['estado'] === 'cerrado') {
            $abiertos = (int) Db::valor("SELECT COUNT(*) FROM soporte_casos WHERE jugador_id = ? AND estado <> 'cerrado'", [$jugador]);
            Fallo::si($abiertos >= self::MAX_ABIERTOS, 'Ya tienes ' . self::MAX_ABIERTOS . ' casos abiertos.', 409, ['codigo' => 'max_casos']);
        }
        self::limiteMensajes($jugador);
        Db::tx(function () use ($caso, $texto) {
            Db::q("INSERT INTO soporte_mensajes (caso_id, autor, texto, creado) VALUES (?, 'jugador', ?, ?)", [$caso, $texto, time()]);
            Db::q("UPDATE soporte_casos SET estado = 'abierto', actualizado = ? WHERE id = ?", [time(), $caso]);
        });
        return ['ok' => true, 'caso' => self::casoJson(Db::fila('SELECT * FROM soporte_casos WHERE id = ?', [$caso]))];
    }

    public static function leido(int $jugador, int $caso): array
    {
        self::casoDe($jugador, $caso);
        Db::q("UPDATE soporte_mensajes SET leido = 1 WHERE caso_id = ? AND autor = 'soporte'", [$caso]);
        return ['ok' => true, 'soporte_sin_leer' => self::sinLeer($jugador)];
    }

    // ---------------------------------------------------------------- Centro de Control
    public static function responderSoporte(int $caso, string $texto, string $quien, bool $cerrar = false): void
    {
        $texto = trim($texto);
        Fallo::si($texto === '' || mb_strlen($texto) > self::MAX_TEXTO, 'Escribe la respuesta (máximo 2000 caracteres).', 400, ['codigo' => $texto === '' ? 'vacio' : 'largo']);
        $texto = self::plantilla($texto, $caso);
        Db::tx(function () use ($caso, $texto, $quien, $cerrar) {
            $c = Db::fila('SELECT * FROM soporte_casos WHERE id = ?', [$caso]);
            Fallo::si(!$c, 'Ese caso no existe.', 404, ['codigo' => 'caso_no_existe']);
            Db::q("INSERT INTO soporte_mensajes (caso_id, autor, texto, creado) VALUES (?, 'soporte', ?, ?)", [$caso, $texto, time()]);
            Db::q('UPDATE soporte_casos SET estado = ?, actualizado = ? WHERE id = ?', [$cerrar ? 'cerrado' : 'respondido', time(), $caso]);
            Auditoria::anotar($quien, 'soporte_respuesta', 'Caso N° ' . $caso . ($cerrar ? ' (y cerrado)' : '') . ': ' . mb_substr($texto, 0, 200), (int) $c['jugador_id'], $c['compra_id'] === null ? null : (int) $c['compra_id']);
        });
    }

    public static function cambiarEstado(int $caso, string $estado, string $quien): void
    {
        Fallo::si(!in_array($estado, ['abierto', 'cerrado'], true), 'Estado no válido.', 400, ['codigo' => 'estado_invalido']);
        $c = Db::fila('SELECT * FROM soporte_casos WHERE id = ?', [$caso]);
        Fallo::si(!$c, 'Ese caso no existe.', 404, ['codigo' => 'caso_no_existe']);
        Db::q('UPDATE soporte_casos SET estado = ?, actualizado = ? WHERE id = ?', [$estado, time(), $caso]);
        Auditoria::anotar($quien, $estado === 'cerrado' ? 'soporte_cerrar' : 'soporte_reabrir', 'Caso N° ' . $caso, (int) $c['jugador_id']);
    }

    // ---------------------------------------------------------------- respuestas rápidas (editables en el Centro de Control)
    public const MAX_TITULO_RAPIDA = 60;

    public static function respuestasRapidas(): array
    {
        return array_map(fn(array $r) => ['id' => (int) $r['id'], 'titulo' => $r['titulo'], 'texto' => $r['texto']],
            Db::todas('SELECT * FROM soporte_respuestas ORDER BY titulo COLLATE NOCASE, id'));
    }

    /** Crea ($id null) o edita una respuesta rápida. */
    public static function guardarRespuestaRapida(?int $id, string $titulo, string $texto, string $quien): array
    {
        $titulo = Social::limpiarTexto($titulo);
        $texto = trim(str_replace("\r\n", "\n", $texto));
        Fallo::si($titulo === '' || mb_strlen($titulo) > self::MAX_TITULO_RAPIDA, 'El título tiene de 1 a ' . self::MAX_TITULO_RAPIDA . ' caracteres.', 400, ['codigo' => 'titulo_invalido']);
        Fallo::si($texto === '' || mb_strlen($texto) > self::MAX_TEXTO, 'El texto tiene de 1 a ' . self::MAX_TEXTO . ' caracteres.', 400, ['codigo' => 'texto_invalido']);
        return Db::tx(function () use ($id, $titulo, $texto, $quien): array {
            if ($id === null) {
                Fallo::si((int) Db::valor('SELECT COUNT(*) FROM soporte_respuestas') >= 100, 'Ya hay 100 respuestas rápidas. Borra alguna.', 409, ['codigo' => 'maximo']);
                Db::q('INSERT INTO soporte_respuestas (titulo, texto, creado) VALUES (?, ?, ?)', [$titulo, $texto, time()]);
                $id = Db::ultimoId();
                Auditoria::anotar($quien, 'soporte_rapida_crear', 'Respuesta rápida N° ' . $id . ': ' . $titulo);
            } else {
                $antes = Db::fila('SELECT * FROM soporte_respuestas WHERE id = ?', [$id]);
                Fallo::si(!$antes, 'Esa respuesta rápida no existe.', 404, ['codigo' => 'respuesta_no_existe']);
                Db::q('UPDATE soporte_respuestas SET titulo = ?, texto = ? WHERE id = ?', [$titulo, $texto, $id]);
                Auditoria::anotar($quien, 'soporte_rapida_editar', 'Respuesta rápida N° ' . $id . ': "' . $antes['titulo'] . '" -> "' . $titulo . '"');
            }
            return ['id' => $id, 'titulo' => $titulo, 'texto' => $texto];
        });
    }

    public static function borrarRespuestaRapida(int $id, string $quien): void
    {
        $r = Db::fila('SELECT * FROM soporte_respuestas WHERE id = ?', [$id]);
        Fallo::si(!$r, 'Esa respuesta rápida no existe.', 404, ['codigo' => 'respuesta_no_existe']);
        Db::q('DELETE FROM soporte_respuestas WHERE id = ?', [$id]);
        Auditoria::anotar($quien, 'soporte_rapida_borrar', 'Respuesta rápida N° ' . $id . ': ' . $r['titulo']);
    }

    /** Nombres que usa el Centro de Control (docs/INTEGRAR_CONTROL.md). */
    public static function guardarRespuesta(?int $id, string $titulo, string $texto, string $quien): array { return self::guardarRespuestaRapida($id, $titulo, $texto, $quien); }
    public static function borrarRespuesta(int $id, string $quien): void { self::borrarRespuestaRapida($id, $quien); }

    /** {nombre}, {caso} y {compra} de una respuesta rápida -> datos del caso. */
    public static function plantilla(string $texto, int $caso): string
    {
        if (!str_contains($texto, '{')) return $texto;
        $c = Db::fila('SELECT c.id, c.compra_id, j.nombre FROM soporte_casos c JOIN jugadores j ON j.id = c.jugador_id WHERE c.id = ?', [$caso]);
        return $c ? strtr($texto, ['{nombre}' => (string) $c['nombre'], '{caso}' => (string) $c['id'], '{compra}' => (string) ($c['compra_id'] ?? '')]) : $texto;
    }

    // ---------------------------------------------------------------- bandeja del Centro de Control (/control/ y admin.php)
    public const POR_PAGINA = 30;

    /** Casos por estado y cuántos esperan respuesta (el último mensaje es del jugador y no está cerrado). */
    public static function conteos(): array
    {
        $o = ['abierto' => 0, 'respondido' => 0, 'cerrado' => 0];
        foreach (Db::todas('SELECT estado, COUNT(*) AS n FROM soporte_casos GROUP BY estado') as $f) $o[$f['estado']] = (int) $f['n'];
        $o['esperan_respuesta'] = (int) Db::valor("SELECT COUNT(*) FROM soporte_casos c WHERE c.estado <> 'cerrado' AND (SELECT autor FROM soporte_mensajes m WHERE m.caso_id = c.id ORDER BY m.id DESC LIMIT 1) = 'jugador'");
        return $o;
    }

    /**
     * Bandeja: filtros estado (null = todos, 'pendientes' = abierto + respondido, o uno), categoria, buscar (asunto, correo,
     * nombre o "#123"), pagina. Primero los que esperan respuesta, después los más recientes.
     */
    public static function bandeja(array $f): array
    {
        $w = []; $p = [];
        $estado = $f['estado'] ?? null;
        if ($estado === 'pendientes') $w[] = "c.estado IN ('abierto', 'respondido')";
        elseif (in_array($estado, ['abierto', 'respondido', 'cerrado'], true)) { $w[] = 'c.estado = ?'; $p[] = $estado; }
        if (in_array($f['categoria'] ?? null, self::CATEGORIAS, true)) { $w[] = 'c.categoria = ?'; $p[] = $f['categoria']; }
        $b = trim((string) ($f['buscar'] ?? ''));
        if ($b !== '') {
            if (preg_match('/^#?(\d{1,9})$/', $b, $m)) { $w[] = 'c.id = ?'; $p[] = (int) $m[1]; }
            else { $l = '%' . addcslashes(mb_substr($b, 0, 80), '%_\\') . '%'; $w[] = "(c.asunto LIKE ? ESCAPE '\\' OR j.email LIKE ? ESCAPE '\\' OR j.nombre LIKE ? ESCAPE '\\')"; array_push($p, $l, $l, $l); }
        }
        $donde = $w ? ' WHERE ' . implode(' AND ', $w) : '';
        $total = (int) Db::valor('SELECT COUNT(*) FROM soporte_casos c JOIN jugadores j ON j.id = c.jugador_id' . $donde, $p);
        $paginas = max(1, (int) ceil($total / self::POR_PAGINA));
        $pag = max(1, min($paginas, (int) ($f['pagina'] ?? 1)));
        $filas = Db::todas('SELECT c.*, j.nombre, j.email, (SELECT COUNT(*) FROM soporte_mensajes m WHERE m.caso_id = c.id) AS n,
                (SELECT autor FROM soporte_mensajes m WHERE m.caso_id = c.id ORDER BY m.id DESC LIMIT 1) AS ultimo_autor,
                (SELECT texto FROM soporte_mensajes m WHERE m.caso_id = c.id ORDER BY m.id DESC LIMIT 1) AS ultimo_texto
            FROM soporte_casos c JOIN jugadores j ON j.id = c.jugador_id' . $donde . "
            ORDER BY CASE WHEN c.estado <> 'cerrado' AND ultimo_autor = 'jugador' THEN 0 ELSE 1 END, c.actualizado DESC, c.id DESC
            LIMIT " . self::POR_PAGINA . ' OFFSET ' . (($pag - 1) * self::POR_PAGINA), $p);
        return ['total' => $total, 'pagina' => $pag, 'paginas' => $paginas, 'casos' => array_map(fn($c) => ['id' => (int) $c['id'], 'asunto' => $c['asunto'], 'estado' => $c['estado'],
            'categoria' => $c['categoria'], 'compra_id' => $c['compra_id'] === null ? null : (int) $c['compra_id'], 'espera_respuesta' => $c['estado'] !== 'cerrado' && $c['ultimo_autor'] === 'jugador',
            'jugador' => ['id' => (int) $c['jugador_id'], 'nombre' => $c['nombre'], 'email' => $c['email']], 'mensajes' => (int) $c['n'],
            'ultimo_texto' => mb_substr((string) $c['ultimo_texto'], 0, 140), 'creado' => Db::iso((int) $c['creado']), 'actualizado' => Db::iso((int) $c['actualizado'])], $filas)];
    }

    private static function compraCorta(?array $c): ?array
    {
        if (!$c) return null;
        return ['id' => (int) $c['id'], 'producto' => $c['producto'], 'nombre' => Catalogo::productoCompra((string) $c['producto'])['nombre'] ?? $c['producto'], 'total' => (float) $c['total'],
                'estado' => $c['estado'], 'canal' => $c['canal'], 'referencia' => $c['plux_transaccion'] ?? $c['google_order_id'], 'creado' => Db::iso((int) $c['creado'])];
    }

    /** Ficha de un caso para el administrador: jugador (sin clave ni pagos), compra del caso, última compra, diagnóstico y mensajes. */
    public static function caso(int $id): array
    {
        $c = Db::fila('SELECT * FROM soporte_casos WHERE id = ?', [$id]);
        Fallo::si(!$c, 'Ese caso no existe.', 404, ['codigo' => 'caso_no_existe']);
        $j = Db::fila('SELECT id, email, nombre, alias, estado, creditos - deuda AS creditos, vip_hasta, creado FROM jugadores WHERE id = ?', [$c['jugador_id']]);
        return ['id' => (int) $c['id'], 'asunto' => $c['asunto'], 'estado' => $c['estado'], 'categoria' => $c['categoria'], 'creado' => Db::iso((int) $c['creado']), 'actualizado' => Db::iso((int) $c['actualizado']),
                'jugador' => $j ? ['id' => (int) $j['id'], 'email' => $j['email'], 'nombre' => $j['nombre'], 'alias' => $j['alias'], 'estado' => $j['estado'], 'creditos' => (int) $j['creditos']] : null,
                'compras_pagadas' => (int) Db::valor("SELECT COUNT(*) FROM compras WHERE jugador_id = ? AND estado = 'pagado'", [$c['jugador_id']]),
                'otros_casos' => (int) Db::valor('SELECT COUNT(*) FROM soporte_casos WHERE jugador_id = ? AND id <> ?', [$c['jugador_id'], $id]),
                'compra' => $c['compra_id'] !== null ? self::compraCorta(Compras::porId((int) $c['compra_id'])) : null,
                'ultima_compra' => self::compraCorta(Db::fila('SELECT * FROM compras WHERE jugador_id = ? ORDER BY id DESC LIMIT 1', [$c['jugador_id']])),
                'diagnostico' => $c['diagnostico_json'] !== null ? (json_decode((string) $c['diagnostico_json'], true) ?: null) : null,
                'mensajes' => array_map(fn($m) => ['id' => (int) $m['id'], 'autor' => $m['autor'], 'texto' => $m['texto'], 'creado' => Db::iso((int) $m['creado']), 'leido' => (bool) (int) $m['leido']],
                    Db::todas('SELECT * FROM soporte_mensajes WHERE caso_id = ? ORDER BY id', [$id]))];
    }
}
