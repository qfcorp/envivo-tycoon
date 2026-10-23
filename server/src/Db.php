<?php
declare(strict_types=1);

namespace EnVivo;

use PDO;
use PDOStatement;

/**
 * Base de datos SQLite (un solo archivo FUERA de la carpeta pública, por defecto /var/lib/envivo/envivo.sqlite).
 * - Modo WAL (lecturas y escrituras a la vez sin bloquearse).
 * - Las tablas se crean y se actualizan solas (migraciones) en la primera petición o con bin/migrar.php.
 * - Toda escritura de dinero/créditos va en Db::tx(), que usa BEGIN IMMEDIATE (un solo escritor a la vez).
 * - Las fechas se guardan como números (segundos Unix) y se muestran en la zona de ENVIVO_ZONA.
 */
final class Db
{
    private static ?PDO $pdo = null;
    private static int $profundidad = 0;

    /** Migraciones en orden. NUNCA cambiar una que ya se aplicó: agregar otra al final. */
    private const MIGRACIONES = [
        // 1: núcleo
        <<<'SQL'
        CREATE TABLE jugadores (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            email TEXT NOT NULL UNIQUE COLLATE NOCASE,
            nombre TEXT NOT NULL,
            clave_hash TEXT NOT NULL,
            creditos INTEGER NOT NULL DEFAULT 0 CHECK (creditos >= 0),
            vip_hasta INTEGER,
            creado INTEGER NOT NULL,
            ultimo_ingreso INTEGER
        );
        CREATE TABLE sesiones (
            token_hash TEXT PRIMARY KEY,
            jugador_id INTEGER NOT NULL REFERENCES jugadores(id) ON DELETE CASCADE,
            creado INTEGER NOT NULL,
            expira INTEGER NOT NULL,
            ip TEXT,
            navegador TEXT,
            compra_pendiente INTEGER
        );
        CREATE INDEX sesiones_jugador ON sesiones (jugador_id);
        CREATE TABLE partidas (
            jugador_id INTEGER PRIMARY KEY REFERENCES jugadores(id) ON DELETE CASCADE,
            datos TEXT NOT NULL,
            actualizado INTEGER NOT NULL
        );
        CREATE TABLE movimientos_creditos (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            jugador_id INTEGER NOT NULL REFERENCES jugadores(id) ON DELETE CASCADE,
            cambio INTEGER NOT NULL,
            saldo INTEGER NOT NULL,
            motivo TEXT NOT NULL,
            ref TEXT,
            creado INTEGER NOT NULL
        );
        CREATE INDEX movimientos_jugador ON movimientos_creditos (jugador_id);
        CREATE TABLE entregas (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            jugador_id INTEGER NOT NULL REFERENCES jugadores(id) ON DELETE CASCADE,
            tipo TEXT NOT NULL,
            item TEXT NOT NULL,
            cantidad INTEGER NOT NULL,
            origen TEXT NOT NULL,
            creado INTEGER NOT NULL
        );
        CREATE INDEX entregas_jugador ON entregas (jugador_id);
        CREATE TABLE compras (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            token TEXT NOT NULL UNIQUE,
            jugador_id INTEGER NOT NULL REFERENCES jugadores(id),
            producto TEXT NOT NULL,
            total REAL NOT NULL,
            subtotal REAL NOT NULL,
            iva REAL NOT NULL,
            estado TEXT NOT NULL DEFAULT 'pendiente' CHECK (estado IN ('pendiente', 'pagado', 'rechazado')),
            plux_transaccion TEXT,
            plux_paso TEXT,
            plux_respuesta TEXT,
            comprador_cedula TEXT,
            comprador_nombre TEXT,
            comprador_email TEXT,
            comprador_telefono TEXT,
            creado INTEGER NOT NULL,
            pagado_en INTEGER,
            pagado_por TEXT
        );
        CREATE INDEX compras_jugador ON compras (jugador_id, producto, estado);
        CREATE INDEX compras_transaccion ON compras (plux_transaccion);
        CREATE INDEX compras_estado ON compras (estado, pagado_en);
        CREATE TABLE bonos_vip (
            jugador_id INTEGER NOT NULL REFERENCES jugadores(id) ON DELETE CASCADE,
            dia TEXT NOT NULL,
            creado INTEGER NOT NULL,
            PRIMARY KEY (jugador_id, dia)
        );
        CREATE TABLE intentos (
            clave TEXT NOT NULL,
            minuto INTEGER NOT NULL,
            total INTEGER NOT NULL,
            PRIMARY KEY (clave, minuto)
        );
        CREATE TABLE avisos (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            tipo TEXT NOT NULL,
            detalle TEXT NOT NULL,
            compra_id INTEGER,
            creado INTEGER NOT NULL
        );
        SQL,
        // 2: mercado entre jugadores (inventario con número de serie por tipo). Los equipos que ya se entregaron como
        //    entregas "item" pasan UNA vez al inventario (con entrega_id, para que el juego no los duplique).
        <<<'SQL'
        CREATE TABLE series (item TEXT PRIMARY KEY, ultima INTEGER NOT NULL);
        CREATE TABLE inventario (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            jugador_id INTEGER NOT NULL REFERENCES jugadores(id) ON DELETE CASCADE,
            item TEXT NOT NULL,
            serie INTEGER NOT NULL,
            origen TEXT NOT NULL,
            ref TEXT,
            entrega_id INTEGER,
            estado TEXT NOT NULL DEFAULT 'bodega' CHECK (estado IN ('bodega', 'publicado', 'revocado')),
            creado INTEGER NOT NULL,
            actualizado INTEGER NOT NULL,
            UNIQUE (item, serie)
        );
        CREATE INDEX inventario_jugador ON inventario (jugador_id, estado);
        CREATE TABLE mercado_publicaciones (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            inventario_id INTEGER NOT NULL REFERENCES inventario(id) ON DELETE CASCADE,
            vendedor_id INTEGER REFERENCES jugadores(id) ON DELETE SET NULL,
            item TEXT NOT NULL,
            serie INTEGER NOT NULL,
            precio INTEGER NOT NULL CHECK (precio BETWEEN 10 AND 100000),
            estado TEXT NOT NULL DEFAULT 'activa' CHECK (estado IN ('activa', 'congelada', 'vendida', 'retirada', 'vencida', 'quitada')),
            publicado INTEGER NOT NULL,
            vence INTEGER NOT NULL,
            cerrado INTEGER,
            comprador_id INTEGER REFERENCES jugadores(id) ON DELETE SET NULL,
            pago_vendedor INTEGER,
            comision INTEGER
        );
        CREATE UNIQUE INDEX mercado_una_activa ON mercado_publicaciones (inventario_id) WHERE estado IN ('activa', 'congelada');
        CREATE INDEX mercado_activas ON mercado_publicaciones (estado, item, precio);
        CREATE INDEX mercado_vendedor ON mercado_publicaciones (vendedor_id, estado);
        CREATE INDEX mercado_vence ON mercado_publicaciones (estado, vence);
        CREATE INDEX mercado_vendidas ON mercado_publicaciones (item, estado, cerrado);
        INSERT INTO inventario (jugador_id, item, serie, origen, ref, entrega_id, estado, creado, actualizado)
            SELECT jugador_id, item, ROW_NUMBER() OVER (PARTITION BY item ORDER BY id),
                   CASE WHEN origen LIKE 'compra:%' THEN 'inicio' ELSE 'canje' END, origen, id, 'bodega', creado, creado
            FROM entregas WHERE tipo = 'item' ORDER BY id;
        INSERT INTO series (item, ultima) SELECT item, MAX(serie) FROM inventario GROUP BY item;
        SQL,
        // 3: servidores, perfil público, asociaciones, chat con moderación y coaliciones
        <<<'SQL'
        CREATE TABLE servidores (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            nombre TEXT NOT NULL,
            capacidad INTEGER NOT NULL DEFAULT 1000,
            abierto INTEGER NOT NULL DEFAULT 1,
            creado INTEGER NOT NULL
        );
        INSERT INTO servidores (id, nombre, capacidad, abierto, creado) VALUES (1, 'Servidor 1 · Quito', 1000, 1, CAST(strftime('%s', 'now') AS INTEGER));
        ALTER TABLE jugadores ADD COLUMN servidor_id INTEGER REFERENCES servidores(id);
        ALTER TABLE jugadores ADD COLUMN alias TEXT;
        ALTER TABLE jugadores ADD COLUMN alias_clave TEXT;
        ALTER TABLE jugadores ADD COLUMN fama_publica INTEGER NOT NULL DEFAULT 0;
        ALTER TABLE jugadores ADD COLUMN fama_dia TEXT;
        ALTER TABLE jugadores ADD COLUMN fama_inicio_dia INTEGER NOT NULL DEFAULT 0;
        ALTER TABLE jugadores ADD COLUMN chat_ultimo_ms INTEGER;
        UPDATE jugadores SET servidor_id = 1;
        CREATE INDEX jugadores_servidor ON jugadores (servidor_id);
        CREATE UNIQUE INDEX jugadores_alias ON jugadores (servidor_id, alias_clave) WHERE alias_clave IS NOT NULL;
        CREATE TABLE asociaciones (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            servidor_id INTEGER NOT NULL REFERENCES servidores(id),
            nombre TEXT NOT NULL,
            nombre_clave TEXT NOT NULL,
            siglas TEXT NOT NULL,
            color TEXT NOT NULL,
            logo_json TEXT,
            descripcion TEXT NOT NULL DEFAULT '',
            ingreso TEXT NOT NULL DEFAULT 'abierto' CHECK (ingreso IN ('abierto', 'solicitud')),
            creado INTEGER NOT NULL
        );
        CREATE UNIQUE INDEX asociaciones_nombre ON asociaciones (servidor_id, nombre_clave);
        CREATE UNIQUE INDEX asociaciones_siglas ON asociaciones (servidor_id, siglas COLLATE NOCASE);
        CREATE TABLE asociacion_miembros (
            asociacion_id INTEGER NOT NULL REFERENCES asociaciones(id) ON DELETE CASCADE,
            jugador_id INTEGER NOT NULL PRIMARY KEY REFERENCES jugadores(id) ON DELETE CASCADE,
            cargo TEXT NOT NULL CHECK (cargo IN ('presidente', 'vicepresidente', 'socio')),
            desde INTEGER NOT NULL
        );
        CREATE INDEX asociacion_miembros_asoc ON asociacion_miembros (asociacion_id, cargo, desde);
        CREATE TABLE asociacion_solicitudes (
            asociacion_id INTEGER NOT NULL REFERENCES asociaciones(id) ON DELETE CASCADE,
            jugador_id INTEGER NOT NULL REFERENCES jugadores(id) ON DELETE CASCADE,
            creado INTEGER NOT NULL,
            PRIMARY KEY (asociacion_id, jugador_id)
        );
        CREATE TABLE chat_mensajes (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            canal TEXT NOT NULL,
            jugador_id INTEGER REFERENCES jugadores(id) ON DELETE CASCADE,
            texto TEXT NOT NULL,
            rapido TEXT,
            creado INTEGER NOT NULL,
            oculto INTEGER NOT NULL DEFAULT 0
        );
        CREATE INDEX chat_canal ON chat_mensajes (canal, id);
        CREATE INDEX chat_creado ON chat_mensajes (creado);
        CREATE TABLE chat_reportes (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            mensaje_id INTEGER NOT NULL REFERENCES chat_mensajes(id) ON DELETE CASCADE,
            reportante_id INTEGER NOT NULL REFERENCES jugadores(id) ON DELETE CASCADE,
            motivo TEXT NOT NULL,
            estado TEXT NOT NULL DEFAULT 'pendiente' CHECK (estado IN ('pendiente', 'resuelto', 'descartado')),
            creado INTEGER NOT NULL,
            resuelto_en INTEGER,
            UNIQUE (mensaje_id, reportante_id)
        );
        CREATE INDEX chat_reportes_estado ON chat_reportes (estado, id);
        CREATE TABLE chat_bloqueos (
            jugador_id INTEGER NOT NULL REFERENCES jugadores(id) ON DELETE CASCADE,
            bloqueado_id INTEGER NOT NULL REFERENCES jugadores(id) ON DELETE CASCADE,
            creado INTEGER NOT NULL,
            PRIMARY KEY (jugador_id, bloqueado_id)
        );
        CREATE TABLE chat_sanciones (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            jugador_id INTEGER NOT NULL REFERENCES jugadores(id) ON DELETE CASCADE,
            tipo TEXT NOT NULL CHECK (tipo IN ('silencio', 'expulsion')),
            hasta INTEGER,
            motivo TEXT NOT NULL,
            creado INTEGER NOT NULL,
            levantada INTEGER NOT NULL DEFAULT 0
        );
        CREATE INDEX chat_sanciones_jugador ON chat_sanciones (jugador_id, levantada);
        CREATE TABLE chat_palabras (palabra TEXT PRIMARY KEY, creado INTEGER NOT NULL);
        CREATE TABLE coaliciones (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            servidor_id INTEGER NOT NULL REFERENCES servidores(id),
            evento_id TEXT NOT NULL,
            nombre TEXT NOT NULL,
            inicio INTEGER NOT NULL,
            fin INTEGER NOT NULL,
            creado INTEGER NOT NULL
        );
        CREATE TABLE coalicion_miembros (
            coalicion_id INTEGER NOT NULL REFERENCES coaliciones(id) ON DELETE CASCADE,
            asociacion_id INTEGER NOT NULL REFERENCES asociaciones(id) ON DELETE CASCADE,
            PRIMARY KEY (coalicion_id, asociacion_id)
        );
        CREATE TRIGGER coalicion_maximo BEFORE INSERT ON coalicion_miembros
            WHEN (SELECT COUNT(*) FROM coalicion_miembros WHERE coalicion_id = NEW.coalicion_id) >= 4
            BEGIN SELECT RAISE(ABORT, 'Una coalicion tiene maximo 4 asociaciones'); END;
        SQL,
        // 4: precios y ofertas editables, tarjeta mensual, refuerzos, transferencias de cuenta, reembolsos/contracargos,
        //    Google Play, cuenta suspendida, auditoría del panel, ajustes (mantenimiento, anuncio), actividad diaria y soporte.
        //    La tabla compras se rehace para permitir el estado 'revertido' (se copian todas las filas).
        <<<'SQL'
        CREATE TABLE compras_nueva (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            token TEXT NOT NULL UNIQUE,
            jugador_id INTEGER NOT NULL REFERENCES jugadores(id),
            producto TEXT NOT NULL,
            total REAL NOT NULL,
            subtotal REAL NOT NULL,
            iva REAL NOT NULL,
            estado TEXT NOT NULL DEFAULT 'pendiente' CHECK (estado IN ('pendiente', 'pagado', 'rechazado', 'revertido')),
            plux_transaccion TEXT,
            plux_paso TEXT,
            plux_respuesta TEXT,
            comprador_cedula TEXT,
            comprador_nombre TEXT,
            comprador_email TEXT,
            comprador_telefono TEXT,
            creado INTEGER NOT NULL,
            pagado_en INTEGER,
            pagado_por TEXT,
            canal TEXT NOT NULL DEFAULT 'web_plux' CHECK (canal IN ('web_plux', 'google_play')),
            google_order_id TEXT,
            google_token TEXT,
            creditos INTEGER,
            bono_pct INTEGER NOT NULL DEFAULT 0,
            transferencia_id INTEGER,
            revertida_en INTEGER,
            revertida_tipo TEXT,
            revertida_motivo TEXT,
            revertida_por TEXT,
            google_ack INTEGER,
            plux_desde INTEGER,
            google_token_hash TEXT
        );
        INSERT INTO compras_nueva (id, token, jugador_id, producto, total, subtotal, iva, estado, plux_transaccion, plux_paso, plux_respuesta,
               comprador_cedula, comprador_nombre, comprador_email, comprador_telefono, creado, pagado_en, pagado_por)
            SELECT id, token, jugador_id, producto, total, subtotal, iva, estado, plux_transaccion, plux_paso, plux_respuesta,
               comprador_cedula, comprador_nombre, comprador_email, comprador_telefono, creado, pagado_en, pagado_por FROM compras;
        DROP TABLE compras;
        ALTER TABLE compras_nueva RENAME TO compras;
        CREATE INDEX compras_jugador ON compras (jugador_id, producto, estado);
        CREATE INDEX compras_transaccion ON compras (plux_transaccion);
        CREATE INDEX compras_estado ON compras (estado, pagado_en);
        -- Google Play: cada comprobante (purchaseToken) se usa UNA vez y queda de la primera cuenta que lo verificó
        CREATE UNIQUE INDEX compras_google_token ON compras (google_token_hash) WHERE google_token_hash IS NOT NULL;
        CREATE UNIQUE INDEX compras_google_orden ON compras (google_order_id) WHERE google_order_id IS NOT NULL AND google_order_id <> '';

        ALTER TABLE jugadores ADD COLUMN estado TEXT NOT NULL DEFAULT 'activo';
        ALTER TABLE jugadores ADD COLUMN estado_motivo TEXT;
        ALTER TABLE jugadores ADD COLUMN estado_desde INTEGER;
        ALTER TABLE jugadores ADD COLUMN deuda INTEGER NOT NULL DEFAULT 0;
        ALTER TABLE jugadores ADD COLUMN tarjeta_hasta INTEGER;
        ALTER TABLE jugadores ADD COLUMN bloqueo_hasta INTEGER;
        ALTER TABLE sesiones ADD COLUMN ultimo_dia TEXT;
        ALTER TABLE jugadores ADD COLUMN riesgo_motivo TEXT;
        ALTER TABLE jugadores ADD COLUMN riesgo_desde INTEGER;
        -- Cada confirmación 3DS (ptk del banco) se acepta UNA sola vez (auditoría A-02)
        CREATE TABLE plux_3ds_usados (
            ptk_hash TEXT PRIMARY KEY,
            compra_id INTEGER,
            creado INTEGER NOT NULL
        );
        -- Lo que gana un vendedor del mercado queda retenido 7 días antes de poder gastarlo (auditoría A-01)
        CREATE TABLE mercado_retenciones (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            jugador_id INTEGER NOT NULL REFERENCES jugadores(id) ON DELETE CASCADE,
            publicacion_id INTEGER NOT NULL UNIQUE,
            creditos INTEGER NOT NULL,
            libera INTEGER NOT NULL,
            estado TEXT NOT NULL DEFAULT 'retenido' CHECK (estado IN ('retenido', 'liberado', 'recuperado')),
            creado INTEGER NOT NULL,
            cerrado INTEGER
        );
        CREATE INDEX mercado_retenciones_jugador ON mercado_retenciones (jugador_id, estado, libera);
        ALTER TABLE entregas ADD COLUMN nivel TEXT;
        ALTER TABLE entregas ADD COLUMN eventos INTEGER;

        CREATE TABLE tarjeta_reclamos (
            jugador_id INTEGER NOT NULL REFERENCES jugadores(id) ON DELETE CASCADE,
            dia TEXT NOT NULL,
            creado INTEGER NOT NULL,
            PRIMARY KEY (jugador_id, dia)
        );
        CREATE TABLE actividad (
            jugador_id INTEGER NOT NULL REFERENCES jugadores(id) ON DELETE CASCADE,
            dia TEXT NOT NULL,
            PRIMARY KEY (dia, jugador_id)
        );
        CREATE TABLE productos_ajustes (
            producto TEXT PRIMARY KEY,
            precio REAL,
            creditos INTEGER,
            activo INTEGER,
            actualizado INTEGER NOT NULL
        );
        CREATE TABLE ofertas (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            producto TEXT NOT NULL,
            bono_pct INTEGER NOT NULL CHECK (bono_pct BETWEEN 1 AND 300),
            inicio INTEGER NOT NULL,
            fin INTEGER NOT NULL,
            activa INTEGER NOT NULL DEFAULT 1,
            creado INTEGER NOT NULL
        );
        CREATE INDEX ofertas_producto ON ofertas (producto, activa, inicio, fin);
        CREATE TABLE ajustes (clave TEXT PRIMARY KEY, valor TEXT NOT NULL, actualizado INTEGER NOT NULL);
        CREATE TABLE auditoria (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            quien TEXT NOT NULL,
            accion TEXT NOT NULL,
            detalle TEXT NOT NULL,
            jugador_id INTEGER,
            compra_id INTEGER,
            ip TEXT,
            creado INTEGER NOT NULL
        );
        CREATE INDEX auditoria_jugador ON auditoria (jugador_id, id);
        CREATE TABLE transferencias (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            jugador_id INTEGER NOT NULL REFERENCES jugadores(id) ON DELETE CASCADE,
            email_anterior TEXT NOT NULL,
            email_nuevo TEXT NOT NULL COLLATE NOCASE,
            estado TEXT NOT NULL CHECK (estado IN ('pendiente_pago', 'pagada', 'completada', 'cancelada')),
            compra_id INTEGER,
            codigo TEXT,
            creado INTEGER NOT NULL,
            pagada_en INTEGER,
            completada_en INTEGER,
            cancelada_en INTEGER,
            cancelada_por TEXT,
            vence INTEGER NOT NULL
        );
        CREATE INDEX transferencias_jugador ON transferencias (jugador_id, estado);
        CREATE TABLE soporte_casos (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            jugador_id INTEGER NOT NULL REFERENCES jugadores(id) ON DELETE CASCADE,
            categoria TEXT NOT NULL CHECK (categoria IN ('pago', 'cuenta', 'error', 'sugerencia', 'reporte', 'otro')),
            asunto TEXT NOT NULL,
            estado TEXT NOT NULL DEFAULT 'abierto' CHECK (estado IN ('abierto', 'respondido', 'cerrado')),
            compra_id INTEGER,
            diagnostico_json TEXT,
            creado INTEGER NOT NULL,
            actualizado INTEGER NOT NULL
        );
        CREATE INDEX soporte_casos_jugador ON soporte_casos (jugador_id, actualizado);
        CREATE INDEX soporte_casos_estado ON soporte_casos (estado, actualizado);
        CREATE TABLE soporte_mensajes (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            caso_id INTEGER NOT NULL REFERENCES soporte_casos(id) ON DELETE CASCADE,
            autor TEXT NOT NULL CHECK (autor IN ('jugador', 'soporte')),
            texto TEXT NOT NULL,
            creado INTEGER NOT NULL,
            leido INTEGER NOT NULL DEFAULT 0
        );
        CREATE INDEX soporte_mensajes_caso ON soporte_mensajes (caso_id, id);
        CREATE TABLE soporte_respuestas (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            titulo TEXT NOT NULL,
            texto TEXT NOT NULL,
            creado INTEGER NOT NULL
        );
        INSERT INTO soporte_respuestas (titulo, texto, creado) VALUES
          ('Pago acreditado', 'Hola. Revisamos tu pago y ya está acreditado en tu cuenta. Cierra y vuelve a abrir el juego para verlo. ¡Gracias por jugar EN VIVO Tycoon!', CAST(strftime('%s', 'now') AS INTEGER)),
          ('Pedimos datos', 'Hola. Para ayudarte necesitamos el número de tu compra (lo ves en Tienda > Mis compras) y la fecha. Respóndenos aquí mismo.', CAST(strftime('%s', 'now') AS INTEGER)),
          ('Error en revisión', 'Hola. Gracias por avisarnos del error. Ya lo estamos revisando y lo arreglaremos en una próxima actualización.', CAST(strftime('%s', 'now') AS INTEGER)),
          ('Gracias por la sugerencia', '¡Gracias por tu idea! La anotamos para las próximas versiones del juego.', CAST(strftime('%s', 'now') AS INTEGER));
        SQL,
    ];

