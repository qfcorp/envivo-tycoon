<?php
declare(strict_types=1);

namespace EnVivo;

/**
 * Plantillas de los correos del juego (HTML + texto) en los 10 idiomas del juego; si falta un idioma o un texto, español.
 *   recuperar      {nombre, enlace, min}   enlace de un solo uso para elegir una contraseña nueva
 *   clave_cambiada {nombre, fecha}         aviso de que la contraseña cambió (y que se cerraron las otras sesiones)
 * El HTML lleva estilos en línea (los programas de correo no leen hojas de estilo) y funciona sin imágenes.
 */
final class CorreoPlantillas
{
    public const IDIOMAS = ['es', 'en', 'pt-BR', 'fr', 'de', 'it', 'ru', 'tr', 'id', 'zh-CN'];

    private const T = [
        'es' => [
            'r_asunto' => 'Recupera tu contraseña de EN VIVO Tycoon',
            'hola' => 'Hola, {nombre}:',
            'r_texto' => 'Pediste cambiar la contraseña de tu cuenta. Toca el botón para elegir una nueva.',
            'r_boton' => 'Elegir contraseña nueva',
            'r_vence' => 'El enlace sirve una sola vez y vence en {min} minutos.',
            'r_no_fuiste' => 'Si no fuiste tú, ignora este correo: tu contraseña sigue igual.',
            'copiar' => 'Si el botón no funciona, copia este enlace en tu navegador:',
            'c_asunto' => 'Tu contraseña de EN VIVO Tycoon cambió',
            'c_texto' => 'La contraseña de tu cuenta se cambió el {fecha}. Por seguridad cerramos tu sesión en los otros dispositivos.',
            'c_no_fuiste' => 'Si no fuiste tú, escríbenos enseguida respondiendo a este correo o desde «Ayuda y soporte» del juego.',
            'pie' => 'Correo automático de EN VIVO Tycoon.',
            'pie_soporte' => '¿Dudas? Escríbenos a {soporte}.',
        ],
        'en' => [
            'r_asunto' => 'Reset your EN VIVO Tycoon password',
            'hola' => 'Hi {nombre},',
            'r_texto' => 'You asked to change your account password. Tap the button to choose a new one.',
            'r_boton' => 'Choose a new password',
            'r_vence' => 'The link works only once and expires in {min} minutes.',
            'r_no_fuiste' => 'If it wasn\'t you, ignore this email: your password stays the same.',
            'copiar' => 'If the button doesn\'t work, copy this link into your browser:',
            'c_asunto' => 'Your EN VIVO Tycoon password changed',
            'c_texto' => 'Your account password was changed on {fecha}. For your safety we signed you out on your other devices.',
            'c_no_fuiste' => 'If it wasn\'t you, write to us right away by replying to this email or from "Help & support" in the game.',
            'pie' => 'Automatic email from EN VIVO Tycoon.',
            'pie_soporte' => 'Questions? Write to {soporte}.',
        ],
        'pt-BR' => [
            'r_asunto' => 'Recupere sua senha do EN VIVO Tycoon',
            'hola' => 'Olá, {nombre}:',
            'r_texto' => 'Você pediu para trocar a senha da sua conta. Toque no botão para escolher uma nova.',
            'r_boton' => 'Escolher nova senha',
            'r_vence' => 'O link funciona uma só vez e vence em {min} minutos.',
            'r_no_fuiste' => 'Se não foi você, ignore este e-mail: sua senha continua a mesma.',
            'copiar' => 'Se o botão não funcionar, copie este link no navegador:',
            'c_asunto' => 'Sua senha do EN VIVO Tycoon mudou',
            'c_texto' => 'A senha da sua conta foi trocada em {fecha}. Por segurança, encerramos sua sessão nos outros aparelhos.',
            'c_no_fuiste' => 'Se não foi você, escreva para nós agora respondendo a este e-mail ou em "Ajuda e suporte" no jogo.',
            'pie' => 'E-mail automático do EN VIVO Tycoon.',
            'pie_soporte' => 'Dúvidas? Escreva para {soporte}.',
        ],
        'fr' => [
            'r_asunto' => 'Réinitialise ton mot de passe EN VIVO Tycoon',
            'hola' => 'Bonjour {nombre},',
            'r_texto' => 'Tu as demandé à changer le mot de passe de ton compte. Touche le bouton pour en choisir un nouveau.',
            'r_boton' => 'Choisir un nouveau mot de passe',
            'r_vence' => 'Le lien ne marche qu\'une fois et expire dans {min} minutes.',
            'r_no_fuiste' => 'Si ce n\'était pas toi, ignore cet e-mail : ton mot de passe ne change pas.',
            'copiar' => 'Si le bouton ne marche pas, copie ce lien dans ton navigateur :',
            'c_asunto' => 'Ton mot de passe EN VIVO Tycoon a changé',
            'c_texto' => 'Le mot de passe de ton compte a été changé le {fecha}. Par sécurité, nous avons fermé ta session sur tes autres appareils.',
            'c_no_fuiste' => 'Si ce n\'était pas toi, écris-nous tout de suite en répondant à cet e-mail ou depuis « Aide et support » dans le jeu.',
            'pie' => 'E-mail automatique d\'EN VIVO Tycoon.',
            'pie_soporte' => 'Des questions ? Écris à {soporte}.',
        ],
        'de' => [
            'r_asunto' => 'Setze dein EN VIVO Tycoon-Passwort zurück',
            'hola' => 'Hallo {nombre},',
            'r_texto' => 'Du möchtest das Passwort deines Kontos ändern. Tippe auf den Knopf, um ein neues zu wählen.',
            'r_boton' => 'Neues Passwort wählen',
            'r_vence' => 'Der Link funktioniert nur einmal und läuft in {min} Minuten ab.',
            'r_no_fuiste' => 'Warst du das nicht? Dann ignoriere diese E-Mail: dein Passwort bleibt gleich.',
            'copiar' => 'Wenn der Knopf nicht geht, kopiere diesen Link in deinen Browser:',
            'c_asunto' => 'Dein EN VIVO Tycoon-Passwort wurde geändert',
            'c_texto' => 'Das Passwort deines Kontos wurde am {fecha} geändert. Zur Sicherheit haben wir dich auf deinen anderen Geräten abgemeldet.',
            'c_no_fuiste' => 'Warst du das nicht? Schreib uns sofort als Antwort auf diese E-Mail oder über „Hilfe & Support" im Spiel.',
            'pie' => 'Automatische E-Mail von EN VIVO Tycoon.',
            'pie_soporte' => 'Fragen? Schreib an {soporte}.',
        ],
        'it' => [
            'r_asunto' => 'Recupera la password di EN VIVO Tycoon',
            'hola' => 'Ciao {nombre},',
            'r_texto' => 'Hai chiesto di cambiare la password del tuo account. Tocca il pulsante per sceglierne una nuova.',
            'r_boton' => 'Scegli una nuova password',
            'r_vence' => 'Il link funziona una sola volta e scade tra {min} minuti.',
            'r_no_fuiste' => 'Se non sei stato tu, ignora questa e-mail: la tua password resta uguale.',
            'copiar' => 'Se il pulsante non funziona, copia questo link nel browser:',
            'c_asunto' => 'La tua password di EN VIVO Tycoon è cambiata',
            'c_texto' => 'La password del tuo account è stata cambiata il {fecha}. Per sicurezza abbiamo chiuso la sessione sugli altri dispositivi.',
            'c_no_fuiste' => 'Se non sei stato tu, scrivici subito rispondendo a questa e-mail o da "Aiuto e supporto" nel gioco.',
            'pie' => 'E-mail automatica di EN VIVO Tycoon.',
            'pie_soporte' => 'Domande? Scrivi a {soporte}.',
        ],
        'ru' => [
            'r_asunto' => 'Восстановление пароля EN VIVO Tycoon',
            'hola' => 'Привет, {nombre}!',
            'r_texto' => 'Ты попросил сменить пароль от аккаунта. Нажми на кнопку, чтобы выбрать новый.',
            'r_boton' => 'Выбрать новый пароль',
            'r_vence' => 'Ссылка работает один раз и действует {min} минут.',
            'r_no_fuiste' => 'Если это был не ты, просто не обращай внимания на письмо: пароль не изменится.',
            'copiar' => 'Если кнопка не работает, скопируй ссылку в браузер:',
            'c_asunto' => 'Пароль EN VIVO Tycoon изменён',
            'c_texto' => 'Пароль от твоего аккаунта изменён {fecha}. Для безопасности мы завершили сеансы на других устройствах.',
            'c_no_fuiste' => 'Если это был не ты, сразу напиши нам, ответив на это письмо, или через «Помощь и поддержка» в игре.',
            'pie' => 'Автоматическое письмо EN VIVO Tycoon.',
            'pie_soporte' => 'Вопросы? Пиши на {soporte}.',
        ],
        'tr' => [
            'r_asunto' => 'EN VIVO Tycoon şifreni sıfırla',
            'hola' => 'Merhaba {nombre},',
            'r_texto' => 'Hesabının şifresini değiştirmek istedin. Yeni bir şifre seçmek için düğmeye dokun.',
            'r_boton' => 'Yeni şifre seç',
            'r_vence' => 'Bağlantı yalnızca bir kez çalışır ve {min} dakika içinde geçersiz olur.',
            'r_no_fuiste' => 'Bu sen değilsen bu e-postayı yok say: şifren aynı kalır.',
            'copiar' => 'Düğme çalışmazsa bu bağlantıyı tarayıcına kopyala:',
            'c_asunto' => 'EN VIVO Tycoon şifren değişti',
            'c_texto' => 'Hesabının şifresi {fecha} tarihinde değiştirildi. Güvenliğin için diğer cihazlardaki oturumlarını kapattık.',
            'c_no_fuiste' => 'Bu sen değilsen hemen bu e-postayı yanıtlayarak ya da oyundaki "Yardım ve destek" bölümünden bize yaz.',
            'pie' => 'EN VIVO Tycoon otomatik e-postası.',
            'pie_soporte' => 'Soruların mı var? {soporte} adresine yaz.',
        ],
        'id' => [
            'r_asunto' => 'Atur ulang kata sandi EN VIVO Tycoon',
            'hola' => 'Halo {nombre},',
            'r_texto' => 'Kamu meminta untuk mengganti kata sandi akunmu. Ketuk tombol untuk memilih yang baru.',
            'r_boton' => 'Pilih kata sandi baru',
            'r_vence' => 'Tautan hanya bisa dipakai sekali dan berlaku {min} menit.',
            'r_no_fuiste' => 'Kalau bukan kamu, abaikan email ini: kata sandimu tetap sama.',
            'copiar' => 'Kalau tombolnya tidak berfungsi, salin tautan ini ke browser:',
            'c_asunto' => 'Kata sandi EN VIVO Tycoon kamu berubah',
            'c_texto' => 'Kata sandi akunmu diganti pada {fecha}. Demi keamanan, kami mengeluarkanmu dari perangkat lain.',
            'c_no_fuiste' => 'Kalau bukan kamu, segera hubungi kami dengan membalas email ini atau lewat "Bantuan & dukungan" di game.',
            'pie' => 'Email otomatis dari EN VIVO Tycoon.',
            'pie_soporte' => 'Ada pertanyaan? Tulis ke {soporte}.',
        ],
        'zh-CN' => [
            'r_asunto' => '重设你的 EN VIVO Tycoon 密码',
            'hola' => '{nombre}，你好：',
            'r_texto' => '你申请了修改账号密码。点按下面的按钮设置新密码。',
            'r_boton' => '设置新密码',
            'r_vence' => '链接只能使用一次，{min} 分钟后失效。',
            'r_no_fuiste' => '如果不是你本人操作，请忽略这封邮件，你的密码不会改变。',
            'copiar' => '如果按钮无法使用，请把这个链接复制到浏览器：',
            'c_asunto' => '你的 EN VIVO Tycoon 密码已修改',
            'c_texto' => '你的账号密码已于 {fecha} 修改。为了安全，我们已让你在其他设备上退出登录。',
            'c_no_fuiste' => '如果不是你本人操作，请立即回复这封邮件，或在游戏的“帮助与支持”中联系我们。',
            'pie' => 'EN VIVO Tycoon 自动邮件。',
            'pie_soporte' => '有疑问？请写信到 {soporte}。',
        ],
    ];

