<?php
declare(strict_types=1);

namespace EnVivo;

/**
 * GENERADO por server/bin/catalogo_juego.php desde js/datos.js: NO editar a mano (correr ese script si cambia datos.js).
 * Lo usan Festival y Liga para revisar roles, equipos y tipos de evento que manda el juego.
 */
final class CatalogoJuego
{
    /** Los roles del juego (claves nuevas). */
    public const ROLES = array (
  0 => 'director',
  1 => 'productor',
  2 => 'camarografo',
  3 => 'operador_ptz',
  4 => 'cablero',
  5 => 'sonidista',
  6 => 'microfonista',
  7 => 'operador_repeticion',
  8 => 'operador_graficos',
  9 => 'shader',
  10 => 'tecnico_transmision',
  11 => 'piloto_dron',
  12 => 'coordinador_piso',
  13 => 'runner',
);

    /** Claves viejas de rol -> nuevas (el juego todavía las acepta). */
    public const ROL_ALIAS = array (
  'cam' => 'camarografo',
  'dir' => 'director',
  'audio' => 'sonidista',
  'stream' => 'tecnico_transmision',
);

    /** Equipos que se compran con dinero del juego: clave => [cat, fama (mínima), nombre, precio, creditos (combo con créditos; 0 = no)]. */
    public const EQUIPOS = array (
  'cam_basic' => 
  array (
    'cat' => 'cam',
    'fama' => 0,
    'nombre' => 'Zony Handicam FDX-AX44',
    'precio' => 750,
    'creditos' => 110,
  ),
  'cam_pro' => 
  array (
    'cat' => 'cam',
    'fama' => 4,
    'nombre' => 'Kanon XA65',
    'precio' => 1300,
    'creditos' => 150,
  ),
  'cam_panasonika_aw_uv22' => 
  array (
    'cat' => 'cam',
    'fama' => 4,
    'nombre' => 'Panasonika AW-UV22',
    'precio' => 1250,
    'creditos' => 150,
  ),
  'cam_blackmagia_estudio_4k_g3' => 
  array (
    'cat' => 'cam',
    'fama' => 4,
    'nombre' => 'Blackmagia Estudio Cam 4K Plus G3',
    'precio' => 1100,
    'creditos' => 140,
  ),
  'cam_cine' => 
  array (
    'cat' => 'cam',
    'fama' => 12,
    'nombre' => 'Kanon XF615',
    'precio' => 2550,
    'creditos' => 210,
  ),
  'cam_jvk_gy_hk560' => 
  array (
    'cat' => 'cam',
    'fama' => 12,
    'nombre' => 'JVK GY-HK560 Conectada',
    'precio' => 2800,
    'creditos' => 220,
  ),
  'cam_zony_fz6_cine' => 
  array (
    'cat' => 'cam',
    'fama' => 12,
    'nombre' => 'Zony FZ6 Cine',
    'precio' => 3150,
    'creditos' => 230,
  ),
  'cam_zony_hxr_mk2500' => 
  array (
    'cat' => 'cam',
    'fama' => 0,
    'nombre' => 'Zony HXR-MK2500 (de hombro)',
    'precio' => 1150,
    'creditos' => 140,
  ),
  'cam_blackmagia_urso_broadcast_g3' => 
  array (
    'cat' => 'cam',
    'fama' => 12,
    'nombre' => 'Blackmagia URSO Broadcast G3',
    'precio' => 2450,
    'creditos' => 200,
  ),
  'cam_panasonika_aw_uv170' => 
  array (
    'cat' => 'cam',
    'fama' => 28,
    'nombre' => 'Panasonika AW-UV170',
    'precio' => 5450,
    'creditos' => 300,
  ),
  'cam_zony_pxv_z760' => 
  array (
    'cat' => 'cam',
    'fama' => 28,
    'nombre' => 'Zony PXV-Z760',
    'precio' => 12500,
    'creditos' => 450,
  ),
  'cam_zony_hdk_3200' => 
  array (
    'cat' => 'cam',
    'fama' => 45,
    'nombre' => 'Zony HDK-3200 (cadena con CCU)',
    'precio' => 13000,
    'creditos' => 460,
  ),
  'cam_zony_hdk_3600' => 
  array (
    'cat' => 'cam',
    'fama' => 65,
    'nombre' => 'Zony HDK-3600 4K HDR (cadena con CCU)',
    'precio' => 25500,
    'creditos' => 640,
  ),
  'cam_zony_hdk_5600_hfr' => 
  array (
    'cat' => 'cam',
    'fama' => 65,
    'nombre' => 'Zony HDK-5600 Ultra Lenta (HFR)',
    'precio' => 40000,
    'creditos' => 800,
  ),
  'cam_fantomas_vio4k' => 
  array (
    'cat' => 'cam',
    'fama' => 45,
    'nombre' => 'Fantomas VIO 4K Ultra Movimiento',
    'precio' => 9900,
    'creditos' => 400,
  ),
  'cam_marchall_cv513_pov' => 
  array (
    'cat' => 'cam',
    'fama' => 4,
    'nombre' => 'Marchall CV513 Minicámara POV',
    'precio' => 610,
    'creditos' => 100,
  ),
  'cam_gopra_heroe13' => 
  array (
    'cat' => 'cam',
    'fama' => 0,
    'nombre' => 'GoPra HÉROE 13',
    'precio' => 370,
    'creditos' => 80,
  ),
  'cam_dgi_osmo_bolsillo_3' => 
  array (
    'cat' => 'cam',
    'fama' => 4,
    'nombre' => 'DGI Ozmo Bolsillo 3',
    'precio' => 490,
    'creditos' => 90,
  ),
  'cam_celular_gimbal' => 
  array (
    'cat' => 'cam',
    'fama' => 0,
    'nombre' => 'Celular gama alta + gimbal DGI Ozmo Móvil 8',
    'precio' => 900,
    'creditos' => 120,
  ),
  'dron_dgi_micro_4_pro' => 
  array (
    'cat' => 'cam',
    'fama' => 12,
    'nombre' => 'DGI Micro 4 Pro (dron)',
    'precio' => 740,
    'creditos' => 110,
  ),
  'lente_kit_mft' => 
  array (
    'cat' => 'lens',
    'fama' => 0,
    'nombre' => 'Lente kit 14-140 (montura MFT)',
    'precio' => 530,
    'creditos' => 100,
  ),
  'lente_zony_gm_24_75' => 
  array (
    'cat' => 'lens',
    'fama' => 4,
    'nombre' => 'Zony Gran Maestro 24-75 II',
    'precio' => 1450,
    'creditos' => 160,
  ),
  'lente_kanon_kx21x8_2' => 
  array (
    'cat' => 'lens',
    'fama' => 12,
    'nombre' => 'Kanon KX21x8.2 IRSD (ENG HD 20x)',
    'precio' => 3650,
    'creditos' => 250,
  ),
  'lente_kanon_cx25ex7_5' => 
  array (
    'cat' => 'lens',
    'fama' => 45,
    'nombre' => 'Kanon CX25ex7.5 (ENG 4K 24x)',
    'precio' => 7800,
    'creditos' => 360,
  ),
  'lente_box_fujinox_xa23x7' => 
  array (
    'cat' => 'lens',
    'fama' => 28,
    'nombre' => 'Fujinox XA23x7 Box de estudio',
    'precio' => 4500,
    'creditos' => 270,
  ),
  'lente_box_kanon_digisupra_88' => 
  array (
    'cat' => 'lens',
    'fama' => 45,
    'nombre' => 'Kanon DIGISUPRA 88 (box 86x)',
    'precio' => 18000,
    'creditos' => 540,
  ),
  'lente_box_fujinox_ux108x' => 
  array (
    'cat' => 'lens',
    'fama' => 65,
    'nombre' => 'Fujinox UX108x8.4 (box 4K 107x)',
    'precio' => 27000,
    'creditos' => 660,
  ),
  'lente_box_kanon_uhd_digisupra_125' => 
  array (
    'cat' => 'lens',
    'fama' => 65,
    'nombre' => 'Kanon UHD-DIGISUPRA 125 AF (box 4K 122x)',
    'precio' => 44500,
    'creditos' => 850,
  ),
  'adaptador_lente_box' => 
  array (
    'cat' => 'lens',
    'fama' => 28,
    'nombre' => 'Adaptador de lente grande para cámara de sistema',
    'precio' => 4650,
    'creditos' => 280,
  ),
  'sop_tripode_basico' => 
  array (
    'cat' => 'support',
    'fama' => 0,
    'nombre' => 'Trípode de video básico Manfrotti Compacto',
    'precio' => 160,
    'creditos' => 60,
  ),
  'sop_manfrotti_504x' => 
  array (
    'cat' => 'support',
    'fama' => 4,
    'nombre' => 'Manfrotti 504X con patas gemelas',
    'precio' => 770,
    'creditos' => 120,
  ),
  'sop_vinter_vector_760' => 
  array (
    'cat' => 'support',
    'fama' => 45,
    'nombre' => 'Vinter Vector 760 + trípode pesado',
    'precio' => 10000,
    'creditos' => 400,
  ),
  'sop_gimbal_dgi_rz4_pro' => 
  array (
    'cat' => 'support',
    'fama' => 4,
    'nombre' => 'DGI RZ 4 Pro (gimbal)',
    'precio' => 750,
    'creditos' => 110,
  ),
  'sop_steadikam_aereo_32' => 
  array (
    'cat' => 'support',
    'fama' => 28,
    'nombre' => 'Estabilio Aéreo 32 (chaleco y brazo)',
    'precio' => 3300,
    'creditos' => 230,
  ),
  'sop_jib_proeme_4m' => 
  array (
    'cat' => 'support',
    'fama' => 12,
    'nombre' => 'Jib Proeme 4 m',
    'precio' => 1350,
    'creditos' => 150,
  ),
  'sop_dolly_riel_6m' => 
  array (
    'cat' => 'support',
    'fama' => 12,
    'nombre' => 'Dolly con riel de 6 m',
    'precio' => 1500,
    'creditos' => 160,
  ),
  'switch_basic' => 
  array (
    'cat' => 'switcher',
    'fama' => 0,
    'nombre' => 'Laptop con vMax Básico HD',
    'precio' => 800,
    'creditos' => 120,
  ),
  'sw_blackmagia_atom_mini_pro' => 
  array (
    'cat' => 'switcher',
    'fama' => 0,
    'nombre' => 'Blackmagia ATOM Mini Pro',
    'precio' => 300,
    'creditos' => 70,
  ),
  'sw_blackmagia_atom_mini_extremo_iso_g3' => 
  array (
    'cat' => 'switcher',
    'fama' => 4,
    'nombre' => 'Blackmagia ATOM Mini Extremo ISO G3',
    'precio' => 1500,
    'creditos' => 160,
  ),
  'sw_vmax_pro_pc' => 
  array (
    'cat' => 'switcher',
    'fama' => 12,
    'nombre' => 'Estación vMax Pro (con repetición)',
    'precio' => 2550,
    'creditos' => 210,
  ),
  'sw_blackmagia_atom_tv_estudio_hd9_iso' => 
  array (
    'cat' => 'switcher',
    'fama' => 12,
    'nombre' => 'Blackmagia ATOM TV Estudio HD9 ISO',
    'precio' => 2350,
    'creditos' => 200,
  ),
  'switch_pro' => 
  array (
    'cat' => 'switcher',
    'fama' => 28,
    'nombre' => 'Blackmagia ATOM 2 M/E Constelación 4K + panel',
    'precio' => 3600,
    'creditos' => 240,
  ),
  'sw_rosco_carbonita_ultra' => 
  array (
    'cat' => 'switcher',
    'fama' => 45,
    'nombre' => 'Rozz Carbonita Ultra + panel',
    'precio' => 7650,
    'creditos' => 350,
  ),
  'sw_glass_valley_kayena' => 
  array (
    'cat' => 'switcher',
    'fama' => 75,
    'nombre' => 'Glass Valley Kayena K-Marco (4 M/E)',
    'precio' => 52000,
    'creditos' => 920,
  ),
  'rep_vmax_repeticion' => 
  array (
    'cat' => 'replay',
    'fama' => 12,
    'nombre' => 'PC de repetición vMax Pro dedicada',
    'precio' => 2400,
    'creditos' => 200,
  ),
  'rep_trikaster_3jugadas' => 
  array (
    'cat' => 'replay',
    'fama' => 28,
    'nombre' => 'TriKaster 3Jugadas',
    'precio' => 8500,
    'creditos' => 370,
  ),
  'rep_evx_xt_nano' => 
  array (
    'cat' => 'replay',
    'fama' => 45,
    'nombre' => 'EVX XT-Nano',
    'precio' => 26500,
    'creditos' => 660,
  ),
  'rep_evx_xt_via' => 
  array (
    'cat' => 'replay',
    'fama' => 65,
    'nombre' => 'EVX XT-VIA 4K (servidor top)',
    'precio' => 43000,
    'creditos' => 830,
  ),
  'gfx_kasparcg_pc' => 
  array (
    'cat' => 'graphics',
    'fama' => 4,
    'nombre' => 'KasparCG (gráficos libres) + PC',
    'precio' => 1250,
    'creditos' => 150,
  ),
  'gfx_rosco_xpresion_go' => 
  array (
    'cat' => 'graphics',
    'fama' => 28,
    'nombre' => 'Rozz XPresión Estudio Go',
    'precio' => 6600,
    'creditos' => 330,
  ),
  'gfx_vizart_ar' => 
  array (
    'cat' => 'graphics',
    'fama' => 75,
    'nombre' => 'Vizart Motor 3D + realidad aumentada',
    'precio' => 23500,
    'creditos' => 620,
  ),
  'mon_blackmagia_multivista_16' => 
  array (
    'cat' => 'monitor',
    'fama' => 12,
    'nombre' => 'Blackmagia MultiVista 16',
    'precio' => 770,
    'creditos' => 120,
  ),
  'mon_referencia_shader' => 
  array (
    'cat' => 'monitor',
    'fama' => 45,
    'nombre' => 'Monitor de referencia broadcast 17" (shader)',
    'precio' => 2550,
    'creditos' => 210,
  ),
  'audio_basic' => 
  array (
    'cat' => 'audio',
    'fama' => 0,
    'nombre' => 'Yamaka MG10XV',
    'precio' => 270,
    'creditos' => 70,
  ),
  'audio_pro' => 
  array (
    'cat' => 'audio',
    'fama' => 4,
    'nombre' => 'Mydas MR19 (digital 18 canales)',
    'precio' => 630,
    'creditos' => 110,
  ),
  'au_behringa_x33_rack' => 
  array (
    'cat' => 'audio',
    'fama' => 12,
    'nombre' => 'Behringa X33 Rack (40 canales)',
    'precio' => 690,
    'creditos' => 110,
  ),
  'au_mydas_m33_live' => 
  array (
    'cat' => 'audio',
    'fama' => 28,
    'nombre' => 'Mydas M33 Live (40 canales)',
    'precio' => 1900,
    'creditos' => 180,
  ),
  'au_yamaka_kl5' => 
  array (
    'cat' => 'audio',
    'fama' => 45,
    'nombre' => 'Yamaka KL5 (72 canales)',
    'precio' => 7000,
    'creditos' => 340,
  ),
  'au_kalrek_brio_37' => 
  array (
    'cat' => 'audio',
    'fama' => 65,
    'nombre' => 'Kalrek Brío 37 (broadcast)',
    'precio' => 12500,
    'creditos' => 450,
  ),
  'mic_shur_sm59' => 
  array (
    'cat' => 'mics',
    'fama' => 0,
    'nombre' => 'Shur SM59 de mano (con cable)',
    'precio' => 100,
    'creditos' => 40,
  ),
  'mics' => 
  array (
    'cat' => 'mics',
    'fama' => 0,
    'nombre' => 'Inalámbrico de mano doble Behringa ULM',
    'precio' => 210,
    'creditos' => 60,
  ),
  'mic_shur_slxd25_doble' => 
  array (
    'cat' => 'mics',
    'fama' => 12,
    'nombre' => 'Shur SLXD25D doble inalámbrico',
    'precio' => 1050,
    'creditos' => 130,
  ),
  'mic_sennhauser_ewdz_corbatero' => 
  array (
    'cat' => 'mics',
    'fama' => 12,
    'nombre' => 'Sennhauser EW-DZ ME3 corbatero',
    'precio' => 620,
    'creditos' => 100,
  ),
  'mic_roade_ntg6_boom' => 
  array (
    'cat' => 'mics',
    'fama' => 12,
    'nombre' => 'Roade NTG6 (shotgun para boom)',
    'precio' => 480,
    'creditos' => 90,
  ),
  'mic_sennhauser_hmd27' => 
  array (
    'cat' => 'mics',
    'fama' => 12,
    'nombre' => 'Sennhauser HMD 27 diadema de comentarista',
    'precio' => 480,
    'creditos' => 90,
  ),
  'mic_dgi_mike_2' => 
  array (
    'cat' => 'mics',
    'fama' => 4,
    'nombre' => 'DGI Mike 2 (solapa inalámbrico)',
    'precio' => 200,
    'creditos' => 60,
  ),
  'ic_hollyband_solidkom_c2' => 
  array (
    'cat' => 'intercom',
    'fama' => 12,
    'nombre' => 'Hollyband Solidkom C2 Pro (8 diademas)',
    'precio' => 1900,
    'creditos' => 180,
  ),
  'ic_clearkom_freehabla_3' => 
  array (
    'cat' => 'intercom',
    'fama' => 45,
    'nombre' => 'ClearKom FreeHabla III (10 petacas)',
    'precio' => 9500,
    'creditos' => 390,
  ),
  'encoder' => 
  array (
    'cat' => 'encoder',
    'fama' => 0,
    'nombre' => 'Blackmagia Web Presentador 4K',
    'precio' => 490,
    'creditos' => 90,
  ),
  'enc_kilovista_p3' => 
  array (
    'cat' => 'encoder',
    'fama' => 4,
    'nombre' => 'Kilovista P3 (bonding 4 módems)',
    'precio' => 1350,
    'creditos' => 150,
  ),
  'enc_liveyou_solo_pro' => 
  array (
    'cat' => 'encoder',
    'fama' => 12,
    'nombre' => 'LiveYou Solo PRO (bonding)',
    'precio' => 1700,
    'creditos' => 170,
  ),
  'enc_liveyou_lu900' => 
  array (
    'cat' => 'encoder',
    'fama' => 45,
    'nombre' => 'LiveYou LU900 (8 módems, 4 cámaras)',
    'precio' => 7600,
    'creditos' => 350,
  ),
  'router4g' => 
  array (
    'cat' => 'internet',
    'fama' => 0,
    'nombre' => 'Hotspot 5G NetGir M7',
    'precio' => 250,
    'creditos' => 70,
  ),
  'tx_hollyband_marte_4k' => 
  array (
    'cat' => 'wireless',
    'fama' => 4,
    'nombre' => 'Hollyband Marte 4K (video inalámbrico)',
    'precio' => 350,
    'creditos' => 80,
  ),
  'tx_terradek_rayo_6' => 
  array (
    'cat' => 'wireless',
    'fama' => 28,
    'nombre' => 'Terradek Rayo 6 LT 750',
    'precio' => 1900,
    'creditos' => 180,
  ),
  'fib_conversor_sdi_fibra' => 
  array (
    'cat' => 'cable',
    'fama' => 12,
    'nombre' => 'Par de conversores SDI-fibra',
    'precio' => 300,
    'creditos' => 70,
  ),
  'fib_cable_smpte_100m' => 
  array (
    'cat' => 'cable',
    'fama' => 28,
    'nombre' => 'Cable híbrido de fibra SMPTE 100 m',
    'precio' => 1100,
    'creditos' => 140,
  ),
  'ups' => 
  array (
    'cat' => 'power',
    'fama' => 4,
    'nombre' => 'APZ VoltGuard 1500 VA',
    'precio' => 690,
    'creditos' => 110,
  ),
  'pw_jonda_eu2300i' => 
  array (
    'cat' => 'power',
    'fama' => 4,
    'nombre' => 'Jonda EU2300i (generador inverter 2,2 kW)',
    'precio' => 910,
    'creditos' => 130,
  ),
  'raincover' => 
  array (
    'cat' => 'rain',
    'fama' => 0,
    'nombre' => 'Cobertor de lluvia básico',
    'precio' => 50,
    'creditos' => 30,
  ),
  'rain_cobertor_broadcast' => 
  array (
    'cat' => 'rain',
    'fama' => 12,
    'nombre' => 'Cobertor broadcast para cámara y lente box',
    'precio' => 450,
    'creditos' => 90,
  ),
  'case_maletas_pelikano' => 
  array (
    'cat' => 'case',
    'fama' => 4,
    'nombre' => 'Juego de maletas rígidas Pelikano',
    'precio' => 570,
    'creditos' => 100,
  ),
  'veh_sedan_usado' => 
  array (
    'cat' => 'vehicle',
    'fama' => 2,
    'nombre' => 'Sedán usado (2009)',
    'precio' => 2400,
    'creditos' => 200,
  ),
  'veh_camioneta_carga' => 
  array (
    'cat' => 'vehicle',
    'fama' => 4,
    'nombre' => 'Camioneta de carga usada',
    'precio' => 5300,
    'creditos' => 300,
  ),
  'veh_van_pasajeros_usada' => 
  array (
    'cat' => 'vehicle',
    'fama' => 12,
    'nombre' => 'Van de 12 pasajeros (usada)',
    'precio' => 7300,
    'creditos' => 350,
  ),
  'veh_furgon_carga' => 
  array (
    'cat' => 'vehicle',
    'fama' => 20,
    'nombre' => 'Furgón de carga (nuevo)',
    'precio' => 9400,
    'creditos' => 390,
  ),
  'veh_sprinto_ob_usada' => 
  array (
    'cat' => 'vehicle',
    'fama' => 12,
    'nombre' => 'Furgoneta Sprinto de producción (usada)',
    'precio' => 7950,
    'creditos' => 360,
  ),
  'veh_trailer_ob_hd12' => 
  array (
    'cat' => 'vehicle',
    'fama' => 45,
    'nombre' => 'Tráiler OB HD 12 cámaras (usado)',
    'precio' => 61000,
    'creditos' => 990,
  ),
  'veh_trailer_ob_uhd20' => 
  array (
    'cat' => 'vehicle',
    'fama' => 85,
    'nombre' => 'Tráiler OB UHD 20 cámaras 4K',
    'precio' => 390000,
    'creditos' => 2500,
  ),
  'srv_aranacam' => 
  array (
    'cat' => 'service',
    'fama' => 65,
    'nombre' => 'Arañacam (cámara aérea por cables) - servicio',
    'precio' => 3650,
    'creditos' => 0,
  ),
  'srv_cablecam_riel' => 
  array (
    'cat' => 'service',
    'fama' => 28,
    'nombre' => 'Cámara en riel / cablecam lineal - servicio',
    'precio' => 570,
    'creditos' => 0,
  ),
  'srv_grua_telescopica' => 
  array (
    'cat' => 'service',
    'fama' => 28,
    'nombre' => 'Grúa de 12 m con operador - servicio',
    'precio' => 340,
    'creditos' => 0,
  ),
  'srv_unidad_movil_4cam' => 
  array (
    'cat' => 'service',
    'fama' => 28,
    'nombre' => 'Alquiler de unidad móvil (hasta 4 cámaras)',
    'precio' => 1400,
    'creditos' => 0,
  ),
  'srv_sng_satelital' => 
  array (
    'cat' => 'service',
    'fama' => 45,
    'nombre' => 'Enlace satelital SNG - servicio',
    'precio' => 650,
    'creditos' => 0,
  ),
  'ex_lente_box' => 
  array (
    'cat' => 'lens',
    'fama' => 75,
    'nombre' => 'Fujinox UX125x Oro (box 4K 125x) Edición Exclusiva',
    'precio' => 66500,
    'creditos' => 0,
  ),
  'ex_soporte' => 
  array (
    'cat' => 'support',
    'fama' => 55,
    'nombre' => 'Vinter Vector 950 Oro + trípode de carbono Edición Exclusiva',
    'precio' => 15000,
    'creditos' => 0,
  ),
  'ex_repeticion' => 
  array (
    'cat' => 'replay',
    'fama' => 75,
    'nombre' => 'EVX XT-VIA Oro (servidor 4K) Edición Exclusiva',
    'precio' => 64500,
    'creditos' => 0,
  ),
  'ex_graficos' => 
  array (
    'cat' => 'graphics',
    'fama' => 85,
    'nombre' => 'Vizart Motor 3D AR Oro Edición Exclusiva',
    'precio' => 35000,
    'creditos' => 0,
  ),
  'ex_monitor' => 
  array (
    'cat' => 'monitor',
    'fama' => 55,
    'nombre' => 'Monitor OLED de referencia 24" Oro Edición Exclusiva',
    'precio' => 3800,
    'creditos' => 0,
  ),
  'ex_audio' => 
  array (
    'cat' => 'audio',
    'fama' => 75,
    'nombre' => 'Kalrek Brío 48 Oro (broadcast) Edición Exclusiva',
    'precio' => 18500,
    'creditos' => 0,
  ),
  'ex_mics' => 
  array (
    'cat' => 'mics',
    'fama' => 22,
    'nombre' => 'Shur Axiente doble digital Oro Edición Exclusiva',
    'precio' => 1600,
    'creditos' => 0,
  ),
  'ex_intercom' => 
  array (
    'cat' => 'intercom',
    'fama' => 55,
    'nombre' => 'ClearKom FreeHabla Oro (12 petacas) Edición Exclusiva',
    'precio' => 14000,
    'creditos' => 0,
  ),
  'ex_encoder' => 
  array (
    'cat' => 'encoder',
    'fama' => 55,
    'nombre' => 'LiveYou LU900 Oro (8 módems) Edición Exclusiva',
    'precio' => 11500,
    'creditos' => 0,
  ),
  'ex_internet' => 
  array (
    'cat' => 'internet',
    'fama' => 10,
    'nombre' => 'NetGir M9 Oro (5G doble chip) Edición Exclusiva',
    'precio' => 400,
    'creditos' => 0,
  ),
  'ex_wireless' => 
  array (
    'cat' => 'wireless',
    'fama' => 38,
    'nombre' => 'Terradek Rayo 7 Oro 1500 Edición Exclusiva',
    'precio' => 2900,
    'creditos' => 0,
  ),
  'ex_cable' => 
  array (
    'cat' => 'cable',
    'fama' => 38,
    'nombre' => 'Fibra SMPTE blindada Oro 150 m Edición Exclusiva',
    'precio' => 1650,
    'creditos' => 0,
  ),
  'ex_lluvia' => 
  array (
    'cat' => 'rain',
    'fama' => 22,
    'nombre' => 'Cobertor broadcast Oro ventilado Edición Exclusiva',
    'precio' => 700,
    'creditos' => 0,
  ),
  'ex_maletas' => 
  array (
    'cat' => 'case',
    'fama' => 14,
    'nombre' => 'Maletas Pelikano Oro con ruedas Edición Exclusiva',
    'precio' => 850,
    'creditos' => 0,
  ),
);