    public static function pdo(): PDO
    {
        if (self::$pdo !== null) return self::$pdo;
        $ruta = Config::db();
        $pdo = new PDO('sqlite:' . $ruta, null, null, [
            PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
            PDO::ATTR_TIMEOUT => 10,
        ]);
        $pdo->exec('PRAGMA busy_timeout = 10000');
        $pdo->exec('PRAGMA journal_mode = WAL');
        $pdo->exec('PRAGMA synchronous = NORMAL');
        $pdo->exec('PRAGMA foreign_keys = ON');
        self::$pdo = $pdo;
        self::migrar();
        return $pdo;
    }

    public static function versionEsperada(): int { return count(self::MIGRACIONES); }

    /** Aplica las migraciones que falten. Devuelve cuántas aplicó (0 = la base ya estaba al día). */
    public static function migrar(): int
    {
        $pdo = self::$pdo ?? self::pdo();
        $n = (int) $pdo->query('PRAGMA user_version')->fetchColumn() >= count(self::MIGRACIONES) ? 0 : self::migrarVersiones($pdo);
        self::migrarModulos($pdo);
        return $n;
    }

    /**
     * Después de las migraciones numeradas: los archivos src/migraciones/*.sql de los módulos (liga, festival, discord...),
     * en orden alfabético, con Migraciones::aplicar (seguros de correr otra vez). Solo se vuelven a aplicar si cambió
     * algún archivo (nombre, tamaño o fecha); la "huella" queda en la tabla esquema_modulos.
     */
    private static function migrarModulos(PDO $pdo): void
    {
        $archivos = glob(Migraciones::CARPETA . '/*.sql') ?: [];
        sort($archivos, SORT_STRING);
        $huella = hash('sha256', implode('|', array_map(fn($f) => basename($f) . ':' . filesize($f) . ':' . filemtime($f), $archivos)));
        $pdo->exec('CREATE TABLE IF NOT EXISTS esquema_modulos (clave TEXT PRIMARY KEY, valor TEXT NOT NULL, actualizado INTEGER NOT NULL)');
        if ((string) $pdo->query("SELECT valor FROM esquema_modulos WHERE clave = 'huella'")->fetchColumn() === $huella) return;
        self::tx(function () use ($pdo, $archivos, $huella): void {
            if ((string) $pdo->query("SELECT valor FROM esquema_modulos WHERE clave = 'huella'")->fetchColumn() === $huella) return;   // otra petición ya lo hizo
            foreach ($archivos as $f) Migraciones::aplicar(basename($f));
            self::unificarPases($pdo);
            self::ampliarCanales($pdo);
            self::q("INSERT INTO esquema_modulos (clave, valor, actualizado) VALUES ('huella', ?, ?) ON CONFLICT (clave) DO UPDATE SET valor = excluded.valor, actualizado = excluded.actualizado", [$huella, time()]);
        });
    }