    /** 'pt' -> 'pt-BR', 'zh' -> 'zh-CN', 'en-US' -> 'en'... Lo que no se reconoce: español. */
    public static function idioma(?string $i): string
    {
        $i = strtolower(trim((string) $i));
        if ($i === '') return 'es';
        foreach (self::IDIOMAS as $c) if ($i === strtolower($c)) return $c;
        $base = substr($i, 0, 2);
        return match ($base) { 'pt' => 'pt-BR', 'zh' => 'zh-CN', 'en', 'fr', 'de', 'it', 'ru', 'tr', 'id', 'es' => $base, default => 'es' };
    }

    /** Idioma del encabezado Accept-Language (el primero que el juego tenga). */
    public static function idiomaDeCabecera(string $al): string
    {
        foreach (explode(',', $al) as $p) {
            $c = trim(explode(';', $p)[0]);
            if ($c === '' || $c === '*') continue;
            $i = self::idioma($c);
            if ($i !== 'es' || str_starts_with(strtolower($c), 'es')) return $i;
        }
        return 'es';
    }

    private static function t(string $idioma, string $k, array $d = []): string
    {
        $t = self::T[$idioma][$k] ?? self::T['es'][$k] ?? $k;
        return preg_replace_callback('/\{(\w+)\}/', fn($m) => array_key_exists($m[1], $d) ? (string) $d[$m[1]] : $m[0], $t) ?? $t;
    }