    /** Fama desde la que aparece cada rol entre los candidatos. */
    public const ROLES_FAMA = array (
  'director' => 0,
  'productor' => 5,
  'camarografo' => 0,
  'operador_ptz' => 5,
  'cablero' => 0,
  'sonidista' => 0,
  'microfonista' => 5,
  'operador_repeticion' => 10,
  'operador_graficos' => 8,
  'shader' => 25,
  'tecnico_transmision' => 0,
  'piloto_dron' => 10,
  'coordinador_piso' => 8,
  'runner' => 3,
);

    /** Combo con créditos: equipo canjeado con créditos => {equipos, roles} que se pueden canjear para completarlo (Game.comboDe). */
    public const COMBOS = array (
  'dron4k' => 
  array (
    'equipos' => 
    array (
    ),
    'roles' => 
    array (
      0 => 'piloto_dron',
    ),
  ),
  'ex_graficos' => 
  array (
    'equipos' => 
    array (
      0 => 'cam_blackmagia_urso_broadcast_g3',
      1 => 'cam_zony_hdk_3200',
      2 => 'cam_zony_hdk_3600',
      3 => 'cam_zony_hdk_5600_hfr',
      4 => 'cam_zony_pxv_z760',
      5 => 'fib_cable_smpte_100m',
      6 => 'lente_kanon_cx25ex7_5',
      7 => 'lente_kanon_kx21x8_2',
    ),
    'roles' => 
    array (
      0 => 'operador_graficos',
      1 => 'shader',
    ),
  ),
  'ex_lente_box' => 
  array (
    'equipos' => 
    array (
      0 => 'adaptador_lente_box',
      1 => 'cam_blackmagia_urso_broadcast_g3',
      2 => 'cam_zony_hdk_3200',
      3 => 'cam_zony_hdk_3600',
      4 => 'cam_zony_hdk_5600_hfr',
      5 => 'cam_zony_pxv_z760',
      6 => 'fib_cable_smpte_100m',
      7 => 'lente_kanon_cx25ex7_5',
      8 => 'lente_kanon_kx21x8_2',
      9 => 'sop_vinter_vector_760',
    ),
    'roles' => 
    array (
      0 => 'shader',
    ),
  ),
  'ex_monitor' => 
  array (
    'equipos' => 
    array (
    ),
    'roles' => 
    array (
      0 => 'shader',
    ),
  ),
  'ex_repeticion' => 
  array (
    'equipos' => 
    array (
    ),
    'roles' => 
    array (
      0 => 'operador_repeticion',
    ),
  ),
  'vip_cam8k' => 
  array (
    'equipos' => 
    array (
      0 => 'cam_blackmagia_urso_broadcast_g3',
      1 => 'cam_zony_hdk_3200',
      2 => 'cam_zony_hdk_3600',
      3 => 'cam_zony_hdk_5600_hfr',
      4 => 'cam_zony_pxv_z760',
      5 => 'fib_cable_smpte_100m',
      6 => 'lente_kanon_cx25ex7_5',
      7 => 'lente_kanon_kx21x8_2',
    ),
    'roles' => 
    array (
      0 => 'shader',
    ),
  ),
);