    /**
     * Pases de Prensa = UN solo saldo (festival_pases). Para bases hechas antes de unificarlos: (1) si festival_pases tiene
     * la lista vieja de motivos, se rehace con la nueva (desafio, desafio_top, gasto); (2) lo que haya en el libro viejo del
     * Desafío (pases_prensa_libro) pasa a festival_pases con ref "pases_prensa:<id>" (una sola vez, INSERT OR IGNORE).
     */
    private static function unificarPases(PDO $pdo): void
    {
        $sql = (string) $pdo->query("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'festival_pases'")->fetchColumn();
        if ($sql === '') return;
        if (!str_contains($sql, "'desafio_top'")) {
            $nuevo = str_replace("'intento', 'ajuste')", "'intento', 'ajuste', 'desafio', 'desafio_top', 'gasto')", $sql);
            if ($nuevo === $sql) throw new \RuntimeException('festival_pases: no se pudo ampliar la lista de motivos');
            $pdo->exec('ALTER TABLE festival_pases RENAME TO festival_pases_viejo');
            $pdo->exec($nuevo);
            $pdo->exec('INSERT INTO festival_pases SELECT * FROM festival_pases_viejo');
            $pdo->exec('DROP TABLE festival_pases_viejo');
            $pdo->exec('CREATE INDEX IF NOT EXISTS festival_pases_dia ON festival_pases (jugador_id, dia, motivo)');
        }
        if (!$pdo->query("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'pases_prensa_libro'")->fetchColumn()) return;
        $motivos = ['diario', 'vip', 'mision', 'compra', 'intento', 'ajuste', 'desafio', 'desafio_top', 'gasto'];
        foreach (self::todas("SELECT * FROM pases_prensa_libro WHERE 'pases_prensa:' || id NOT IN (SELECT ref FROM festival_pases WHERE ref LIKE 'pases_prensa:%') ORDER BY id") as $f) {
            $j = (int) $f['jugador_id'];
            $saldo = (int) self::valor('SELECT COALESCE(SUM(cambio), 0) FROM festival_pases WHERE jugador_id = ?', [$j]) + (int) $f['cambio'];
            $m = in_array($f['motivo'], $motivos, true) ? $f['motivo'] : ((int) $f['cambio'] < 0 ? 'gasto' : 'ajuste');
            self::q('INSERT OR IGNORE INTO festival_pases (jugador_id, cambio, saldo, motivo, ref, dia, creado) VALUES (?, ?, ?, ?, ?, ?, ?)',
                [$j, (int) $f['cambio'], max(0, $saldo), $m, 'pases_prensa:' . $f['id'], date('Y-m-d', (int) $f['creado']), (int) $f['creado']]);
        }
    }