    /** @return array{asunto:string, html:string, texto:string} */
    public static function armar(string $cual, string $idioma, array $d): array
    {
        $L = self::idioma($idioma);
        $soporte = Config::get('SOPORTE_CORREO');
        $pie = self::t($L, 'pie') . ($soporte !== '' ? ' ' . self::t($L, 'pie_soporte', ['soporte' => $soporte]) : '');
        $nombre = trim((string) ($d['nombre'] ?? '')) ?: 'productor';
        $hola = self::t($L, 'hola', ['nombre' => $nombre]);
        if ($cual === 'recuperar') {
            $min = (int) ($d['min'] ?? 30);
            $enlace = (string) $d['enlace'];
            $asunto = self::t($L, 'r_asunto');
            $parrafos = [self::t($L, 'r_texto')];
            $despues = [self::t($L, 'r_vence', ['min' => $min]), self::t($L, 'r_no_fuiste')];
            $texto = $hola . "\n\n" . $parrafos[0] . "\n\n" . $enlace . "\n\n" . implode("\n", $despues) . "\n\n-- \n" . $pie . "\n";
            $html = self::html($L, $asunto, $hola, $parrafos, ['texto' => self::t($L, 'r_boton'), 'enlace' => $enlace], $despues, $pie);
            return ['asunto' => $asunto, 'html' => $html, 'texto' => $texto];
        }
        if ($cual === 'clave_cambiada') {
            $asunto = self::t($L, 'c_asunto');
            $parrafos = [self::t($L, 'c_texto', ['fecha' => (string) ($d['fecha'] ?? date('Y-m-d H:i'))]), self::t($L, 'c_no_fuiste')];
            $texto = $hola . "\n\n" . implode("\n\n", $parrafos) . "\n\n-- \n" . $pie . "\n";
            return ['asunto' => $asunto, 'html' => self::html($L, $asunto, $hola, $parrafos, null, [], $pie), 'texto' => $texto];
        }
        throw new \InvalidArgumentException('Plantilla de correo desconocida: ' . $cual);
    }