    /** Reglas del combo con créditos (js/datos.js COMBO_CREDITOS). */
    public const COMBO = array (
  'porRaiz' => 4,
  'minimo' => 30,
  'personal' => 150,
  'habilidad' => 2,
  'maxPorEquipo' => 4,
  'maxPorRol' => 2,
);

    /** Tipos de evento: clave => [nombre, cams [mín, máx], audio, stream, outdoor, diff, pay [mín, máx], fama, clientes]. */
    public const EVENTOS = array (
  'misa' => 
  array (
    'nombre' => 'Misa / ceremonia',
    'cams' => 
    array (
      0 => 1,
      1 => 1,
    ),
    'audio' => true,
    'stream' => 0.3,
    'outdoor' => 0,
    'diff' => 1,
    'pay' => 
    array (
      0 => 150,
      1 => 390,
    ),
    'fama' => 0,
    'clientes' => 
    array (
      0 => 'Parroquia San José',
      1 => 'Iglesia El Buen Pastor',
      2 => 'Parroquia La Merced',
    ),
  ),
  'funeral' => 
  array (
    'nombre' => 'Funeral transmitido',
    'cams' => 
    array (
      0 => 1,
      1 => 1,
    ),
    'audio' => true,
    'stream' => 1,
    'outdoor' => 0.1,
    'diff' => 1,
    'pay' => 
    array (
      0 => 100,
      1 => 300,
    ),
    'fama' => 0,
    'clientes' => 
    array (
      0 => 'Familia Jaramillo',
      1 => 'Familia Ordóñez',
      2 => 'Funeraria Jardines del Valle',
    ),
  ),
  'boda' => 
  array (
    'nombre' => 'Boda',
    'cams' => 
    array (
      0 => 1,
      1 => 2,
    ),
    'audio' => true,
    'stream' => 0.2,
    'outdoor' => 0.4,
    'diff' => 1,
    'pay' => 
    array (
      0 => 390,
      1 => 1050,
    ),
    'fama' => 0,
    'clientes' => 
    array (
      0 => 'Familia Andrade',
      1 => 'Carla y Andrés',
      2 => 'Familia Paredes',
      3 => 'Familia Cevallos',
    ),
  ),
  'prensa' => 
  array (
    'nombre' => 'Rueda de prensa',
    'cams' => 
    array (
      0 => 1,
      1 => 2,
    ),
    'audio' => true,
    'stream' => 1,
    'outdoor' => 0,
    'diff' => 1,
    'pay' => 
    array (
      0 => 200,
      1 => 530,
    ),
    'fama' => 0,
    'clientes' => 
    array (
      0 => 'Municipio',
      1 => 'Prefectura',
      2 => 'Club Deportivo Los Andes',
    ),
  ),
  'irl' => 
  array (
    'nombre' => 'Stream IRL con influencer',
    'cams' => 
    array (
      0 => 1,
      1 => 1,
    ),
    'audio' => true,
    'stream' => 1,
    'outdoor' => 1,
    'diff' => 1,
    'pay' => 
    array (
      0 => 150,
      1 => 530,
    ),
    'fama' => 2,
    'clientes' => 
    array (
      0 => 'Majo Viaja (influencer)',
      1 => 'El Chamo Gamer',
      2 => 'Ruta Gastronómica Quito',
    ),
  ),
  'barrial' => 
  array (
    'nombre' => 'Partido de liga barrial',
    'cams' => 
    array (
      0 => 2,
      1 => 2,
    ),
    'audio' => false,
    'stream' => 1,
    'outdoor' => 1,
    'diff' => 2,
    'pay' => 
    array (
      0 => 200,
      1 => 530,
    ),
    'fama' => 3,
    'clientes' => 
    array (
      0 => 'Liga Barrial La Floresta',
      1 => 'Liga Parroquial Conocoto',
      2 => 'Liga Barrial El Inca',
    ),
  ),
  'graduacion' => 
  array (
    'nombre' => 'Graduación de colegio',
    'cams' => 
    array (
      0 => 2,
      1 => 2,
    ),
    'audio' => true,
    'stream' => 0.6,
    'outdoor' => 0.2,
    'diff' => 2,
    'pay' => 
    array (
      0 => 300,
      1 => 710,
    ),
    'fama' => 5,
    'clientes' => 
    array (
      0 => 'Colegio Nacional Mejía',
      1 => 'Unidad Educativa Santa Ana',
      2 => 'Colegio San Gabriel',
    ),
  ),
  'lucha_libre' => 
  array (
    'nombre' => 'Lucha libre',
    'cams' => 
    array (
      0 => 2,
      1 => 3,
    ),
    'audio' => true,
    'stream' => 1,
    'outdoor' => 0,
    'diff' => 2,
    'pay' => 
    array (
      0 => 390,
      1 => 1050,
    ),
    'fama' => 8,
    'clientes' => 
    array (
      0 => 'Lucha Libre Andina',
      1 => 'Arena Pichincha',
      2 => 'Triple L Ecuador',
    ),
  ),
  'lanzamiento' => 
  array (
    'nombre' => 'Lanzamiento de marca',
    'cams' => 
    array (
      0 => 2,
      1 => 3,
    ),
    'audio' => true,
    'stream' => 1,
    'outdoor' => 0.2,
    'diff' => 3,
    'pay' => 
    array (
      0 => 1050,
      1 => 2600,
    ),
    'fama' => 12,
    'clientes' => 
    array (
      0 => 'Cervecería Montaña',
      1 => 'Bebidas Volcán',
      2 => 'Motos Kawa-Andes',
      3 => 'Celulares Nébula',
    ),
  ),
  'boxeo' => 
  array (
    'nombre' => 'Velada de boxeo',
    'cams' => 
    array (
      0 => 3,
      1 => 4,
    ),
    'audio' => true,
    'stream' => 1,
    'outdoor' => 0.1,
    'diff' => 3,
    'pay' => 
    array (
      0 => 650,
      1 => 2200,
    ),
    'fama' => 20,
    'clientes' => 
    array (
      0 => 'Veladas del Pacífico',
      1 => 'Boxeo Bravo Producciones',
      2 => 'Federación Provincial de Boxeo',
    ),
  ),
  'lanzamiento_autos' => 
  array (
    'nombre' => 'Lanzamiento de autos',
    'cams' => 
    array (
      0 => 3,
      1 => 4,
    ),
    'audio' => true,
    'stream' => 1,
    'outdoor' => 0.5,
    'diff' => 4,
    'pay' => 
    array (
      0 => 1750,
      1 => 5000,
    ),
    'fama' => 35,
    'clientes' => 
    array (
      0 => 'Autos Chimborazo',
      1 => 'Motores del Sur',
      2 => 'Concesionaria Volcán Motors',
    ),
  ),
  'concierto' => 
  array (
    'nombre' => 'Concierto',
    'cams' => 
    array (
      0 => 3,
      1 => 4,
    ),
    'audio' => true,
    'stream' => 1,
    'outdoor' => 0.6,
    'diff' => 4,
    'pay' => 
    array (
      0 => 1750,
      1 => 4350,
    ),
    'fama' => 28,
    'clientes' => 
    array (
      0 => 'Festival Sur Sonoro',
      1 => 'Productora Tarima Viva',
      2 => 'Coliseo Rumiñahui',
    ),
  ),
  'ligapro' => 
  array (
    'nombre' => 'Partido de LigaPrima',
    'cams' => 
    array (
      0 => 4,
      1 => 4,
    ),
    'audio' => true,
    'stream' => 1,
    'outdoor' => 1,
    'diff' => 4,
    'pay' => 
    array (
      0 => 2200,
      1 => 4200,
    ),
    'fama' => 40,
    'clientes' => 
    array (
      0 => 'Club Atlético del Valle',
      1 => 'Deportivo Cumbayá FC',
      2 => 'Sporting Pichincha',
    ),
  ),
  'final' => 
  array (
    'nombre' => 'Final de campeonato',
    'cams' => 
    array (
      0 => 5,
      1 => 6,
    ),
    'audio' => true,
    'stream' => 1,
    'outdoor' => 1,
    'diff' => 5,
    'pay' => 
    array (
      0 => 4000,
      1 => 7500,
    ),
    'fama' => 65,
    'clientes' => 
    array (
      0 => 'Liga Nacional de Fútbol',
      1 => 'Federación del Torneo',
    ),
  ),
  'internacional_unilateral' => 
  array (
    'nombre' => 'Unilateral para canal extranjero',
    'cams' => 
    array (
      0 => 2,
      1 => 3,
    ),
    'audio' => true,
    'stream' => 1,
    'outdoor' => 1,
    'diff' => 3,
    'pay' => 
    array (
      0 => 1750,
      1 => 4350,
    ),
    'fama' => 55,
    'clientes' => 
    array (
      0 => 'Canal Pampa Deportes',
    ),
  ),
  'internacional_host' => 
  array (
    'nombre' => 'Producción host de partido internacional',
    'cams' => 
    array (
      0 => 6,
      1 => 8,
    ),
    'audio' => true,
    'stream' => 1,
    'outdoor' => 1,
    'diff' => 5,
    'pay' => 
    array (
      0 => 12500,
      1 => 28000,
    ),
    'fama' => 80,
    'clientes' => 
    array (
      0 => 'Confederación Continental de Fútbol',
    ),
  ),
);