    /**
     * PayPal (src/PayPal.php, migraciones/paypal.sql): la regla del canal de compras (migración 4) solo aceptaba 'web_plux'
     * y 'google_play'. SQLite no cambia un CHECK con ALTER TABLE: se rehace la tabla con el MISMO texto (todas sus columnas,
     * también las que hayan agregado los módulos) más 'web_paypal', se copian todas las filas y se vuelven a crear sus índices.
     * Ninguna tabla apunta a compras con REFERENCES. Si ya acepta 'web_paypal' no hace nada.
     */
    private static function ampliarCanales(PDO $pdo): void
    {
        $sql = (string) $pdo->query("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'compras'")->fetchColumn();
        if ($sql === '' || str_contains($sql, "'web_paypal'")) return;
        $nuevo = str_replace("CHECK (canal IN ('web_plux', 'google_play'))", "CHECK (canal IN ('web_plux', 'google_play', 'web_paypal'))", $sql, $n);
        if ($n !== 1 || !preg_match('/^CREATE TABLE "?compras"?\s*\(/i', $nuevo)) throw new \RuntimeException('compras: no se pudo ampliar la regla del canal');
        $indices = $pdo->query("SELECT sql FROM sqlite_master WHERE type = 'index' AND tbl_name = 'compras' AND sql IS NOT NULL")->fetchAll(PDO::FETCH_COLUMN);
        $antes = (int) $pdo->query('SELECT COUNT(*) FROM compras')->fetchColumn();
        $pdo->exec((string) preg_replace('/^CREATE TABLE "?compras"?/i', 'CREATE TABLE compras_nueva', $nuevo));
        $pdo->exec('INSERT INTO compras_nueva SELECT * FROM compras');
        $pdo->exec('DROP TABLE compras');
        $pdo->exec('ALTER TABLE compras_nueva RENAME TO compras');
        foreach ($indices as $i) $pdo->exec((string) $i);
        if ((int) $pdo->query('SELECT COUNT(*) FROM compras')->fetchColumn() !== $antes) throw new \RuntimeException('compras: se perdieron filas al ampliar el canal');
    }

