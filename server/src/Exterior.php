<?php
declare(strict_types=1);

namespace EnVivo;

/** Regla de ventas al exterior: sin IVA en ningún producto. Copia de qfcorp/tufactura src/Exterior.php (misma lógica). */
final class Exterior
{
    /** Países que, escritos en la dirección o la ciudad, indican un cliente del exterior (sin tildes, en minúsculas). */
    public const PAISES_EXTERIOR = ['afganistan', 'alemania', 'andorra', 'angola', 'arabia saudita', 'argelia', 'argentina', 'armenia', 'aruba', 'australia', 'austria', 'azerbaiyan', 'bahamas', 'banglades', 'barbados', 'belgica', 'belice', 'bolivia', 'bosnia', 'brasil', 'bulgaria', 'canada', 'chile', 'china', 'chipre', 'colombia', 'corea', 'costa rica', 'croacia', 'cuba', 'curazao', 'dinamarca', 'egipto', 'el salvador', 'emiratos arabes', 'escocia', 'eslovaquia', 'eslovenia', 'espana', 'estados unidos', 'estonia', 'filipinas', 'finlandia', 'francia', 'grecia', 'guatemala', 'guyana', 'haiti', 'holanda', 'paises bajos', 'honduras', 'hungria', 'india', 'indonesia', 'inglaterra', 'irlanda', 'islandia', 'israel', 'italia', 'jamaica', 'japon', 'jordania', 'kenia', 'letonia', 'libano', 'lituania', 'luxemburgo', 'marruecos', 'mexico', 'nicaragua', 'nigeria', 'noruega', 'nueva zelanda', 'panama', 'paraguay', 'peru', 'polonia', 'portugal', 'puerto rico', 'reino unido', 'republica checa', 'republica dominicana', 'rumania', 'rusia', 'senegal', 'serbia', 'singapur', 'sudafrica', 'suecia', 'suiza', 'tailandia', 'trinidad', 'turquia', 'ucrania', 'uruguay', 'venezuela', 'vietnam', 'eeuu', 'ee uu', 'usa', 'uk'];

    /**
     * ¿Es una venta al exterior? (27 nov 2026, pedido de Dimitry: «cuando en el campo dirección, ciudad o país no es Ecuador no se debe cargar IVA en ningún producto»;
     * y la misma noche: «una cédula o RUC ecuatoriano válido PREVALECE: se factura con IVA aunque el país o la dirección digan otro país»).
     * Orden de decisión (el primero que aplica manda):
     *  1) Identificación ecuatoriana válida (cédula o RUC) => Ecuador, CON IVA.
     *  2) País explícito: distinto de Ecuador (EC, ECU, Ecuador) => exterior; Ecuador => con IVA.
     *  3) Ciudad y dirección: si dicen «Ecuador» => con IVA; si nombran un país extranjero => exterior.
     *  4) Tipo de identificación «08» (identificación del exterior) => exterior.
     * Sin datos: con IVA, como siempre.
     * @param array $cliente identificacion, tipo_id, pais, ciudad, direccion (todos opcionales)
     */
    public static function esExterior(array $cliente): bool
    {
        if (self::identificacionEcuatoriana((string) ($cliente['identificacion'] ?? ''))) return false;
        $n = fn(string $t): string => trim((string) preg_replace('/\s+/', ' ', preg_replace('/[^a-z0-9]+/', ' ', strtr(mb_strtolower($t), ['á' => 'a', 'é' => 'e', 'í' => 'i', 'ó' => 'o', 'ú' => 'u', 'ü' => 'u', 'ñ' => 'n']))));
        $pais = $n((string) ($cliente['pais'] ?? ''));
        if ($pais !== '') return !in_array($pais, ['ec', 'ecu', 'ecuador', 'republica del ecuador'], true);
        $texto = ' ' . $n(((string) ($cliente['ciudad'] ?? '')) . ' ' . ((string) ($cliente['direccion'] ?? ''))) . ' ';
        if (str_contains($texto, ' ecuador ')) return false;
        foreach (self::PAISES_EXTERIOR as $p) if (str_contains($texto, ' ' . $p . ' ')) return true;
        return (string) ($cliente['tipo_id'] ?? '') === '08';
    }

    /**
     * ¿Es una cédula o un RUC de Ecuador con sus dígitos verificadores correctos?
     *  - Cédula: 10 dígitos, provincia 01-24 o 30, tercer dígito 0-5, módulo 10.
     *  - RUC: 13 dígitos terminados en 001 y provincia 01-24 o 30. Persona natural (tercer dígito 0-5): los 10 primeros son una cédula válida (módulo 10).
     *    Sociedad privada (tercer dígito 9): módulo 11 con pesos 4,3,2,7,6,5,4,3,2 (verificador = dígito 10).
     *    Entidad pública (tercer dígito 6): módulo 11 con pesos 3,2,7,6,5,4,3,2 (verificador = dígito 9).
     * Se ignoran espacios y guiones. Pasaportes y números del exterior no pasan.
     */
    public static function identificacionEcuatoriana(string $id): bool
    {
        $id = preg_replace('/[\s.-]+/', '', trim($id)) ?? '';
        if (preg_match('/^\d{10}$/', $id)) return self::cedulaEcuatoriana($id);
        if (!preg_match('/^\d{13}$/', $id) || substr($id, 10) !== '001') return false;
        $prov = (int) substr($id, 0, 2);
        if (($prov < 1 || $prov > 24) && $prov !== 30) return false;
        $d3 = (int) $id[2];
        if ($d3 <= 5) return self::cedulaEcuatoriana(substr($id, 0, 10));
        if ($d3 === 9) { $pesos = [4, 3, 2, 7, 6, 5, 4, 3, 2]; $verif = (int) $id[9]; }
        elseif ($d3 === 6) { $pesos = [3, 2, 7, 6, 5, 4, 3, 2]; $verif = (int) $id[8]; }
        else return false;
        $s = 0;
        foreach ($pesos as $i => $p) $s += (int) $id[$i] * $p;
        $r = $s % 11;
        return ($r === 0 ? 0 : 11 - $r) === $verif;
    }

    private static function cedulaEcuatoriana(string $c): bool
    {
        $prov = (int) substr($c, 0, 2);
        if (($prov < 1 || $prov > 24) && $prov !== 30) return false;
        if ((int) $c[2] > 5) return false;
        $s = 0;
        for ($i = 0; $i < 9; $i++) { $v = (int) $c[$i] * ($i % 2 === 0 ? 2 : 1); $s += $v > 9 ? $v - 9 : $v; }
        return (10 - $s % 10) % 10 === (int) $c[9];
    }

}