    private static function html(string $L, string $titulo, string $hola, array $parrafos, ?array $boton, array $despues, string $pie): string
    {
        $e = fn(string $t) => htmlspecialchars($t, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
        $p = fn(string $t, string $estilo = '') => '<p style="margin:0 0 14px;font-size:15px;line-height:1.5;color:#e9edf5;' . $estilo . '">' . $e($t) . '</p>';
        $cuerpo = $p($hola) . implode('', array_map(fn($t) => $p($t), $parrafos));
        if ($boton) {
            $cuerpo .= '<table role="presentation" cellpadding="0" cellspacing="0" style="margin:6px 0 18px"><tr><td style="border-radius:12px;background:#ff3b3b">'
                . '<a href="' . $e($boton['enlace']) . '" style="display:inline-block;padding:13px 22px;font-size:16px;font-weight:700;color:#ffffff;text-decoration:none;border-radius:12px">'
                . $e($boton['texto']) . '</a></td></tr></table>';
        }
        foreach ($despues as $t) $cuerpo .= $p($t, 'color:#9aa3b5;font-size:14px;');
        if ($boton) {
            $cuerpo .= $p(self::t($L, 'copiar'), 'color:#9aa3b5;font-size:13px;margin-bottom:4px;')
                . '<p style="margin:0 0 14px;font-size:13px;word-break:break-all"><a href="' . $e($boton['enlace']) . '" style="color:#ffb020">' . $e($boton['enlace']) . '</a></p>';
        }
        return '<!doctype html><html lang="' . $e($L) . '"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">'
            . '<meta name="color-scheme" content="dark light"><title>' . $e($titulo) . '</title></head>'
            . '<body style="margin:0;padding:0;background:#0d0f14;font-family:system-ui,-apple-system,Segoe UI,Roboto,Arial,sans-serif">'
            . '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#0d0f14"><tr><td align="center" style="padding:20px 12px">'
            . '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#161a22;border:1px solid #2a3142;border-radius:16px">'
            . '<tr><td style="padding:18px 20px 6px;font-weight:800;letter-spacing:.04em;font-size:17px;color:#ff3b3b">EN VIVO <span style="color:#ffb020">Tycoon</span></td></tr>'
            . '<tr><td style="padding:8px 20px 6px">' . $cuerpo . '</td></tr>'
            . '<tr><td style="padding:12px 20px 18px;border-top:1px solid #2a3142;font-size:12px;line-height:1.5;color:#9aa3b5">' . $e($pie) . '</td></tr>'
            . '</table></td></tr></table></body></html>';
    }
}