    private static function migrarVersiones(PDO $pdo): int
    {
        return self::tx(function () use ($pdo): int {
            $v = (int) $pdo->query('PRAGMA user_version')->fetchColumn();   // otra petición pudo migrar mientras esperábamos
            $n = 0;
            for ($i = $v; $i < count(self::MIGRACIONES); $i++) {
                $pdo->exec(self::MIGRACIONES[$i]);
                if ($i === 2) {   // lista inicial de palabras del filtro del chat (después se edita en el panel)
                    $st = $pdo->prepare('INSERT OR IGNORE INTO chat_palabras (palabra, creado) VALUES (?, ?)');
                    foreach (Filtro::PALABRAS_INICIALES as $w) $st->execute([Filtro::limpiarPalabra($w), time()]);
                }
                $pdo->exec('PRAGMA user_version = ' . ($i + 1));
                $n++;
            }
            return $n;
        });
    }

    /**
     * Ejecuta $f dentro de una transacción con BEGIN IMMEDIATE (toma el turno de escritura al empezar, así
     * dos compras a la vez nunca se pisan). Si ya hay una transacción abierta, se suma a ella.
     */
    public static function tx(callable $f): mixed
    {
        $pdo = self::pdo();
        if (self::$profundidad > 0) return $f();
        $pdo->exec('BEGIN IMMEDIATE');
        self::$profundidad = 1;
        try {
            $r = $f();
            $pdo->exec('COMMIT');
            return $r;
        } catch (\Throwable $e) {
            try { $pdo->exec('ROLLBACK'); } catch (\Throwable) {}
            throw $e;
        } finally {
            self::$profundidad = 0;
        }
    }