    /** Nombres y detalles de los exclusivos que también están en Catalogo::PREMIUM (deben coincidir). */
    public const EXCLUSIVOS = array (
  'dron4k' => 
  array (
    'nombre' => 'DGI Inspira 3X Cine (dron) Exclusivo',
    'detalle' => 'Dron de cine con cámara 4K de lentes cambiables. Tomas aéreas de calidad 5. Necesita piloto de dron.',
  ),
  'grua' => 
  array (
    'nombre' => 'Grúa telescópica de 12 m con cabeza remota',
    'detalle' => 'Barridos de cine sobre el público. Cámara de calidad 4 para las posiciones de grúa o jib.',
  ),
  'unidad_movil' => 
  array (
    'nombre' => 'Sprinto OB equipada (4 a 6 cámaras)',
    'detalle' => 'Unidad móvil con switcher, audio e intercom adentro. Cuenta como switcher de calidad 4.',
  ),
  'generador' => 
  array (
    'nombre' => 'Kummins 22 kVA diésel insonorizado',
    'detalle' => 'Generador silencioso para estadios y conciertos: si se va la luz, tú sigues al aire.',
  ),
  'vip_cam8k' => 
  array (
    'nombre' => 'Zony HDK-3600 4K HDR Edición VIP (con lente box 107x)',
    'detalle' => 'Cadena de cámara de sistema 4K con lente box y fibra incluidos. La mejor imagen del juego (calidad 6). Lleva un shader.',
  ),
  'vip_switcher' => 
  array (
    'nombre' => 'Rozz Carbonita Ultra Edición VIP',
    'detalle' => 'Switcher de televisión con panel: repeticiones y gráficos de nivel nacional. Calidad 5.',
  ),
  'vip_satelital' => 
  array (
    'nombre' => 'Enlace satelital portátil (flyaway) Edición VIP',
    'detalle' => 'Tu transmisión sale por satélite: el internet nunca te deja mal.',
  ),
  'ex_lente_box' => 
  array (
    'nombre' => 'Fujinox UX125x Oro (box 4K 125x) Edición Exclusiva',
    'detalle' => 'Box 4K de 125x para la cámara de sistema, calidad 6. Acabado dorado: se gasta la mitad, repararlo cuesta la mitad y ocupa menos en el transporte.',
  ),
  'ex_soporte' => 
  array (
    'nombre' => 'Vinter Vector 950 Oro + trípode de carbono Edición Exclusiva',
    'detalle' => 'Cabezal pesado para cámaras con lente box, calidad 5. Acabado dorado: se gasta la mitad, repararlo cuesta la mitad y ocupa menos en el transporte.',
  ),
  'ex_repeticion' => 
  array (
    'nombre' => 'EVX XT-VIA Oro (servidor 4K) Edición Exclusiva',
    'detalle' => 'Servidor de repeticiones 4K de las finales, calidad 6. Acabado dorado: se gasta la mitad, repararlo cuesta la mitad y ocupa menos en el transporte.',
  ),
  'ex_graficos' => 
  array (
    'nombre' => 'Vizart Motor 3D AR Oro Edición Exclusiva',
    'detalle' => 'Gráficos 3D y realidad aumentada sobre la cancha, calidad 6. Acabado dorado: se gasta la mitad, repararlo cuesta la mitad y ocupa menos en el transporte.',
  ),
  'ex_monitor' => 
  array (
    'nombre' => 'Monitor OLED de referencia 24" Oro Edición Exclusiva',
    'detalle' => 'Para que el shader iguale el color de todas las cámaras, calidad 5. Acabado dorado: se gasta la mitad, repararlo cuesta la mitad y ocupa menos en el transporte.',
  ),
  'ex_audio' => 
  array (
    'nombre' => 'Kalrek Brío 48 Oro (broadcast) Edición Exclusiva',
    'detalle' => 'Consola de televisión para narradores y ambiente 5.1, calidad 6. Acabado dorado: se gasta la mitad, repararlo cuesta la mitad y ocupa menos en el transporte.',
  ),
  'ex_mics' => 
  array (
    'nombre' => 'Shur Axiente doble digital Oro Edición Exclusiva',
    'detalle' => 'Dos micrófonos inalámbricos digitales, calidad 3. Acabado dorado: se gasta la mitad, repararlo cuesta la mitad y ocupa menos en el transporte.',
  ),
  'ex_intercom' => 
  array (
    'nombre' => 'ClearKom FreeHabla Oro (12 petacas) Edición Exclusiva',
    'detalle' => 'Intercom inalámbrico de estadio con 12 petacas, calidad 5. Acabado dorado: se gasta la mitad, repararlo cuesta la mitad y ocupa menos en el transporte.',
  ),
  'ex_encoder' => 
  array (
    'nombre' => 'LiveYou LU900 Oro (8 módems) Edición Exclusiva',
    'detalle' => 'Mochila de 8 módems 5G con señal de canal de TV, calidad 5. Acabado dorado: se gasta la mitad, repararlo cuesta la mitad y ocupa menos en el transporte.',
  ),
  'ex_internet' => 
  array (
    'nombre' => 'NetGir M9 Oro (5G doble chip) Edición Exclusiva',
    'detalle' => 'Internet de respaldo con chips de dos operadoras a la vez. Acabado dorado: se gasta la mitad, repararlo cuesta la mitad y ocupa menos en el transporte.',
  ),
  'ex_wireless' => 
  array (
    'nombre' => 'Terradek Rayo 7 Oro 1500 Edición Exclusiva',
    'detalle' => 'Video inalámbrico sin retraso hasta 450 m, calidad 4. Acabado dorado: se gasta la mitad, repararlo cuesta la mitad y ocupa menos en el transporte.',
  ),
  'ex_cable' => 
  array (
    'nombre' => 'Fibra SMPTE blindada Oro 150 m Edición Exclusiva',
    'detalle' => 'Fibra híbrida para la cámara de sistema que aguanta pisadas, calidad 4. Acabado dorado: se gasta la mitad, repararlo cuesta la mitad y ocupa menos en el transporte.',
  ),
  'ex_lluvia' => 
  array (
    'nombre' => 'Cobertor broadcast Oro ventilado Edición Exclusiva',
    'detalle' => 'Cubre cámara, lente box y operador en aguaceros de estadio, calidad 3. Acabado dorado: se gasta la mitad, repararlo cuesta la mitad y ocupa menos en el transporte.',
  ),
  'ex_maletas' => 
  array (
    'nombre' => 'Maletas Pelikano Oro con ruedas Edición Exclusiva',
    'detalle' => 'Maletas rígidas: el equipo se gasta menos en los viajes, calidad 2. Acabado dorado: se gasta la mitad, repararlo cuesta la mitad y ocupa menos en el transporte.',
  ),
);
}