    public static function q(string $sql, array $p = []): PDOStatement
    {
        $st = self::pdo()->prepare($sql);
        $st->execute($p);
        return $st;
    }

    public static function fila(string $sql, array $p = []): ?array
    {
        $r = self::q($sql, $p)->fetch();
        return is_array($r) ? $r : null;
    }

    public static function valor(string $sql, array $p = []): mixed
    {
        $r = self::q($sql, $p)->fetchColumn();
        return $r === false ? null : $r;
    }

    public static function todas(string $sql, array $p = []): array { return self::q($sql, $p)->fetchAll(); }

    public static function ultimoId(): int { return (int) self::pdo()->lastInsertId(); }

    /** Fecha (segundos Unix) -> texto ISO 8601 con la zona del juego, ej. 2026-11-22T10:00:00-05:00 */
    public static function iso(?int $t): ?string { return $t === null ? null : date('c', $t); }

    /** Deja una nota para el administrador (se ve en admin.php). Nunca lleva datos de tarjeta. */
    public static function aviso(string $tipo, string $detalle, ?int $compra = null): void
    {
        try {
            self::q('INSERT INTO avisos (tipo, detalle, compra_id, creado) VALUES (?, ?, ?, ?)', [$tipo, mb_substr($detalle, 0, 3000), $compra, time()]);
        } catch (\Throwable $e) {
            error_log('EN VIVO: no se pudo guardar un aviso (' . $tipo . ')');
        }
    }
}
