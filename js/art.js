/* =========================================================
   EN VIVO Tycoon — Gráficos (todo dibujado con SVG, sin imágenes)
   Art.icon(nombre, clase, tamaño)          → ícono de línea (botones, etiquetas, menú)
   Art.portrait(personaje, tamaño)          → retrato (ramiro, mega, marca, dirigente)
   Art.item(tipo, tamaño, {subtipo, cat})   → render del equipo con brillo según rareza
   Art.rarity(tipo)                         → { key, label, color } (Común … VIP)
   Art.avatar(nombre|persona, rol, tamaño, {owner, premium}) → retrato del personal
   Art.hq(estado)                           → la sede de tu productora (día y noche)
   Art.scene(evento, imprevisto, cámaras, terminado, gear, info) → escena en vivo
   Los degradados se definen UNA vez en la página (#art-shared-defs) y se reutilizan.
   ========================================================= */
(function (root) {
  'use strict';

  /* ---------- Íconos (24x24, trazo) ---------- */
  const P = {
    // Equipos
    cam_basic: '<rect x="3" y="8" width="12" height="9" rx="2"/><path d="M15 11l5-3v9l-5-3"/><circle cx="7" cy="12.5" r="1.6"/>',
    cam_pro: '<rect x="2.5" y="8" width="13" height="8" rx="1.5"/><path d="M15.5 10h3l3-2v8l-3-2h-3"/><path d="M5 8V6h6v2"/><path d="M6 16v3M12 16v3M4.5 19h9"/>',
    cam_cine: '<rect x="3" y="7" width="11" height="9" rx="1.5"/><path d="M14 9.5h2.5V8l4.5 1v5l-4.5 1v-1.5H14"/><circle cx="8.5" cy="11.5" r="2.5"/><path d="M5 7V4.5h7V7M8.5 16v4M5 20h7"/>',
    switch_basic: '<rect x="4" y="5" width="16" height="10" rx="1.5"/><path d="M2 18.5h20l-1.5-2.5h-17z"/><path d="M7 12l2.5-3 2 2 2.5-3 3 4"/>',
    switch_pro: '<rect x="2" y="7" width="20" height="10" rx="1.5"/><circle cx="6" cy="11" r="1"/><circle cx="9.5" cy="11" r="1"/><circle cx="13" cy="11" r="1"/><path d="M5 14.5h9"/><path d="M18 9.5v5"/><rect x="16.5" y="11" width="3" height="2" rx=".5"/>',
    audio_basic: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M8 7v10M12 7v10M16 7v10"/><path d="M6.5 10h3M10.5 14h3M14.5 9h3"/>',
    audio_pro: '<rect x="2.5" y="3.5" width="19" height="17" rx="2"/><rect x="5" y="6" width="14" height="4" rx="1"/><path d="M6.5 13v5M10 13v5M13.5 13v5M17 13v5"/><path d="M5.5 15h2M9 16.5h2M12.5 14h2M16 15.5h2"/>',
    mics: '<rect x="9" y="3" width="6" height="10" rx="3"/><path d="M6 11a6 6 0 0012 0M12 17v4M8.5 21h7"/>',
    encoder: '<rect x="3" y="11" width="18" height="8" rx="1.5"/><path d="M7 15h4"/><circle cx="17" cy="15" r="1"/><path d="M8.5 7.5a5 5 0 017 0M6 5a8.5 8.5 0 0112 0"/>',
    router4g: '<rect x="3" y="12" width="18" height="7" rx="1.5"/><path d="M7 12l-2-7M17 12l2-7"/><circle cx="7.5" cy="15.5" r=".8"/><circle cx="11" cy="15.5" r=".8"/><path d="M14 15.5h4"/>',
    ups: '<rect x="5" y="3" width="14" height="18" rx="2"/><path d="M12.5 7l-3 5.5h3.5l-3 5"/>',
    raincover: '<path d="M3 12a9 9 0 0118 0z"/><path d="M12 12v6.5a2 2 0 01-4 0"/>',
    cable: '<path d="M4 20c4 0 4-8 8-8s4-6 8-6"/><rect x="17" y="3" width="5" height="6" rx="1" transform="rotate(30 19.5 6)"/><circle cx="4" cy="20" r="1.5"/>',
    battery: '<rect x="3" y="7" width="16" height="10" rx="2"/><path d="M21 10.5v3"/><path d="M6 10v4M9 10v4"/>',
    dron: '<rect x="9" y="10" width="6" height="4" rx="1.5"/><path d="M9 11H5M15 11h4M5 11V9M19 11V9"/><path d="M2.5 8.5h5M16.5 8.5h5"/><circle cx="12" cy="16.5" r="1.6"/><path d="M12 14v1"/>',
    grua: '<path d="M4 21h8M8 21l-2-9 14-7"/><path d="M6 12l3-1"/><rect x="16.5" y="3" width="5" height="4" rx="1" transform="rotate(-25 19 5)"/><path d="M8 21l2-9"/>',
    unidad_movil: '<rect x="2" y="8" width="13" height="9" rx="1.5"/><path d="M15 11h4l3 3v3h-7z"/><circle cx="6" cy="18" r="2"/><circle cx="18" cy="18" r="2"/><path d="M7 8V5M4.5 3.5a3.5 3.5 0 015 0"/>',
    generador: '<rect x="3" y="7" width="18" height="12" rx="2"/><path d="M7 7V4h4v3"/><path d="M13.5 10l-2.5 3.5h3l-2.5 3.5"/><path d="M6 19v2M18 19v2"/>',
    gem: '<path d="M6 4h12l3 5-9 11L3 9z"/><path d="M3 9h18M9 4l-1.5 5L12 20l4.5-11L15 4"/>',
    crown: '<path d="M3 8l4 4 5-7 5 7 4-4-2 11H5z"/><path d="M5 19h14"/>',
    cart: '<path d="M3 4h2l2.5 11h11L21 7H6.5"/><circle cx="9.5" cy="19" r="1.5"/><circle cx="17" cy="19" r="1.5"/>',
    user: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0116 0"/>',
    cloud: '<path d="M7 18a4.5 4.5 0 01-.5-9 6 6 0 0111.5 2A3.5 3.5 0 0117.5 18z"/><path d="M12 11v5M9.5 13.5L12 11l2.5 2.5"/>',
    gift: '<rect x="3" y="9" width="18" height="4" rx="1"/><path d="M5 13v8h14v-8M12 9v12"/><path d="M12 9c-2-4-6-4-6-1.5S10 9 12 9c2 0 6-.5 6-1.5S14 5 12 9z"/>',
    // Roles
    role_cam: '<rect x="3" y="7" width="12" height="9" rx="2"/><path d="M15 10l6-3v9l-6-3"/><path d="M7 16l-2 5M11 16l2 5"/>',
    role_dir: '<path d="M3 9h18v11H3z"/><path d="M3 9l2-5 16 0-2 5"/><path d="M7.5 4.2L9.5 9M13 4.2L15 9"/>',
    role_audio: '<path d="M4 15v-3a8 8 0 0116 0v3"/><rect x="2.5" y="14" width="4.5" height="6.5" rx="1.5"/><rect x="17" y="14" width="4.5" height="6.5" rx="1.5"/>',
    role_stream: '<circle cx="12" cy="10" r="2"/><path d="M12 12l-3 9M12 12l3 9M10 18h4"/><path d="M8 6.5a5 5 0 000 7M16 6.5a5 5 0 010 7M5.2 4a9 9 0 000 12M18.8 4a9 9 0 010 12"/>',
    // Los 14 puestos del juego (role_<clave de js/datos.js>)
    role_director: '<path d="M3 9h18v11H3z"/><path d="M3 9l2-5 16 0-2 5"/><path d="M7.5 4.2L9.5 9M13 4.2L15 9"/><path d="M7 14.5h5"/>',
    role_productor: '<rect x="5" y="4" width="14" height="17" rx="2"/><path d="M9 4V2.8h6V4"/><path d="M8.5 12.5l2.4 2.4 4.6-5"/>',
    role_camarografo: '<rect x="3" y="7" width="12" height="9" rx="2"/><path d="M15 10l6-3v9l-6-3"/><path d="M7 16l-2 5M11 16l2 5"/>',
    role_operador_ptz: '<circle cx="12" cy="8.5" r="4.5"/><circle cx="12" cy="8.5" r="1.6"/><rect x="7" y="13" width="10" height="5" rx="1.5"/><path d="M4.5 21h15"/>',
    role_cablero: '<circle cx="10" cy="11" r="7"/><circle cx="10" cy="11" r="2.3"/><path d="M10 4a7 7 0 016.6 4.7"/><path d="M17 11h2.5a1.5 1.5 0 011.5 1.5V20M19 20h4"/>',
    role_sonidista: '<path d="M4 15v-3a8 8 0 0116 0v3"/><rect x="2.5" y="14" width="4.5" height="6.5" rx="1.5"/><rect x="17" y="14" width="4.5" height="6.5" rx="1.5"/>',
    role_microfonista: '<path d="M3.5 20.5L14 10"/><rect x="13.2" y="2.8" width="5.6" height="9.4" rx="2.8" transform="rotate(45 16 7.5)"/><path d="M5.5 15.5l3 3"/>',
    role_operador_repeticion: '<path d="M4 12a8 8 0 1 0 2.4-5.7"/><path d="M4 4v4.5h4.5"/><path d="M10.5 9v6l4.5-3z"/>',
    role_operador_graficos: '<rect x="2.5" y="4" width="19" height="13" rx="1.5"/><rect x="5" y="11.5" width="9" height="3" rx=".8"/><path d="M15.5 6.5h3.5V9h-3.5z"/><path d="M8 21h8M12 17v4"/>',
    role_shader: '<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="8.5" cy="12" r="3"/><path d="M8.5 9v3"/><path d="M15 8v8M18 8v8M15 11h-1.5M18 14h1.5"/>',
    role_tecnico_transmision: '<circle cx="12" cy="10" r="2"/><path d="M12 12l-3 9M12 12l3 9M10 18h4"/><path d="M8 6.5a5 5 0 000 7M16 6.5a5 5 0 010 7M5.2 4a9 9 0 000 12M18.8 4a9 9 0 010 12"/>',
    role_piloto_dron: '<rect x="3" y="12" width="18" height="8.5" rx="3"/><circle cx="8" cy="16.2" r="1.6"/><circle cx="16" cy="16.2" r="1.6"/><path d="M8 12V7.5M16 12V7.5"/><path d="M5 5h6M13 5h6"/>',
    role_coordinador_piso: '<path d="M4 14v-2a8 8 0 0116 0v2"/><rect x="2.5" y="13" width="4" height="6" rx="1.5"/><rect x="17.5" y="13" width="4" height="6" rx="1.5"/><path d="M19.5 19c0 1.5-2 2.5-5 2.5"/>',
    role_runner: '<circle cx="14.5" cy="4" r="2"/><path d="M8.5 21l3-6 3 2.5V21"/><path d="M6.5 11l3.5-3.5 4 1 2.5 3.5 3 .5"/><path d="M11.5 8.5L10 14.5"/><path d="M2 13h3.5M3 16.5h3.5"/>',
    // Modos en línea y avisos del día
    online: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c2.8 3 2.8 15 0 18M12 3c-2.8 3-2.8 15 0 18"/><path d="M5 7.5h14M5 16.5h14"/>',
    globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c2.8 3 2.8 15 0 18M12 3c-2.8 3-2.8 15 0 18"/>',
    flag: '<path d="M5 21V3.5"/><path d="M5 4h12l-2.5 4L17 12H5"/>',
    plane: '<path d="M2.5 13.5l19-8-5.5 15-3.5-6z"/><path d="M12.5 14.5l9-9"/>',
    link: '<path d="M10 14a4.5 4.5 0 006.4 0l3-3a4.5 4.5 0 00-6.4-6.4l-1.2 1.2"/><path d="M14 10a4.5 4.5 0 00-6.4 0l-3 3a4.5 4.5 0 006.4 6.4l1.2-1.2"/>',
    shield: '<path d="M12 3l8 3v6c0 5-3.5 8.3-8 9.5C7.5 20.3 4 17 4 12V6z"/><path d="M8.5 12l2.5 2.5 4.5-5"/>',
    target: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1.4"/>',
    festival: '<path d="M2 21h20"/><path d="M4 21V11h16v10"/><path d="M4 11l3-6M20 11l-3-6M9 11l1-6M15 11l-1-6"/><path d="M9 21v-4h6v4"/>',
    user_x: '<circle cx="10" cy="8" r="4"/><path d="M3 21a7 7 0 0114 0"/><path d="M17 5l4 4M21 5l-4 4"/>',
    sad: '<circle cx="12" cy="12" r="9"/><path d="M8.5 16.5a4.5 4.5 0 017 0"/><path d="M9 9.5v.5M15 9.5v.5"/>',
    x_circle: '<circle cx="12" cy="12" r="9"/><path d="M9 9l6 6M15 9l-6 6"/>',
    trend_down: '<path d="M3 7l6 6 4-4 8 8"/><path d="M15 17h6v-6"/>',
    // Tipos de evento
    misa: '<path d="M12 2v4M10 4h4"/><path d="M7 21V11l5-4 5 4v10"/><path d="M3 21h18"/><path d="M10.5 21v-4a1.5 1.5 0 013 0v4"/>',
    boda: '<circle cx="9" cy="14" r="5.5"/><circle cx="15" cy="14" r="5.5"/><path d="M13 5l2-2 2 2-2 2z"/>',
    prensa: '<rect x="9.5" y="2.5" width="5" height="8" rx="2.5"/><path d="M12 10.5V14"/><path d="M5 14h14l-1.5 7h-11z"/>',
    barrial: '<circle cx="12" cy="12" r="9"/><path d="M12 7l3.8 2.8-1.5 4.4H9.7L8.2 9.8z"/><path d="M12 3v4M20.5 9.5l-4.7.3M17 19.5l-2.7-5.3M7 19.5l2.7-5.3M3.5 9.5l4.7.3"/>',
    graduacion: '<path d="M2 9l10-5 10 5-10 5z"/><path d="M6 11v5c3 2.5 9 2.5 12 0v-5"/><path d="M21 9.5v5"/>',
    lanzamiento: '<path d="M12 2c3.5 2.5 5 6 5 10l-2 4H9l-2-4c0-4 1.5-7.5 5-10z"/><circle cx="12" cy="9" r="1.8"/><path d="M9 16l-3 3 1-5M15 16l3 3-1-5M10.5 19.5L12 22l1.5-2.5"/>',
    concierto: '<path d="M14 3l5 5-7.5 7.5"/><circle cx="7.5" cy="16.5" r="4.5"/><path d="M6 18l3-3"/><path d="M17.5 4.5l2 2"/>',
    ligapro: '<path d="M2 18c2-5 6-7 10-7s8 2 10 7"/><path d="M2 18h20v3H2z"/><path d="M5 11V4M19 11V4"/><path d="M3.5 4h3M17.5 4h3"/>',
    final: '<path d="M7 3h10v5a5 5 0 01-10 0z"/><path d="M7 5H4a3 3 0 003 4M17 5h3a3 3 0 01-3 4"/><path d="M12 13v4M8 21h8l-1-4H9z"/>',
    boxeo: '<path d="M7 9.5a4.5 4.5 0 014.5-4.5h2A4.5 4.5 0 0118 9.5V14a3 3 0 01-3 3H9.5A2.5 2.5 0 017 14.5z"/><path d="M7 11.5H5.5A1.5 1.5 0 004 13v0a1.5 1.5 0 001.5 1.5H7"/><path d="M9 17v3.5h7V17"/><path d="M11 9.5h4"/>',
    lucha_libre: '<path d="M5 9c0-4 3-6 7-6s7 2 7 6v4c0 4-3 7-7 7s-7-3-7-7z"/><path d="M8 10.5l3 1.5-3 1.5zM16 10.5l-3 1.5 3 1.5z"/><path d="M10 17h4"/><path d="M12 3v3"/>',
    funeral: '<path d="M12 2.5v6M9 5h6"/><path d="M5 21l2-9h10l2 9z"/><path d="M3 21h18"/>',
    lanzamiento_autos: '<path d="M3 15l1.8-4.6A2 2 0 016.7 9h10.6a2 2 0 011.9 1.4L21 15v3H3z"/><path d="M3 15h18"/><circle cx="7" cy="18" r="1.8"/><circle cx="17" cy="18" r="1.8"/><path d="M8 5l1 2M12 4v2.5M16 5l-1 2"/>',
    irl: '<rect x="7" y="2.5" width="10" height="15" rx="2"/><path d="M11 15h2"/><circle cx="12" cy="8.5" r="2"/><path d="M9 21.5h6M12 17.5v4"/><path d="M19.5 6a5 5 0 010 7M4.5 6a5 5 0 000 7"/>',
    internacional_unilateral: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c2.8 3 2.8 15 0 18M12 3c-2.8 3-2.8 15 0 18"/>',
    internacional_host: '<path d="M7 3h10v5a5 5 0 01-10 0z"/><path d="M7 5H4a3 3 0 003 4M17 5h3a3 3 0 01-3 4"/><path d="M12 13v4M8 21h8l-1-4H9z"/><circle cx="12" cy="7" r="1.5"/>',
    // Interfaz
    home: '<path d="M3 11l9-7 9 7"/><path d="M5 9.5V20h5v-6h4v6h5V9.5"/>',
    planta: '<path d="M7.5 15h9l-1.2 6H8.7z"/><path d="M12 15V9"/><path d="M12 12c-4.5 0-6.5-3-6.5-6.5 3.5 0 6.5 2.5 6.5 6.5zM12 10c0-4 2.5-6.5 6.5-6.5 0 3.5-2.5 6.5-6.5 6.5z"/>',
    clients: '<rect x="5" y="4" width="14" height="17" rx="2"/><path d="M9 4V2.8h6V4"/><path d="M8.5 10h7M8.5 14h7M8.5 18h4"/>',
    people: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0113 0"/><circle cx="17" cy="9" r="2.6"/><path d="M15.5 14.2A5 5 0 0121.5 19"/>',
    box: '<path d="M3 7.5L12 3l9 4.5v9L12 21l-9-4.5z"/><path d="M3 7.5l9 4.5 9-4.5M12 12v9"/>',
    log: '<path d="M6 3h11a2 2 0 012 2v14a2 2 0 01-2 2H6z"/><path d="M6 3a2 2 0 00-2 2v1h2M9.5 8h6M9.5 12h6M9.5 16h4"/>',
    money: '<rect x="2.5" y="6" width="19" height="12" rx="2"/><circle cx="12" cy="12" r="2.8"/><path d="M6 9.5v5M18 9.5v5"/>',
    star: '<path d="M12 3l2.7 5.6 6.1.8-4.5 4.2 1.1 6.1L12 16.8l-5.4 2.9 1.1-6.1-4.5-4.2 6.1-.8z"/>',
    calendar: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>',
    bolt: '<path d="M13 2L4 14h7l-1 8 9-12h-7z"/>',
    wifi_off: '<path d="M2 8.5a15 15 0 0120 0M5.5 12a10 10 0 0113 0M9 15.5a5 5 0 016 0"/><circle cx="12" cy="19" r="1"/><path d="M3 3l18 18"/>',
    rain: '<path d="M6 14a4 4 0 01.5-8 6 6 0 0111 1.5A3.5 3.5 0 0117 14z"/><path d="M8 17l-1 3M12 17l-1 3M16 17l-1 3"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    wrench: '<path d="M14.5 6.5a4 4 0 015.2 5.2l-2.2-2.2-2.3.6-.6 2.3 2.2 2.2a4 4 0 01-5.2-5.2L4 17v3h3l7.6-7.6"/>',
    sound: '<path d="M4 9v6h4l5 4V5L8 9z"/><path d="M16.5 8.5a5 5 0 010 7M19.5 6a8.5 8.5 0 010 12"/>',
    sparkle: '<path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z"/><path d="M19 16l.7 2 2 .7-2 .7-.7 2-.7-2-2-.7 2-.7z"/>',
    vip: '<circle cx="12" cy="7" r="3.5"/><path d="M5 21v-2a7 7 0 0114 0v2"/><path d="M12 13.5l-1 3 1 4 1-4z"/>',
    megaphone: '<path d="M3 10v4h3l9 5V5L6 10z"/><path d="M6 14l1.5 6h2.5l-1-5.5"/><path d="M18 9.5a3 3 0 010 5"/>',
    social: '<rect x="6" y="2.5" width="12" height="19" rx="2.5"/><path d="M10.5 18.5h3"/><path d="M9 9.5l3 2.5 3-2.5M9 13h6"/>',
    ad: '<rect x="3" y="4" width="18" height="13" rx="1.5"/><path d="M8 21h8M12 17v4"/><path d="M7 13l2.5-6 2.5 6M7.8 11h3.4M14 7v6h1.5a3 3 0 000-6z"/>',
    walk: '<circle cx="13" cy="4" r="2"/><path d="M10 21l2-6 3 3v3M8.5 11l2.5-4 3 1 2 3.5M11 7l-1 5"/>',
    sleep: '<path d="M20 14.5A8 8 0 019.5 4a8 8 0 1010.5 10.5z"/><path d="M15 3h4l-4 4h4"/>',
    refresh: '<path d="M20 11a8 8 0 00-14.5-4.5L3 9"/><path d="M3 4v5h5"/><path d="M4 13a8 8 0 0014.5 4.5L21 15"/><path d="M21 20v-5h-5"/>',
    play: '<path d="M7 4l13 8-13 8z"/>',
    rec: '<circle cx="12" cy="12" r="8"/>',
    check: '<path d="M4 12.5l5 5L20 6.5"/>',
    close: '<path d="M5 5l14 14M19 5L5 19"/>',
    lock: '<rect x="5" y="10.5" width="14" height="10" rx="2"/><path d="M8 10.5V7.5a4 4 0 018 0v3"/>',
    trend: '<path d="M3 17l6-6 4 4 8-8"/><path d="M15 7h6v6"/>',
    rival: '<path d="M4 20l7-7M13 11l7-7M4 4l16 16"/><path d="M14 20l6-6M4 10l6-6"/>',
    tip: '<path d="M9 18h6M10 21h4"/><path d="M12 3a6 6 0 00-3.5 10.9c.6.5 1 1.2 1 2.1h5c0-.9.4-1.6 1-2.1A6 6 0 0012 3z"/>',
    outdoor: '<circle cx="8" cy="8" r="3"/><path d="M8 2v1.5M2 8h1.5M3.8 3.8l1 1M12.2 3.8l-1 1"/><path d="M10 19a3.5 3.5 0 01.5-7 5 5 0 019.5 1.5A3 3 0 0119 19z"/>',
    stream: '<circle cx="12" cy="12" r="2"/><path d="M8.5 8.5a5 5 0 000 7M15.5 8.5a5 5 0 010 7M5.6 5.6a9 9 0 000 12.8M18.4 5.6a9 9 0 010 12.8"/>',
  };

  const ALIAS = { dron4k: 'dron', kit_reparacion: 'wrench', caja_chica: 'money', estrella: 'role_cam', inicio: 'gift', vip30: 'crown',
    // eventos de temporada (js/temporadas.js)
    tmp_calaveras: 'concierto', tmp_arbol_ny: 'star', tmp_pase_nino: 'star', tmp_reveillon: 'concierto', tmp_anio_viejo: 'bolt',
    tmp_bodas: 'boda', tmp_serenata: 'concierto', tmp_procesion: 'misa', tmp_corso: 'concierto' };
  function icon(name, cls, size) {
    const body = P[name] || P[ALIAS[name]] || (/^creditos/.test(name) ? P.gem : P.box);
    const dim = size ? ` width="${size}" height="${size}"` : '';
    return `<svg class="ico ${cls || ''}"${dim} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;
  }

  /* ---------- Retratos ---------- */
  // Personajes originales. Cada uno: fondo, ropa, cara, pelo y detalles.
  function face(skin, extra) {
    return `<path d="M26 92c0-16 10-25 24-25s24 9 24 25z" fill="var(--pc-cloth)"/>
      <rect x="44" y="56" width="12" height="12" rx="4" fill="${skin}"/>
      <ellipse cx="50" cy="42" rx="16" ry="19" fill="${skin}"/>
      <ellipse cx="34.5" cy="44" rx="3" ry="4.5" fill="${skin}"/><ellipse cx="65.5" cy="44" rx="3" ry="4.5" fill="${skin}"/>
      ${extra}`;
  }
  const PORTRAITS = {
    ramiro: { bg: '#3b4a5e', cloth: '#7a5a3a', svg: face('#d9a679', `
      <path d="M34 34c0-12 7-18 16-18s16 6 16 18c-3-6-9-8-16-8s-13 2-16 8z" fill="#cfd5dd"/>
      <path d="M31 33h38v-3a19 6 0 00-38 0z" fill="#1f2a37"/><path d="M60 31h14v3H60z" fill="#1f2a37"/>
      <circle cx="43.5" cy="43" r="4.8" fill="none" stroke="#1d1d1d" stroke-width="1.6"/><circle cx="56.5" cy="43" r="4.8" fill="none" stroke="#1d1d1d" stroke-width="1.6"/><path d="M48.3 43h3.4" stroke="#1d1d1d" stroke-width="1.6"/>
      <circle cx="43.5" cy="43.5" r="1.3" fill="#1d1d1d"/><circle cx="56.5" cy="43.5" r="1.3" fill="#1d1d1d"/>
      <path d="M41 53c3-3 6-2 9-1 3-1 6-2 9 1-3 2-6 2-9 1-3 1-6 1-9-1z" fill="#cfd5dd"/>
      <path d="M46 57.5q4 2 8 0" stroke="#8a4a32" stroke-width="1.4" fill="none" stroke-linecap="round"/>
      <path d="M40 80h20" stroke="#5c4128" stroke-width="2"/><circle cx="50" cy="84" r="2.5" fill="#d9b44a"/>`) },
    mega: { bg: '#4a1f2b', cloth: '#16181d', svg: face('#e2b48f', `
      <path d="M33 38c-1-14 8-21 18-21 9 0 16 5 16 15-4-5-10-7-17-6-7 0-12 4-17 12z" fill="#15161a"/>
      <rect x="37" y="39" width="11" height="7" rx="2.5" fill="#0d0e11"/><rect x="52" y="39" width="11" height="7" rx="2.5" fill="#0d0e11"/><path d="M48 41.5h4" stroke="#0d0e11" stroke-width="2"/>
      <path d="M44 55q7 3 12-2" stroke="#7a3b2e" stroke-width="1.6" fill="none" stroke-linecap="round"/>
      <path d="M44 67l6 10 6-10" fill="#f2f2f2"/><path d="M50 69l-2.5 4 2.5 12 2.5-12z" fill="#c62f3a"/>
      <path d="M36 74l8-7M64 74l-8-7" stroke="#2a2d35" stroke-width="2"/>`) },
    marca: { bg: '#2c4a45', cloth: '#d8604c', svg: face('#c98a5e', `
      <path d="M33 44c-3-17 6-27 17-27s20 10 17 27c-2-9-7-14-17-14s-15 5-17 14z" fill="#3a2418"/>
      <circle cx="50" cy="16" r="7" fill="#3a2418"/>
      <circle cx="44" cy="44" r="1.8" fill="#1d1d1d"/><circle cx="56" cy="44" r="1.8" fill="#1d1d1d"/>
      <path d="M40.5 39.5q3.5-2 7 0M52.5 39.5q3.5-2 7 0" stroke="#2a1a12" stroke-width="1.3" fill="none"/>
      <path d="M45 53q5 4 10 0" stroke="#9c3b3b" stroke-width="2" fill="none" stroke-linecap="round"/>
      <circle cx="34" cy="50" r="2" fill="#e8c35a"/><circle cx="66" cy="50" r="2" fill="#e8c35a"/>
      <path d="M43 67l7 8 7-8" fill="#f4ede4"/>`) },
    dirigente: { bg: '#1f3557', cloth: '#26303f', svg: face('#b97f55', `
      <path d="M35 36c0-11 7-17 15-17s15 6 15 17c-1-3-3-5-5-6H40c-2 1-4 3-5 6z" fill="#b97f55"/>
      <path d="M34 40c0-6 1-9 3-10M66 40c0-6-1-9-3-10" stroke="#4b3426" stroke-width="3" stroke-linecap="round"/>
      <circle cx="44" cy="44" r="1.8" fill="#1d1d1d"/><circle cx="56" cy="44" r="1.8" fill="#1d1d1d"/>
      <path d="M40 39h7M53 39h7" stroke="#2b1e16" stroke-width="2" stroke-linecap="round"/>
      <path d="M40 54c3-4 7-3 10-2 3-1 7-2 10 2-4 1-7 0-10-1-3 1-6 2-10 1z" fill="#2b1e16"/>
      <path d="M34 72c5 3 10 4 16 4s11-1 16-4l-2-6c-4 3-9 4-14 4s-10-1-14-4z" fill="#d23a3a"/>
      <path d="M38 69l3 9M44 71l1.5 8M56 71l-1.5 8M62 69l-3 9" stroke="#2457a6" stroke-width="2.2"/>`) },
  };
  const PORTRAIT_NAMES = { ramiro: 'Don Ramiro', mega: 'Germán Vélez', marca: 'Lucía Mena', dirigente: 'Don Aurelio' };
  function portrait(key, size) {
    const p = PORTRAITS[key] || PORTRAITS.ramiro;
    const s = size || 64;
    return `<svg class="portrait" width="${s}" height="${s}" viewBox="0 0 100 100" role="img" aria-label="${PORTRAIT_NAMES[key] || ''}" style="--pc-cloth:${p.cloth}">
      <rect width="100" height="100" rx="22" fill="${p.bg}"/>
      <clipPath id="pc-${key}-${s}"><rect width="100" height="100" rx="22"/></clipPath>
      <g clip-path="url(#pc-${key}-${s})">${p.svg}</g></svg>`;
  }


  /* =========================================================
     Utilidades
     ========================================================= */
  let UID = 0;
  const uid = (p) => (p || 'a') + (++UID).toString(36);
  const Gm = () => root.Game || {};
  const catalogItem = (type) => { try { const g = Gm(); return (g.CATALOG && g.CATALOG[type]) || (g.CONSUMABLES && g.CONSUMABLES[type]) || null; } catch (e) { return null; } };
  function esc(t) { return String(t).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
  function hash(str) {
    let h = 2166136261;
    const s = String(str == null ? '' : str);
    for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
    return h >>> 0;
  }
  function rng(seed) {
    let a = hash(seed) || 1;
    return () => { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), a | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  }
  const pickR = (r, arr) => arr[Math.floor(r() * arr.length) % arr.length];
  function shade(hex, amt) {
    const m = /^#?([0-9a-f]{6})$/i.exec(hex || '');
    if (!m) return hex;
    const n = parseInt(m[1], 16);
    const f = (v) => Math.max(0, Math.min(255, Math.round(v + (amt < 0 ? v * amt : (255 - v) * amt))));
    return '#' + [f(n >> 16), f((n >> 8) & 255), f(n & 255)].map((v) => v.toString(16).padStart(2, '0')).join('');
  }
  const stops = (arr) => arr.map(([o, c, op]) => `<stop offset="${o}" stop-color="${c}"${op != null ? ` stop-opacity="${op}"` : ''}/>`).join('');
  const lin = (id, arr, x2, y2) => `<linearGradient id="${id}" x1="0" y1="0" x2="${x2 == null ? 0 : x2}" y2="${y2 == null ? 1 : y2}">${stops(arr)}</linearGradient>`;
  const rad = (id, arr, cx, cy, r) => `<radialGradient id="${id}" cx="${cx == null ? 0.5 : cx}" cy="${cy == null ? 0.5 : cy}" r="${r == null ? 0.5 : r}">${stops(arr)}</radialGradient>`;
  const FONT_D = 'Barlow Condensed,Arial Narrow,sans-serif';
  const FONT_M = 'JetBrains Mono,ui-monospace,monospace';
  const FONT_B = 'IBM Plex Sans,system-ui,sans-serif';

  /* =========================================================
     Rareza (solo visual, sale del catálogo)
     ========================================================= */
  const RARITIES = {
    comun:     { key: 'comun',     label: 'Común',       color: '#9aa6bb' },
    pro:       { key: 'pro',       label: 'Profesional', color: '#4da3ff' },
    elite:     { key: 'elite',     label: 'Élite',       color: '#b57bff' },
    exclusivo: { key: 'exclusivo', label: 'Exclusivo',   color: '#ff8a3d' },
    vip:       { key: 'vip',       label: 'VIP',         color: '#ffd34d' },
  };
  const RARITY_ALIAS = { comun: 'comun', 'común': 'comun', common: 'comun', pro: 'pro', profesional: 'pro', elite: 'elite', 'élite': 'elite', exclusivo: 'exclusivo', exclusive: 'exclusivo', vip: 'vip' };
  const PRO_TYPES = ['cam_pro', 'audio_pro', 'switch_pro'];
  const ELITE_TYPES = ['cam_cine'];
  function rarity(type) {
    try {
      const it = catalogItem(type);
      if (it && it.vip) return RARITIES.vip;
      if (it && it.premium) return RARITIES.exclusivo;
      const own = it && RARITY_ALIAS[String(it.rareza || it.rarity || '').toLowerCase()];
      if (own) return RARITIES[own];
      if (ELITE_TYPES.includes(type)) return RARITIES.elite;
      if (PRO_TYPES.includes(type)) return RARITIES.pro;
      if (type === 'vip30' || /^vip_/.test(String(type))) return RARITIES.vip;
      if (it && typeof it.q === 'number' && it.cat !== 'power' && it.cat !== 'rain') {
        if (it.q >= 3) return RARITIES.elite;
        if (it.q === 2) return RARITIES.pro;
      }
    } catch (e) { /* tipo raro: común */ }
    return RARITIES.comun;
  }

  /* =========================================================
     Degradados compartidos (se insertan UNA vez en la página)
     ========================================================= */
  const U = (k) => `url(#am-${k})`;
  function sharedDefs() {
    const r = Object.keys(RARITIES).map((k) => rad('am-glow-' + k, [[0, RARITIES[k].color, 0.5], [0.5, RARITIES[k].color, 0.14], [1, RARITIES[k].color, 0]])).join('');
    return r
      + lin('am-gm', [[0, '#646d80'], [0.12, '#4a5263'], [0.5, '#2a303b'], [1, '#14171d']])
      + lin('am-gmd', [[0, '#3a414e'], [0.5, '#1f232b'], [1, '#0c0e12']])
      + lin('am-al', [[0, '#fbfcfd'], [0.4, '#d3d9e1'], [0.55, '#aab3c0'], [1, '#e1e6ec']])
      + lin('am-pl', [[0, '#3b414c'], [0.3, '#22262e'], [1, '#0b0d11']])
      + lin('am-cy', [[0, '#1f242c'], [0.22, '#6b7487'], [0.4, '#3a414e'], [0.8, '#15181e'], [1, '#08090c']])
      + lin('am-cyp', [[0, '#16191f'], [0.22, '#4a505c'], [0.42, '#22262d'], [0.85, '#0b0c10'], [1, '#050608']])
      + lin('am-cyal', [[0, '#8a93a1'], [0.22, '#ffffff'], [0.45, '#c3cad4'], [0.85, '#7c8594'], [1, '#5b6476']])
      + lin('am-side', [[0, '#1a1e25'], [1, '#07080b']], 1, 0)
      + rad('am-lens', [[0, '#d6efff'], [0.12, '#7fb8ee'], [0.35, '#24528a'], [0.7, '#0a1628'], [1, '#020306']], 0.36, 0.32, 0.7)
      + lin('am-lcd', [[0, '#3b86d6'], [0.55, '#1d4f86'], [1, '#0b2442']])
      + lin('am-scr', [[0, '#141b28'], [1, '#05070b']])
      + rad('am-sh', [[0, '#000', 0.6], [0.6, '#000', 0.25], [1, '#000', 0]])
      + lin('am-sp', [[0, '#fff', 0.42], [1, '#fff', 0]])
      + lin('am-gold', [[0, '#fff3c4'], [0.35, '#f5c542'], [0.7, '#c68a12'], [1, '#7a520c']])
      + lin('am-org', [[0, '#ffd27a'], [0.35, '#f5a01b'], [1, '#9a4f05']])
      + lin('am-red', [[0, '#ff6b6b'], [0.5, '#d42a30'], [1, '#7a1015']])
      + lin('am-wht', [[0, '#ffffff'], [0.6, '#dfe4ea'], [1, '#a9b2bf']])
      + lin('am-rub', [[0, '#34373e'], [1, '#0a0b0e']])
      + lin('am-fab', [[0, '#3a3f49'], [0.5, '#22262d'], [1, '#121418']], 1, 1)
      + lin('am-glass', [[0, '#bfe0ff', 0.35], [1, '#4da3ff', 0.12]])
      + rad('am-dish', [[0, '#ffffff'], [0.6, '#dde3ea'], [1, '#8f99aa']], 0.4, 0.4, 0.7)
      + rad('am-dishg', [[0, '#fff3c4'], [0.6, '#f0b829'], [1, '#8a5a10']], 0.4, 0.4, 0.7)
      + lin('am-meter', [[0, '#ff3b3b'], [0.25, '#ffb020'], [0.45, '#2ecc71'], [1, '#1d8a4c']])
      + lin('am-cable', [[0, '#3f7fd0'], [0.5, '#1d4f86'], [1, '#0b2442']])
      + rad('am-warm', [[0, '#fff8e0'], [0.5, '#ffd27a'], [1, '#c98a2a']])
      + rad('am-tire', [[0, '#6b7487'], [0.45, '#3a4150'], [0.5, '#111'], [1, '#050505']])
      // Escenas
      + lin('am-cone', [[0, '#fffbe0', 0.34], [1, '#fffbe0', 0]])
      + lin('am-coneB', [[0, '#cfe6ff', 0.3], [1, '#cfe6ff', 0]])
      + ['#ff3b3b', '#4da3ff', '#ffb020', '#b04dff'].map((c, i) => lin('am-b' + i, [[0, c, 0.55], [1, c, 0]])).join('')
      + rad('am-vig', [[0, '#000', 0], [0.68, '#000', 0], [1, '#000', 0.55]], 0.5, 0.45, 0.72)
      + rad('am-haze', [[0, '#fff', 0.14], [1, '#fff', 0]])
      + rad('am-pool', [[0, '#fffbe0', 0.42], [0.6, '#fffbe0', 0.1], [1, '#fffbe0', 0]])
      + rad('am-poolW', [[0, '#ffd27a', 0.38], [0.6, '#ffd27a', 0.1], [1, '#ffd27a', 0]])
      + lin('am-turf', [[0, '#17532d'], [1, '#2f9150']])
      + lin('am-night', [[0, '#03060d'], [0.65, '#101a30'], [1, '#26324e']])
      + lin('am-dusk', [[0, '#1d2a4a'], [0.55, '#8a4a6a'], [1, '#f0a060']])
      + lin('am-day', [[0, '#3f78b8'], [0.7, '#86b6e0'], [1, '#c9dcec']])
      + lin('am-cover', [[0, '#8f99aa'], [0.35, '#4a5263'], [1, '#14171d']])
      + lin('am-wood', [[0, '#8a6440'], [1, '#3a2818']])
      + lin('am-led', [[0, '#ff3b3b'], [0.5, '#b04dff'], [1, '#4da3ff']], 1, 0)
      + rad('am-flame', [[0, '#fff3c4', 0.95], [0.35, '#ffb020', 0.45], [1, '#ffb020', 0]])
      + lin('am-floor', [[0, '#3a3027'], [1, '#14100c']])
      + lin('am-floorC', [[0, '#1e2232'], [1, '#07080c']])
      + lin('am-mat', [[0, '#e9edf5'], [1, '#9aa3b0']])
      + lin('am-wallW', [[0, '#3a2c28'], [1, '#1a1412']])
      + lin('am-road', [[0, '#3a3f4a'], [1, '#15171c']]);
  }
  const SHARED_ID = 'art-shared-defs';
  function ensureShared() {
    try {
      if (typeof document === 'undefined' || !document.body) return false;
      if (!document.getElementById(SHARED_ID)) {
        document.body.insertAdjacentHTML('afterbegin', `<svg id="${SHARED_ID}" width="0" height="0" style="position:absolute;width:0;height:0;overflow:hidden" aria-hidden="true" focusable="false"><defs>${sharedDefs()}</defs></svg>`);
      }
      return true;
    } catch (e) { return false; }
  }

  /* =========================================================
     Equipos: render semi-realista (120x120). Se dibujan por SUBTIPO,
     así un equipo nuevo se ve bien sin código nuevo:
     Art.item(tipo, tamaño, { subtipo, cat })
     ========================================================= */
  const SH = (cx, rx, cy, ry) => `<ellipse cx="${cx}" cy="${cy || 103}" rx="${rx}" ry="${ry || 6.5}" fill="${U('sh')}"/>`;
  const SPEC = (x, y, w, h, rx) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${rx || 0}" fill="${U('sp')}"/>`;
  const BEV = (x1, y, x2) => `<path d="M${x1} ${y}H${x2}" stroke="#fff" stroke-opacity=".28" stroke-width="1"/>`;
  const TALLY = (x, y, r) => `<circle cx="${x}" cy="${y}" r="${(r || 2.2) * 2.6}" fill="#ff3b3b" opacity=".2"/><circle cx="${x}" cy="${y}" r="${r || 2.2}" fill="#ff3b3b" class="blink"/><circle cx="${x - 0.6}" cy="${y - 0.6}" r="${(r || 2.2) * 0.35}" fill="#fff" opacity=".8"/>`;
  const LED = (x, y, c, blink) => `<circle cx="${x}" cy="${y}" r="1.4" fill="${c}"${blink ? ' class="blink"' : ''}/>`;
  const LENSF = (cx, cy, rx, ry) => `<ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" fill="${U('lens')}"/><ellipse cx="${cx - rx * 0.3}" cy="${cy - ry * 0.45}" rx="${Math.max(0.6, rx * 0.25)}" ry="${ry * 0.18}" fill="#fff" opacity=".75"/>`;
  const RIBS = (x0, x1, y0, y1, step) => { let d = ''; for (let x = x0; x <= x1; x += step || 2) d += `M${x} ${y0}V${y1}`; return `<path d="${d}" stroke="#000" stroke-opacity=".38" stroke-width=".9"/>`; };
  const MINI_SCREEN = (x, y, w, h) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="#1d4f86"/><path d="M${x} ${y + h * 0.62}h${w}v${h * 0.38}h-${w}z" fill="#2f8f5b"/><circle cx="${x + w * 0.75}" cy="${y + h * 0.3}" r="${h * 0.14}" fill="#ffd27a"/><path d="M${x} ${y + h * 0.62}l${w * 0.25}-${h * 0.3} ${w * 0.2} ${h * 0.18} ${w * 0.2}-${h * 0.25} ${w * 0.35} ${h * 0.37}z" fill="#24405f"/>`;
  // Superficie en perspectiva para paneles y consolas (atrás y=40, adelante y=74)
  const deck = (t) => ({ y: 40 + 34 * t, xl: 26 - 16 * t, xr: 94 + 16 * t });
  const at = (u, t) => { const d = deck(t); return [d.xl + (d.xr - d.xl) * u, d.y]; };
  const sc = (t) => (68 + 32 * t) / 68;
  const DECK = (top, front) => `<path d="M26 40H94L110 74H10Z" fill="${top}"/><path d="M26 40H94" stroke="#fff" stroke-opacity=".25"/><path d="M10 74h100v9q0 2-2 2H12q-2 0-2-2z" fill="${front}"/><path d="M10 74h100" stroke="#fff" stroke-opacity=".18"/>`;
  const KEY = (u, t, w, h, fill, lit) => { const [x, y] = at(u, t); const k = sc(t); return `${lit ? `<rect x="${(x - w * k * 0.9).toFixed(1)}" y="${(y - h * k * 0.9).toFixed(1)}" width="${(w * k * 1.8).toFixed(1)}" height="${(h * k * 1.8).toFixed(1)}" rx="2" fill="${fill}" opacity=".25"/>` : ''}<rect x="${(x - w * k / 2).toFixed(1)}" y="${(y - h * k / 2).toFixed(1)}" width="${(w * k).toFixed(1)}" height="${(h * k).toFixed(1)}" rx="${(0.8 * k).toFixed(1)}" fill="${fill}"/>`; };

  const DRAW = {
    // Cámara de mano (camcorder)
    camcorder: (p) => `${SH(60, 40)}
      <rect x="40" y="80" width="40" height="5" rx="2" fill="${U('pl')}"/>
      <rect x="38" y="46" width="54" height="36" rx="9" fill="${U('gm')}"/>${SPEC(40, 47, 50, 10, 6)}${BEV(46, 46.6, 86)}
      <rect x="20" y="52" width="22" height="25" rx="3" fill="${U('cyp')}"/>${RIBS(26, 36, 52, 77, 2)}
      <path d="M12 47l10 5v25l-10 5z" fill="${U('pl')}"/>${LENSF(13, 64.5, 3.4, 13)}
      <path d="M46 47V37q0-4 4-4h30q4 0 4 4v10" fill="none" stroke="#1b1e25" stroke-width="5" stroke-linejoin="round"/>
      <rect x="26" y="29" width="22" height="5" rx="2.5" fill="${U('cyal')}"/><rect x="18" y="28" width="10" height="7" rx="3.5" fill="#23262d"/>
      <rect x="86" y="38" width="14" height="10" rx="3" fill="${U('cyp')}"/><rect x="98" y="37" width="5" height="12" rx="2" fill="${U('rub')}"/>
      <rect x="56" y="51" width="30" height="22" rx="2.5" fill="#0c0e12" stroke="#3a4150" stroke-width=".8"/>${MINI_SCREEN(58, 53, 26, 18)}${SPEC(58, 53, 26, 7)}
      <rect x="90" y="52" width="7" height="26" rx="3" fill="${U('rub')}"/>
      <circle cx="47" cy="76" r="2" fill="#3a4150"/>${TALLY(45, 52, 1.8)}`,
    // Cámara de hombro (ENG)
    eng: (p) => `${SH(60, 52)}
      <path d="M60 80h28q4 0 4 4v5q0 3-3 3H62q-4 0-4-3v-5q0-4 2-4z" fill="${U('rub')}"/>
      <rect x="98" y="46" width="14" height="36" rx="2.5" fill="${U('pl')}"/><rect x="99.5" y="49" width="2" height="30" fill="#000" opacity=".35"/>${LED(107, 52, '#2ecc71')}${LED(107, 56, '#2ecc71')}${LED(107, 60, '#2ecc71')}${LED(107, 64, '#3a4150')}
      <rect x="44" y="42" width="56" height="40" rx="5" fill="${p.body || U('gm')}"/>${SPEC(45, 43, 54, 11, 5)}${BEV(48, 42.6, 96)}
      <rect x="58" y="56" width="34" height="18" rx="2" fill="#0d1015" stroke="#000" stroke-opacity=".5"/>
      <rect x="61" y="59" width="13" height="8" rx="1" fill="${U('lcd')}"/><text x="67.5" y="65" font-size="4.5" font-family="${FONT_M}" fill="#cfe6ff" text-anchor="middle">${p.tag || 'HD'}</text>
      ${[[79, 61], [85, 61], [79, 68], [85, 68]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="1.7" fill="#3a4150"/>`).join('')}<rect x="62" y="69" width="9" height="2.5" rx="1" fill="#5b6476"/>
      <rect x="40" y="48" width="7" height="28" rx="1.5" fill="${U('cyal')}"/>
      <rect x="14" y="51" width="28" height="22" rx="2" fill="${U('cyp')}"/>${RIBS(22, 33, 51, 73, 2)}
      <rect x="6" y="46" width="11" height="32" rx="2.5" fill="${U('cyp')}"/>${LENSF(7.5, 62, 3, 14)}
      <rect x="22" y="66" width="20" height="22" rx="5" fill="${U('pl')}"/><rect x="26" y="69.5" width="8" height="3" rx="1.5" fill="#5b6476"/><circle cx="38" cy="71" r="1.6" fill="#ff3b3b"/>
      <path d="M54 42v-8q0-4 4-4h30q4 0 4 4v8" fill="none" stroke="#1b1e25" stroke-width="5" stroke-linejoin="round"/>
      <rect x="28" y="30" width="25" height="11" rx="3" fill="${U('cyp')}"/><rect x="51" y="29" width="7" height="13" rx="2.5" fill="${U('rub')}"/><rect x="40" y="40" width="6" height="3" fill="#14171d"/>
      <rect x="20" y="22" width="34" height="5" rx="2.5" fill="${U('cyal')}"/><rect x="9" y="20.5" width="14" height="8" rx="4" fill="#23262d"/><rect x="55" y="21" width="4" height="10" rx="1" fill="#14171d"/>
      ${p.vip ? '<path d="M44 81h56" stroke="#f0b829" stroke-width="1.5"/>' : ''}${TALLY(50, 47)}`,
    // Cámara de estudio con lente de caja (sistema)
    system: (p) => `${SH(60, 48)}
      <ellipse cx="58" cy="101" rx="26" ry="5" fill="${U('gmd')}"/><rect x="52" y="86" width="12" height="15" fill="${U('cy')}"/>
      <path d="M76 82l34 12" stroke="#2a2f3a" stroke-width="3" stroke-linecap="round"/><rect x="104" y="89" width="10" height="7" rx="3" transform="rotate(20 109 92)" fill="${U('rub')}"/>
      <rect x="44" y="78" width="32" height="9" rx="2" fill="${U('gm')}"/>
      <rect x="60" y="44" width="38" height="35" rx="4" fill="${p.body || U('al')}"/>${SPEC(61, 45, 36, 10, 4)}
      <rect x="64" y="58" width="22" height="14" rx="1.5" fill="#cfd5dd" stroke="#8f99aa" stroke-width=".7"/>${[0, 1, 2].map((i) => `<circle cx="${68 + i * 6}" cy="65" r="1.6" fill="#5b6476"/>`).join('')}
      <rect x="96" y="50" width="8" height="24" rx="2" fill="${U('pl')}"/>
      <rect x="10" y="40" width="54" height="40" rx="4" fill="${U('gmd')}"/>${SPEC(11, 41, 52, 10, 4)}${BEV(14, 40.6, 60)}
      <rect x="18" y="50" width="30" height="16" rx="2" fill="#0b0d11" stroke="#000" stroke-opacity=".5"/><text x="33" y="61" font-size="7" font-family="${FONT_M}" fill="#8b95a8" text-anchor="middle">86×</text>
      <path d="M10 72h54" stroke="${p.acc || '#ff3b3b'}" stroke-width="1.6"/>
      <rect x="4" y="42" width="9" height="36" rx="2.5" fill="${U('cyp')}"/>${LENSF(5.5, 60, 3, 15)}
      <rect x="52" y="18" width="44" height="26" rx="3" fill="${U('pl')}"/>${SPEC(53, 19, 42, 7, 3)}<rect x="92" y="21" width="4" height="20" fill="#2f6fb3"/><rect x="56" y="22" width="8" height="5" rx="1" fill="#e9edf5"/><text x="60" y="26.2" font-size="4.6" font-family="${FONT_M}" fill="#14171d" text-anchor="middle">2</text>
      <rect x="66" y="12" width="14" height="6" rx="1.5" fill="#ff3b3b" class="blink"/><rect x="62" y="10" width="22" height="10" rx="3" fill="#ff3b3b" opacity=".18"/>`,
    // Cámara robótica PTZ
    ptz: (p) => `${SH(60, 32)}
      <rect x="34" y="84" width="52" height="16" rx="5" fill="${U('pl')}"/>${SPEC(35, 85, 50, 5, 4)}${LED(44, 93, '#4da3ff', true)}
      <path d="M38 86V56q0-6 6-6h3v36zM82 86V56q0-6-6-6h-3v36z" fill="${U('gm')}"/>
      <rect x="40" y="38" width="40" height="44" rx="18" fill="${p.body || U('wht')}"/>${SPEC(42, 39, 36, 12, 12)}
      <circle cx="60" cy="60" r="15" fill="${U('pl')}"/><circle cx="60" cy="60" r="11.5" fill="${U('cyp')}"/>${LENSF(60, 60, 8.5, 8.5)}
      <circle cx="73" cy="44" r="1.7" fill="#ff3b3b" class="blink"/>`,
    // Cámara de cine (cubo + matte box)
    cine: (p) => `${SH(60, 48)}
      <rect x="86" y="46" width="12" height="32" rx="2" fill="${U('pl')}"/>${LED(92, 52, '#2ecc71')}${LED(92, 56, '#2ecc71')}
      <rect x="44" y="40" width="44" height="40" rx="4" fill="${U('pl')}"/>${SPEC(45, 41, 42, 10, 4)}${BEV(48, 40.6, 84)}
      <rect x="54" y="52" width="26" height="16" rx="1.5" fill="#0b0d11"/><text x="67" y="62.5" font-size="7" font-family="${FONT_D}" font-weight="800" fill="${p.acc || '#8b95a8'}" text-anchor="middle">${p.tag || '6K'}</text>
      <rect x="22" y="48" width="24" height="26" rx="2" fill="${U('cyp')}"/>${RIBS(28, 38, 48, 74, 1.6)}<rect x="30" y="74" width="8" height="10" rx="2" fill="${p.acc || '#3a4150'}"/><circle cx="34" cy="86" r="4" fill="${U('gm')}"/>
      <path d="M8 36h14v52H8z" fill="${U('pl')}"/><path d="M8 36l-3 -3M8 88l-3 3" stroke="#14171d" stroke-width="3"/>${LENSF(15, 61, 3.4, 12)}
      <path d="M52 40v-8q0-3 3-3h24q3 0 3 3v8" fill="none" stroke="#1b1e25" stroke-width="4.5"/>
      <path d="M86 30l6-6" stroke="#2a2f3a" stroke-width="3"/><rect x="84" y="10" width="28" height="18" rx="2" fill="${U('pl')}"/>${MINI_SCREEN(86, 12, 24, 14)}${SPEC(86, 12, 24, 5)}
      ${p.vip ? '<path d="M44 80h44M22 48h24" stroke="#f0b829" stroke-width="1.6"/>' : ''}${TALLY(84, 44, 1.6)}`,
    // Panel de switcher con T-bar y monitor multiview
    switcher: (p) => `${SH(60, 52, 104)}
      <rect x="56" y="34" width="8" height="10" fill="${U('gmd')}"/>
      <rect x="30" y="6" width="60" height="32" rx="2" fill="${U('pl')}"/><rect x="32" y="8" width="56" height="28" fill="#05070b"/>
      <rect x="33" y="9" width="26" height="15" fill="#1d4f86" stroke="#2ecc71" stroke-width="1"/><rect x="61" y="9" width="26" height="15" fill="#5a1d22" stroke="#ff3b3b" stroke-width="1"/>
      ${MINI_SCREEN(34, 10, 24, 13)}${MINI_SCREEN(62, 10, 24, 13)}
      ${[0, 1, 2, 3].map((i) => `<rect x="${33 + i * 13.6}" y="26" width="12.6" height="9" fill="${['#2f5a3e', '#5a4a2a', '#3b2f55', '#24405f'][i]}"/>`).join('')}${SPEC(32, 8, 56, 8)}
      ${DECK(U('gm'), U('pl'))}
      <rect x="${at(0.06, 0.08)[0]}" y="43" width="14" height="5" rx="1" fill="${U('lcd')}"/>
      ${[0.3, 0.55, 0.8].map((t, r) => Array.from({ length: 8 }, (_, i) => KEY(0.06 + i * 0.085, t, 5, 3.3, r === 0 && i === 2 ? '#ff3b3b' : r === 1 && i === 4 ? '#2ecc71' : r === 2 && i === 0 ? '#ffb020' : '#4a5263', (r === 0 && i === 2) || (r === 1 && i === 4))).join('')).join('')}
      <path d="M${at(0.86, 0.35)[0]} ${at(0.86, 0.35)[1]}L${at(0.86, 0.9)[0]} ${at(0.86, 0.9)[1]}" stroke="#05070b" stroke-width="3" stroke-linecap="round"/>
      <path d="M${at(0.86, 0.6)[0]} ${at(0.86, 0.6)[1]}L${at(0.86, 0.6)[0] + 8} ${at(0.86, 0.6)[1] - 14}" stroke="${U('cyal')}" stroke-width="2.4" stroke-linecap="round"/>
      <rect x="${at(0.86, 0.6)[0] + 2}" y="${at(0.86, 0.6)[1] - 19}" width="14" height="5" rx="2.5" fill="${U('cyal')}"/>
      <circle cx="${at(0.98, 0.25)[0] - 6}" cy="${at(0.98, 0.25)[1]}" r="3.4" fill="${U('gmd')}" stroke="#5b6476" stroke-width=".8"/><path d="M${at(0.98, 0.25)[0] - 6} ${at(0.98, 0.25)[1]}v-5" stroke="#8f99aa" stroke-width="1.6" stroke-linecap="round"/>
      ${p.vip ? '<path d="M10 83h100" stroke="#f0b829" stroke-width="1.6"/>' : ''}`,
    // Laptop con vMax
    laptop: (p) => `${SH(60, 50, 102)}
      <path d="M22 84h76l12 12H10z" fill="${U('al')}"/><path d="M10 96h100v2.5q0 1.5-1.5 1.5h-97q-1.5 0-1.5-1.5z" fill="#6b7487"/>
      ${[0, 1, 2, 3].map((r) => `<path d="M${25 - r * 2.6} ${86.2 + r * 2.4}h${70 + r * 5.2}" stroke="#2a2f3a" stroke-width="1.3" stroke-dasharray="3 1"/>`).join('')}<path d="M50 95.2h20" stroke="#8f99aa" stroke-width="2.4"/>
      <path d="M24 28h72q2 0 2 2v54H22V30q0-2 2-2z" fill="${U('pl')}"/><rect x="26" y="31" width="68" height="50" fill="#05070b"/>
      <rect x="27" y="32" width="32" height="20" fill="#1d4f86" stroke="#2ecc71" stroke-width="1"/>${MINI_SCREEN(28, 33, 30, 18)}
      <rect x="61" y="32" width="32" height="20" fill="#5a1d22" stroke="#ff3b3b" stroke-width="1"/>${MINI_SCREEN(62, 33, 30, 18)}
      ${[0, 1, 2, 3].map((i) => `<rect x="${27 + i * 16.6}" y="55" width="15.6" height="10" fill="${['#2f5a3e', '#5a4a2a', '#3b2f55', '#24405f'][i]}"/>`).join('')}
      <rect x="27" y="68" width="66" height="11" fill="#11161f"/><rect x="29" y="70.5" width="18" height="6" rx="1" fill="#ff3b3b"/><rect x="49" y="70.5" width="14" height="6" rx="1" fill="#2a3242"/><rect x="65" y="70.5" width="26" height="6" rx="1" fill="#2a3242"/>
      <path d="M26 31h68l-30 50H26z" fill="#fff" opacity=".05"/>`,
    // Consola de audio (digital con pantalla o analógica)
    console: (p) => {
      const n = p.channels || 12;
      const screen = p.screen !== false;
      let strips = '';
      for (let i = 0; i < n; i++) {
        const u = 0.06 + i * (0.88 / (n - 1));
        const [x0, y0] = at(u, screen ? 0.45 : 0.55), [x1, y1] = at(u, 0.95);
        const tt = (screen ? 0.5 : 0.6) + ((i * 37) % 10) / 30;
        strips += `<path d="M${x0.toFixed(1)} ${y0}L${x1.toFixed(1)} ${y1}" stroke="#05070b" stroke-width="1.6"/>${KEY(u, tt, 4.6, 2.6, i === n - 1 ? '#ff3b3b' : '#e1e6ec')}`;
        strips += (screen ? [0.12, 0.3] : [0.1, 0.25, 0.4]).map((t, k) => { const [x, y] = at(u, t); return `<circle cx="${x.toFixed(1)}" cy="${y}" r="${(1.7 * sc(t)).toFixed(2)}" fill="${screen ? '#8f99aa' : ['#ff5a5a', '#4da3ff', '#e1e6ec'][k]}"/>`; }).join('');
      }
      const scr = screen ? `<rect x="40" y="41" width="40" height="12" rx="1" fill="#05070b"/>${Array.from({ length: 12 }, (_, i) => `<rect x="${42 + i * 3.1}" y="${52 - (3 + (i * 7) % 8)}" width="2" height="${3 + (i * 7) % 8}" fill="${U('meter')}"/>`).join('')}` : '';
      return `${SH(60, 54, 104)}${DECK(U('gm'), U('pl'))}${scr}${strips}`;
    },
    // Receptor inalámbrico + micrófono de mano
    mic_wireless: (p) => `${SH(60, 46, 104)}
      <path d="M24 56l8-10h66l-8 10z" fill="${U('gm')}"/><rect x="24" y="56" width="66" height="24" rx="2" fill="${U('pl')}"/><path d="M90 56l8-10v24l-8 10z" fill="${U('side')}"/>${BEV(26, 56.6, 88)}
      <rect x="29" y="61" width="30" height="13" rx="1.5" fill="${U('lcd')}"/><text x="31" y="67" font-size="4.6" font-family="${FONT_M}" fill="#e9f3ff">CH 1</text><text x="31" y="72" font-size="4" font-family="${FONT_M}" fill="#9ec5ff">-12 dB</text>
      ${[0, 1, 2, 3, 4].map((i) => `<rect x="${49 + i * 1.8}" y="${72 - i * 1.6}" width="1.2" height="${1.6 + i * 1.6}" fill="#e9f3ff"/>`).join('')}
      <circle cx="68" cy="68" r="4" fill="${U('gmd')}" stroke="#5b6476" stroke-width=".8"/>${LED(78, 64, '#2ecc71', true)}${LED(78, 70, '#ffb020')}<circle cx="85" cy="68" r="2.4" fill="#3a4150"/>
      <path d="M34 47l-6-24M88 47l6-24" stroke="#14171d" stroke-width="2.6" stroke-linecap="round"/><circle cx="28" cy="23" r="1.8" fill="#2a2f3a"/><circle cx="94" cy="23" r="1.8" fill="#2a2f3a"/>
      <g transform="rotate(-14 62 92)"><rect x="40" y="88" width="40" height="8" rx="4" fill="${U('cyp')}"/><rect x="76" y="87" width="5" height="10" rx="1.5" fill="#2a2f3a"/>
        <ellipse cx="88" cy="92" rx="9" ry="8" fill="${U('cyal')}"/><path d="M82 88h12M81 92h14M82 96h12M88 84v16M85 85v14M91 85v14" stroke="#5b6476" stroke-width=".6"/><rect x="50" y="90" width="4" height="4" rx="1" fill="#2ecc71"/></g>`,
    // Encoder SRT portátil
    encoder: (p) => `${SH(60, 42, 102)}
      <path d="M26 54l8-8h58l-8 8z" fill="${U('gm')}"/><rect x="26" y="54" width="58" height="36" rx="3" fill="${U('pl')}"/><path d="M84 54l8-8v34l-8 10z" fill="${U('side')}"/>${BEV(28, 54.6, 82)}
      ${[[26, 54], [80, 54], [26, 86], [80, 86]].map(([x, y]) => `<rect x="${x}" y="${y}" width="4" height="4" rx="1" fill="${p.acc || '#ff3b3b'}"/>`).join('')}
      <rect x="32" y="59" width="30" height="14" rx="1.5" fill="#03140b" stroke="#1d3b2b" stroke-width=".8"/><text x="34" y="65.5" font-size="5" font-family="${FONT_M}" fill="#2ecc71">SRT ●</text><text x="34" y="71" font-size="4" font-family="${FONT_M}" fill="#7fe0a8">8.2 Mbps</text>
      ${[0, 1].map((i) => `<rect x="${66 + i * 8}" y="60" width="6" height="5" rx="1" fill="#05070b"/><circle cx="${69 + i * 8}" cy="62.5" r="1.3" fill="#f0b829"/>`).join('')}
      ${LED(34, 80, '#2ecc71', true)}${LED(39, 80, '#2ecc71')}${LED(44, 80, '#ffb020')}<path d="M52 80h26" stroke="#05070b" stroke-width="2.5" stroke-linecap="round"/>
      ${[38, 74].map((x) => `<path d="M${x} 47l-2-18" stroke="#14171d" stroke-width="3.4" stroke-linecap="round"/>`).join('')}
      <path d="M50 30a12 12 0 0116 0M45 25a19 19 0 0126 0" stroke="#4da3ff" stroke-width="2" fill="none" stroke-linecap="round" class="blink"/>`,
    // Mochila de transmisión (bonding)
    bonding: (p) => `${SH(60, 34)}
      ${[0, 1, 2, 3, 4, 5].map((i) => `<rect x="${36 + i * 8.6}" y="${10 + (i % 2) * 4}" width="5" height="22" rx="2.5" fill="${U('pl')}"/>`).join('')}
      <path d="M30 30q0-8 8-8h44q8 0 8 8v62q0 6-6 6H36q-6 0-6-6z" fill="${U('fab')}"/>${SPEC(32, 23, 56, 12, 8)}
      <path d="M26 40q-4 30 2 56" stroke="#14171d" stroke-width="5" fill="none" stroke-linecap="round"/><path d="M94 40q4 30-2 56" stroke="#14171d" stroke-width="5" fill="none" stroke-linecap="round"/>
      <rect x="38" y="56" width="44" height="34" rx="6" fill="#1b1e24" stroke="#2f343d"/><path d="M40 60h40" stroke="#5b6476" stroke-width="1" stroke-dasharray="1.5 1"/>
      <rect x="38" y="78" width="44" height="3.5" fill="#cfd8e6" opacity=".75"/>
      <rect x="44" y="34" width="32" height="16" rx="2" fill="#0b0d11" stroke="#2f343d"/><text x="60" y="44.5" font-size="6.5" font-family="${FONT_D}" font-weight="800" fill="#ff3b3b" text-anchor="middle">LIVE</text>
      ${[0, 1, 2, 3].map((i) => LED(48 + i * 8, 68, i < 3 ? '#2ecc71' : '#ffb020', i === 1)).join('')}`,
    // Router 4G
    router: (p) => `${SH(60, 44, 100)}
      ${[30, 90].map((x, i) => `<path d="M${x} 62l${i ? 8 : -8}-36" stroke="#14171d" stroke-width="4.5" stroke-linecap="round"/>`).join('')}
      <path d="M20 62l10-10h66l-10 10z" fill="${U('al')}"/><rect x="20" y="62" width="66" height="26" rx="4" fill="${U('wht')}"/><path d="M86 62l10-10v24l-10 12z" fill="#8f99aa"/>${SPEC(22, 63, 62, 7, 3)}
      ${[0, 1, 2, 3].map((i) => LED(30 + i * 8, 75, i === 3 ? '#ffb020' : '#2ecc71', i === 1)).join('')}
      <text x="76" y="79" font-size="11" font-family="${FONT_D}" font-weight="800" fill="#2f6fb3" text-anchor="middle">4G</text>`,
    // UPS
    ups: (p) => `${SH(60, 32)}
      <path d="M38 22l10-8h34l-10 8z" fill="${U('gm')}"/><rect x="38" y="22" width="34" height="78" rx="4" fill="${U('pl')}"/><path d="M72 22l10-8v76l-10 10z" fill="${U('side')}"/>${SPEC(39, 23, 32, 10, 4)}
      <rect x="43" y="30" width="24" height="17" rx="1.5" fill="${U('lcd')}"/><rect x="47" y="34" width="13" height="7" rx="1" fill="none" stroke="#cfe6ff" stroke-width="1"/><rect x="60" y="36" width="1.6" height="3" fill="#cfe6ff"/><rect x="48.5" y="35.5" width="8" height="4" fill="#2ecc71"/>
      <circle cx="55" cy="58" r="5" fill="#14171d" stroke="#2ecc71" stroke-width="1.6"/><path d="M55 54.5v3.6" stroke="#2ecc71" stroke-width="1.6" stroke-linecap="round"/>
      ${[0, 1, 2, 3, 4, 5].map((i) => `<path d="M44 ${70 + i * 4.4}h22" stroke="#05070b" stroke-width="2"/>`).join('')}`,
    // Batería V-mount
    vbattery: (p) => `${SH(60, 30)}
      <path d="M34 30l10-8h40l-10 8z" fill="${U('gm')}"/><rect x="34" y="30" width="40" height="66" rx="5" fill="${U('pl')}"/><path d="M74 30l10-8v64l-10 10z" fill="${U('side')}"/>${SPEC(35, 31, 38, 12, 5)}
      <rect x="40" y="38" width="28" height="12" rx="1.5" fill="#0b0d11"/><text x="54" y="46.5" font-size="5.6" font-family="${FONT_M}" fill="#e9edf5" text-anchor="middle">98Wh</text>
      <path d="M58 56l-8 13h6l-4 11 11-15h-6l4-9z" fill="${U('org')}"/>
      ${[0, 1, 2, 3].map((i) => `<rect x="${41 + i * 7}" y="86" width="5" height="3" rx="1" fill="${i < 3 ? '#2ecc71' : '#2a2f3a'}"/>`).join('')}<circle cx="66" cy="80" r="2" fill="#3a4150"/>`,
    // Carrete de cable SDI / fibra
    cable_reel: (p) => `${SH(60, 40)}
      <path d="M38 100l14-40M82 100l-14-40" stroke="${U('cyal')}" stroke-width="4" stroke-linecap="round"/>
      <circle cx="58" cy="56" r="38" fill="${U('pl')}"/><circle cx="58" cy="56" r="33" fill="#0b0d11"/>
      ${[31, 27, 23, 19].map((r, i) => `<circle cx="58" cy="56" r="${r}" fill="none" stroke="${i % 2 ? '#163c69' : U('cable')}" stroke-width="4.6"/>`).join('')}
      <path d="M58 56m-33 0a33 33 0 0166 0" fill="none" stroke="#fff" stroke-opacity=".12" stroke-width="5"/>
      <circle cx="58" cy="56" r="13" fill="${U('cyal')}"/><circle cx="58" cy="56" r="4" fill="#3a4150"/>${[0, 1, 2].map((i) => `<path d="M58 56l${(Math.cos(i * 2.094) * 12).toFixed(1)} ${(Math.sin(i * 2.094) * 12).toFixed(1)}" stroke="#8f99aa" stroke-width="2"/>`).join('')}
      <path d="M58 56l18-14" stroke="#5b6476" stroke-width="3" stroke-linecap="round"/><rect x="74" y="36" width="5" height="9" rx="2.5" fill="#ff3b3b"/>
      <path d="M90 52q12 10 8 34q-2 10 6 14" stroke="${U('cable')}" stroke-width="4" fill="none" stroke-linecap="round"/><rect x="100" y="96" width="12" height="6" rx="2" fill="${U('cyal')}"/>`,
    // Cobertor de lluvia (sobre una cámara)
    raincover: (p) => `${DRAW.eng(p).replace(SH(60, 52), SH(60, 52))}
      <path d="M2 50C6 22 36 12 62 14s46 10 48 32v34q0 8-12 8H40C20 88 4 78 2 64z" fill="${U('glass')}" stroke="#bfe0ff" stroke-opacity=".7" stroke-width="1.4"/>
      <path d="M14 34c14-12 44-16 66-10" stroke="#fff" stroke-width="2.4" opacity=".55" fill="none" stroke-linecap="round"/>
      ${[[24, 30], [46, 22], [86, 24], [104, 44], [10, 52], [72, 84]].map(([x, y]) => `<path d="M${x} ${y}q2.6 4 0 6.5q-2.6-2.5 0-6.5z" fill="#d6ecff" opacity=".9"/>`).join('')}`,
    // Dron de 4 brazos
    drone: (p) => `${SH(60, 26, 106, 4)}
      <g class="hover">
      ${[[24, 40], [96, 40]].map(([x, y]) => `<path d="M60 56L${x} ${y}" stroke="#14171d" stroke-width="4.6" stroke-linecap="round"/><rect x="${x - 3.5}" y="${y - 6}" width="7" height="8" rx="2" fill="${U('cy')}"/>`).join('')}
      <path d="M40 66l-6 22M80 66l6 22" stroke="#2a2f3a" stroke-width="2.4" stroke-linecap="round"/><path d="M28 88h14M78 88h14" stroke="#2a2f3a" stroke-width="2.4" stroke-linecap="round"/>
      <path d="M38 52c4-12 40-12 44 0l3 12c-7 9-43 9-50 0z" fill="${p.body || U('wht')}"/><path d="M44 49c7-6 25-6 32 0" stroke="#fff" stroke-width="2" fill="none" opacity=".9"/><path d="M38 60c10 6 34 6 44 0" stroke="#000" stroke-opacity=".18" stroke-width="2" fill="none"/>
      ${[[30, 72], [90, 72]].map(([x, y]) => `<path d="M60 60L${x} ${y}" stroke="#14171d" stroke-width="5.4" stroke-linecap="round"/><rect x="${x - 4}" y="${y - 7}" width="8" height="9" rx="2" fill="${U('cy')}"/>`).join('')}
      <rect x="55" y="68" width="10" height="5" rx="1.5" fill="#14171d"/><rect x="52.5" y="72" width="15" height="11" rx="3" fill="${U('pl')}"/>${LENSF(60, 77.5, 3.6, 3.6)}
      ${LED(42, 60, '#ff3b3b', true)}${LED(78, 60, '#2ecc71', true)}
      ${[[24, 33, 0.8], [96, 33, 0.8], [30, 64, 1], [90, 64, 1]].map(([x, y, k], i) => `<ellipse cx="${x}" cy="${y}" rx="${18 * k}" ry="${4.2 * k}" fill="#d6e0ee" opacity=".16"/><g transform="translate(${x} ${y}) scale(${k} ${0.24 * k})"><g class="spin" style="animation-duration:${0.24 + i * 0.03}s"><path d="M-17 0h34" stroke="#e9edf5" stroke-width="3.4" stroke-linecap="round" opacity=".85"/></g></g>`).join('')}
      </g>`,
    // Grúa / jib
    jib: (p) => `${SH(52, 40)}
      <path d="M36 100l14-34 14 34M50 66v34" stroke="#3a4150" stroke-width="3" stroke-linecap="round"/>${[36, 64, 50].map((x) => `<circle cx="${x}" cy="101" r="2.6" fill="#14171d"/>`).join('')}
      <rect x="43" y="60" width="14" height="9" rx="2" fill="${U('gm')}"/>
      <path d="M12 80L104 28" stroke="#14171d" stroke-width="8" stroke-linecap="round"/><path d="M12 80L104 28" stroke="${U('cyal')}" stroke-width="5" stroke-linecap="round"/>
      <path d="M14 75l8 1M24 69l8 1M34 63l8 1M44 58l8 1M56 51l8 1M66 45l8 1M76 39l8 1M86 34l8 1" stroke="#5b6476" stroke-width="1.2"/>
      ${[0, 1, 2].map((i) => `<rect x="${3 + i * 2}" y="${76 + i * 6}" width="16" height="5" rx="1.5" fill="${U('gm')}"/>`).join('')}
      <path d="M104 28v8" stroke="#14171d" stroke-width="3"/><rect x="96" y="35" width="18" height="10" rx="2" fill="${U('gmd')}"/>
      <rect x="92" y="44" width="20" height="13" rx="2.5" fill="${U('al')}"/><rect x="86" y="46" width="8" height="9" rx="1.5" fill="${U('cyp')}"/>${LENSF(86.5, 50.5, 1.8, 4.2)}${TALLY(108, 47, 1.5)}
      <path d="M60 54q-6 20 4 40" stroke="#14171d" stroke-width="1.2" fill="none"/>`,
    // Unidad móvil con antena satelital
    ob_van: (p) => `${SH(60, 56, 104, 5)}
      <path d="M6 44q0-4 4-4h66v52H6z" fill="${U('wht')}"/>${SPEC(7, 41, 68, 9, 3)}
      <path d="M76 52h18q4 0 6 4l10 16v16q0 4-4 4H76z" fill="${U('wht')}"/><path d="M82 56h12l9 14H82z" fill="#1d3b5e"/><path d="M84 58h5l-3 10h-2z" fill="#fff" opacity=".35"/>
      <rect x="6" y="70" width="70" height="7" fill="${U('red')}"/><rect x="76" y="76" width="34" height="4" fill="${U('red')}"/>
      <path d="M30 44v24M52 44v24" stroke="#a9b2bf" stroke-width=".8"/><rect x="12" y="50" width="12" height="9" rx="1" fill="#1d3b5e"/>
      <text x="54" y="86.5" font-size="7" font-family="${FONT_D}" font-weight="800" fill="#ff3b3b" text-anchor="middle" letter-spacing=".6">EN VIVO</text>
      ${[24, 94].map((x) => `<circle cx="${x}" cy="92" r="10" fill="${U('tire')}"/>`).join('')}
      <path d="M26 40v-6" stroke="#5b6476" stroke-width="3"/><g transform="rotate(-24 26 26)"><ellipse cx="26" cy="26" rx="19" ry="7.5" fill="${p.vip ? U('dishg') : U('dish')}"/><path d="M26 26V14" stroke="#5b6476" stroke-width="1.6"/><circle cx="26" cy="13" r="2.2" fill="#3a4150"/></g>
      <path d="M62 40V18M58 18h8" stroke="#5b6476" stroke-width="2"/><circle cx="62" cy="16" r="2" fill="#ff3b3b" class="blink"/>`,
    // Generador
    generator: (p) => `${SH(60, 50)}
      <path d="M16 40h88M16 92h88M18 40v52M102 40v52" stroke="#1b1e25" stroke-width="4.6" stroke-linecap="round"/>
      <rect x="22" y="36" width="76" height="14" rx="5" fill="${U('org')}"/>${SPEC(24, 37, 72, 5, 3)}<circle cx="34" cy="36" r="4" fill="#14171d"/>
      <rect x="22" y="52" width="40" height="36" rx="3" fill="${U('gm')}"/>${RIBS(26, 58, 56, 84, 3)}
      <rect x="66" y="52" width="30" height="36" rx="2" fill="#1b1e25"/><circle cx="74" cy="61" r="4" fill="#e9edf5"/><path d="M74 61l2.6-2.6" stroke="#ff3b3b" stroke-width="1.2"/>
      <rect x="82" y="57" width="10" height="8" rx="1.5" fill="#2a2f3a"/><circle cx="85" cy="61" r="1" fill="#05070b"/><circle cx="89" cy="61" r="1" fill="#05070b"/>
      <rect x="70" y="72" width="8" height="4" rx="1" fill="#2ecc71"/><rect x="80" y="72" width="12" height="4" rx="1" fill="#ff3b3b"/>
      <path d="M90 36V24h8" stroke="#3a4150" stroke-width="4" fill="none"/><circle cx="102" cy="20" r="4" fill="#c5ccd6" opacity=".3" class="puff"/>
      ${[30, 90].map((x) => `<circle cx="${x}" cy="97" r="6" fill="${U('tire')}"/>`).join('')}`,
    // Servidor de repeticiones + controlador
    replay: (p) => `${SH(60, 52, 104)}
      <path d="M22 26l8-8h62l-8 8z" fill="${U('gm')}"/><rect x="22" y="26" width="62" height="26" rx="2" fill="${U('pl')}"/><path d="M84 26l8-8v26l-8 8z" fill="${U('side')}"/>
      ${[0, 1, 2, 3].map((i) => `<rect x="${26 + i * 9}" y="30" width="7" height="18" rx="1" fill="#14171d" stroke="#2f343d" stroke-width=".6"/>${LED(29.5 + i * 9, 45, '#2ecc71', i === 2)}`).join('')}
      <rect x="64" y="31" width="16" height="7" rx="1" fill="${U('lcd')}"/>
      ${DECK(U('gm'), U('pl'))}
      ${Array.from({ length: 6 }, (_, i) => KEY(0.08 + i * 0.08, 0.35, 5, 3.4, i === 1 ? '#ffb020' : '#4a5263')).join('')}
      ${Array.from({ length: 6 }, (_, i) => KEY(0.08 + i * 0.08, 0.7, 5, 3.4, i === 0 ? '#ff3b3b' : i === 3 ? '#2ecc71' : '#4a5263', i === 0)).join('')}
      <ellipse cx="${at(0.78, 0.6)[0]}" cy="${at(0.78, 0.6)[1]}" rx="15" ry="8" fill="${U('gmd')}" stroke="#5b6476" stroke-width=".8"/><ellipse cx="${at(0.78, 0.6)[0]}" cy="${at(0.78, 0.6)[1] - 1}" rx="10" ry="5.2" fill="${U('cy')}"/><circle cx="${at(0.78, 0.6)[0] + 4}" cy="${at(0.78, 0.6)[1] - 2}" r="1.6" fill="#14171d"/>`,
    // Intercom: beltpack y headset
    intercom: (p) => `${SH(60, 46)}
      <path d="M58 70a22 22 0 0144 0" stroke="#14171d" stroke-width="4" fill="none"/><ellipse cx="58" cy="76" rx="7" ry="10" fill="${U('rub')}"/><ellipse cx="102" cy="76" rx="7" ry="10" fill="${U('rub')}"/>
      <path d="M58 82q4 14 22 14" stroke="#2a2f3a" stroke-width="2" fill="none"/><ellipse cx="82" cy="96" rx="4" ry="3" fill="#14171d"/>
      <path d="M22 34l6-6h30l-6 6z" fill="${U('gm')}"/><rect x="22" y="34" width="30" height="62" rx="4" fill="${U('pl')}"/><path d="M52 34l6-6v62l-6 6z" fill="${U('side')}"/>${SPEC(23, 35, 28, 9, 4)}
      ${[0, 1].map((i) => `<circle cx="${30 + i * 14}" cy="46" r="4.4" fill="${U('gmd')}" stroke="#5b6476" stroke-width=".7"/><path d="M${30 + i * 14} 46l2.4-2.4" stroke="#e9edf5" stroke-width="1.2"/>`).join('')}
      <rect x="26" y="58" width="22" height="12" rx="2" fill="#ffb020"/><text x="37" y="66.5" font-size="6.5" font-family="${FONT_D}" font-weight="800" fill="#1a1205" text-anchor="middle">TALK</text>
      <rect x="26" y="74" width="22" height="12" rx="2" fill="#2a2f3a"/><text x="37" y="82.5" font-size="6.5" font-family="${FONT_D}" font-weight="800" fill="#8b95a8" text-anchor="middle">CALL</text>`,
    // Antena satelital portátil
    satellite: (p) => `${SH(60, 38)}
      <path d="M60 66l-22 36M60 66l22 36M60 66v36" stroke="${U('cyal')}" stroke-width="3" stroke-linecap="round"/>
      <g transform="rotate(-28 58 48)"><ellipse cx="58" cy="48" rx="38" ry="15" fill="${p.vip ? U('dishg') : U('dish')}"/><ellipse cx="58" cy="46" rx="30" ry="10" fill="#fff" opacity=".16"/>
        <path d="M58 48V20" stroke="#5b6476" stroke-width="2"/><path d="M40 48L58 20M76 48L58 20" stroke="#5b6476" stroke-width="1"/><rect x="54" y="14" width="8" height="8" rx="1.5" fill="#3a4150"/></g>
      <path d="M92 18a10 10 0 0110 10M92 10a18 18 0 0118 18" stroke="${p.vip ? '#ffd34d' : '#4da3ff'}" stroke-width="2" fill="none" class="blink"/>`,
    // Monitor de campo
    monitor: (p) => `${SH(60, 34)}
      <path d="M60 80v18M48 100h24" stroke="#2a2f3a" stroke-width="4" stroke-linecap="round"/>
      <path d="M20 30h80l6-8H14z" fill="${U('pl')}"/><rect x="20" y="30" width="80" height="52" rx="4" fill="${U('pl')}"/><rect x="25" y="35" width="70" height="42" fill="#05070b"/>${MINI_SCREEN(26, 36, 68, 40)}${SPEC(25, 35, 70, 14)}
      <rect x="70" y="38" width="22" height="5" rx="1" fill="#000" opacity=".5"/><text x="81" y="42" font-size="4" font-family="${FONT_M}" fill="#2ecc71" text-anchor="middle">SDI 1</text>`,
    // Panel de luz LED
    light: (p) => `${SH(60, 34)}
      <path d="M60 78l-18 24M60 78l18 24M60 78v24" stroke="#3a4150" stroke-width="2.6" stroke-linecap="round"/>
      <path d="M18 18l8 8M102 18l-8 8M18 86l8-8M102 86l-8-8" stroke="#14171d" stroke-width="5" stroke-linecap="round"/>
      <rect x="24" y="24" width="72" height="56" rx="4" fill="${U('pl')}"/><rect x="28" y="28" width="64" height="48" rx="2" fill="${U('warm')}"/>
      ${Array.from({ length: 5 }, (_, r) => `<path d="M32 ${33 + r * 9.5}h56" stroke="#c98a2a" stroke-width="1" stroke-dasharray="1.2 2.6" opacity=".7"/>`).join('')}
      <rect x="54" y="78" width="12" height="6" rx="1.5" fill="${U('gm')}"/>`,
    // Maleta de transporte (genérico)
    case: (p) => `${SH(60, 46)}
      <path d="M18 42l12-10h66l-12 10z" fill="${U('al')}"/><rect x="18" y="42" width="66" height="54" rx="3" fill="${U('pl')}"/><path d="M84 42l12-10v52l-12 12z" fill="${U('side')}"/>
      <path d="M18 42h66v6H18zM18 90h66v6H18z" fill="${U('al')}"/><path d="M18 42v54M84 42v54" stroke="${U('cyal')}" stroke-width="3"/>
      ${[[30, 52], [72, 52]].map(([x, y]) => `<rect x="${x - 5}" y="${y - 3}" width="10" height="9" rx="1.5" fill="${U('cyal')}"/><circle cx="${x}" cy="${y + 1.5}" r="1.5" fill="#3a4150"/>`).join('')}
      <path d="M42 36q9-8 18 0" stroke="#14171d" stroke-width="4" fill="none" stroke-linecap="round"/>
      <rect x="38" y="66" width="26" height="9" rx="1.5" fill="#e9edf5"/><text x="51" y="73" font-size="6" font-family="${FONT_D}" font-weight="800" fill="#14171d" text-anchor="middle">${p.tag || 'FRÁGIL'}</text>`,
    // ----- Tienda (no son equipos) -----
    gems: () => `${SH(60, 40)}
      ${[[38, 66, 0.78], [84, 68, 0.78], [60, 54, 1.08]].map(([x, y, k]) => `<g transform="translate(${x} ${y}) scale(${k})">
        <path d="M-16-10h32l8 10-24 26-24-26z" fill="#2f6fb3"/><path d="M-16-10h32l8 10H-24z" fill="#9ec5ff"/><path d="M-8-10l-4 10 12 26 12-26-4-10z" fill="#4da3ff"/><path d="M-12 0L0 26 12 0z" fill="#1d4f86" opacity=".5"/>
        <path d="M-11-7h8" stroke="#fff" stroke-width="2" stroke-linecap="round" opacity=".9"/></g>`).join('')}`,
    crown: () => `${SH(60, 40)}
      <path d="M20 44l20 16 20-28 20 28 20-16-8 46H28z" fill="${U('gold')}"/><path d="M26 80h68" stroke="#fff3c4" stroke-opacity=".6" stroke-width="1.5"/><rect x="28" y="84" width="64" height="8" rx="2" fill="#8a5a10"/>
      ${[[20, 44], [60, 30], [100, 44]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="5" fill="${U('gold')}"/>`).join('')}
      <circle cx="60" cy="68" r="6" fill="${U('red')}"/><circle cx="40" cy="72" r="4" fill="#4da3ff"/><circle cx="80" cy="72" r="4" fill="#2ecc71"/><circle cx="58" cy="66" r="1.6" fill="#fff" opacity=".7"/>`,
    gift: () => `${SH(60, 40)}
      <rect x="26" y="52" width="68" height="42" rx="4" fill="${U('red')}"/><rect x="22" y="42" width="76" height="14" rx="3" fill="#ff5a5a"/>${SPEC(23, 43, 74, 6, 3)}
      <rect x="55" y="42" width="10" height="52" fill="${U('gold')}"/>
      <path d="M60 42c-8-16-26-14-22-4 2 5 14 4 22 4zM60 42c8-16 26-14 22-4-2 5-14 4-22 4z" fill="${U('gold')}"/>`,
    star: () => `${SH(60, 36)}
      <path d="M60 18l11 24 26 3-19 18 5 26-23-13-23 13 5-26-19-18 26-3z" fill="${U('gold')}" stroke="#8a5a10" stroke-width="1.5"/>
      <path d="M60 30l6 14 15 2" stroke="#fff" stroke-width="2.5" fill="none" opacity=".55" stroke-linecap="round"/>`,
    toolkit: () => `${SH(60, 44)}
      <path d="M48 46v-8q0-4 4-4h16q4 0 4 4v8" stroke="#14171d" stroke-width="5" fill="none"/>
      <rect x="18" y="46" width="84" height="48" rx="5" fill="${U('red')}"/>${SPEC(19, 47, 82, 10, 5)}<rect x="18" y="62" width="84" height="5" fill="#7a1015"/>
      <rect x="54" y="58" width="12" height="13" rx="2" fill="${U('cyal')}"/>
      <path d="M82 30a8 8 0 0110 10l-4-4-4 1-1 4 4 4a8 8 0 01-10-10L66 48" stroke="${U('cyal')}" stroke-width="4" fill="none" stroke-linecap="round"/>`,
    cash: () => `${SH(60, 44)}
      ${[0, 1, 2, 3].map((i) => `<rect x="${22 + i * 2}" y="${78 - i * 9}" width="72" height="16" rx="3" fill="${i % 2 ? '#1d8a4c' : '#26a65b'}" stroke="#0e4a28"/><path d="M${26 + i * 2} ${82 - i * 9}h64" stroke="#fff" stroke-opacity=".2"/>`).join('')}
      <rect x="52" y="49" width="12" height="16" fill="#e9edf5"/><circle cx="58" cy="57" r="6" fill="#0e4a28" opacity=".5"/><text x="58" y="60.5" font-size="9" font-family="${FONT_D}" font-weight="800" fill="#e9edf5" text-anchor="middle">$</text>`,
  };

  /* ---------- Más equipos: cada TIPO de producto con su propio dibujo (mismo estilo) ---------- */
  // Caja en perspectiva: frente (x, y, w, h), cara de arriba y lado derecho con profundidad d
  const BOX3 = (x, y, w, h, d, front, top, rx) => `<path d="M${x} ${y}l${d} -${(d * 0.8).toFixed(1)}h${w}l-${d} ${(d * 0.8).toFixed(1)}z" fill="${top || U('gm')}"/><path d="M${x + w} ${y}l${d} -${(d * 0.8).toFixed(1)}v${h}l-${d} ${(d * 0.8).toFixed(1)}z" fill="${U('side')}"/><rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${rx == null ? 3 : rx}" fill="${front || U('pl')}"/>`;
  // Lente visto de 3/4: cuerpo cilíndrico (xf adelante, xb atrás) y cristal frontal
  const BARREL = (xf, xb, cy, ry, fill) => `<ellipse cx="${xb}" cy="${cy}" rx="${(ry * 0.45).toFixed(1)}" ry="${ry}" fill="${U('cyp')}"/><rect x="${xf}" y="${cy - ry}" width="${xb - xf}" height="${ry * 2}" fill="${fill || U('cyp')}"/>`;
  const GLASS = (cx, cy, ry, rim) => `<ellipse cx="${cx}" cy="${cy}" rx="${(ry * 0.45).toFixed(1)}" ry="${ry}" fill="${rim || U('pl')}"/><ellipse cx="${cx}" cy="${cy}" rx="${(ry * 0.34).toFixed(1)}" ry="${(ry * 0.8).toFixed(1)}" fill="${U('lens')}"/><ellipse cx="${(cx - ry * 0.1).toFixed(1)}" cy="${(cy - ry * 0.4).toFixed(1)}" rx="${(ry * 0.08).toFixed(1)}" ry="${(ry * 0.16).toFixed(1)}" fill="#fff" opacity=".75"/>`;
  const LEG = (x1, y1, x2, y2, w) => `<path d="M${x1} ${y1}L${x2} ${y2}" stroke="#14171d" stroke-width="${(w || 3) + 2}" stroke-linecap="round"/><path d="M${x1} ${y1}L${x2} ${y2}" stroke="#aab3c0" stroke-width="${w || 3}" stroke-linecap="round"/>`;
  const ANT = (x, y, ang, len, c) => `<g transform="rotate(${ang} ${x} ${y})"><rect x="${x - 2.4}" y="${y - len}" width="4.8" height="${len}" rx="2.4" fill="${c || U('rub')}"/><rect x="${x - 1.5}" y="${y - 2.5}" width="3" height="4" fill="#3a4150"/></g>`;
  const KNOB = (x, y, r) => `<circle cx="${x}" cy="${y}" r="${r || 3}" fill="${U('gmd')}" stroke="#5b6476" stroke-width=".7"/><path d="M${x} ${y}l${((r || 3) * 0.6).toFixed(1)} -${((r || 3) * 0.6).toFixed(1)}" stroke="#e9edf5" stroke-width="1"/>`;
  const WAVES = (x, y, c) => `<path d="M${x - 8} ${y}a11 11 0 0116 0M${x - 13} ${y - 5}a18 18 0 0126 0" stroke="${c || '#4da3ff'}" stroke-width="2" fill="none" stroke-linecap="round" class="blink"/>`;
  // Pantalla de software (mezcla, repetición o gráficos)
  function UI(x, y, w, h, ui) {
    const f = (v) => v.toFixed(1);
    if (ui === 'replay') {
      return `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="#070a10"/>${MINI_SCREEN(x + 1, y + 1, w * 0.62, h * 0.62)}<rect x="${x + 2}" y="${y + 2}" width="13" height="6" rx="1" fill="#000" opacity=".65"/><text x="${x + 8.5}" y="${y + 6.6}" font-size="4.6" font-family="${FONT_M}" fill="#ffb020" text-anchor="middle">×0.5</text>
        ${[0, 1, 2, 3].map((i) => `<rect x="${f(x + w * 0.66)}" y="${f(y + 1 + i * h * 0.155)}" width="${f(w * 0.32)}" height="${f(h * 0.12)}" rx=".8" fill="${i === 1 ? '#ffb020' : '#24405f'}"/>`).join('')}
        <rect x="${x + 1}" y="${f(y + h * 0.7)}" width="${w - 2}" height="${f(h * 0.12)}" fill="#1b2433"/>${[0.06, 0.28, 0.46, 0.7].map((v, i) => `<rect x="${f(x + 1 + (w - 2) * v)}" y="${f(y + h * 0.7)}" width="${f((w - 2) * 0.14)}" height="${f(h * 0.12)}" fill="${['#2f6fb3', '#2ecc71', '#b57bff', '#2f6fb3'][i]}"/>`).join('')}
        <path d="M${f(x + w * 0.52)} ${f(y + h * 0.66)}v${f(h * 0.2)}" stroke="#ff3b3b" stroke-width="1.4"/><rect x="${x + 1}" y="${f(y + h * 0.86)}" width="${f(w * 0.3)}" height="${f(h * 0.11)}" rx="1" fill="#ff3b3b"/>`;
    }
    if (ui === 'gfx') {
      return `${MINI_SCREEN(x, y, w, h)}<rect x="${x + 2}" y="${y + 2}" width="${f(w * 0.4)}" height="${f(h * 0.16)}" rx="1" fill="#0b0d11" opacity=".92"/><rect x="${x + 3.5}" y="${f(y + 3.2)}" width="${f(w * 0.07)}" height="${f(h * 0.09)}" fill="#ff3b3b"/><rect x="${f(x + 3.5 + w * 0.26)}" y="${f(y + 3.2)}" width="${f(w * 0.07)}" height="${f(h * 0.09)}" fill="#4da3ff"/><text x="${f(x + 2 + w * 0.2)}" y="${f(y + 2 + h * 0.13)}" font-size="${f(h * 0.12)}" font-family="${FONT_M}" fill="#fff" text-anchor="middle">2-1</text>
        <rect x="${f(x + w * 0.08)}" y="${f(y + h * 0.68)}" width="${f(w * 0.1)}" height="${f(h * 0.18)}" fill="#ff3b3b"/><rect x="${f(x + w * 0.18)}" y="${f(y + h * 0.68)}" width="${f(w * 0.62)}" height="${f(h * 0.18)}" fill="#f2f4f8"/><rect x="${f(x + w * 0.22)}" y="${f(y + h * 0.72)}" width="${f(w * 0.38)}" height="${f(h * 0.045)}" fill="#14171d"/><rect x="${f(x + w * 0.22)}" y="${f(y + h * 0.79)}" width="${f(w * 0.24)}" height="${f(h * 0.03)}" fill="#8f99aa"/>`;
    }
    const bw = (w - 3) / 2, bh = h * 0.48, sw = (w - 5) / 4;
    return `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="#05070b"/><rect x="${x + 1}" y="${y + 1}" width="${f(bw)}" height="${f(bh)}" fill="#1d4f86" stroke="#2ecc71" stroke-width="1"/>${MINI_SCREEN(x + 1.5, y + 1.5, bw - 1, bh - 1)}<rect x="${f(x + 2 + bw)}" y="${y + 1}" width="${f(bw)}" height="${f(bh)}" fill="#5a1d22" stroke="#ff3b3b" stroke-width="1"/>${MINI_SCREEN(x + 2.5 + bw, y + 1.5, bw - 1, bh - 1)}
      ${[0, 1, 2, 3].map((i) => `<rect x="${f(x + 1 + i * (sw + 1))}" y="${f(y + bh + 2.5)}" width="${f(sw)}" height="${f(h * 0.24)}" fill="${['#2f5a3e', '#5a4a2a', '#3b2f55', '#24405f'][i]}"/>`).join('')}
      <rect x="${x + 1}" y="${f(y + h * 0.8)}" width="${w - 2}" height="${f(h * 0.17)}" fill="#11161f"/><rect x="${x + 2}" y="${f(y + h * 0.83)}" width="${f(w * 0.26)}" height="${f(h * 0.11)}" rx="1" fill="#ff3b3b"/><rect x="${f(x + 4 + w * 0.26)}" y="${f(y + h * 0.83)}" width="${f(w * 0.2)}" height="${f(h * 0.11)}" rx="1" fill="#2a3242"/>`;
  }
  // Monitor sobre pie (multiview, referencia, gráficos)
  const MON = (x, y, w, h, inner) => `<path d="M${x + w / 2} ${y + h}v12M${x + w / 2 - 14} ${y + h + 14}h28" stroke="#2a2f3a" stroke-width="4" stroke-linecap="round"/><rect x="${x}" y="${y}" width="${w}" height="${h}" rx="3" fill="${U('pl')}"/>${BEV(x + 3, y + 0.6, x + w - 3)}<rect x="${x + 3}" y="${y + 3}" width="${w - 6}" height="${h - 9}" fill="#05070b"/>${inner}<rect x="${x + w - 12}" y="${y + h - 4.5}" width="3" height="2" rx="1" fill="#2ecc71"/>`;

  Object.assign(DRAW, {
    // ===== Cámaras =====
    // Camcorder doméstica: pequeña, pantalla abatible y correa de mano
    handycam: (p) => `${SH(58, 38)}
      <rect x="44" y="78" width="28" height="5" rx="2" fill="${U('pl')}"/>
      <rect x="24" y="51" width="20" height="25" rx="4" fill="${U('cyp')}"/>${RIBS(29, 41, 51, 76, 2.2)}
      <path d="M15 48l11 3v25l-11 3z" fill="${U('pl')}"/>${LENSF(16, 63.5, 3.2, 12)}
      <rect x="38" y="46" width="56" height="34" rx="13" fill="${p.body || U('gm')}"/>${SPEC(42, 47, 48, 9, 8)}${BEV(48, 46.6, 84)}
      <rect x="46" y="42.5" width="16" height="4.5" rx="2" fill="#23262d"/><path d="M48 44.7h12" stroke="#5b6476" stroke-width="1.4" stroke-dasharray="1 1.2"/>
      <rect x="70" y="41.5" width="11" height="4.5" rx="2.2" fill="${U('cyal')}"/><circle cx="86" cy="44" r="2" fill="#5b6476"/>
      <path d="M80 47c9-3 15 2 15 10v13c0 8-6 12-14 10" stroke="#14171d" stroke-width="8.5" fill="none" stroke-linecap="round"/><path d="M80 47c9-3 15 2 15 10v13c0 8-6 12-14 10" stroke="${U('fab')}" stroke-width="6.5" fill="none" stroke-linecap="round"/><path d="M82 49.5c6-1.5 10 2 10 8v12c0 6-4 9-10 8" stroke="#6b7487" stroke-width=".7" stroke-dasharray="1.4 1" fill="none"/>
      <rect x="44" y="54" width="31" height="22" rx="2.5" fill="#0c0e12" stroke="#3a4150" stroke-width=".9"/>${MINI_SCREEN(46, 56, 27, 18)}${SPEC(46, 56, 27, 6)}
      <rect x="75" y="58" width="3" height="14" rx="1" fill="#2a2f3a"/>${LED(43, 50, '#ff3b3b', true)}`,
    // Cámara de acción: caja chica resistente, lente grande y patitas de montaje
    action_cam: (p) => `${SH(60, 32)}
      <rect x="49" y="84" width="5" height="12" rx="1.5" fill="${U('rub')}"/><rect x="57" y="84" width="5" height="12" rx="1.5" fill="${U('rub')}"/><rect x="65" y="84" width="5" height="12" rx="1.5" fill="${U('rub')}"/><path d="M47 90.5h26" stroke="${U('cyal')}" stroke-width="2.4" stroke-linecap="round"/>
      <path d="M38 98h44l5 5H33z" fill="${U('gm')}"/>
      ${BOX3(32, 38, 52, 47, 9, U('pl'), U('gm'), 7)}${SPEC(33, 39, 50, 11, 7)}${BEV(38, 38.6, 78)}
      <rect x="62" y="28.6" width="15" height="4" rx="2" fill="${U('red')}"/>
      <rect x="36" y="43" width="28" height="28" rx="6" fill="#0b0d11" stroke="#3a4150" stroke-width="1"/>
      <circle cx="50" cy="57" r="11.5" fill="${U('cyp')}"/><circle cx="50" cy="57" r="9" fill="#05070b"/>${LENSF(50, 57, 7.2, 7.2)}
      <rect x="67" y="44" width="14" height="13" rx="2" fill="#0c0e12" stroke="#3a4150" stroke-width=".7"/>${MINI_SCREEN(68.5, 45.5, 11, 10)}
      ${LED(74, 63, '#ff3b3b', true)}<path d="M38 78h3M43 78h3M48 78h3M53 78h3" stroke="#05070b" stroke-width="2" stroke-linecap="round"/>
      <path d="M86 40v38" stroke="#000" stroke-opacity=".3" stroke-width="1.2" stroke-dasharray="2 2"/>`,
    // Cámara de bolsillo con gimbal: mango alto, pantallita y cabeza de 3 ejes
    pocket_gimbal: (p) => `${SH(61, 22)}
      <rect x="49" y="50" width="24" height="52" rx="10" fill="${U('pl')}"/>${SPEC(50, 51, 8, 48, 4)}
      <rect x="52" y="55" width="18" height="22" rx="2.5" fill="#0c0e12" stroke="#3a4150" stroke-width=".8"/>${MINI_SCREEN(53.5, 56.5, 15, 19)}
      ${KNOB(61, 84, 3.8)}<circle cx="61" cy="94" r="3" fill="#ff3b3b"/>
      <rect x="55" y="43" width="12" height="9" rx="2.5" fill="${U('cy')}"/>
      <path d="M61 44V41H80V25H75" fill="none" stroke="#1b1e25" stroke-width="5" stroke-linejoin="round"/><circle cx="80" cy="41" r="3.6" fill="${U('cyal')}"/>
      <rect x="44" y="11" width="30" height="27" rx="10" fill="${U('gm')}"/>${SPEC(46, 12, 26, 8, 8)}
      <circle cx="57" cy="24.5" r="9.5" fill="${U('pl')}"/><circle cx="57" cy="24.5" r="7.4" fill="${U('cyp')}"/>${LENSF(57, 24.5, 5.4, 5.4)}
      <rect x="72" y="19" width="7" height="11" rx="2.5" fill="${U('cyal')}"/>${LED(69, 16, '#2ecc71')}`,
    // Minicámara POV: cubito con lente redondo, brazo articulado y prensa
    pov_cam: (p) => `${SH(58, 30)}
      <path d="M84 56q14 4 13 22t15 22" stroke="#14171d" stroke-width="3" fill="none" stroke-linecap="round"/>
      <path d="M61 68L45 82L58 95" fill="none" stroke="#14171d" stroke-width="7.5" stroke-linecap="round" stroke-linejoin="round"/><path d="M61 68L45 82L58 95" fill="none" stroke="${U('cyal')}" stroke-width="4.4" stroke-linecap="round" stroke-linejoin="round"/>
      <circle cx="45" cy="82" r="5" fill="${U('gm')}" stroke="#8f99aa" stroke-width=".8"/><path d="M42 82h6" stroke="#ff3b3b" stroke-width="1.8"/>
      <path d="M48 92h26v13H48v-4h20v-5H48z" fill="${U('gm')}"/><rect x="66" y="96" width="14" height="3.4" rx="1.5" fill="${U('cyal')}"/>
      ${BOX3(42, 36, 32, 31, 10, U('pl'), U('gm'), 3)}${SPEC(43, 37, 30, 8, 3)}
      <path d="M77 31v28M80 29v28M83 27v28" stroke="#000" stroke-opacity=".35" stroke-width="1"/>
      <circle cx="58" cy="51.5" r="12.5" fill="${U('cyp')}"/><circle cx="58" cy="51.5" r="9.8" fill="#05070b" stroke="#3a4150"/>${LENSF(58, 51.5, 7.2, 7.2)}
      <circle cx="61" cy="69" r="4" fill="${U('cyal')}"/>${LED(46.5, 40, '#ff3b3b', true)}`,
    // Celular en gimbal de mano
    phone_gimbal: (p) => `${SH(60, 26)}
      <rect x="52" y="60" width="16" height="42" rx="8" fill="${U('gm')}"/>${SPEC(53, 61, 5, 38, 3)}
      ${KNOB(60, 73, 3.6)}<circle cx="60" cy="83" r="2.6" fill="#ff3b3b"/>
      <rect x="54" y="53" width="12" height="9" rx="2.5" fill="${U('cy')}"/>
      <path d="M60 55V51H88V44" stroke="#1b1e25" stroke-width="5" fill="none" stroke-linejoin="round"/><circle cx="88" cy="48" r="4.2" fill="${U('cyal')}"/>
      <rect x="52" y="10" width="16" height="7" rx="2" fill="${U('cyal')}"/><rect x="52" y="41" width="16" height="7" rx="2" fill="${U('cyal')}"/>
      <rect x="14" y="14" width="92" height="31" rx="6" fill="#0b0d11" stroke="#4a5263" stroke-width="1.2"/>
      <rect x="18" y="17" width="84" height="25" rx="3" fill="#000"/>${MINI_SCREEN(19, 18, 82, 23)}${SPEC(18, 17, 84, 8, 3)}
      <rect x="21" y="20" width="16" height="6" rx="1" fill="#000" opacity=".55"/><circle cx="24.5" cy="23" r="1.7" fill="#ff3b3b" class="blink"/><text x="27.5" y="24.8" font-size="4.4" font-family="${FONT_M}" fill="#fff">REC</text>
      <circle cx="99" cy="29.5" r="1.4" fill="#2a2f3a"/>`,
    // Cámara de estudio liviana: cuerpo de caja con pantalla grande atrás y lente chico
    studio_box: (p) => `${SH(62, 46)}
      <rect x="54" y="86" width="16" height="12" fill="${U('cy')}"/><ellipse cx="62" cy="100" rx="18" ry="4" fill="${U('gmd')}"/>
      <rect x="20" y="44" width="16" height="24" rx="2" fill="${U('cyp')}"/>${RIBS(23, 33, 44, 68, 2)}<path d="M11 41l10 3v24l-10 3z" fill="${U('pl')}"/>${LENSF(12, 56, 2.8, 12)}
      ${BOX3(32, 36, 64, 48, 8)}${BEV(36, 36.6, 92)}
      <path d="M33 37h62v46H33z" fill="none" stroke="#05070b" stroke-width="2.5"/>
      <rect x="37" y="40" width="54" height="35" fill="#05070b"/>${MINI_SCREEN(38, 41, 52, 33)}${SPEC(37, 40, 54, 10)}
      <rect x="39" y="42" width="16" height="5" rx="1" fill="#000" opacity=".55"/><text x="47" y="45.9" font-size="3.8" font-family="${FONT_M}" fill="#2ecc71" text-anchor="middle">4K60</text>
      ${[0, 1, 2, 3, 4].map((i) => `<rect x="${40 + i * 7}" y="77.5" width="5" height="3" rx="1" fill="${i === 0 ? '#ff3b3b' : '#4a5263'}"/>`).join('')}${KNOB(84, 79, 2.6)}
      <rect x="78" y="28" width="13" height="3.2" rx="1" fill="#ff3b3b" class="blink"/>`,
    // PTZ broadcast: cabeza de caja en horquilla, lente grande
    ptz_pro: (p) => `${SH(60, 40)}
      <rect x="28" y="84" width="64" height="16" rx="4" fill="${U('pl')}"/>${SPEC(29, 85, 62, 5, 4)}${LED(38, 93, '#2ecc71', true)}<rect x="68" y="90" width="18" height="4" rx="1" fill="#05070b"/>
      <path d="M92 95q12 0 18 9" stroke="#f0b829" stroke-width="2.6" fill="none" stroke-linecap="round"/>
      <path d="M30 86V44q0-6 6-6h5v48zM90 86V44q0-6-6-6h-5v48z" fill="${U('gm')}"/>
      <circle cx="35" cy="58" r="5" fill="${U('cyal')}"/><circle cx="85" cy="58" r="5" fill="${U('cyal')}"/>
      <rect x="39" y="33" width="42" height="48" rx="6" fill="${p.body || U('pl')}"/>${SPEC(40, 34, 40, 10, 6)}${BEV(43, 33.6, 77)}
      <rect x="44" y="41" width="32" height="32" rx="5" fill="#05070b"/><circle cx="60" cy="57" r="13.5" fill="${U('cyp')}"/><circle cx="60" cy="57" r="11" fill="#05070b" stroke="#3a4150"/>${LENSF(60, 57, 9, 9)}
      ${TALLY(75, 37, 1.8)}`,
    // Cámara de alta velocidad: cuerpo de caja con disipador, lente de cine con engranajes y contador de cuadros
    highspeed: (p) => `${SH(58, 48)}
      <path d="M52 37v-8q0-3 3-3h28q3 0 3 3v8" fill="none" stroke="#1b1e25" stroke-width="4.5"/>
      ${BOX3(42, 37, 54, 46, 8)}${SPEC(43, 38, 52, 10, 3)}${RIBS(46, 92, 39, 46, 2.4)}
      <path d="M42 74h54" stroke="${p.acc || '#ff3b3b'}" stroke-width="2.2"/>
      <rect x="56" y="50" width="34" height="18" rx="1.5" fill="#0b0d11" stroke="#3a4150" stroke-width=".7"/><text x="73" y="61" font-size="9" font-family="${FONT_D}" font-weight="800" fill="#ffb020" text-anchor="middle">1000</text><text x="73" y="66" font-size="4" font-family="${FONT_M}" fill="#8b95a8" text-anchor="middle">fps</text>
      ${BARREL(18, 44, 60, 15)}<rect x="24" y="44" width="6" height="32" rx="1" fill="#14171d"/><rect x="34" y="44" width="5" height="32" rx="1" fill="#14171d"/>${RIBS(24, 30, 72, 76, 1.2)}${RIBS(34, 39, 72, 76, 1.2)}
      <path d="M26 46v3M36 46v3" stroke="#e9edf5" stroke-width="1"/>
      <rect x="10" y="40" width="10" height="40" rx="2" fill="${U('pl')}"/>${GLASS(11, 60, 17)}
      <rect x="62" y="84" width="16" height="8" rx="2" fill="${U('gm')}"/>${TALLY(90, 42, 1.5)}`,
    // Cámara aérea por cables
    spidercam: (p) => `<ellipse cx="60" cy="106" rx="56" ry="9" fill="${U('turf')}" opacity=".6"/><path d="M14 106h92M60 99v14" stroke="#fff" stroke-opacity=".35" stroke-width="1"/>
      ${SH(60, 20, 106, 4)}
      <path d="M0 4L50 54M120 4L70 54M0 44L46 60M120 44L74 60" stroke="#c5ccd6" stroke-width="1.3" opacity=".9"/>
      ${[[0, 4], [120, 4], [0, 44], [120, 44]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="3.5" fill="${U('gm')}"/>`).join('')}
      <path d="M46 52h28l5 10H41z" fill="${U('gm')}"/><rect x="41" y="62" width="38" height="8" rx="2" fill="${U('pl')}"/>${LED(47, 66, '#2ecc71', true)}${LED(73, 66, '#ff3b3b', true)}
      <rect x="57" y="70" width="6" height="5" fill="#14171d"/><circle cx="60" cy="84" r="12" fill="${U('wht')}"/>${SPEC(50, 73, 20, 6, 3)}
      <circle cx="54" cy="86" r="6.5" fill="${U('pl')}"/>${LENSF(54, 86, 4.6, 4.6)}`,
    // Cámara en riel (cablecam lineal)
    rail_cam: (p) => `${SH(60, 54, 104, 4)}
      <path d="M14 46v56M106 46v56M6 102h16M98 102h16" stroke="#3a4150" stroke-width="3.4" stroke-linecap="round"/>
      <rect x="2" y="36" width="116" height="10" rx="1.5" fill="${U('cyal')}"/><path d="M${Array.from({ length: 19 }, (_, i) => `${i ? 'L' : ''}${3 + i * 6.1} ${i % 2 ? 45 : 37}`).join('')}" stroke="#5b6476" stroke-width="1" fill="none"/>
      <rect x="44" y="45" width="34" height="9" rx="2" fill="${U('gm')}"/><circle cx="50" cy="45" r="3" fill="#14171d"/><circle cx="72" cy="45" r="3" fill="#14171d"/>
      <path d="M61 54v6h18v16h-5" stroke="#1b1e25" stroke-width="4.5" fill="none" stroke-linejoin="round"/>
      <rect x="44" y="61" width="30" height="18" rx="3" fill="${U('al')}"/>${SPEC(45, 62, 28, 5, 3)}<rect x="33" y="63" width="12" height="14" rx="2" fill="${U('cyp')}"/>${LENSF(33.5, 70, 2.2, 6.2)}${TALLY(70, 65, 1.4)}
      <path d="M86 64h24M90 72h20M84 80h22" stroke="#4da3ff" stroke-width="1.8" stroke-linecap="round" opacity=".55"/>`,

    // ===== Lentes =====
    lens_kit: (p) => `${SH(60, 34)}
      <ellipse cx="88" cy="63" rx="9" ry="20" fill="${U('cyal')}"/>
      ${BARREL(36, 86, 63, 20)}
      <rect x="48" y="43" width="20" height="40" fill="#14171d"/>${RIBS(49, 67, 43, 83, 1.8)}
      <rect x="72" y="43" width="8" height="40" fill="#22262d"/>
      <path d="M58 46v5" stroke="#e9edf5" stroke-width="1.2"/>
      ${SPEC(36, 44, 50, 7)}
      <text x="76" y="80" font-size="4.6" font-family="${FONT_M}" fill="#cfd5dd" text-anchor="middle" transform="rotate(-90 76 80)">${esc(p.tag || '14-140')}</text>
      ${GLASS(36, 63, 22)}`,
    lens_cine: (p) => `${SH(60, 44)}
      <ellipse cx="96" cy="60" rx="9" ry="20" fill="${U('cyal')}"/>
      ${BARREL(34, 94, 60, 22, U('pl'))}
      ${[[44, 12], [64, 12]].map(([x, w]) => `<rect x="${x}" y="36" width="${w}" height="48" rx="1.5" fill="#0b0d11"/>${RIBS(x + 1, x + w - 1, 80, 85, 1.4)}`).join('')}
      <rect x="80" y="38" width="8" height="44" fill="#1b1e25"/>
      ${[0, 1, 2, 3, 4].map((i) => `<path d="M${46 + i * 2.2} 40v3" stroke="#ffffff" stroke-width=".8"/><path d="M${66 + i * 2.2} 40v${i % 2 ? 2 : 3}" stroke="${p.acc || '#ffb020'}" stroke-width=".8"/>`).join('')}
      <path d="M34 39h60" stroke="#fff" stroke-opacity=".2" stroke-width="2"/>
      <text x="85" y="66" font-size="4.6" font-family="${FONT_M}" fill="#cfd5dd" text-anchor="middle" transform="rotate(-90 85 66)">${esc(p.tag || 'T2.8')}</text>
      <rect x="22" y="30" width="14" height="60" rx="2" fill="${U('pl')}"/>${GLASS(23, 60, 28)}`,
    lens_eng: (p) => `${SH(56, 44)}
      <ellipse cx="94" cy="56" rx="6" ry="13" fill="${U('cyal')}"/>
      ${BARREL(24, 92, 56, 14)}
      <rect x="36" y="42" width="14" height="28" fill="#14171d"/>${RIBS(37, 49, 42, 70, 1.8)}<rect x="80" y="42" width="6" height="28" fill="#22262d"/>
      <path d="M86 70l6 8" stroke="#ffb020" stroke-width="2.6" stroke-linecap="round"/>
      ${SPEC(24, 43, 68, 5)}<text x="64" y="51" font-size="5" font-family="${FONT_M}" fill="#cfd5dd" text-anchor="middle">${esc(p.tag || '20×')}</text>
      <path d="M48 66h30q6 0 6 6v18q0 6-6 6H52q-6 0-6-6z" fill="${U('pl')}"/>${SPEC(48, 67, 34, 6, 4)}
      <rect x="54" y="72" width="16" height="6" rx="3" fill="${U('cyal')}"/><text x="56.5" y="76.6" font-size="4" font-family="${FONT_M}" fill="#14171d">W T</text>
      <circle cx="76" cy="75" r="2.6" fill="#ff3b3b"/><path d="M50 84q16 10 32 0" stroke="${U('fab')}" stroke-width="4" fill="none"/>
      <rect x="12" y="38" width="13" height="36" rx="2" fill="${U('pl')}"/>${GLASS(13, 56, 18)}`,
    lens_box: (p) => {
      const L = p.q >= 6 ? 74 : p.q === 5 ? 66 : 52;
      return `${SH(56, 50)}
      <path d="M${36 + L} 82q8 8 2 16t8 8" stroke="#14171d" stroke-width="2.4" fill="none"/>
      ${BOX3(32, 32, L, 52, 8, U('al'), U('wht'), 4)}${SPEC(33, 33, L - 2, 12, 4)}
      <rect x="${32 + L - 16}" y="40" width="10" height="36" rx="2" fill="#2a2f3a"/><path d="M32 74h${L}" stroke="${p.acc || '#ff3b3b'}" stroke-width="2"/>
      <rect x="44" y="48" width="${Math.min(30, L - 22)}" height="12" rx="1.5" fill="#14171d"/><text x="${44 + Math.min(30, L - 22) / 2}" y="57" font-size="8" font-family="${FONT_D}" font-weight="800" fill="#e9edf5" text-anchor="middle">${esc(p.tag || '86×')}</text>
      <rect x="8" y="24" width="28" height="68" rx="7" fill="${U('pl')}"/>${BEV(12, 24.6, 32)}${GLASS(20, 58, 28, '#0b0d11')}`;
    },
    // Adaptador para lente box: bandeja con montura grande y visor de estudio
    box_adapter: (p) => `${SH(60, 50)}
      ${BOX3(20, 62, 80, 22, 10)}${SPEC(21, 63, 78, 5, 3)}
      <path d="M30 59h68M34 56h66" stroke="#aab3c0" stroke-width="2.2" stroke-linecap="round"/>
      <rect x="36" y="46" width="44" height="13" rx="2" fill="none" stroke="#4da3ff" stroke-width="1.4" stroke-dasharray="3 2" opacity=".85"/>
      <rect x="8" y="46" width="16" height="42" rx="3" fill="${U('gm')}"/><ellipse cx="16" cy="67" rx="5.5" ry="15" fill="#05070b" stroke="${U('cyal')}" stroke-width="2.4"/>
      <rect x="66" y="40" width="8" height="8" fill="${U('gmd')}"/>
      <rect x="50" y="14" width="46" height="27" rx="3" fill="${U('pl')}"/><rect x="54" y="18" width="38" height="19" fill="${U('scr')}"/>${SPEC(54, 18, 38, 6)}<path d="M50 14l-6-4h58l-6 4" fill="${U('gmd')}"/>
      ${LED(28, 72, '#2ecc71')}${LED(33, 72, '#2ecc71')}${LED(38, 72, '#ffb020')}<rect x="66" y="69" width="26" height="7" rx="1.5" fill="#05070b"/>`,

    // ===== Trípodes y soportes =====
    tripod: (p) => {
      const heavy = !!p.heavy, fluid = heavy || !!p.fluid;
      const hub = [60, heavy ? 52 : 50];
      const feet = heavy ? [[14, 100], [106, 100], [64, 94]] : [[22, 100], [98, 100], [64, 94]];
      const legs = feet.map(([x, y]) => (fluid
        ? LEG(hub[0] - 2, hub[1], x - 2, y, heavy ? 2.6 : 2) + LEG(hub[0] + 2, hub[1], x + 2, y, heavy ? 2.6 : 2)
        : LEG(hub[0], hub[1], x, y, 3))).join('');
      const mid = (t) => feet.map(([x, y]) => [hub[0] + (x - hub[0]) * t, hub[1] + (y - hub[1]) * t]);
      const spread = fluid ? `<path d="M${mid(0.6).map(([x, y]) => `${x.toFixed(1)} ${y.toFixed(1)}`).join('L')}z" fill="none" stroke="#3a4150" stroke-width="2"/>` : '';
      const ground = heavy ? `<path d="M14 100L106 100M14 100L64 94L106 100" stroke="#2a2f3a" stroke-width="2.4" fill="none"/>${[14, 106].map((x) => `<circle cx="${x}" cy="101" r="3.4" fill="${U('tire')}"/>`).join('')}` : feet.map(([x, y]) => `<circle cx="${x}" cy="${y + 1}" r="2.4" fill="#14171d"/>`).join('');
      const head = heavy
        ? `<ellipse cx="60" cy="52" rx="16" ry="5" fill="${U('gmd')}"/><rect x="40" y="26" width="40" height="26" rx="5" fill="${U('gm')}"/>${SPEC(41, 27, 38, 7, 5)}${KNOB(48, 40, 4)}${KNOB(72, 40, 4)}<rect x="36" y="20" width="48" height="7" rx="2" fill="${U('cyal')}"/>
          <path d="M80 34l26 14M40 34l-26 14" stroke="#14171d" stroke-width="4.5" stroke-linecap="round"/><rect x="100" y="44" width="12" height="7" rx="3" transform="rotate(28 106 47)" fill="${U('rub')}"/><rect x="8" y="44" width="12" height="7" rx="3" transform="rotate(-28 14 47)" fill="${U('rub')}"/>`
        : fluid
          ? `<ellipse cx="60" cy="50" rx="12" ry="4" fill="${U('gmd')}"/><rect x="48" y="33" width="24" height="17" rx="4" fill="${U('gm')}"/>${SPEC(49, 34, 22, 5, 4)}<circle cx="55" cy="41" r="2.4" fill="#2ecc71" stroke="#0e4a28"/>${KNOB(66, 42, 3)}<rect x="44" y="28" width="32" height="5" rx="2" fill="${U('cyal')}"/>
            <path d="M72 40l30 16" stroke="#14171d" stroke-width="4.4" stroke-linecap="round"/><rect x="96" y="52" width="13" height="7" rx="3" transform="rotate(28 102 55)" fill="${U('rub')}"/>`
          : `<rect x="51" y="40" width="18" height="10" rx="2" fill="${U('gm')}"/><rect x="47" y="35" width="26" height="5" rx="2" fill="${U('cyal')}"/>
            <path d="M68 44l30 18" stroke="#14171d" stroke-width="3.4" stroke-linecap="round"/><rect x="92" y="58" width="11" height="6" rx="3" transform="rotate(30 97 61)" fill="${U('rub')}"/>`;
      return `${SH(60, heavy ? 52 : 42, 101, 5)}${legs}${spread}${ground}${fluid ? '' : `<path d="M60 50v20" stroke="#5b6476" stroke-width="3"/>`}${head}`;
    },
    tripod_fluid: (p) => DRAW.tripod(Object.assign({}, p, { fluid: true })),
    tripod_heavy: (p) => DRAW.tripod(Object.assign({}, p, { heavy: true })),
    // Gimbal de mano con cámara chica
    gimbal: (p) => `${SH(60, 30)}
      <rect x="53" y="62" width="14" height="40" rx="6" fill="${U('rub')}"/>${RIBS(55, 65, 84, 100, 2)}<rect x="56" y="67" width="8" height="8" rx="1" fill="${U('lcd')}"/>${LED(60, 79, '#2ecc71')}
      <rect x="51" y="55" width="18" height="9" rx="3" fill="${U('cy')}"/>
      <path d="M60 56V51H93V27H86" stroke="#1b1e25" stroke-width="5.5" fill="none" stroke-linejoin="round"/>
      <circle cx="93" cy="51" r="5" fill="${U('cyal')}"/>
      <rect x="40" y="22" width="40" height="27" rx="4" fill="${U('gm')}"/>${SPEC(41, 23, 38, 8, 4)}<rect x="46" y="17" width="12" height="6" rx="1.5" fill="${U('gm')}"/><circle cx="72" cy="21" r="2.4" fill="#3a4150"/>
      <rect x="52" y="29" width="22" height="15" rx="1.5" fill="#0c0e12"/>${MINI_SCREEN(53, 30, 20, 13)}
      <rect x="22" y="25" width="19" height="21" rx="2" fill="${U('cyp')}"/>${RIBS(26, 37, 25, 46, 1.8)}<path d="M15 23l8 2v21l-8 2z" fill="${U('pl')}"/>${LENSF(16, 35.5, 2.6, 10)}
      <circle cx="86" cy="35" r="5" fill="${U('cyal')}"/>`,
    // Steadicam: chaleco, brazo con resortes y poste con cámara y monitor
    steadicam: (p) => `${SH(60, 50)}
      <path d="M8 38q0-8 8-8h16q8 0 8 8v52q0 6-6 6H14q-6 0-6-6z" fill="${U('fab')}" stroke="#5b6476" stroke-width="1.2"/><path d="M14 31q10 10 20 0" stroke="#5b6476" stroke-width="1.2" fill="none"/><path d="M14 30v-8M34 30v-8" stroke="#14171d" stroke-width="4" stroke-linecap="round"/>
      ${[50, 66, 82].map((y) => `<rect x="9" y="${y}" width="30" height="4" fill="#14171d"/><rect x="21" y="${y - 1}" width="6" height="6" rx="1" fill="${U('cyal')}"/>`).join('')}
      <rect x="38" y="58" width="8" height="12" rx="2" fill="${U('gm')}"/>
      <path d="M44 62L62 72L82 62" stroke="#14171d" stroke-width="7" fill="none" stroke-linejoin="round"/><path d="M44 62L62 72L82 62" stroke="${U('cyal')}" stroke-width="4" fill="none" stroke-linejoin="round"/>
      <path d="M46 67L60 76M64 76L80 67" stroke="#ff3b3b" stroke-width="2" stroke-dasharray="1.6 1.2"/><circle cx="62" cy="72" r="3.6" fill="${U('gm')}"/>
      <rect x="84" y="22" width="5" height="70" rx="2" fill="${U('cyal')}"/><rect x="80" y="56" width="13" height="11" rx="3" fill="${U('rub')}"/>
      <rect x="70" y="12" width="34" height="13" rx="3" fill="${U('gm')}"/>${SPEC(71, 13, 32, 4, 3)}<rect x="60" y="13.5" width="11" height="10" rx="2" fill="${U('cyp')}"/>${LENSF(60.5, 18.5, 1.8, 4.5)}
      <rect x="70" y="86" width="22" height="14" rx="2" fill="${U('pl')}"/>${MINI_SCREEN(72, 88, 18, 10)}<rect x="92" y="82" width="12" height="18" rx="2" fill="${U('gm')}"/>${LED(98, 86, '#2ecc71')}`,
    // Dolly sobre riel
    dolly: (p) => `${SH(60, 56, 104, 4)}
      ${Array.from({ length: 9 }, (_, i) => `<rect x="${3 + i * 14}" y="92" width="6" height="14" rx="1" fill="#3a2818"/>`).join('')}
      <path d="M2 95h116M2 103h116" stroke="#aab3c0" stroke-width="2.6"/>
      <rect x="22" y="80" width="70" height="8" rx="2" fill="${U('gm')}"/><path d="M22 80h70" stroke="#fff" stroke-opacity=".25"/><rect x="22" y="86" width="70" height="4" fill="${U('pl')}"/>
      ${[30, 84].map((x) => `<circle cx="${x}" cy="94" r="4.5" fill="${U('tire')}"/>`).join('')}
      <path d="M88 80l12-30h8" stroke="#1b1e25" stroke-width="4" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
      <rect x="54" y="54" width="8" height="26" fill="${U('cyal')}"/><ellipse cx="58" cy="54" rx="9" ry="3" fill="${U('gmd')}"/><rect x="50" y="44" width="16" height="10" rx="3" fill="${U('gm')}"/>
      <path d="M66 50l20 10" stroke="#14171d" stroke-width="3.4" stroke-linecap="round"/>
      <rect x="44" y="26" width="34" height="18" rx="3" fill="${U('al')}"/>${SPEC(45, 27, 32, 5, 3)}<rect x="30" y="28" width="15" height="14" rx="2" fill="${U('cyp')}"/>${LENSF(30.5, 35, 2.2, 6.4)}${TALLY(74, 30, 1.4)}
      <path d="M2 70h14M4 62h10" stroke="#4da3ff" stroke-width="1.8" stroke-linecap="round" opacity=".5"/>`,

    // ===== Switchers, repetición y gráficos =====
    // Switcher mini con botones grandes (4 u 8 entradas)
    mini_switcher: (p) => {
      const n = (p.q || 1) >= 2 ? 8 : 4;
      const A = (u, t) => [24 - 12 * t + (72 + 24 * t) * u, 48 + 30 * t];
      const K = (u, t, w, h, fill, lit) => { const [x, y] = A(u, t); const k = 1 + 0.35 * t; const W = w * k, H = h * k; return `${lit ? `<rect x="${(x - W * 0.85).toFixed(1)}" y="${(y - H * 0.85).toFixed(1)}" width="${(W * 1.7).toFixed(1)}" height="${(H * 1.7).toFixed(1)}" rx="2" fill="${fill}" opacity=".25"/>` : ''}<rect x="${(x - W / 2).toFixed(1)}" y="${(y - H / 2).toFixed(1)}" width="${W.toFixed(1)}" height="${H.toFixed(1)}" rx="1.2" fill="${fill}"/>`; };
      const ins = Array.from({ length: n }, (_, i) => K(0.07 + i * (0.5 / (n - 1)), 0.32, n === 4 ? 10 : 5.6, 6, i === 0 ? '#ff3b3b' : i === 1 ? '#2ecc71' : '#e1e6ec', i < 2)).join('');
      const tr = [0, 1, 2].map((i) => K(0.72 + i * 0.09, 0.32, 5, 4, i === 2 ? '#ffb020' : '#4a5263', i === 2)).join('');
      const knobs = Array.from({ length: n === 4 ? 6 : 10 }, (_, i) => { const [x, y] = A(0.07 + i * (n === 4 ? 0.1 : 0.056), 0.72); return `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="2.2" fill="#3a4150"/><circle cx="${x.toFixed(1)}" cy="${(y - 0.6).toFixed(1)}" r="1" fill="#8f99aa"/>`; }).join('');
      const [lx, ly] = A(0.7, 0.62);
      const lcd = n === 8 ? `<rect x="${lx.toFixed(1)}" y="${(ly - 5).toFixed(1)}" width="24" height="13" rx="1" fill="#05070b"/>${MINI_SCREEN(lx + 1, ly - 4, 22, 11)}` : `<rect x="${lx.toFixed(1)}" y="${(ly - 2).toFixed(1)}" width="22" height="6" rx="1.5" fill="#ff3b3b"/><text x="${(lx + 11).toFixed(1)}" y="${(ly + 2.4).toFixed(1)}" font-size="4.6" font-family="${FONT_D}" font-weight="800" fill="#fff" text-anchor="middle">ON AIR</text>`;
      return `${SH(60, 52, 100)}
        ${[0, 1, 2, 3].map((i) => `<path d="M${36 + i * 12} 49c0-12 -6-18 -14-${26 - i * 3}" stroke="#14171d" stroke-width="3" fill="none" stroke-linecap="round"/>`).join('')}
        <path d="M24 48H96L108 78H12Z" fill="${U('gm')}"/><path d="M24 48H96" stroke="#fff" stroke-opacity=".25"/><path d="M12 78h96v9q0 2-2 2H14q-2 0-2-2z" fill="${U('pl')}"/><path d="M12 78h96" stroke="#fff" stroke-opacity=".18"/>
        ${ins}${tr}${knobs}${lcd}`;
    },
    // Switcher de rack con panel incorporado
    switcher_rack: (p) => `${SH(60, 54, 100)}
      ${BOX3(10, 46, 94, 36, 8)}${SPEC(11, 47, 92, 8, 3)}
      <rect x="4" y="46" width="7" height="36" rx="1" fill="${U('gm')}"/><circle cx="7.5" cy="51" r="1.4" fill="#05070b"/><circle cx="7.5" cy="77" r="1.4" fill="#05070b"/>
      <rect x="15" y="51" width="24" height="15" rx="1" fill="#05070b"/>${MINI_SCREEN(16, 52, 22, 13)}
      ${[0, 1].map((r) => Array.from({ length: 9 }, (_, i) => `<rect x="${43 + i * 6.2}" y="${52 + r * 7}" width="4.8" height="4.4" rx=".8" fill="${r === 0 && i === 1 ? '#ff3b3b' : r === 1 && i === 3 ? '#2ecc71' : '#4a5263'}"/>`).join('')).join('')}
      ${Array.from({ length: 6 }, (_, i) => `<rect x="${43 + i * 6.2}" y="70" width="4.8" height="4.4" rx=".8" fill="${i === 4 ? '#ffb020' : '#2a2f3a'}"/>`).join('')}
      <rect x="15" y="70" width="24" height="5" rx="1" fill="#05070b"/>${[0, 1, 2, 3].map((i) => `<rect x="${16 + i * 5.8}" y="71" width="${2 + (i * 3) % 4}" height="3" fill="#2ecc71"/>`).join('')}
      ${KNOB(86, 72, 4.2)}${LED(98, 52, '#2ecc71', true)}`,
    // Switcher grande de unidad móvil (4 M/E): pared de monitores y panel enorme
    switcher_big: (p) => `${SH(60, 56, 104)}
      ${[0, 1, 2].map((i) => `<rect x="${3 + i * 38.5}" y="4" width="37" height="26" rx="1.5" fill="${U('pl')}"/><rect x="${4.5 + i * 38.5}" y="5.5" width="34" height="23" fill="#05070b"/>`).join('')}
      ${[0, 1, 2, 3, 4, 5].map((i) => `<rect x="${5 + (i % 3) * 11.2}" y="${6 + Math.floor(i / 3) * 11}" width="10.4" height="10" fill="${['#2f5a3e', '#24405f', '#5a4a2a', '#3b2f55', '#24405f', '#2f5a3e'][i]}"/>`).join('')}
      <rect x="44" y="6" width="16.5" height="21.5" fill="#1d4f86" stroke="#2ecc71"/>${MINI_SCREEN(44.5, 6.5, 15.5, 20.5)}<rect x="61" y="6" width="16.5" height="21.5" fill="#5a1d22" stroke="#ff3b3b"/>${MINI_SCREEN(61.5, 6.5, 15.5, 20.5)}
      ${[0, 1, 2, 3, 4, 5].map((i) => `<rect x="${82.5 + (i % 3) * 11.2}" y="${6 + Math.floor(i / 3) * 11}" width="10.4" height="10" fill="${['#3b2f55', '#2f5a3e', '#24405f', '#5a4a2a', '#2f5a3e', '#3b2f55'][i]}"/>`).join('')}
      <rect x="56" y="30" width="8" height="10" fill="${U('gmd')}"/>
      ${DECK(U('gm'), U('pl'))}
      ${[0.18, 0.36, 0.54, 0.72, 0.9].map((t, r) => Array.from({ length: 12 }, (_, i) => KEY(0.03 + i * 0.058, t, 3.6, 2.6, (r === 1 || r === 3) && i === 2 ? '#ff3b3b' : (r === 1 || r === 3) && i === 5 ? '#2ecc71' : r === 4 && i < 3 ? '#ffb020' : '#4a5263', (r === 1 || r === 3) && i === 2)).join('')).join('')}
      ${[0.8, 0.93].map((u) => `<path d="M${at(u, 0.3)[0]} ${at(u, 0.3)[1]}L${at(u, 0.85)[0]} ${at(u, 0.85)[1]}" stroke="#05070b" stroke-width="3" stroke-linecap="round"/><rect x="${at(u, 0.55)[0] - 4}" y="${at(u, 0.55)[1] - 3}" width="10" height="4.5" rx="2" fill="${U('cyal')}"/>`).join('')}
      ${p.vip ? '<path d="M10 83h100" stroke="#f0b829" stroke-width="1.6"/>' : ''}`,
    // PC de escritorio con software (mezcla, repetición o gráficos)
    workstation: (p) => `${SH(60, 54, 104)}
      ${BOX3(88, 42, 20, 56, 6)}<rect x="91" y="48" width="14" height="3" rx="1" fill="#05070b"/>${LED(98, 56, '#4da3ff', true)}<circle cx="98" cy="76" r="6" fill="#05070b" stroke="#2f343d"/><path d="M95 76h6M98 73v6" stroke="#2f343d"/>
      <path d="M48 66v10M36 78h24" stroke="#2a2f3a" stroke-width="4" stroke-linecap="round"/>
      <rect x="8" y="14" width="80" height="52" rx="3" fill="${U('pl')}"/>${BEV(11, 14.6, 85)}${UI(11, 17, 74, 45, p.ui)}<path d="M11 17h74l-28 45H11z" fill="#fff" opacity=".04"/>
      <path d="M12 84h56l6 12H6z" fill="${U('gm')}"/>${[0, 1, 2].map((r) => `<path d="M${12 - r * 2} ${87 + r * 3}h${56 + r * 4}" stroke="#05070b" stroke-width="1.6" stroke-dasharray="3 1"/>`).join('')}
      ${p.jog ? `<path d="M72 86h34l6 12H66z" fill="${U('gm')}"/><ellipse cx="96" cy="92" rx="7" ry="4" fill="${U('cy')}" stroke="#5b6476" stroke-width=".7"/>${[0, 1, 2].map((i) => `<rect x="${72 + i * 6}" y="89" width="4.4" height="3" rx=".8" fill="${i === 0 ? '#ff3b3b' : '#4a5263'}"/>`).join('')}<path d="M80 95l-2 -10" stroke="${U('cyal')}" stroke-width="2.4" stroke-linecap="round"/>` : `<ellipse cx="80" cy="91" rx="4" ry="5" fill="${U('gm')}"/>`}`,
    // Gráficos 3D en vivo
    cg: (p) => `${SH(60, 46)}
      ${MON(12, 14, 96, 64, `<rect x="15" y="17" width="90" height="52" fill="url(#am-night)"/>
        ${[0, 1, 2, 3].map((i) => { const h = [16, 26, 20, 32][i], x = 26 + i * 18; return `<path d="M${x} ${62 - h}l5-4h10l-5 4z" fill="${['#ff8a8a', '#9ec5ff', '#ff8a8a', '#9ec5ff'][i]}"/><path d="M${x + 10} ${62 - h}l5-4v${h}l-5 4z" fill="${['#7a1015', '#163c69', '#7a1015', '#163c69'][i]}"/><rect x="${x}" y="${62 - h}" width="10" height="${h}" fill="${['#d42a30', '#2f6fb3', '#d42a30', '#2f6fb3'][i]}"/>`; }).join('')}
        <path d="M20 63h82" stroke="#cfe6ff" stroke-opacity=".5"/><rect x="20" y="21" width="46" height="8" rx="1" fill="#f2f4f8"/><rect x="22" y="23.5" width="28" height="3" fill="#14171d"/><rect x="66" y="21" width="10" height="8" fill="#ff3b3b"/>`)}
      ${BOX3(30, 94, 60, 8, 4, U('pl'), U('gm'), 1.5)}${LED(36, 98, '#2ecc71', true)}${LED(41, 98, '#2ecc71')}<rect x="62" y="96.5" width="22" height="3" rx="1" fill="#05070b"/>`,
    // Gráficos de realidad aumentada sobre la cancha
    cg_ar: (p) => `${SH(60, 46)}
      ${MON(12, 14, 96, 64, `<rect x="15" y="17" width="90" height="52" fill="url(#am-night)"/><path d="M15 40h90v29H15z" fill="${U('turf')}"/><path d="M15 40h90" stroke="#fff" stroke-opacity=".5"/>
        <path d="M60 40l-8 29M30 52h60" stroke="#fff" stroke-opacity=".45" stroke-width=".9"/><ellipse cx="55" cy="52" rx="9" ry="3.4" fill="none" stroke="#fff" stroke-opacity=".45" stroke-width=".9"/>
        <path d="M28 58l30-6v-20l-30 6z" fill="#4da3ff" opacity=".55"/><path d="M28 58l30-6v-20l-30 6z" fill="none" stroke="#cfe6ff" stroke-width="1"/><path d="M34 49l18-3.6M34 44l12-2.4" stroke="#fff" stroke-width="2" stroke-linecap="round"/>
        <path d="M72 62l14-3 0 4 9-7-9-5 0 4-14 3z" fill="#ffb020" opacity=".9"/>
        <rect x="18" y="20" width="14" height="7" rx="1" fill="#b57bff"/><text x="25" y="25.6" font-size="5" font-family="${FONT_D}" font-weight="800" fill="#fff" text-anchor="middle">AR</text>`)}
      ${BOX3(30, 94, 60, 8, 4, U('pl'), U('gm'), 1.5)}${LED(36, 98, '#b57bff', true)}<rect x="62" y="96.5" width="22" height="3" rx="1" fill="#05070b"/>`,
    // Multiview: muchas cámaras en una pantalla
    multiview: (p) => `${SH(60, 46)}
      ${MON(6, 14, 108, 68, Array.from({ length: 16 }, (_, i) => { const x = 10 + (i % 4) * 25, y = 18 + Math.floor(i / 4) * 14.2; const c = ['#2f5a3e', '#24405f', '#5a4a2a', '#3b2f55'][(i * 3) % 4]; return `<rect x="${x}" y="${y}" width="24" height="13.4" fill="${c}"${i === 0 ? ' stroke="#ff3b3b" stroke-width="1.4"' : i === 1 ? ' stroke="#2ecc71" stroke-width="1.4"' : ''}/><path d="M${x} ${y + 9}l6-4 5 3 6-5 7 6v4H${x}z" fill="#000" opacity=".25"/><rect x="${x + 1.5}" y="${y + 10.2}" width="9" height="2.2" fill="#000" opacity=".5"/>`; }).join(''))}`,
    // Monitor de referencia: barras de color y forma de onda
    ref_monitor: (p) => `${SH(60, 40)}
      ${MON(14, 16, 92, 64, `${['#c0c0c0', '#c0c000', '#00c0c0', '#00c000', '#c000c0', '#c00000', '#0000c0'].map((c, i) => `<rect x="${17 + i * 12.29}" y="19" width="12.4" height="34" fill="${c}"/>`).join('')}
        <rect x="17" y="53" width="86" height="5" fill="#1a1a2a"/><rect x="17" y="58" width="86" height="13" fill="#0a0a0a"/><rect x="60" y="58" width="43" height="13" fill="#05070b" stroke="#2f343d" stroke-width=".6"/>
        <path d="M62 68l4-6 4 3 4-7 4 5 4-8 4 6 4-4 6 9" stroke="#2ecc71" stroke-width="1" fill="none"/>`)}
      <path d="M14 16l-4-5h100l-4 5" fill="${U('gmd')}"/>
      ${[0, 1, 2, 3, 4].map((i) => `<rect x="${22 + i * 8}" y="76" width="6" height="2.2" rx=".8" fill="${i === 0 ? '#2ecc71' : '#3a4150'}"/>`).join('')}`,

    // ===== Audio y micrófonos =====
    // Mezcladora de rack (con tablet si se controla por WiFi)
    mixer_rack: (p) => `${SH(58, 50, 102)}
      ${p.tablet ? `<g transform="rotate(-6 42 30)"><rect x="12" y="6" width="58" height="40" rx="4" fill="#0b0d11" stroke="#4a5263" stroke-width="1.2"/><rect x="15" y="9" width="52" height="34" fill="${U('scr')}"/>
        ${Array.from({ length: 8 }, (_, i) => `<path d="M${20 + i * 6} 13v26" stroke="#2f343d" stroke-width="1.6"/><rect x="${17.6 + i * 6}" y="${16 + ((i * 7) % 18)}" width="4.8" height="3" rx=".6" fill="${i === 7 ? '#ff3b3b' : '#e1e6ec'}"/>`).join('')}</g>${WAVES(88, 30, '#4da3ff')}` : ''}
      ${BOX3(12, 56, 86, 32, 10)}${SPEC(13, 57, 84, 7, 3)}
      <rect x="8" y="56" width="5" height="32" rx="1" fill="${U('gm')}"/>
      ${[0, 1].map((r) => Array.from({ length: 8 }, (_, i) => `<circle cx="${19 + i * 7}" cy="${66 + r * 12}" r="2.8" fill="#05070b" stroke="#5b6476" stroke-width=".7"/><circle cx="${19 + i * 7}" cy="${66 + r * 12}" r="1" fill="#3a4150"/>`).join('')).join('')}
      ${p.screen ? `<rect x="76" y="60" width="18" height="10" rx="1" fill="${U('lcd')}"/>${KNOB(80, 79, 2.8)}${KNOB(90, 79, 2.8)}` : `${LED(80, 64, '#2ecc71', true)}${LED(86, 64, '#4da3ff')}<rect x="76" y="72" width="10" height="8" rx="1" fill="#05070b"/><rect x="88" y="72" width="6" height="8" rx="1" fill="#05070b"/>`}`,
    // Micrófono de mano con cable
    mic_handheld: (p) => `${SH(56, 36)}
      <path d="M30 88q-16 4-12 12t22 0 34 4" stroke="#14171d" stroke-width="3.4" fill="none" stroke-linecap="round"/>
      <g transform="rotate(-40 60 60)">
        <rect x="14" y="56.5" width="10" height="7" rx="1.5" fill="${U('cyal')}"/>
        <path d="M23 57L76 53.5V66.5L23 63Z" fill="${U('cyp')}"/><path d="M26 57.6L74 54.6" stroke="#fff" stroke-opacity=".35" stroke-width="1.2"/>
        <rect x="74" y="52" width="6" height="16" rx="1.5" fill="#2a2f3a"/>
        <ellipse cx="90" cy="60" rx="13" ry="12" fill="${U('cyal')}"/><path d="M80 54h20M78 60h24M80 66h20M90 48v24M85 49v22M95 49v22" stroke="#5b6476" stroke-width=".7"/>
        <ellipse cx="86" cy="54" rx="5" ry="3" fill="#fff" opacity=".45"/>
      </g>`,
    // Micrófono corbatero: petaca transmisora y cápsula de solapa
    lavalier: (p) => `${SH(56, 42)}
      <path d="M52 34q4-16 22-16t18 18q0 14-6 22" stroke="#14171d" stroke-width="1.8" fill="none"/>
      ${BOX3(28, 40, 32, 52, 7)}${SPEC(29, 41, 30, 9, 3)}
      <path d="M36 34V14" stroke="#14171d" stroke-width="2.8" stroke-linecap="round"/>
      <rect x="32" y="46" width="24" height="13" rx="1.5" fill="${U('lcd')}"/><text x="34" y="52" font-size="4.4" font-family="${FONT_M}" fill="#e9f3ff">CH 2</text>${[0, 1, 2, 3].map((i) => `<rect x="${47 + i * 2}" y="${56 - i * 1.4}" width="1.3" height="${1.4 + i * 1.4}" fill="#e9f3ff"/>`).join('')}
      ${LED(36, 66, '#2ecc71', true)}<rect x="42" y="64" width="12" height="4" rx="2" fill="#3a4150"/><rect x="34" y="74" width="20" height="2" fill="#05070b"/><rect x="34" y="79" width="20" height="2" fill="#05070b"/>
      <rect x="78" y="54" width="16" height="5" rx="1.5" fill="${U('cyal')}"/><rect x="82" y="58" width="8" height="12" rx="3.5" fill="${U('pl')}"/><circle cx="86" cy="74" r="5.5" fill="#2a2d33"/><circle cx="84.5" cy="72.5" r="1.6" fill="#fff" opacity=".18"/>`,
    // Micrófono shotgun con suspensión, empuñadura y caña
    shotgun: (p) => `${SH(60, 46)}
      <path d="M64 70L116 108" stroke="#14171d" stroke-width="5.5" stroke-linecap="round"/><path d="M64 70L116 108" stroke="${U('cyal')}" stroke-width="3" stroke-linecap="round"/><path d="M88 87.5l3 2.2" stroke="#14171d" stroke-width="5"/>
      <path d="M56 58l6 26" stroke="#14171d" stroke-width="10" stroke-linecap="round"/><path d="M56 58l6 26" stroke="${U('rub')}" stroke-width="8" stroke-linecap="round"/>
      <path d="M38 56h36" stroke="#2a2f3a" stroke-width="3.4" stroke-linecap="round"/>
      ${[40, 72].map((x) => `<ellipse cx="${x}" cy="44" rx="4" ry="13" fill="none" stroke="#3a4150" stroke-width="2.6"/>`).join('')}
      <rect x="8" y="38" width="96" height="12" rx="6" fill="${U('cyp')}"/>${SPEC(10, 39, 92, 4, 2)}
      ${Array.from({ length: 9 }, (_, i) => `<rect x="${22 + i * 6.6}" y="42.5" width="3.4" height="3" rx="1" fill="#05070b"/>`).join('')}
      <rect x="6" y="37" width="12" height="14" rx="6" fill="#3a4150"/><path d="M8 40v8M11 38.5v11M14 38.5v11" stroke="#14171d" stroke-width=".8"/>
      <rect x="100" y="39" width="10" height="10" rx="2" fill="${U('cyal')}"/>`,
    // Diadema de comentarista
    headset: (p) => `${SH(60, 42)}
      <path d="M28 64C28 22 92 22 92 64" stroke="#14171d" stroke-width="8" fill="none" stroke-linecap="round"/><path d="M30 60C31 28 89 28 90 60" stroke="#5b6476" stroke-width="2" fill="none"/>
      <path d="M96 82q8 10 2 22" stroke="#14171d" stroke-width="3" fill="none" stroke-linecap="round"/>
      <ellipse cx="92" cy="70" rx="12" ry="17" fill="${U('pl')}"/><ellipse cx="95" cy="70" rx="7" ry="12" fill="${U('rub')}"/>
      <ellipse cx="28" cy="70" rx="12" ry="17" fill="${U('pl')}"/>${SPEC(19, 56, 16, 6, 3)}<ellipse cx="25" cy="70" rx="7" ry="12" fill="${U('rub')}"/>
      <path d="M32 80q2 20 26 18" stroke="#14171d" stroke-width="3.4" fill="none" stroke-linecap="round"/>
      <rect x="54" y="92" width="16" height="10" rx="5" fill="${U('pl')}"/><ellipse cx="70" cy="97" rx="5.5" ry="5.5" fill="#2a2d33"/><circle cx="68.5" cy="95.5" r="1.6" fill="#fff" opacity=".2"/>
      <rect x="36" y="40" width="8" height="5" rx="2" fill="#ff3b3b" transform="rotate(-50 40 42)"/>`,
    // Intercom inalámbrico: base con antenas y diadema sin cable
    intercom_wl: (p) => `${SH(58, 48)}
      ${ANT(26, 48, -18, 22)}${ANT(56, 48, 18, 22)}
      ${BOX3(18, 50, 44, 28, 6)}${SPEC(19, 51, 42, 6, 3)}<rect x="23" y="55" width="22" height="10" rx="1" fill="${U('lcd')}"/><text x="25" y="61.8" font-size="4.6" font-family="${FONT_M}" fill="#e9f3ff">8 ON</text>${LED(51, 58, '#2ecc71', true)}${LED(56, 58, '#2ecc71')}${KNOB(52, 71, 3)}
      <path d="M70 70C70 40 108 40 108 70" stroke="#14171d" stroke-width="5.5" fill="none" stroke-linecap="round"/>
      <ellipse cx="72" cy="76" rx="9" ry="12" fill="${U('pl')}"/><ellipse cx="74" cy="76" rx="5" ry="8.5" fill="${U('rub')}"/><rect x="104" y="66" width="8" height="10" rx="3" fill="${U('pl')}"/>
      <path d="M68 70v-12" stroke="#14171d" stroke-width="2.6" stroke-linecap="round"/>${LED(72, 66, '#4da3ff', true)}
      <path d="M74 86q4 12 22 12" stroke="#14171d" stroke-width="2.8" fill="none"/><rect x="92" y="94" width="12" height="7" rx="3.5" fill="#2a2d33"/>`,

    // ===== Internet, video inalámbrico, cables y energía =====
    hotspot: (p) => `${SH(60, 34)}
      ${WAVES(60, 30)}
      <rect x="26" y="38" width="68" height="50" rx="12" fill="${U('pl')}"/>${SPEC(28, 39, 64, 12, 10)}${BEV(36, 38.6, 84)}
      <rect x="33" y="46" width="42" height="26" rx="3" fill="${U('lcd')}"/>${[0, 1, 2, 3].map((i) => `<rect x="${37 + i * 4}" y="${62 - i * 3}" width="2.6" height="${4 + i * 3}" fill="#e9f3ff"/>`).join('')}
      <text x="65" y="63" font-size="12" font-family="${FONT_D}" font-weight="800" fill="#fff" text-anchor="middle">5G</text>
      <rect x="37" y="49" width="8" height="3.4" rx=".8" fill="none" stroke="#cfe6ff" stroke-width=".7"/><rect x="38" y="50" width="5" height="1.4" fill="#2ecc71"/>
      ${KNOB(84, 59, 3.4)}${LED(84, 49, '#2ecc71', true)}<rect x="34" y="78" width="16" height="4" rx="1" fill="#05070b"/>`,
    // Transmisor de video inalámbrico (2 o 4 antenas de paleta)
    wireless_tx: (p) => {
      const n = (p.q || 1) >= 4 ? 4 : 2;
      const ants = n === 4 ? [[36, -22], [48, -8], [60, 8], [72, 22]] : [[40, -16], [68, 16]];
      return `${SH(56, 40)}
      ${ants.map(([x, a]) => ANT(x, 46, a, 26)).join('')}
      ${BOX3(28, 48, 52, 38, 8)}${SPEC(29, 49, 50, 8, 3)}
      <rect x="34" y="54" width="30" height="14" rx="1.5" fill="#03140b" stroke="#1d3b2b" stroke-width=".8"/><text x="36" y="60.5" font-size="4.8" font-family="${FONT_M}" fill="#2ecc71">TX ●</text><text x="36" y="66" font-size="4" font-family="${FONT_M}" fill="#7fe0a8">${n === 4 ? '230 m' : '135 m'}</text>
      <circle cx="72" cy="60" r="3" fill="#f0b829"/><circle cx="72" cy="60" r="1.2" fill="#05070b"/>${LED(36, 76, '#2ecc71', true)}${LED(41, 76, '#4da3ff')}${KNOB(70, 76, 3)}
      <path d="M80 70q14 4 18 18" stroke="#14171d" stroke-width="3" fill="none" stroke-linecap="round"/>${WAVES(96, 30, n === 4 ? '#b57bff' : '#4da3ff')}`;
    },
    // Par de conversores SDI ↔ fibra
    fiber_converter: (p) => `${SH(60, 54)}
      <path d="M40 74C56 104 66 40 80 70" stroke="#f0b829" stroke-width="3.4" fill="none" stroke-linecap="round"/><path d="M40 72C56 100 66 38 80 68" stroke="#fff3c4" stroke-width=".9" fill="none" opacity=".6"/>
      <path d="M12 70q-10 6-8 22M108 70q10 6 8 22" stroke="#14171d" stroke-width="3" fill="none" stroke-linecap="round"/>
      ${[[10, 'SDI'], [76, 'SDI']].map(([x, t]) => `${BOX3(x, 58, 34, 22, 6)}${SPEC(x + 1, 59, 32, 5, 3)}<circle cx="${x + 7}" cy="70" r="3.4" fill="${U('cyal')}"/><circle cx="${x + 7}" cy="70" r="1.3" fill="#05070b"/><rect x="${x + 24}" y="67" width="7" height="6" rx="1" fill="#2f6fb3"/>${LED(x + 15, 66, '#2ecc71', true)}<text x="${x + 18}" y="77" font-size="4.4" font-family="${FONT_M}" fill="#8b95a8" text-anchor="middle">${t}</text>`).join('')}`,
    // Generador inverter portátil
    generator_inverter: (p) => `${SH(60, 46)}
      <path d="M36 42q0-16 14-16h20q14 0 14 16" stroke="#7a1015" stroke-width="7" fill="none" stroke-linecap="round"/>
      <path d="M18 56q0-14 14-14h56q14 0 14 14v34q0 6-6 6H24q-6 0-6-6z" fill="${U('red')}"/>${SPEC(22, 43, 76, 10, 8)}
      <rect x="24" y="58" width="38" height="30" rx="3" fill="#1b1e25"/>
      ${[0, 1].map((i) => `<rect x="${28 + i * 16}" y="62" width="13" height="11" rx="2.5" fill="#e9edf5"/><path d="M${32 + i * 16} 65v4M${37 + i * 16} 65v4" stroke="#14171d" stroke-width="1.4"/>`).join('')}
      <rect x="28" y="78" width="10" height="5" rx="1" fill="#2ecc71"/><circle cx="52" cy="80.5" r="3" fill="#3a4150"/>
      ${Array.from({ length: 6 }, (_, i) => `<path d="M68 ${60 + i * 4.4}h26" stroke="#7a1015" stroke-width="2" stroke-linecap="round"/>`).join('')}
      <circle cx="90" cy="46" r="4" fill="${U('gm')}"/><rect x="24" y="96" width="12" height="4" rx="1" fill="#14171d"/><rect x="84" y="96" width="12" height="4" rx="1" fill="#14171d"/>`,

    // ===== Vehículos =====
    cargo_van: (p) => `${SH(60, 56, 104, 5)}
      ${[[14, 18], [34, 14], [52, 16]].map(([x, w], i) => `<rect x="${x}" y="${30 - i % 2 * 4}" width="${w}" height="${10 + i % 2 * 4}" rx="1.5" fill="${['#2a2f3a', '#1d3b5e', '#2a2f3a'][i]}"/><rect x="${x + w / 2 - 3}" y="${32 - i % 2 * 4}" width="6" height="2" fill="#5b6476"/>`).join('')}
      <path d="M10 40h62" stroke="#3a4150" stroke-width="3"/>
      <path d="M6 48q0-6 6-6h66q6 0 10 4l18 20q4 4 4 10v12q0 4-4 4H6z" fill="${U('al')}"/>${SPEC(7, 43, 74, 8, 4)}
      <path d="M82 48h7l14 16H82z" fill="#1d3b5e"/><path d="M84 50h4l-3 10h-2z" fill="#fff" opacity=".35"/>
      <path d="M44 46v38M78 46v38" stroke="#8f99aa" stroke-width=".9"/><rect x="70" y="62" width="6" height="2" rx="1" fill="#5b6476"/><rect x="36" y="62" width="6" height="2" rx="1" fill="#5b6476"/>
      <path d="M6 72h104" stroke="#2f6fb3" stroke-width="3"/><rect x="104" y="76" width="6" height="4" rx="1" fill="#ffd27a"/><rect x="6" y="76" width="4" height="5" fill="#ff3b3b"/>
      ${[26, 90].map((x) => `<circle cx="${x}" cy="90" r="10" fill="${U('tire')}"/>`).join('')}`,
    // Tráiler OB con cabina de camión
    ob_truck: (p) => `${SH(60, 58, 104, 5)}
      <path d="M8 34v-6" stroke="#5b6476" stroke-width="3"/><g transform="rotate(-24 10 20)"><ellipse cx="10" cy="20" rx="15" ry="6" fill="${p.vip ? U('dishg') : U('dish')}"/><path d="M10 20V10" stroke="#5b6476" stroke-width="1.4"/><circle cx="10" cy="9" r="1.8" fill="#3a4150"/></g>
      <rect x="2" y="34" width="84" height="54" rx="2" fill="${U('wht')}"/>${SPEC(3, 35, 82, 10, 2)}
      <rect x="16" y="40" width="56" height="40" rx="1" fill="none" stroke="#a9b2bf" stroke-width="1.2"/><path d="M44 40v40" stroke="#a9b2bf" stroke-width=".8"/>
      <rect x="2" y="66" width="84" height="7" fill="${p.uhd ? U('gold') : U('red')}"/>
      <text x="44" y="61" font-size="9" font-family="${FONT_D}" font-weight="800" fill="#ff3b3b" text-anchor="middle" letter-spacing=".6">${p.uhd ? '4K HDR' : 'EN VIVO'}</text>
      <path d="M48 34V22M44 22h8" stroke="#5b6476" stroke-width="2"/><circle cx="48" cy="20" r="2" fill="#ff3b3b" class="blink"/>
      <rect x="62" y="88" width="3" height="8" fill="#3a4150"/>
      <path d="M88 54h14q6 0 8 6l6 14v14H88z" fill="${U('red')}"/><path d="M94 58h8l6 12H94z" fill="#1d3b5e"/><path d="M96 60h3l-2 8h-2z" fill="#fff" opacity=".35"/><rect x="86" y="44" width="4" height="44" fill="${U('gm')}"/>
      <rect x="112" y="80" width="5" height="4" rx="1" fill="#ffd27a"/>
      ${[16, 32, 102].map((x) => `<circle cx="${x}" cy="92" r="8.5" fill="${U('tire')}"/>`).join('')}`,
  });
  // Variantes por subtipo que reutilizan un dibujo (no son clases nuevas)
  const BOND0 = DRAW.bonding;
  DRAW.bonding = (p) => (p.big ? BOND0(p).replace('<path d="M30 30q', `${[0, 1].map((i) => `<rect x="${30 + i * 52}" y="${16 + i * 2}" width="5" height="20" rx="2.5" fill="${U('pl')}"/>`).join('')}<path d="M30 30q`).replace('>LIVE<', ' textLength="28" lengthAdjust="spacingAndGlyphs">LIVE 5G<') : BOND0(p));
  const CAMC0 = DRAW.camcorder;
  DRAW.camcorder = (p) => `${CAMC0(p)}${p.tag ? `<rect x="43" y="62" width="12" height="7" rx="1" fill="#0b0d11"/><text x="49" y="67.3" font-size="4.6" font-family="${FONT_M}" fill="${p.stream ? '#2ecc71' : '#8b95a8'}" text-anchor="middle">${esc(p.tag)}</text>` : ''}${p.stream ? `${ANT(80, 33, 14, 14)}${ANT(72, 33, -8, 12)}${WAVES(98, 20, '#2ecc71')}` : ''}`;
  const ENG0 = DRAW.eng;
  DRAW.eng = (p) => `${p.fiber ? '<path d="M100 78q14 6 12 16t6 12" stroke="#f0b829" stroke-width="3.2" fill="none" stroke-linecap="round"/>' : ''}${ENG0(p)}${p.fiber ? `<rect x="96" y="74" width="10" height="7" rx="2" fill="${U('cyal')}"/>` : ''}`;
  const SYS0 = DRAW.system;
  DRAW.system = (p) => `${SYS0(p)}${p.tag ? `<rect x="64" y="58" width="22" height="7" rx="1" fill="#0b0d11"/><text x="75" y="63.6" font-size="5" font-family="${FONT_M}" fill="${p.acc || '#8b95a8'}" text-anchor="middle">${esc(p.tag)}</text>` : ''}`;
  // Subtipos soportados (para equipos nuevos: CATALOG[k].subtipo o Art.item(k, s, {subtipo}))
  const SUBTIPOS = Object.keys(DRAW).filter((k) => !['gems', 'crown', 'gift', 'star', 'toolkit', 'cash'].includes(k));
  const has = (o, k) => !!k && Object.prototype.hasOwnProperty.call(o, k);
  // Subtipo del catálogo (js/datos.js) → dibujo, o [dibujo, parámetros]. "cat:subtipo" gana sobre "subtipo".
  const SUB_DRAW = {
    // Cámaras: cada clase con su dibujo
    camcorder_consumo: 'handycam', camcorder_pro: 'camcorder', camcorder_pro_sdi: ['camcorder', { tag: 'SDI' }], camcorder_streaming: ['camcorder', { tag: 'SRT', stream: true }],
    estudio_ligera: 'studio_box', cine: 'cine', eng_hombro: 'eng', ptz: 'ptz', ptz_broadcast: 'ptz_pro',
    sistema: ['eng', { fiber: true, tag: 'CCU', body: U('al') }], sistema_4k: ['system', { tag: 'UHD' }], super_lenta: ['system', { tag: 'HFR', acc: '#ffb020' }],
    ultra_movimiento: 'highspeed', pov: 'pov_cam', accion: 'action_cam', gimbal_compacta: 'pocket_gimbal', celular: 'phone_gimbal',
    dron: 'drone', dron_cine: ['drone', { body: U('gm') }], grua: 'jib', camara_aerea_cables: 'spidercam', riel: 'rail_cam',
    // Lentes
    lente_mft: 'lens_kit', lente_cine: 'lens_cine', lente_eng: 'lens_eng', lente_box: 'lens_box', adaptador_lente_box: 'box_adapter',
    // Trípodes y soportes
    tripode: 'tripod', tripode_fluido: 'tripod_fluid', soporte_pesado: 'tripod_heavy', gimbal: 'gimbal', steadicam: 'steadicam', jib: 'jib', dolly: 'dolly',
    // Switchers, repetición, gráficos y monitores
    mini_hdmi: 'mini_switcher', sdi: 'switcher_rack', sdi_me: 'switcher', grande_me: 'switcher_big',
    'switcher:software': (it) => ((it.q || 1) >= 3 ? ['workstation', { ui: 'mix' }] : 'laptop'),
    'replay:software': ['workstation', { ui: 'replay', jog: true }], servidor_medio: 'replay', servidor_broadcast: 'replay',
    'graphics:software': ['workstation', { ui: 'gfx' }], cg_3d: 'cg', cg_ar: 'cg_ar', multiviewer: 'multiview', referencia: 'ref_monitor',
    // Audio y micrófonos
    analoga: ['console', { channels: 8, screen: false }], digital_chica: ['mixer_rack', { tablet: true }], digital: ['mixer_rack', { screen: true }],
    digital_superficie: ['console', { channels: 12 }], digital_grande: ['console', { channels: 16 }], broadcast: ['console', { channels: 20 }],
    dinamico: 'mic_handheld', 'mics:inalambrico': 'mic_wireless', corbatero: 'lavalier', shotgun: 'shotgun', diadema_comentarista: 'headset',
    'intercom:inalambrico': 'intercom_wl', inalambrico_digital: 'intercom',
    // Transmisión, cables, energía, vehículos
    encoder_hw: 'encoder', bonding: 'bonding', bonding_broadcast: ['bonding', { big: true }], hotspot: 'hotspot', satelite: 'satellite', tx_video: 'wireless_tx',
    conversor_fibra: 'fiber_converter', cable_fibra_smpte: 'cable_reel', ups: 'ups', generador_portatil: 'generator_inverter', generador_diesel: 'generator',
    cobertor: 'raincover', maletas: 'case', camioneta: 'cargo_van', ob_chica: 'ob_van', ob_grande: 'ob_truck', ob_uhd: ['ob_truck', { uhd: true }], ob_alquiler: 'ob_van',
  };
  const SUB_ALIAS = { camara: 'camcorder', camcorder: 'camcorder', mano: 'camcorder', hombro: 'eng', eng: 'eng', ptz: 'ptz', robotica: 'ptz', sistema: 'system', estudio: 'studio_box', system: 'system', box: 'system', cine: 'cine',
    accion: 'action_cam', action: 'action_cam', bolsillo: 'pocket_gimbal', pov: 'pov_cam', celular: 'phone_gimbal', movil: 'phone_gimbal',
    switcher: 'switcher', mezclador: 'switcher', laptop: 'laptop', consola: 'console', mixer: 'console', console: 'console', mic: 'mic_wireless', microfono: 'mic_wireless', inalambrico: 'mic_wireless',
    encoder: 'encoder', mochila: 'bonding', bonding: 'bonding', backpack: 'bonding', router: 'router', ups: 'ups', bateria: 'vbattery', battery: 'vbattery', vmount: 'vbattery',
    cable: 'cable_reel', fibra: 'cable_reel', carrete: 'cable_reel', lluvia: 'raincover', cobertor: 'raincover', dron: 'drone', drone: 'drone', grua: 'jib', jib: 'jib',
    unidad_movil: 'ob_van', ob: 'ob_van', van: 'ob_van', generador: 'generator', replay: 'replay', repeticion: 'replay', intercom: 'intercom', satelite: 'satellite', satelital: 'satellite',
    monitor: 'monitor', luz: 'light', light: 'light', led: 'light', maleta: 'case', case: 'case', lente: 'lens_eng', lens: 'lens_eng', tripode: 'tripod', tripod: 'tripod' };
  const TYPE_SUB = {
    cam_basic: 'handycam', cam_pro: 'camcorder', cam_cine: 'camcorder', vip_cam8k: 'system', switch_basic: 'laptop', switch_pro: 'switcher', vip_switcher: 'switcher',
    audio_basic: 'console', audio_pro: 'mixer_rack', mics: 'mic_wireless', encoder: 'encoder', router4g: 'hotspot', ups: 'ups', raincover: 'raincover',
    cable: 'cable_reel', battery: 'vbattery', dron4k: 'drone', grua: 'jib', unidad_movil: 'ob_van', generador: 'generator', vip_satelital: 'satellite',
    kit_reparacion: 'toolkit', caja_chica: 'cash', vip30: 'crown', inicio: 'gift', estrella: 'star',
  };
  const CAT_SUB = { cam: 'camcorder', lens: 'lens_eng', support: 'tripod_fluid', switcher: 'switcher', replay: 'replay', graphics: 'cg', monitor: 'monitor', audio: 'console', mics: 'mic_wireless',
    intercom: 'intercom', encoder: 'encoder', internet: 'router', wireless: 'wireless_tx', cable: 'cable_reel', power: 'ups', rain: 'raincover', case: 'case', vehicle: 'cargo_van',
    service: 'jib', light: 'light', luz: 'light', bonding: 'bonding', drone: 'drone', dron: 'drone' };
  const norm = (t) => String(t == null ? '' : t).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  // → { sub: clave de DRAW, prm: parámetros del subtipo }
  function specOf(type, o) {
    const it = catalogItem(type);
    const cat = norm((o && o.cat) || (it && it.cat));
    for (const c of [o && o.subtipo, it && it.subtipo]) {
      const k = norm(c);
      if (!k) continue;
      let m = has(SUB_DRAW, cat + ':' + k) ? SUB_DRAW[cat + ':' + k] : has(SUB_DRAW, k) ? SUB_DRAW[k] : null;
      if (typeof m === 'function') { try { m = m(it || {}); } catch (e) { m = null; } }
      if (m) { const d = Array.isArray(m) ? m[0] : m; if (has(DRAW, d)) return { sub: d, prm: Array.isArray(m) ? m[1] : null }; }
      if (has(DRAW, k)) return { sub: k };
      if (has(SUB_ALIAS, k)) return { sub: SUB_ALIAS[k] };
    }
    if (has(TYPE_SUB, type)) return { sub: TYPE_SUB[type] };
    if (/^creditos/.test(String(type))) return { sub: 'gems' };
    const n = norm(type);
    const rx = [[/camioneta|furgon|pickup/, 'cargo_van'], [/corbat|solapa|lavalier/, 'lavalier'], [/shotgun|boom/, 'shotgun'], [/diadema|headset/, 'headset'],
      [/gopr|accion|action/, 'action_cam'], [/bolsillo|pocket/, 'pocket_gimbal'], [/pov/, 'pov_cam'], [/celular|phone/, 'phone_gimbal'], [/steadi/, 'steadicam'], [/dolly/, 'dolly'],
      [/gimbal/, 'gimbal'], [/tripod/, 'tripod_fluid'], [/lente|lens/, 'lens_eng'], [/hotspot/, 'hotspot'], [/multiview/, 'multiview'],
      [/ptz/, 'ptz'], [/eng|hombro/, 'eng'], [/sistema|system|estudio|box/, 'system'], [/cine|8k|6k/, 'cine'], [/replay|repetic/, 'replay'], [/intercom|clear/, 'intercom'],
      [/mochila|bond|backpack|lu\d/, 'bonding'], [/unidad|ob_?van|movil|truck|trailer/, 'ob_van'], [/dron|drone/, 'drone'], [/grua|jib|crane/, 'jib'], [/cable|fibra|sdi/, 'cable_reel'],
      [/bater|battery|vmount|v_mount/, 'vbattery'], [/monitor/, 'monitor'], [/luz|light|led|panel/, 'light'], [/sat/, 'satellite'], [/gener/, 'generator'], [/router|4g|5g|modem/, 'router'],
      [/encoder|srt/, 'encoder'], [/mic/, 'mic_wireless'], [/audio|consola|mixer/, 'console'], [/switch|atem|mezcl/, 'switcher'], [/laptop|vmix/, 'laptop'], [/ups/, 'ups'], [/cam/, 'camcorder']];
    for (const [re, k] of rx) if (re.test(n)) return { sub: k };
    if (has(CAT_SUB, cat)) return { sub: CAT_SUB[cat] };
    return { sub: 'case' };
  }
  const subtipoOf = (type, o) => specOf(type, o).sub;
  function itemParams(type, r, prm) {
    const it = catalogItem(type) || {};
    const p = Object.assign({ vip: r.key === 'vip', q: it.q || 1 }, prm || {});
    // Lentes: el número de zoom o la focal sale del nombre (solo números, nunca la marca)
    if (it.cat === 'lens' && !p.tag) {
      const nm = String(it.name || ''), r1 = /(\d+)\s*-\s*(\d+)/.exec(nm), zs = nm.match(/\d{2,3}(?=\s*[x×])/gi);
      if (zs) p.tag = zs[zs.length - 1] + '×'; else if (r1) p.tag = r1[1] + '-' + r1[2];
    }
    if (p.vip) { p.acc = '#f0b829'; p.tag = p.tag || '8K'; }
    return p;
  }
  const ITEM_LABEL = (type) => { const it = catalogItem(type); return it ? it.name : ''; };

  // Art.item(tipo, tamaño, { subtipo, cat, rarity, label }) → render del equipo con brillo de rareza
  function itemRaw(type, size, opts) {
    const o = opts || {};
    const s = size || 96;
    const r = (o.rarity && RARITIES[RARITY_ALIAS[norm(o.rarity)] || o.rarity]) || rarity(type);
    const spec = specOf(type, o);
    const sub = spec.sub;
    let body;
    try { body = DRAW[sub](itemParams(type, r, spec.prm)); } catch (e) { try { body = DRAW.case({}); } catch (e2) { body = ''; } }
    const inline = ensureShared() ? '' : `<defs>${sharedDefs()}</defs>`;
    const rays = r.key === 'exclusivo' || r.key === 'vip'
      ? `<g opacity="${r.key === 'vip' ? 0.2 : 0.13}" fill="${r.color}" class="${r.key === 'vip' ? 'rays' : ''}" style="transform-origin:60px 58px">${Array.from({ length: 8 }, (_, i) => { const a = i * Math.PI / 4; return `<path d="M60 58L${(60 + 72 * Math.cos(a - 0.11)).toFixed(1)} ${(58 + 72 * Math.sin(a - 0.11)).toFixed(1)}L${(60 + 72 * Math.cos(a + 0.11)).toFixed(1)} ${(58 + 72 * Math.sin(a + 0.11)).toFixed(1)}z"/>`; }).join('')}</g>` : '';
    const sparkles = r.key === 'vip' || r.key === 'exclusivo'
      ? [[16, 20, 0], [104, 16, 0.6], [106, 86, 1.2]].map(([x, y, d]) => `<path d="M${x} ${y - 5}l1.4 3.6 3.6 1.4-3.6 1.4-1.4 3.6-1.4-3.6-3.6-1.4 3.6-1.4z" fill="${r.key === 'vip' ? '#fff3c4' : '#ffd0a8'}" class="twinkle" style="animation-delay:${d}s"/>`).join('') : '';
    const label = esc(o.label || ITEM_LABEL(type) || 'Equipo');
    return `<svg class="itemart r-${r.key}" width="${s}" height="${s}" viewBox="0 0 120 120" role="img" aria-label="${label}" data-sub="${sub}">${inline}
      <circle cx="60" cy="58" r="58" fill="url(#am-glow-${r.key})"/>${rays}${body}${sparkles}</svg>`;
  }

  // Los dibujos son deterministas: se guardan ya armados (la bodega pinta hasta 90 a la vez)
  const MEMO_MAX = 600;
  const memoItem = new Map(), memoAvatar = new Map();
  const recordar = (m, k, v) => { if (m.size >= MEMO_MAX) m.delete(m.keys().next().value); m.set(k, v); return v; };
  function item(type, size, opts) {
    let k;
    try { k = type + '|' + (size || 96) + '|' + (opts ? JSON.stringify(opts) : '') + '|' + ITEM_LABEL(type); } catch (e) { return itemRaw(type, size, opts); }
    if (memoItem.has(k)) return memoItem.get(k);
    const v = itemRaw(type, size, opts);
    return ensureShared() ? recordar(memoItem, k, v) : v;
  }

  /* =========================================================
     Avatares del personal (dibujados a partir del nombre)
     Art.avatar(nombre | persona, rol, tamaño, { owner, premium })
     Roles: cam, dir, audio, stream y los nuevos (cablero/asistente, boom, replay,
     graficos, shader, dron/piloto, productor). Rol desconocido → sin accesorio.
     ========================================================= */
  const SKINS = ['#f3cfae', '#e8bb92', '#dda77c', '#c98a5e', '#b97f55', '#9a6440', '#7a4b2c'];
  const HAIRS = ['#14151a', '#1f1610', '#2e1d12', '#3d2616', '#5a3a22', '#7a4f2a', '#a8742f'];
  const ROLE_ALIAS = { camarografo: 'cam', camara: 'cam', director: 'dir', vmix: 'dir', sonidista: 'audio', sonido: 'audio', streaming: 'stream', tecnico: 'stream',
    cablero: 'cablero', asistente: 'cablero', boom: 'boom', microfonista: 'boom', replay: 'replay', repeticion: 'replay', graficos: 'graficos', grafica: 'graficos',
    shader: 'shader', ccu: 'shader', vision: 'shader', dron: 'dron', piloto: 'dron', piloto_dron: 'dron', productor: 'productor', produccion: 'productor',
    operador_repeticion: 'replay', operador_graficos: 'graficos', tecnico_transmision: 'stream', operador_ptz: 'cam', coordinador_piso: 'productor', runner: 'cablero' };
  const ROLE_TONE = {
    cam: { bg: '#18324f', cloth: ['#2f4f7a', '#3a5f8f', '#24405f'] },
    dir: { bg: '#3a1d27', cloth: ['#2a2d35', '#3b2f45', '#20242c'] },
    audio: { bg: '#163a2a', cloth: ['#3f6b4a', '#2f5a3e', '#4a5a3a'] },
    stream: { bg: '#2e2448', cloth: ['#5a4a7a', '#4a3d6b', '#6b4a7a'] },
    cablero: { bg: '#3a2c12', cloth: ['#f59e1b', '#e0861a', '#3a4150'] },
    boom: { bg: '#1d3340', cloth: ['#2a3a48', '#3a4a58', '#20303c'] },
    replay: { bg: '#2c1f3f', cloth: ['#3b2f55', '#2a2d35', '#4a3d6b'] },
    graficos: { bg: '#123a3a', cloth: ['#1d5a5a', '#2a4a5a', '#24404a'] },
    shader: { bg: '#1f2a44', cloth: ['#24405f', '#2a2d35', '#1d3b5e'] },
    dron: { bg: '#1c3a1f', cloth: ['#3a5a2a', '#2f4a3a', '#4a5a3a'] },
    productor: { bg: '#40301a', cloth: ['#2a2d35', '#5a3a22', '#3b2f45'] },
  };
  const FEM = /^(andrea|mar[ií]a|gaby|gabriela|daniela|paola|mishell|karla|tania|jessica|vane|vanessa|majo|dom[eé]nica|luc[ií]a|carla|ana|sof[ií]a|valeria|fernanda|camila|micaela|nathaly|evelyn|katherine|estefan[ií]a)\b/i;

  function avatarRaw(seed, role, size, opts) {
    try {
      let o = opts || {};
      let name = seed;
      if (seed && typeof seed === 'object') { o = Object.assign({ owner: seed.owner, premium: seed.premium }, o); name = seed.name; role = role || seed.role; }
      name = String(name == null ? '?' : name);
      const owner = !!o.owner || /^T[uú] \(due[nñ]o\)/i.test(name);
      const premium = !!o.premium;
      const rk = norm(role);
      const rl = ROLE_TONE[rk] ? rk : ROLE_ALIAS[rk] || 'otro';
      const tone = ROLE_TONE[rl] || { bg: '#2a3242', cloth: ['#3a4150', '#2a2d35', '#4a5263'] };
      const r = rng(name + '|' + rl);
      const s = size || 52;
      const u = uid('v');
      const fem = FEM.test(name.replace(/^[^A-Za-zÁÉÍÓÚáéíóúÑñ]+/, ''));
      const skin = owner ? '#d29a6c' : pickR(r, SKINS);
      const skinL = shade(skin, 0.22), skinD = shade(skin, -0.22);
      const hair = owner ? '#1f1610' : (r() < 0.1 ? pickR(r, ['#8a5a2b', '#b8863b', '#7a2f3f']) : pickR(r, HAIRS));
      const cloth = owner ? '#c62f3a' : pickR(r, tone.cloth);
      const bg = owner ? '#4a1a20' : tone.bg;
      const hw = 14 + r() * 2.6, hh = 17 + r() * 2.2;
      const cx = 50, cy = 46, top = cy - hh, L = cx - hw - 1, R = cx + hw + 1;
      const style = owner ? 'side' : fem ? pickR(r, ['long', 'long', 'ponytail', 'bun', 'curly', 'bob']) : pickR(r, ['short', 'short', 'buzz', 'side', 'curly', 'bald', 'spiky']);
      const H = `url(#${u}h)`;
      let back = '', front = '';
      switch (style) {
        case 'long': back = `<path d="M${L - 4} 80C${L - 9} ${top - 2} ${R + 9} ${top - 2} ${R + 4} 80z" fill="${H}"/>`;
          front = `<path d="M${L} 48C${L - 2} ${top - 6} ${R + 2} ${top - 6} ${R} 48c-2-9-8-14-16-15-4 5-10 7-17 8z" fill="${H}"/>`; break;
        case 'bob': back = `<path d="M${L - 3} 62C${L - 6} ${top - 2} ${R + 6} ${top - 2} ${R + 3} 62z" fill="${H}"/>`;
          front = `<path d="M${L} 50C${L - 2} ${top - 6} ${R + 2} ${top - 6} ${R} 50c-1-8-4-12-8-13H${cx - 4}c-6 0-11 4-14 13z" fill="${H}"/>`; break;
        case 'ponytail': back = `<path d="M${R - 2} ${top + 8}c12 2 14 18 8 30-2-10-6-16-12-20z" fill="${H}"/>`;
          front = `<path d="M${L} 46C${L - 1} ${top - 5} ${R + 1} ${top - 5} ${R} 46c-3-8-10-12-${hw + 1}-12s-${hw - 3} 4-${hw + 1} 12z" fill="${H}"/>`; break;
        case 'bun': front = `<circle cx="${cx}" cy="${top - 3}" r="7" fill="${H}"/><path d="M${L} 46C${L - 1} ${top - 5} ${R + 1} ${top - 5} ${R} 46c-3-8-10-12-${hw + 1}-12s-${hw - 3} 4-${hw + 1} 12z" fill="${H}"/>`; break;
        case 'curly': front = `<path d="${Array.from({ length: 10 }, (_, i) => { const a = Math.PI * (1.02 + i * 0.106); const x = cx + Math.cos(a) * (hw + 1), y = cy - 4 + Math.sin(a) * (hh - 1), rr = 5.4 + (i % 2); return `M${(x - rr).toFixed(1)} ${y.toFixed(1)}a${rr} ${rr} 0 1 0 ${(2 * rr).toFixed(1)} 0a${rr} ${rr} 0 1 0 -${(2 * rr).toFixed(1)} 0`; }).join('')}" fill="${H}"/>`;
          if (fem) back = `<path d="M${L - 5} 66C${L - 8} ${top} ${R + 8} ${top} ${R + 5} 66z" fill="${H}"/>`; break;
        case 'buzz': front = `<path d="M${L + 0.5} 44C${L} ${top - 3} ${R} ${top - 3} ${R - 0.5} 44c-2-8-8-11-${hw}-11s-${hw - 2} 3-${hw} 11z" fill="${H}" opacity=".7"/>`; break;
        case 'spiky': front = `<path d="M${L} 44l-1-12 6 3 2-9 6 5 4-8 4 7 6-5 2 9 6-3-1 13c-4-6-10-8-17-8s-13 2-17 8z" fill="${H}"/>`; break;
        case 'side': front = `<path d="M${L} 46C${L - 2} ${top - 7} ${R + 2} ${top - 7} ${R} 46c-1-7-3-10-6-12-8 1-16-1-22-3-3 3-5 9-6 15z" fill="${H}"/>`; break;
        case 'bald': front = `<path d="M${L + 1} 46c0-3 1-6 2-7M${R - 1} 46c0-3-1-6-2-7" stroke="${hair}" stroke-width="3" opacity=".7" stroke-linecap="round"/><ellipse cx="${cx + 3}" cy="${top + 5}" rx="7" ry="3" fill="#fff" opacity=".18"/>`; break;
        default: front = `<path d="M${L} 46C${L - 1} ${top - 6} ${R + 1} ${top - 6} ${R} 46l-2-6C${R - 4} ${top + 8} ${L + 4} ${top + 8} ${L + 2} 40z" fill="${H}"/>`;
      }
      const shine = style !== 'bald' && style !== 'buzz' ? `<path d="M${cx - 6} ${top + 2}q6-3 12 0" stroke="#fff" stroke-opacity=".22" stroke-width="2.4" fill="none" stroke-linecap="round"/>` : '';
      const facial = !fem && !owner && r() < 0.3
        ? (r() < 0.5 ? `<path d="M${cx - 6} 56.5q6-3 12 0q-6 1.6-12 0z" fill="${hair}"/>` : `<path d="M${L + 3} 50c2 12 8 16 ${hw - 2} 16s${hw - 7}-4 ${hw - 2}-16c-2 5-6 7-${hw - 2} 7s-${hw - 6}-2-${hw - 2}-7z" fill="${hair}" opacity=".8"/>`)
        : owner ? `<path d="M${cx - 6} 56.5q6-3 12 0q-6 1.6-12 0z" fill="${hair}"/>` : '';
      const eyeY = 46 + (r() - 0.5) * 1.5;
      const iris = pickR(r, ['#3a2416', '#2a1a10', '#4a3020', '#1d1d1d']);
      const smile = r();
      const mouth = smile < 0.6 ? `<path d="M${cx - 5} 59q5 4 10 0" stroke="#7a3b2e" stroke-width="1.6" fill="none" stroke-linecap="round"/>`
        : smile < 0.85 ? `<path d="M${cx - 5} 58.5q5 5 10 0z" fill="#6a2424"/><path d="M${cx - 4} 58.8h8" stroke="#fff" stroke-width="1.2"/>`
        : `<path d="M${cx - 4} 59.5h8" stroke="#7a3b2e" stroke-width="1.6" stroke-linecap="round"/>`;
      const lips = fem ? `<path d="M${cx - 4.5} 59.2q4.5 2.6 9 0" stroke="#b5485a" stroke-width="1.4" fill="none" stroke-linecap="round" opacity=".7"/>` : '';
      const lash = fem ? `<path d="M${cx - 9.8} ${eyeY - 1.8}l-1.6-1.3M${cx + 9.8} ${eyeY - 1.8}l1.6-1.3" stroke="#1d1d1d" stroke-width="1.1"/>` : '';
      const capCol = pickR(r, ['#ff3b3b', '#2b2f3a', '#4da3ff', '#ffb020', '#2ecc71']);
      const capD = shade(capCol, -0.35);
      const cap = (col, d) => `<path d="M${L - 1} 38C${L} ${top - 7} ${R} ${top - 7} ${R + 1} 38z" fill="${col}"/><path d="M${cx - 4} ${top - 2}q8 2 12 12" stroke="#fff" stroke-opacity=".2" stroke-width="2" fill="none"/><path d="M${L - 1} 38h${(2 * hw + 16).toFixed(1)}c0 2-2 3.5-4 3.5H${L - 1}z" fill="${d}"/>`;
      const headset = (mic) => `<path d="M${L - 1} 44C${L - 1} ${top - 6} ${R + 1} ${top - 6} ${R + 1} 44" stroke="#1d2129" stroke-width="3.2" fill="none"/>
        <rect x="${L - 4}" y="40" width="7" height="11" rx="3" fill="#2a2f3a"/>${mic ? `<path d="M${L} 49q2 9 ${(cx - L - 6).toFixed(1)} 9" stroke="#1d2129" stroke-width="1.8" fill="none"/><circle cx="${cx - 5}" cy="58" r="2.2" fill="#1d2129"/>` : ''}`;
      const glasses = `<rect x="${cx - 13}" y="${eyeY - 4.5}" width="10.5" height="8" rx="2.5" fill="#9ec5ff" fill-opacity=".14" stroke="#14151a" stroke-width="1.6"/><rect x="${cx + 2.5}" y="${eyeY - 4.5}" width="10.5" height="8" rx="2.5" fill="#9ec5ff" fill-opacity=".14" stroke="#14151a" stroke-width="1.6"/><path d="M${cx - 2.5} ${eyeY - 1}h5" stroke="#14151a" stroke-width="1.6"/><path d="M${cx - 11} ${eyeY - 3.5}l3 3" stroke="#fff" stroke-opacity=".5" stroke-width="1"/>`;
      const lanyard = (c) => `<path d="M40 72l10 16 10-16" stroke="${c}" stroke-width="2" fill="none"/><rect x="45" y="86" width="10" height="12" rx="1.5" fill="#e9edf5"/><rect x="47" y="89" width="6" height="2" fill="#4da3ff"/>`;
      let acc = '';
      if (owner) {
        acc = `<path d="M${L - 1} 37C${L} ${top - 7} ${R} ${top - 7} ${R + 1} 37z" fill="#16181d"/><path d="M${L - 1} 37h${(2 * hw + 14).toFixed(1)}l-1 3H${L - 1}z" fill="#0d0e11"/>
          <path d="M${cx} ${top + 1}l1.6 3.3 3.6.5-2.6 2.5.6 3.6-3.2-1.7-3.2 1.7.6-3.6-2.6-2.5 3.6-.5z" fill="#ffd34d"/>`;
      } else if (rl === 'cam') acc = cap(capCol, capD) + `<circle cx="${cx}" cy="${top + 2}" r="1.6" fill="${capD}"/>`;
      else if (rl === 'dir') acc = headset(true);
      else if (rl === 'audio') acc = `<path d="M${L - 3} 46C${L - 4} ${top - 9} ${R + 4} ${top - 9} ${R + 3} 46" stroke="#1d2129" stroke-width="5" fill="none"/>
          <rect x="${L - 8}" y="38" width="10" height="16" rx="4" fill="${capCol}"/><rect x="${R - 2}" y="38" width="10" height="16" rx="4" fill="${capCol}"/><rect x="${L - 6}" y="41" width="3" height="10" rx="1.5" fill="#fff" opacity=".28"/>`;
      else if (rl === 'stream') acc = glasses + lanyard('#ffb020');
      else if (rl === 'cablero') acc = cap('#f59e1b', '#9a4f05') + '<path d="M30 92q20-14 40 0" stroke="#14171d" stroke-width="4" fill="none"/><path d="M30 92q20-14 40 0" stroke="#3f7fd0" stroke-width="2" fill="none"/>';
      else if (rl === 'boom') acc = headset(false) + `<path d="M84 4L66 40" stroke="#8f99aa" stroke-width="2.4"/><ellipse cx="88" cy="2" rx="8" ry="4" transform="rotate(-60 88 2)" fill="#5b6476"/>`;
      else if (rl === 'replay') acc = headset(true) + '<rect x="56" y="80" width="22" height="14" rx="2" fill="#14171d"/><ellipse cx="67" cy="86" rx="6" ry="3" fill="#3a4150"/>';
      else if (rl === 'graficos') acc = glasses + '<rect x="56" y="78" width="24" height="16" rx="2" fill="#14171d"/><rect x="58" y="80" width="20" height="10" fill="#1d5a5a"/>';
      else if (rl === 'shader') acc = headset(false) + glasses;
      else if (rl === 'dron') acc = cap('#2ecc71', '#1d8a4c') + '<rect x="54" y="80" width="26" height="14" rx="3" fill="#14171d"/><path d="M58 80l-2-8M76 80l2-8" stroke="#5b6476" stroke-width="1.6"/><rect x="61" y="82" width="12" height="8" fill="#1d4f86"/>';
      else if (rl === 'productor') acc = lanyard('#ff3b3b') + `<rect x="${R - 1}" y="44" width="5" height="10" rx="2" fill="#14171d"/>`;
      const jacket = owner ? `<path d="M40 72l10 14 10-14" fill="#f2f2f2"/><path d="M44 76l6 10 6-10" stroke="#8a1c25" stroke-width="2" fill="none"/>`
        : rl === 'productor' ? `<path d="M40 72l10 16 10-16" fill="#f2f2f2"/>`
        : `<path d="M42 72q8 6 16 0" stroke="${shade(cloth, -0.35)}" stroke-width="2" fill="none"/>`;
      const ring = premium ? `<circle cx="50" cy="50" r="46.5" fill="none" stroke="url(#${u}o)" stroke-width="5"/><path d="M84 14l1.6 4 4 1.6-4 1.6-1.6 4-1.6-4-4-1.6 4-1.6z" fill="#fff3c4" class="twinkle"/>`
        : owner ? '<circle cx="50" cy="50" r="47" fill="none" stroke="#ff3b3b" stroke-width="3"/>'
        : `<circle cx="50" cy="50" r="47.5" fill="none" stroke="${shade(bg, 0.28)}" stroke-width="2"/>`;
      return `<svg class="avatar" width="${s}" height="${s}" viewBox="0 0 100 100" role="img" aria-label="${esc(name)}">
      <defs><clipPath id="${u}c"><circle cx="50" cy="50" r="47"/></clipPath>
        ${rad(u + 'b', [[0, shade(bg, 0.3)], [1, shade(bg, -0.4)]], 0.5, 0.25, 0.8)}
        ${rad(u + 's', [[0, skinL], [0.55, skin], [1, skinD]], 0.42, 0.36, 0.68)}
        ${lin(u + 'h', [[0, shade(hair, 0.3)], [0.35, hair], [1, shade(hair, -0.4)]])}
        ${lin(u + 'k', [[0, shade(cloth, 0.2)], [1, shade(cloth, -0.45)]])}
        ${premium ? lin(u + 'o', [[0, '#fff1b8'], [0.5, '#f0b829'], [1, '#a8740f']], 1, 1) : ''}</defs>
      <circle cx="50" cy="50" r="48" fill="url(#${u}b)"/>
      <g clip-path="url(#${u}c)">
        ${back}
        <path d="M12 108c0-23 17-36 38-36s38 13 38 36z" fill="url(#${u}k)"/>
        <path d="M18 100c2-16 14-26 32-27" stroke="#fff" stroke-opacity=".14" stroke-width="3" fill="none"/>
        <path d="M${cx - 6.5} 58h13v12q-6.5 5-13 0z" fill="${skinD}"/>
        ${jacket}
        <ellipse cx="${L + 1}" cy="48" rx="3.2" ry="4.6" fill="${skinD}"/><ellipse cx="${R - 1}" cy="48" rx="3.2" ry="4.6" fill="${skinD}"/>
        <ellipse cx="${cx}" cy="${cy}" rx="${hw}" ry="${hh}" fill="url(#${u}s)"/>
        <path d="M${cx - hw + 3} ${cy + 8}q${hw - 3} ${hh * 0.7} ${2 * hw - 6} 0" stroke="${skinD}" stroke-opacity=".5" stroke-width="2" fill="none"/>
        ${front}${shine}${facial}
        <ellipse cx="${cx - 7.5}" cy="${eyeY}" rx="2.8" ry="2.2" fill="#fff" opacity=".9"/><ellipse cx="${cx + 7.5}" cy="${eyeY}" rx="2.8" ry="2.2" fill="#fff" opacity=".9"/>
        <circle cx="${cx - 7.2}" cy="${eyeY + 0.2}" r="1.8" fill="${iris}"/><circle cx="${cx + 7.8}" cy="${eyeY + 0.2}" r="1.8" fill="${iris}"/>
        <circle cx="${cx - 6.6}" cy="${eyeY - 0.5}" r=".7" fill="#fff"/><circle cx="${cx + 8.4}" cy="${eyeY - 0.5}" r=".7" fill="#fff"/>${lash}
        <path d="M${cx - 11} ${eyeY - 5}q3.5-2 7 0M${cx + 4} ${eyeY - 5}q3.5-2 7 0" stroke="${shade(hair, -0.2)}" stroke-width="1.8" fill="none" stroke-linecap="round"/>
        <path d="M${cx + 0.5} ${eyeY + 2}l-2 6.2h3.4" stroke="${skinD}" stroke-width="1.4" fill="none" stroke-linecap="round"/>
        <ellipse cx="${cx - 10}" cy="${eyeY + 7}" rx="3.2" ry="1.9" fill="#ff7a7a" opacity=".2"/><ellipse cx="${cx + 10}" cy="${eyeY + 7}" rx="3.2" ry="1.9" fill="#ff7a7a" opacity=".2"/>
        ${mouth}${lips}${acc}
      </g>${ring}</svg>`;
    } catch (e) {
      return `<svg class="avatar" width="${size || 52}" height="${size || 52}" viewBox="0 0 100 100" aria-hidden="true"><circle cx="50" cy="50" r="48" fill="#2a3242"/><circle cx="50" cy="40" r="16" fill="#8b95a8"/><path d="M18 96c0-20 14-30 32-30s32 10 32 30z" fill="#8b95a8"/></svg>`;
    }
  }

  /* =========================================================
     Piezas de escena reutilizables
     ========================================================= */
  // Público en silueta: pocas <path> (una por color), con alturas y anchos variados
  function avatar(seed, role, size, opts) {
    const o = opts || {};
    const obj = seed && typeof seed === 'object';
    const name = obj ? seed.name : seed;
    const k = [name, role || (obj ? seed.role : ''), size || 52, !!(o.owner || (obj && seed.owner)), !!(o.premium || (obj && seed.premium))].join('|');
    if (memoAvatar.has(k)) return memoAvatar.get(k);
    return recordar(memoAvatar, k, avatarRaw(seed, role, size, opts));
  }

  function crowd(seed, y, n, x0, x1, k, colors, opts) {
    const o = opts || {};
    const r = rng(seed);
    const buckets = colors.map(() => '');
    const skinB = o.heads ? ['', '', ''] : null;
    const step = (x1 - x0) / n;
    for (let i = 0; i < n; i++) {
      const s = k * (0.85 + r() * 0.3);
      const x = x0 + step * (i + 0.5) + (r() - 0.5) * step * 0.5;
      const yy = y + (r() - 0.5) * 3 * k;
      const b = Math.floor(r() * colors.length);
      const hr = 4.2 * s, sw = 8 * s, sh = 13 * s;
      const head = `M${(x - hr).toFixed(1)} ${(yy - sh + 1).toFixed(1)}a${hr.toFixed(1)} ${hr.toFixed(1)} 0 1 0 ${(2 * hr).toFixed(1)} 0a${hr.toFixed(1)} ${hr.toFixed(1)} 0 1 0 -${(2 * hr).toFixed(1)} 0`;
      const body = `M${(x - sw).toFixed(1)} ${(yy + 14 * s).toFixed(1)}c0-${(10 * s).toFixed(1)} ${(2 * s).toFixed(1)}-${(13 * s).toFixed(1)} ${sw.toFixed(1)}-${(13 * s).toFixed(1)}s${sw.toFixed(1)} ${(3 * s).toFixed(1)} ${sw.toFixed(1)} ${(13 * s).toFixed(1)}z`;
      buckets[b] += body;
      if (skinB) skinB[i % 3] += head; else buckets[b] += head;
      if (o.arms && r() < o.arms) buckets[b] += `M${(x + sw * 0.5).toFixed(1)} ${(yy - 2 * s).toFixed(1)}l${(5 * s).toFixed(1)}-${(16 * s).toFixed(1)}l${(2.4 * s).toFixed(1)} ${(0.8 * s).toFixed(1)}l-${(4 * s).toFixed(1)} ${(16 * s).toFixed(1)}z`;
      if (o.phones && r() < o.phones) buckets[b] += `M${(x + 3 * s).toFixed(1)} ${(yy - 14 * s).toFixed(1)}h${(4 * s).toFixed(1)}v${(6 * s).toFixed(1)}h-${(4 * s).toFixed(1)}z`;
    }
    let out = buckets.map((d, i) => (d ? `<path d="${d}" fill="${colors[i]}"/>` : '')).join('');
    if (skinB) out += skinB.map((d, i) => (d ? `<path d="${d}" fill="${['#c98a5e', '#e2b48f', '#8a5a3a'][i]}"/>` : '')).join('');
    return `<g class="${o.anim === false ? '' : 'crowd'}" style="animation-delay:${o.delay || 0}s">${out}</g>`;
  }
  const cone = (x, y, w, len, spread, fill, cls) => `<path d="M${x - w} ${y}L${x - spread} ${y + len}H${x + spread}L${x + w} ${y}z" fill="${fill || U('cone')}"${cls ? ` class="${cls}"` : ''}/>`;
  const pool = (x, y, rx, ry, warm) => `<ellipse cx="${x}" cy="${y}" rx="${rx}" ry="${ry}" fill="${warm ? U('poolW') : U('pool')}"/>`;
  const fixture = (x, y, c) => `<rect x="${x - 6}" y="${y - 4}" width="12" height="8" rx="2" fill="${U('pl')}"/><circle cx="${x}" cy="${y + 3}" r="3" fill="${c || '#fffbe0'}"/>`;

  function sceneCam(x, y, type, k, off) {
    const look = { cam_basic: [U('gm'), 0.8], cam_pro: [U('gm'), 1], cam_cine: [U('al'), 1.08], vip_cam8k: [U('pl'), 1.1] }[type] || [U('gm'), 1];
    const s = (k || 1) * look[1];
    return `<g transform="translate(${x} ${y}) scale(${s.toFixed(2)})" class="${off ? 'cam-off' : ''}">
      <ellipse cx="0" cy="31" rx="15" ry="3" fill="#000" opacity=".45"/>
      <path d="M0 0l-12 30M0 0l12 30M0 0v30" stroke="#5b6476" stroke-width="2.2" stroke-linecap="round"/><path d="M-6 16h12" stroke="#3a4150" stroke-width="1.4"/>
      <rect x="-4" y="-3" width="8" height="5" rx="1" fill="#14171d"/><path d="M-4 -1l-12 6" stroke="#3a4150" stroke-width="2" stroke-linecap="round"/>
      <rect x="-14" y="-17" width="25" height="14" rx="2.5" fill="${look[0]}"/><rect x="-13" y="-16" width="23" height="3.5" rx="1.5" fill="#fff" opacity=".22"/>
      <rect x="-5" y="-23" width="13" height="6" rx="1.5" fill="#14171d"/>
      <rect x="10" y="-15" width="10" height="10" rx="1.5" fill="${U('cyp')}"/><ellipse cx="20" cy="-10" rx="1.6" ry="4.4" fill="${U('lens')}"/>
      ${type === 'vip_cam8k' ? '<path d="M-14 -4h25" stroke="#f0b829" stroke-width="1.2"/>' : ''}
      <circle cx="-9" cy="-20" r="2.2" fill="#ff3b3b" class="${off ? '' : 'blink'}"/></g>`;
  }
  function vanSide(x, y, k, dish, vip) {
    return `<g transform="translate(${x} ${y}) scale(${k || 1})">
      <ellipse cx="44" cy="35" rx="48" ry="4" fill="#000" opacity=".45"/>
      <rect x="0" y="0" width="70" height="28" rx="4" fill="${U('wht')}"/><path d="M70 6h10l8 10v12H70z" fill="${U('wht')}"/><path d="M72 9h7l6 8H72z" fill="#1d3b5e"/>
      <rect x="0" y="15" width="70" height="5" fill="${U('red')}"/><rect x="1" y="1" width="68" height="5" rx="3" fill="#fff" opacity=".5"/>
      ${[0, 1, 2].map((i) => `<rect x="${6 + i * 20}" y="6" width="13" height="7" rx="1" fill="#1d3b5e"/>`).join('')}
      <circle cx="16" cy="29" r="6.2" fill="${U('tire')}"/><circle cx="70" cy="29" r="6.2" fill="${U('tire')}"/>
      ${dish ? `<path d="M24 0v-6" stroke="#8b95a8" stroke-width="2"/><g transform="rotate(-25 24 -10)"><ellipse cx="24" cy="-10" rx="11" ry="4.5" fill="${vip ? U('dishg') : U('dish')}"/><path d="M24 -10v-7" stroke="#8b95a8"/></g>` : '<path d="M20 0v-8M14 -12h12" stroke="#8b95a8" stroke-width="2"/>'}
      <circle cx="60" cy="-2" r="2" fill="#ff3b3b" class="blink"/></g>`;
  }
  function droneSmall(x, y, k, flying) {
    return `<g transform="translate(${x} ${y}) scale(${k || 1})"><g class="${flying ? 'hover' : ''}">
      <path d="M-14 -4L14 4M-14 4L14 -4" stroke="#14171d" stroke-width="2.6" stroke-linecap="round"/>
      <ellipse cx="0" cy="0" rx="8" ry="4.5" fill="${U('wht')}"/><rect x="-2.5" y="3.5" width="5" height="4" rx="1" fill="#14171d"/><circle cx="0" cy="8.5" r="2.2" fill="${U('lens')}"/>
      ${[[-14, -5], [14, -5], [-14, 3], [14, 3]].map(([px, py]) => (flying ? `<ellipse cx="${px}" cy="${py - 1.5}" rx="8" ry="1.8" fill="#d6e0ee" opacity=".35"/>` : `<path d="M${px - 6} ${py - 1.5}h12" stroke="#5b6476" stroke-width="1.4"/>`)).join('')}
      <circle cx="-10" cy="0" r="1.6" fill="#ff3b3b" class="${flying ? 'fx-blink' : ''}"/><circle cx="10" cy="0" r="1.6" fill="#2ecc71" class="${flying ? 'fx-blink' : ''}" style="animation-delay:.4s"/></g></g>`;
  }
  function tripod(x, y, color, scale) { return sceneCam(x, y, color === '#e9edf5' ? 'cam_cine' : 'cam_pro', scale); }

  /* =========================================================
     Sede de la productora (día y noche)
     ========================================================= */
  /* Premios de temporada que se ven en la sede (s.temporada.cosmeticos) */
  function cosmeticosSede(st, roofX, roofY) {
    const c = st && st.temporada && Array.isArray(st.temporada.cosmeticos) ? st.temporada.cosmeticos : [];
    const out = { cielo: '', piso: '' };
    if (!c.length) return out;
    const has = (k) => c.includes(k);
    if (has('fuegos')) out.cielo += `<g class="hq-cosm hq-fuegos">${[[60, 2, '#ffd27a'], [250, -6, '#ff5a8a'], [150, -10, '#5ad1ff']].map(([x, y, col], j) => `<g class="twinkle" style="animation-delay:${j * 0.5}s">${Array.from({ length: 8 }, (_, i) => { const a = i * Math.PI / 4; return `<path d="M${x} ${y}l${(Math.cos(a) * 11).toFixed(1)} ${(Math.sin(a) * 11).toFixed(1)}" stroke="${col}" stroke-width="1.4" stroke-linecap="round"/>`; }).join('')}</g>`).join('')}</g>`;
    if (has('pesebre')) out.cielo += `<path class="hq-cosm hq-pesebre twinkle" transform="translate(${roofX + 22} ${roofY - 8})" d="M0-7l2 5h5l-4 3 2 5-5-3-5 3 2-5-4-3h5z" fill="#ffd27a"/>`;
    if (has('corazones')) out.cielo += `<g class="hq-cosm hq-corazones">${[[110, 30], [200, 26], [250, 36]].map(([x, y]) => `<path transform="translate(${x} ${y}) scale(.7)" d="M0 4C-6-2-10 2-8 6l8 8 8-8c2-4-2-8-8-2z" fill="#ff5a8a" class="twinkle"/>`).join('')}</g>`;
    if (has('banderines')) out.cielo += `<g class="hq-cosm hq-banderines"><path d="M40 20q140 30 280 0" stroke="#c5ccd6" fill="none"/>${Array.from({ length: 12 }, (_, i) => { const x = 50 + i * 23, y = 20 + Math.sin((i + 0.5) / 12 * Math.PI) * 14; return `<path d="M${x} ${y.toFixed(1)}l6 0-3 8z" fill="${['#ff5a5a', '#ffd27a', '#5ad1ff', '#7dff9a'][i % 4]}"/>`; }).join('')}</g>`;
    if (has('arbol')) out.piso += `<g class="hq-cosm hq-arbol" transform="translate(318 140)"><rect x="-2" y="-6" width="4" height="6" fill="#6b4a2a"/><path d="M0-44L-13-20h6L-15-6h30L7-20h6z" fill="#2f8f5b"/>${[[-6, -14, '#ff5a5a'], [5, -22, '#ffd27a'], [-3, -30, '#5ad1ff'], [8, -12, '#ff8fb1'], [-9, -9, '#ffd27a']].map(([x, y, col]) => `<circle cx="${x}" cy="${y}" r="1.8" fill="${col}" class="blink"/>`).join('')}<path d="M0-49l1.6 3.4h3.6l-2.9 2.2 1.1 3.6L0-42l-3.4 2.2 1.1-3.6-2.9-2.2h3.6z" fill="#ffd27a" class="twinkle"/></g>`;
    if (has('calabazas')) out.piso += `<g class="hq-cosm hq-calabazas">${[[48, 137], [312, 137]].map(([x, y]) => `<g transform="translate(${x} ${y})"><ellipse rx="7" ry="5" fill="#ff8a1f"/><path d="M-1-5v-3" stroke="#3b7a2a" stroke-width="2"/><path d="M-4-1l2-2 2 2zM1-1l2-2 2 2z" fill="#ffd27a"/></g>`).join('')}</g>`;
    if (has('flores')) out.piso += `<g class="hq-cosm hq-flores">${Array.from({ length: 7 }, (_, i) => `<circle cx="${150 + i * 10}" cy="${136 - Math.sin(i / 6 * Math.PI) * 6}" r="3" fill="${['#ffffff', '#f4d0ff', '#ffd27a'][i % 3]}"/>`).join('')}</g>`;
    return out;
  }
  /* ---------- Vida de la sede: gente, tráfico, luces, ondas, cielo (solo CSS: transform/opacity, lento y calmado) ----------
     Las clases empiezan con "hqv-". Con "reducir movimiento" no se mueve nada: la gente queda parada en la vereda y lo que
     solo existe en movimiento (carro, moto, pájaros, estrella fugaz, ondas, sombra en la ventana) queda oculto. */
  const VIDA_CSS = '.hq .hqv-p{stroke-width:1.9;stroke-linecap:round;animation:hqv-paso .45s ease-in-out infinite alternate;transform-box:fill-box;transform-origin:50% 0}'
    + '.hq .hqv-br{stroke:#000;stroke-opacity:.35;stroke-width:1.5;stroke-linecap:round}.hq .hqv-humo,.hq .hqv-onda{fill:none;stroke-linecap:round}.hq .hqv-humo{stroke:#e9edf5;stroke-width:.55}.hq .hqv-onda{stroke-width:1.1}.hq .hqv-est{fill:#fff}'
    + '.hq .hqv-p2{animation-delay:-.45s}'
    + '@keyframes hqv-paso{from{transform:rotate(24deg)}to{transform:rotate(-24deg)}}'
    + '.hq .hqv-bob{animation:hqv-bob .45s ease-in-out infinite alternate}@keyframes hqv-bob{to{transform:translateY(-.7px)}}'
    + '.hq .hqv-ca{animation:hqv-ca 22s linear infinite}'
    + '@keyframes hqv-ca{0%{transform:translateX(120px) scaleX(-1);opacity:0}4%{opacity:1}46%{transform:translateX(0) scaleX(-1)}47%{transform:translateX(0) scaleX(1)}91%{transform:translateX(120px) scaleX(1);opacity:1}95%,100%{transform:translateX(120px) scaleX(1);opacity:0}}'
    + '.hq .hqv-cb{animation:hqv-cb 26s linear infinite}'
    + '@keyframes hqv-cb{0%{transform:translateX(-115px);opacity:0}3%{opacity:1}82%{transform:translateX(155px);opacity:1}86%,100%{transform:translateX(155px);opacity:0}}'
    + '.hq .hqv-cc{animation:hqv-cc 24s linear infinite}'
    + '@keyframes hqv-cc{0%{transform:translateX(85px) scaleX(-1);opacity:0}3%{opacity:1}80%,100%{transform:translateX(-185px) scaleX(-1)}}'
    + '.hq .hqv-auto{opacity:0;animation:hqv-auto 19s linear infinite}'
    + '@keyframes hqv-auto{0%{transform:translateX(0);opacity:1}30%{transform:translateX(450px);opacity:1}30.1%,100%{transform:translateX(450px);opacity:0}}'
    + '.hq .hqv-moto{animation:hqv-moto 23s linear -15s infinite}'
    + '@keyframes hqv-moto{0%{transform:translateX(0);opacity:1}35%{transform:translateX(-460px);opacity:1}35.1%,100%{transform:translateX(-460px);opacity:0}}'
    + '.hq .hqv-tally{animation:hqv-tally 2.6s ease-in-out infinite}@keyframes hqv-tally{0%,45%{opacity:1}55%,100%{opacity:.2}}'
    + '.hq .hqv-halo{opacity:0;animation:hqv-halo 4s ease-in-out infinite}@keyframes hqv-halo{50%{opacity:.55}}'
    + '.hq .hqv-onda{opacity:0;animation:hqv-onda 9s ease-out infinite;transform-box:fill-box;transform-origin:center}'
    + '@keyframes hqv-onda{0%{transform:scale(.3);opacity:0}4%{opacity:.9}30%,100%{transform:scale(1.6);opacity:0}}'
    + '.hq .hqv-sil{opacity:0;animation:hqv-sil 15s ease-in-out infinite}@keyframes hqv-sil{0%{transform:translateX(0);opacity:.6}45%,100%{transform:translateX(80px);opacity:.6}}'
    + '.hq .hqv-humo{opacity:0;animation:hqv-humo 3.6s ease-out infinite}@keyframes hqv-humo{0%{transform:translateY(0);opacity:0}30%{opacity:.75}100%{transform:translateY(-5px);opacity:0}}'
    + '.hq .hqv-nube{animation:hqv-nube 18s ease-in-out infinite alternate}@keyframes hqv-nube{to{transform:translateX(26px)}}'
    + '.hq .hqv-aves{opacity:0;animation:hqv-aves 21s linear -6s infinite}'
    + '@keyframes hqv-aves{0%{transform:translateX(0);opacity:1}45%{transform:translateX(-440px);opacity:1}45.1%,100%{transform:translateX(-440px);opacity:0}}'
    + '.hq .hqv-ala{animation:hqv-ala .5s ease-in-out infinite alternate;transform-box:fill-box;transform-origin:center}@keyframes hqv-ala{to{transform:scaleY(.3)}}'
    + '.hq .hqv-est{animation:hqv-est 5s ease-in-out infinite}@keyframes hqv-est{50%{opacity:.15}}'
    + '.hq .hqv-fugaz{opacity:0;animation:hqv-fugaz 17s ease-out 4s infinite}@keyframes hqv-fugaz{0%{transform:translate(0,0);opacity:0}1%{opacity:.9}6%,100%{transform:translate(-70px,24px);opacity:0}}'
    + '.hq .hqv-poste{animation:hqv-poste 11s linear infinite}@keyframes hqv-poste{0%,86%,88%,91%,100%{opacity:1}87%{opacity:.35}90%{opacity:.55}}'
    + '@media (prefers-reduced-motion:reduce){.hq [class*="hqv-"]{animation:none!important}}';
  const VIDA_ID = 'art-hq-vida';
  // Los estilos van UNA vez en la página; sin documento (Node) van dentro del SVG
  function ensureVidaCss() {
    try {
      if (typeof document === 'undefined' || !document.head) return false;
      if (!document.getElementById(VIDA_ID)) document.head.insertAdjacentHTML('beforeend', `<style id="${VIDA_ID}">${VIDA_CSS}</style>`);
      return true;
    } catch (e) { return false; }
  }
  // Vitrina de la decoración en cada local (igual que FACHADA en js/decoracion.js) → dónde queda la taza de la cafetera
  const VITRINA = [[95, 96, 170, 44], [78, 96, 122, 44], [60, 100, 120, 40], [56, 92, 196, 48]];
  function vidaSede(st, stage, night, u) {
    let cafe = false;
    try { const D = root.Decoracion; cafe = !!(D && D.lista && st.decor && D.lista(st).some((x) => x.activo && x.it && x.it.k === 'cafetera')); } catch (e) { cafe = false; }
    const humo = (x, y, d) => `<path class="hqv-humo" style="animation-delay:${d}s" d="M${x} ${y}q-.9-1.3 0-2.6t0-2.6"/>`;
    /* Gente: 1 persona → el dueño; 2-3 → + alguien con un case; 4 o más → + alguien con un rollo de cable. Pies en y = 141 */
    const n = (st.staff || []).length;
    const cuantos = n <= 1 ? 1 : n <= 3 ? 2 : 3;
    const persona = (cls, x, delay, ropa, piel, gorra, mano) => `<g transform="translate(${x} 141)"><g class="${cls}" style="animation-delay:${delay}s">`
      + `<g stroke="${night ? '#3a4560' : '#2a3242'}"><path class="hqv-p" d="M-1-6.6v6"/><path class="hqv-p hqv-p2" d="M1-6.6v6"/></g>`
      + `<g class="hqv-bob"><rect x="-2.7" y="-13" width="5.4" height="7.2" rx="1.8" fill="${ropa}"/><circle cy="-15.4" r="2.3" fill="${piel}"/>`
      + `<path d="M-2.4-15.5a2.4 2.4 0 014.8 0z${gorra ? 'M1.8-16h2.3' : ''}" fill="${gorra || '#2a1a14'}" stroke="${gorra || 'none'}" stroke-width=".9"/>${mano}</g></g></g>`;
    const brazo = (x2, y2) => `<path class="hqv-br" d="M.3-11.6L${x2} ${y2}"/>`;
    const gente = [
      // el dueño sale por la puerta, camina un poco y vuelve a entrar (con su café si hay cafetera)
      persona('hqv-ca', [120, 120, 140, 195][stage], -3, '#d42a30', '#c98a5e', '#14171d',
        brazo(1.8, -7.6) + (cafe ? `<rect x="1.2" y="-8.8" width="1.9" height="2.3" rx=".3" fill="#e9edf5"/>${humo(2.1, -9.4, 0)}` : '')),
      // lleva un case hasta la puerta / la unidad móvil
      persona('hqv-cb', 100, -10, '#2f6fb3', '#8d5a3b', '', brazo(3.4, -8.2) + '<rect x="1" y="-8.4" width="6.6" height="4.8" rx=".6" fill="#2a2e37" stroke="#8b95a8" stroke-width=".5"/><path d="M2.8-8.4v-.8h3v.8" stroke="#8b95a8" stroke-width=".5" fill="none"/>'),
      // sale con un rollo de cable al hombro
      persona('hqv-cc', 165, -5, '#2f8f5b', '#e0b48c', '', brazo(1.6, -7.4) + '<circle cx="-1.4" cy="-10.6" r="2.8" fill="none" stroke="#f5a01b" stroke-width="1.1"/>'),
    ].slice(0, cuantos).join('');
    /* Tráfico: un taxi amarillo que pasa de vez en cuando y una moto de entregas en sentido contrario */
    const luz = (x, y, dir) => (night ? `<path d="M${x} ${y}l${dir * 26}-3.5v8z" fill="#ffd27a" opacity=".22"/>` : '');
    const taxi = `<g transform="translate(-40 0)"><g class="hqv-auto">${luz(14, 142.6, 1)}<path d="M-8 141l3.2-4.4h9.6l4 4.4z" fill="#f5c542"/><path d="M-5.6 140.6l2.4-3.3h3.6v3.3zM1.4 140.6v-3.3h2.8l2.8 3.3z" fill="${night ? '#ffe9a3' : '#bcd8ff'}" opacity="${night ? 0.55 : 0.85}"/>`
      + `<rect x="-14" y="140.6" width="28" height="6.4" rx="2" fill="#f5c542"/><path d="M-14 143.6h28" stroke="#c68a12" stroke-width=".6"/><rect x="-2" y="135" width="5" height="1.8" rx=".5" fill="${night ? '#fff3c4' : '#14171d'}"/>`
      + `<circle cx="13" cy="142.4" r="1" fill="#fffbe0"/><circle cx="-13.3" cy="142.4" r=".9" fill="#ff3b3b"/><circle cx="-8" cy="147.2" r="2.3" fill="#111"/><circle cx="8" cy="147.2" r="2.3" fill="#111"/><circle cx="-8" cy="147.2" r=".9" fill="#8b95a8"/><circle cx="8" cy="147.2" r=".9" fill="#8b95a8"/></g></g>`;
    const moto = `<g transform="translate(410 0)"><g class="hqv-auto hqv-moto">${luz(-5.6, 139.8, -1)}<circle cx="-6" cy="146.8" r="2.4" fill="none" stroke="#111" stroke-width="1.3"/><circle cx="6" cy="146.8" r="2.4" fill="none" stroke="#111" stroke-width="1.3"/>`
      + `<path d="M-6 146.8l3-4.6h6.5l2.5 4.6M-3 142.2l-1.6-2.8" stroke="#3a4150" stroke-width="1.3" fill="none" stroke-linecap="round"/><circle cx="-5.2" cy="139.6" r=".8" fill="#fffbe0"/>`
      + `<rect x="4" y="135" width="6" height="5.6" rx=".8" fill="#d42a30"/><path d="M0 141.6l1.6-6.2" stroke="#2a3242" stroke-width="2.2" stroke-linecap="round"/><path d="M1.4 136l-4 2.4" stroke="#2a3242" stroke-width="1.3" stroke-linecap="round"/><circle cx="1.6" cy="133.6" r="2.2" fill="#e9edf5"/><path d="M-.6 133.6h2" stroke="#14171d" stroke-width="1"/></g></g>`;
    /* Fachada: luz de EN VIVO (tally) y halo del letrero, antena con ondas (estudio y centro), sombra que pasa detrás
       de una ventana, vapor de la cafetera en la vitrina */
    const tally = (x, y) => `<rect x="${x - 2.6}" y="${y - 2.6}" width="5.2" height="5.2" rx="1" fill="#14171d"/><circle cx="${x}" cy="${y}" r="5" fill="#ff3b3b" fill-opacity=".2" class="hqv-tally"/><circle cx="${x}" cy="${y}" r="1.7" fill="#ff3b3b" class="hqv-tally"/>`;
    const halo = (x, y, w, h) => `<rect class="hqv-halo" x="${x - 2}" y="${y - 2}" width="${w + 4}" height="${h + 4}" rx="4" fill="none" stroke="#ff5a5a" stroke-width="1.6"/>`;
    const ondas = (x, y) => `<g class="hqv-ondas" transform="translate(${x} ${y})" stroke="${night ? '#7fd8ff' : '#e9f6ff'}">${[0, 0.8, 1.6].map((d) => `<path class="hqv-onda" style="animation-delay:${d}s" d="M-6-5a8 8 0 000 10M6-5a8 8 0 010 10"/>`).join('')}</g>`;
    const vent = [null, [122, 50, 26, 36], [229, 74, 62, 40], [266, 74, 48, 36]][stage];
    let fachada = [
      `${tally(191, 51.5)}`,
      `${tally(282, 52)}${halo(206, 44, 68, 16)}`,
      `${halo(218, 40, 84, 16)}<path d="M282 20V2M277 9l5-4.4 5 4.4" stroke="#8b95a8" stroke-width="1.6" fill="none"/><circle cx="282" cy="1" r="2" fill="#ff3b3b" class="blink"/>${ondas(282, 1)}`,
      `${halo(262, 34, 56, 16)}${ondas(290, -12)}`,
    ][stage];
    if (vent) {
      const [x, y, w, h] = vent;
      fachada += `<clipPath id="${u}v"><rect x="${x}" y="${y}" width="${w}" height="${h}"/></clipPath><g clip-path="url(#${u}v)"><g transform="translate(${x - 8} ${y + h})"><path class="hqv-sil" d="M-6 0v-5q0-4.6 6-4.6t6 4.6v5zM0-10.6a3.2 3.2 0 100-6.4 3.2 3.2 0 100 6.4z" fill="${night ? '#3a2a1a' : '#0d0f14'}"/></g></g>`;
    }
    if (cafe) {
      const [x, y, w, h] = VITRINA[stage];
      let k = h / 80; if (200 * k > w) k = w / 200;
      const cx = x + (w - 200 * k) / 2 + 21 * k, cy = y + h - 80 * k + 43.6 * k;
      fachada += `<g class="hqv-vapor">${humo((cx - 0.7).toFixed(1), cy.toFixed(1), 0)}${humo((cx + 0.8).toFixed(1), cy.toFixed(1), 1.8)}</g>`;
    }
    /* Cielo: de día pájaros que cruzan; de noche estrellas que titilan y una estrella fugaz de vez en cuando */
    const cielo = night
      ? [[172, -9, 4.2, 0], [226, -3, 6, -2], [262, -14, 5, -3.5], [205, 8, 7, -1], [160, 6, 5.5, -4], [305, -12, 4.6, -2.6]].map(([x, y, d, l]) => `<circle class="hqv-est" style="animation-duration:${d}s;animation-delay:${l}s" cx="${x}" cy="${y}" r="1"/>`).join('')
        + '<path class="hqv-fugaz" d="M240-16l12-4" stroke="#fff" stroke-width="1" stroke-linecap="round"/>'
      : `<g transform="translate(400 6)"><g class="hqv-aves" stroke="#2a3242" stroke-width=".8" fill="none" stroke-linecap="round"><path class="hqv-ala" d="M-3 0q1.5-1.8 3 0q1.5-1.8 3 0"/><path class="hqv-ala" style="animation-delay:-.25s" d="M6 4.5q1.2-1.4 2.4 0q1.2-1.4 2.4 0"/></g></g>`;
    const css = ensureVidaCss() ? '' : `<style>${VIDA_CSS}</style>`;
    return {
      cielo: `<g class="hq-vida hqv-cielo">${css}${cielo}</g>`,
      fachada: `<g class="hq-vida hqv-fachada">${fachada}</g>`,
      gente: `<g class="hq-vida hqv-gente">${gente}</g>`,
      trafico: `<g class="hq-vida hqv-trafico">${taxi}${moto}</g>`,
    };
  }
  function hq(s) {
    try {
      const st = s || {};
      const chapter = st.chapter || 0;
      // El local que se dibuja es el mismo que cobra la renta (Game.venue): garaje, oficina, estudio o centro
      let ven = null;
      try { const g = Gm(); ven = g && g.venue && st.staff ? g.venue(st) : null; } catch (e) { ven = null; }
      const stage = ven && typeof ven.nivel === 'number' && ven.nivel >= 0 ? Math.min(3, ven.nivel)
        : st.storyDone ? 3 : chapter >= 4 ? 3 : chapter >= 2 ? 2 : chapter >= 1 ? 1 : 0;
      const equip = Array.isArray(st.equip) ? st.equip : [];
      const has = (t) => equip.some((e) => e && e.type === t);
      const cams = equip.filter((e) => { if (!e) return false; const it = catalogItem(e.type); return it ? it.cat === 'cam' && !['dron4k', 'grua'].includes(e.type) : /^cam_/.test(e.type); });
      const night = ((st.day || 1) % 2) === 0;
      // Letrero con el nombre de la productora (s.productora); si no tiene nombre, el texto de siempre. Se ajusta al ancho.
      const nomProd = typeof st.productora === 'string' ? st.productora.trim().toUpperCase().slice(0, 24) : '';
      const letrero = (x, y, size, fill, def, maxW) => {
        const t = nomProd || def;
        const largo = t.length * size * 0.56 > maxW;
        return `<text x="${x}" y="${y}" font-size="${size}" font-family="${FONT_D}" font-weight="800" fill="${fill}" text-anchor="middle"${largo ? ` textLength="${maxW}" lengthAdjust="spacingAndGlyphs"` : ''}>${t.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]))}</text>`;
      };
      const u = uid('h');
      const inline = ensureShared() ? '' : sharedDefs();
      const win = night ? '#ffd27a' : '#bcd8ff';
      const winOp = night ? 0.85 : 0.4;
      const wall = lin(u + 'w', night ? [[0, '#2c3549'], [1, '#161b28']] : [[0, '#5a6680'], [1, '#2e3647']]);
      const W = `url(#${u}w)`;
      const glowWin = (x, y, w, h, op) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${win}" opacity="${(op || 1) * winOp}"/>${night ? `<rect x="${x - 3}" y="${y - 3}" width="${w + 6}" height="${h + 6}" fill="${win}" opacity=".08"/>` : `<path d="M${x} ${y}h${w * 0.4}l-${w * 0.25} ${h}H${x}z" fill="#fff" opacity=".18"/>`}`;
      let building, label, roofY, roofX;
      if (stage === 0) {
        label = 'Garaje'; roofY = 26; roofX = 180;
        building = `<rect x="70" y="40" width="220" height="100" fill="${W}"/><path d="M58 42l122-30 122 30z" fill="#3a3f4b"/><path d="M58 42l122-30 122 30" stroke="#5b6476" stroke-width="2" fill="none"/>
          <path d="M70 42h220v6H70z" fill="#000" opacity=".25"/>
          <rect x="95" y="62" width="170" height="78" fill="#1a1d24"/>${[0, 1, 2, 3, 4, 5].map((i) => `<path d="M95 ${70 + i * 12}h170" stroke="#2a2e37" stroke-width="2"/><path d="M95 ${71 + i * 12}h170" stroke="#fff" stroke-opacity=".05"/>`).join('')}
          ${night ? `<rect x="95" y="128" width="170" height="12" fill="#ffd27a" opacity=".35"/>${pool(180, 146, 90, 6, true)}` : ''}
          <path d="M180 62v8" stroke="#8b95a8"/><circle cx="180" cy="74" r="4" fill="#ffd27a" class="bulb"/>
          ${glowWin(76, 50, 14, 14)}${glowWin(270, 50, 14, 14)}
          <rect x="200" y="46" width="54" height="11" rx="2" fill="#0d0f14"/>${letrero(227, 54.5, 7, '#ff3b3b', 'PRODUCCIONES', 50)}`;
      } else if (stage === 1) {
        label = 'Oficina alquilada'; roofY = 24; roofX = 120;
        building = `<rect x="60" y="30" width="240" height="110" fill="${W}"/><rect x="56" y="24" width="248" height="10" fill="#3a4354"/><path d="M60 34h240v5H60z" fill="#000" opacity=".25"/>
          ${[0, 1, 2].map((i) => `<rect x="${80 + i * 40}" y="48" width="30" height="40" fill="#16202e" stroke="#4a5568"/>${glowWin(82 + i * 40, 50, 26, 36, i === 1 ? 1 : 0.7)}<path d="M${95 + i * 40} 48v40" stroke="#4a5568"/>`).join('')}
          <rect x="210" y="70" width="60" height="70" fill="#1a1d24"/>${glowWin(214, 74, 52, 40, 0.6)}
          <rect x="206" y="44" width="68" height="16" rx="3" fill="${U('red')}"/>${letrero(240, 55.5, 9, '#fff', 'PRODUCTORA', 64)}`;
      } else if (stage === 2) {
        label = 'Estudio propio'; roofY = 20; roofX = 110;
        building = `<rect x="40" y="26" width="280" height="114" fill="${W}"/><rect x="36" y="20" width="288" height="10" fill="#384358"/><path d="M40 30h280v5H40z" fill="#000" opacity=".25"/>
          <rect x="60" y="44" width="120" height="56" fill="#121a26" stroke="#4a5568"/>
          ${[0, 1, 2].map((i) => `<rect x="${68 + i * 38}" y="52" width="32" height="20" fill="#203048"/><rect x="${70 + i * 38}" y="54" width="28" height="16" fill="${['#2f6fb3', '#b33a3a', '#2f8f5b'][i]}" opacity="${night ? 0.9 : 0.6}"/>`).join('')}
          <path d="M70 84h100" stroke="#3b4659" stroke-width="6"/>${glowWin(60, 100, 120, 40, 0.4)}
          <rect x="218" y="40" width="84" height="16" rx="3" fill="${U('red')}"/><circle cx="230" cy="48" r="3" fill="#fff" class="blink"/>${letrero(268, 52, 9, '#fff', 'EN VIVO', 66)}
          <rect x="225" y="70" width="70" height="70" fill="#1a1d24"/>${glowWin(229, 74, 62, 40, 0.5)}`;
      } else {
        label = 'Centro de producción'; roofY = 12; roofX = 190;
        building = `<rect x="30" y="18" width="300" height="122" fill="${W}"/><rect x="26" y="12" width="308" height="10" fill="#36425a"/><path d="M30 22h300v5H30z" fill="#000" opacity=".25"/>
          ${[0, 1, 2, 3].map((i) => `<rect x="${48 + i * 52}" y="34" width="44" height="30" fill="#15202f" stroke="#41506a"/><rect x="${50 + i * 52}" y="36" width="40" height="26" fill="${['#2f6fb3', '#b33a3a', '#2f8f5b', '#b38a2f'][i]}" opacity="${night ? 0.85 : 0.5}"/>`).join('')}
          ${[0, 1, 2, 3, 4].map((i) => glowWin(48 + i * 42, 88, 34, 18, 0.55)).join('')}
          <rect x="48" y="74" width="200" height="8" rx="2" fill="#3b4659"/>
          <rect x="262" y="34" width="56" height="16" rx="3" fill="${U('red')}"/>${letrero(290, 46, 9, '#fff', 'EN VIVO', 52)}
          <rect x="262" y="70" width="56" height="70" fill="#1a1d24"/>${glowWin(266, 74, 48, 36, 0.5)}
          <path d="M100 12V-2" stroke="#8b95a8" stroke-width="2"/><g transform="rotate(-30 100 -6)"><ellipse cx="100" cy="-6" rx="17" ry="6.5" fill="${U('dish')}"/><path d="M100 -6v-9" stroke="#8b95a8" stroke-width="1.5"/><circle cx="100" cy="-15" r="1.8" fill="#8b95a8"/></g>
          <path d="M290 12V-10M280 -2l10 -8 10 8" stroke="#8b95a8" stroke-width="2" fill="none"/><circle cx="290" cy="-12" r="3" fill="#ff3b3b" class="blink"/>`;
      }
      if (ven && ven.name) { let n = String(ven.name); try { if (root.I18N && root.I18N.TL) n = root.I18N.TL(n); } catch (e) { /* español */ } label = n; }
      const sky = night ? U('night') : U('day');
      const skyDeco = night
        ? `<path d="${[[20, -5], [90, 2], [150, -10], [330, 0], [210, -14], [310, -15], [48, 8], [250, 4], [120, -16], [170, 6], [280, -6]].map(([x, y]) => `M${x} ${y}h1.2v1.2h-1.2z`).join('')}" fill="#e9edf5" opacity=".8"/>
          <circle cx="40" cy="-4" r="1.4" fill="#fff" class="twinkle"/><circle cx="336" cy="-2" r="9" fill="#f4f1d0"/><circle cx="340" cy="-5" r="8" fill="#0b1222"/><circle cx="336" cy="-2" r="20" fill="#f4f1d0" opacity=".06"/>`
        : `<circle cx="330" cy="2" r="12" fill="#ffe9a3"/><circle cx="330" cy="2" r="24" fill="#ffe9a3" opacity=".22"/>
          ${[[40, -6, 1, 0], [190, -12, 0.8, -7], [258, -2, 0.55, -13]].map(([x, y, k, d]) => `<g transform="translate(${x} ${y}) scale(${k})"><g class="hqv-nube" style="animation-delay:${d}s"><path d="M-18 4a8 8 0 018-10 12 12 0 0122-2 9 9 0 018 12z" fill="#fff" opacity=".9"/><path d="M-18 4h38" stroke="#c9dcec" stroke-width="2"/></g></g>`).join('')}`;
      const hills = night
        ? '<path d="M0 118L40 96 80 110 130 86 180 106 240 82 300 104 360 90V140H0z" fill="#121a2a"/><path d="M0 128L60 112 120 122 200 104 280 120 360 108V140H0z" fill="#0e1422"/>'
        : '<path d="M0 118L40 96 80 110 130 86 180 106 240 82 300 104 360 90V140H0z" fill="#6f8ca6" opacity=".55"/><path d="M0 128L60 112 120 122 200 104 280 120 360 108V140H0z" fill="#4f7a5a" opacity=".6"/>';
      const van = has('unidad_movil') ? vanSide(244, 106, 1, true) : (st.rep || 0) >= 30 ? vanSide(250, 110, 0.9, stage >= 3) : '';
      const roof = [];
      if (has('dron4k')) roof.push(`<rect x="${roofX - 14}" y="${roofY - 3}" width="28" height="3" rx="1" fill="#2ecc71" opacity=".6"/><text x="${roofX}" y="${roofY - 0.5}" font-size="3" font-family="${FONT_D}" fill="#0d0f14" text-anchor="middle">H</text>${droneSmall(roofX, roofY - 9, 0.9, false)}`);
      if (has('vip_satelital')) roof.push(`<g transform="translate(${roofX + 40} ${roofY}) scale(.5)"><path d="M0 0l-10 -18 M0 0l10 -18" stroke="#5b6476" stroke-width="3"/><g transform="rotate(-30 0 -24)"><ellipse cx="0" cy="-24" rx="20" ry="8" fill="${U('dishg')}"/></g></g>`);
      const side = [];
      if (has('generador')) side.push(`<g transform="translate(4 122)"><ellipse cx="13" cy="18" rx="16" ry="2.5" fill="#000" opacity=".4"/><rect width="26" height="17" rx="2" fill="${U('org')}"/><rect x="3" y="4" width="10" height="8" fill="#1d2129"/><path d="M20 0v-6h4" stroke="#3a4150" stroke-width="2" fill="none"/><circle cx="26" cy="-9" r="3" fill="#c5ccd6" opacity=".35" class="puff"/></g>`);
      if (has('grua')) side.push(`<g transform="translate(332 140)"><path d="M0 0l-6-26 6 0" stroke="#5b6476" stroke-width="2"/><path d="M-30 -10L22 -40" stroke="${U('cyal')}" stroke-width="3" stroke-linecap="round"/><rect x="16" y="-44" width="12" height="8" rx="1.5" fill="${U('al')}"/></g>`);
      const camRow = cams.slice(0, 6).map((e, i) => sceneCam(26 + i * 34, 121, e.type, 0.6)).join('');
      const cosm = cosmeticosSede(st, roofX, roofY);
      const lamp = `<path d="M346 140V100" stroke="#3a4150" stroke-width="2"/><path d="M346 100h-8" stroke="#3a4150" stroke-width="2"/>${night ? `<g class="hqv-poste"><circle cx="337" cy="102" r="2.5" fill="#ffd27a"/>${cone(337, 104, 2, 36, 16, U('poolW'))}</g>` : '<circle cx="337" cy="102" r="2.5" fill="#8b95a8"/>'}`;
      const vida = vidaSede(st, stage, night, u);
      return `<svg class="hq" viewBox="0 -20 360 170" role="img" aria-label="${esc(label)}">
      <defs>${inline}${wall}</defs>
      <rect x="0" y="-20" width="360" height="170" fill="${sky}"/>
      ${skyDeco}${vida.cielo}${hills}
      <ellipse cx="180" cy="141" rx="170" ry="5" fill="#000" opacity=".35"/>
      ${building}${root.Decoracion && root.Decoracion.capa ? root.Decoracion.capa(st, stage) : ''}${vida.fachada}${roof.join('')}
      <rect x="0" y="140" width="360" height="10" fill="${night ? '#1a1f2a' : '#5b6476'}"/><path d="M0 141h360" stroke="${night ? '#2a3242' : '#8f99aa'}" stroke-width="1.5"/><path d="M0 146h360" stroke="${night ? '#2a3242' : '#e9edf5'}" stroke-width="1" stroke-dasharray="10 8" opacity=".5"/>
      ${cosm.cielo}${lamp}${side.join('')}${vida.gente}${camRow}${van}${cosm.piso}${vida.trafico}
      <rect x="8" y="-14" width="${Math.min(344, Math.round(label.length * 6.2 + 16))}" height="18" rx="9" fill="#0d0f14cc" stroke="#2a3242"/>
      <text x="16" y="-1.5" font-size="10.5" font-family="${FONT_B}" font-weight="600" fill="#e9edf5">${esc(label)}</text>
    </svg>`;
    } catch (e) {
      return '<svg class="hq" viewBox="0 -20 360 170" role="img" aria-label="Tu sede"><rect x="0" y="-20" width="360" height="170" fill="#151b28"/><rect x="70" y="40" width="220" height="100" fill="#2b2f38"/></svg>';
    }
  }

  /* =========================================================
     Escena del evento en vivo
     Tipos: misa, boda, prensa, barrial, graduacion, lanzamiento, concierto, ligapro, final
     y los nuevos: boxeo, lucha (lucha libre), funeral, autos (lanzamiento de autos), irl.
     ========================================================= */
  const FOOTBALL = ['barrial', 'ligapro', 'final'];
  // Tipo de evento que trae una extensión (temporadas): dice qué escena base usa y qué dibujo va encima
  const extTipo = (type) => { try { const t = Gm().EVENT_TYPES; return t && t[type] && t[type].especial ? t[type] : null; } catch (e) { return null; } };
  /* Dibujos de temporada encima de la escena (livianos: unas formas y una animación CSS, sin filtros) */
  function overlayTemporada(kind, u) {
    const pts = (n, f) => Array.from({ length: n }, (_, i) => f(i)).join('');
    const rr = (i, m) => Math.floor(Math.abs(Math.sin(i * 12.9898 + m * 0.017) * 43758.5453) % 1 * m);
    if (kind === 'nieve') return `<g class="tmp-ov tmp-nieve">${pts(28, (i) => `<circle cx="${rr(i, 360)}" cy="${rr(i * 3, 150)}" r="${1 + (i % 3) * 0.6}" fill="#fff" opacity="${0.5 + (i % 4) * 0.12}" class="${i % 2 ? 'twinkle' : ''}"/>`)}
      <g transform="translate(304 118)"><rect x="-3" y="-4" width="6" height="8" fill="#6b4a2a"/><path d="M0-78L-20-46h9L-26-22h11L-32 0h64L15-22h11L11-46h9z" fill="#1f6b43"/>
        ${pts(14, (i) => `<circle cx="${(rr(i + 50, 40) - 20) * (0.3 + rr(i + 7, 70) / 100)}" cy="${-6 - rr(i + 7, 66)}" r="1.9" fill="${['#ff5a5a', '#ffd27a', '#5ad1ff', '#7dff9a'][i % 4]}" class="blink" style="animation-delay:${(i % 5) * 0.2}s"/>`)}
        <path d="M0-86l2.6 5.4h5.8l-4.6 3.4 1.8 5.6L0-75l-5.6 3.4 1.8-5.6-4.6-3.4h5.8z" fill="#ffd27a" class="twinkle"/></g>
      <path d="M0 162q30-6 60 0t60 0 60 0 60 0 60 0 60 0V170H0z" fill="#eef4ff" opacity=".85"/>
      ${pts(9, (i) => `<circle cx="${20 + i * 40}" cy="${10 + (i % 2) * 4}" r="2.2" fill="${['#ff5a5a', '#ffd27a', '#5ad1ff', '#7dff9a'][i % 4]}" class="blink"/>`)}<path d="M0 10q40 10 80 0t80 0 80 0 80 0 80 0" stroke="#2a3242" fill="none"/></g>`;
    if (kind === 'fuegos') return `<g class="tmp-ov tmp-fuegos">${[[70, 34, '#ffd27a'], [180, 22, '#ff5a8a'], [290, 38, '#5ad1ff'], [130, 52, '#7dff9a']].map(([x, y, c], j) => `<g class="twinkle" style="animation-delay:${j * 0.4}s">${pts(10, (i) => { const a = i * Math.PI / 5; return `<path d="M${x} ${y}l${(Math.cos(a) * 16).toFixed(1)} ${(Math.sin(a) * 16).toFixed(1)}" stroke="${c}" stroke-width="1.6" stroke-linecap="round"/>`; })}<circle cx="${x}" cy="${y}" r="2.5" fill="#fff"/></g>`).join('')}</g>`;
    if (kind === 'corazones') return `<g class="tmp-ov tmp-corazones">${pts(9, (i) => { const x = 20 + rr(i, 320), y = 14 + rr(i * 5, 70), k = 0.6 + (i % 3) * 0.25; return `<path transform="translate(${x} ${y}) scale(${k})" d="M0 4C-6-2-10 2-8 6l8 8 8-8c2-4-2-8-8-2z" fill="${i % 2 ? '#ff5a8a' : '#ff8fb1'}" opacity=".85" class="${i % 3 ? '' : 'twinkle'}"/>`; })}</g>`;
    if (kind === 'calabazas') return `<g class="tmp-ov tmp-calabazas">${[[24, 158], [60, 162], [318, 160]].map(([x, y]) => `<g transform="translate(${x} ${y})"><ellipse rx="11" ry="8" fill="#ff8a1f"/><path d="M-4 -8v-4" stroke="#3b7a2a" stroke-width="2.4"/><path d="M-6 -2l3-3 3 3zM2 -2l3-3 3 3z" fill="#ffd27a"/><path d="M-5 3q5 4 10 0" stroke="#ffd27a" stroke-width="1.6" fill="none"/></g>`).join('')}
      <path d="M150 20q6-8 12 0q6-8 12 0l-12 8z" fill="#0d0b12" opacity=".9"/><path d="M228 34q5-6 10 0q5-6 10 0l-10 6z" fill="#0d0b12" opacity=".8"/>
      <circle cx="330" cy="22" r="12" fill="#ffe9a3" opacity=".9"/></g>`;
    if (kind === 'estrellas') return `<g class="tmp-ov tmp-estrellas"><path transform="translate(180 20)" d="M0-12l3 8h9l-7 5 3 9-8-6-8 6 3-9-7-5h9z" fill="#ffd27a" class="twinkle"/>${pts(14, (i) => `<circle cx="${rr(i, 360)}" cy="${rr(i * 3, 60)}" r="1.2" fill="#ffe9a3" class="twinkle"/>`)}</g>`;
    if (kind === 'velas') return `<g class="tmp-ov tmp-velas">${pts(10, (i) => { const x = 18 + i * 36; return `<rect x="${x}" y="150" width="4" height="12" fill="#f4f1d0"/><ellipse cx="${x + 2}" cy="147" rx="2.2" ry="3.6" fill="#ffd27a" class="blink"/>`; })}</g>`;
    if (kind === 'confeti') return `<g class="tmp-ov tmp-confeti">${pts(36, (i) => `<rect x="${rr(i, 360)}" y="${rr(i * 3, 150)}" width="3" height="5" transform="rotate(${rr(i, 90)} ${rr(i, 360)} ${rr(i * 3, 150)})" fill="${['#ff5a5a', '#ffd27a', '#5ad1ff', '#7dff9a', '#ff8fb1'][i % 5]}" opacity=".9"/>`)}</g>`;
    return '';
  }
  function sceneKind(type) {
    const ex = extTipo(type);
    if (ex && ex.escena) return ex.escena;
    const t = norm(type);
    if (FOOTBALL.includes(t)) return t;
    if (['misa', 'boda', 'prensa', 'graduacion', 'lanzamiento', 'concierto'].includes(t)) return t;
    if (/box/.test(t)) return 'boxeo';
    if (/lucha|wrestl/.test(t)) return 'lucha';
    if (/funeral|velorio|sepelio|misa_difuntos/.test(t)) return 'funeral';
    if (/auto|carro|vehic|concesion/.test(t)) return 'autos';
    if (/irl|influ|calle|vlog|tiktok/.test(t)) return 'irl';
    if (/futbol|partido|liga|copa|torneo|campeonato/.test(t)) return 'ligapro';
    if (/concierto|festival|show|musica/.test(t)) return 'concierto';
    if (/iglesia|ceremonia|bautizo|primera_comunion/.test(t)) return 'misa';
    if (/matrimonio|boda|quince/.test(t)) return 'boda';
    return 'prensa';
  }
  const WARM = ['#2a2433', '#3a2c28', '#1f2a3a', '#33263a', '#2a3a33'];
  const DARK = ['#0d0b12', '#151320', '#1b1726'];

  function ring(u, ropes, matCol, post) {
    // Ring en perspectiva: lona, faldón, postes y cuerdas
    return `<path d="M60 112L104 82H256L300 112z" fill="${matCol}"/><path d="M60 112h240v14H60z" fill="${post === 'lucha' ? U('red') : '#1d3b5e'}"/>
      <path d="M60 112h240" stroke="#fff" stroke-opacity=".4"/>${pool(180, 98, 80, 12)}
      <text x="180" y="122.5" font-size="8" font-family="${FONT_D}" font-weight="800" fill="#fff" fill-opacity=".85" text-anchor="middle" letter-spacing="3">${post === 'lucha' ? 'LUCHA LIBRE' : 'NOCHE DE BOX'}</text>
      ${[[60, 112, 34], [300, 112, 34], [104, 82, 24], [256, 82, 24]].map(([x, y, h], i) => `<rect x="${x - 2.5}" y="${y - h}" width="5" height="${h}" rx="1.5" fill="${i % 2 ? '#d42a30' : '#2f6fb3'}"/>`).join('')}
      ${[0, 1, 2].map((k) => { const f = 1 - k * 0.3; const y1 = 112 - 30 * f, y2 = 82 - 22 * f; return `<path d="M60 ${y1}L104 ${y2}H256L300 ${y1}" stroke="${ropes[k]}" stroke-width="${1.8 - k * 0.3}" fill="none"/><path d="M60 ${y1}H300" stroke="${ropes[k]}" stroke-width="${2.2 - k * 0.3}"/>`; }).join('')}`;
  }

  function sceneBg(kind, u, info) {
    const seed = kind + ((info && info.client) || '');
    if (FOOTBALL.includes(kind)) {
      const big = kind !== 'barrial';
      const colors = kind === 'final' ? ['#d9b44a', '#a5363a', '#c5ccd6', '#3a5f99'] : ['#a5363a', '#3a5f99', '#b39a3a', '#4a5263', '#c5ccd6'];
      let stands;
      if (big) {
        stands = `<path d="M0 92V36l60-14h240l60 14v56z" fill="#141a26"/><path d="M0 36l60-14h240l60 14" stroke="#3a4354" stroke-width="2" fill="none"/>
          ${crowd(seed + 'a', 44, 30, 0, 360, 0.52, colors.map((c) => shade(c, -0.45)), { anim: false })}
          ${crowd(seed + 'b', 58, 28, 0, 360, 0.6, colors.map((c) => shade(c, -0.3)), { delay: 0.3, arms: 0.15 })}
          ${crowd(seed + 'c', 74, 26, 0, 360, 0.7, colors.map((c) => shade(c, -0.15)), { arms: 0.25 })}
          <rect x="0" y="82" width="360" height="10" fill="#0b0f18"/>${[0, 1, 2, 3, 4, 5].map((i) => `<rect x="${i * 60 + 2}" y="83" width="56" height="8" rx="1" fill="${['#d42a30', '#1d3b5e', '#d98a10', '#1d3b5e', '#1d8a4c', '#1d3b5e'][i]}"/><text x="${i * 60 + 30}" y="89.5" font-size="6" font-family="${FONT_D}" font-weight="800" fill="#fff" text-anchor="middle">${['EN VIVO', 'GOLAZO', 'TU MARCA', 'EN VIVO', 'GOLAZO', 'TU MARCA'][i]}</text>`).join('')}`;
        if (kind === 'final') stands += `<g class="twinkle">${[[70, 12], [290, 8], [180, 4]].map(([x, y], i) => `<path d="${Array.from({ length: 8 }, (_, k) => `M${x} ${y}L${(x + Math.cos(k * 0.785) * 9).toFixed(1)} ${(y + Math.sin(k * 0.785) * 9).toFixed(1)}`).join('')}" stroke="${['#ffd34d', '#ff3b3b', '#4da3ff'][i]}" stroke-width="1.5"/>`).join('')}</g>`;
      } else {
        stands = `<path d="M0 66L50 40 90 56 150 28 210 52 270 32 330 54 360 44V92H0z" fill="#121a30"/>
          <path d="M0 78L60 58 120 70 200 50 280 68 360 56V92H0z" fill="#18233a"/>
          ${[[40, 68], [70, 64], [230, 60], [262, 64], [300, 66]].map(([x, y]) => `<rect x="${x}" y="${y}" width="10" height="8" fill="#232c40"/><rect x="${x + 3}" y="${y + 2}" width="3" height="3" fill="#ffd27a" opacity=".85"/>`).join('')}
          <path d="M106 92V72h148v20z" fill="#232c40"/><path d="M106 78h148M106 85h148" stroke="#3a4354"/>
          ${crowd(seed, 84, 13, 110, 250, 0.55, colors.map((c) => shade(c, -0.25)), { arms: 0.2 })}
          <path d="M0 92h360" stroke="#8b95a8" stroke-width="1"/><path d="${Array.from({ length: 19 }, (_, i) => `M${i * 20} 84v8`).join('')}M0 85h360" stroke="#5b6476" stroke-dasharray="2 2"/>`;
      }
      const stripes = Array.from({ length: 6 }, (_, i) => `M${-40 + i * 80} 170L${20 + i * 53.3} 92h26.7L${0 + i * 80} 170z`).join('');
      const pitch = `<path d="M-40 170L20 92h320l60 78z" fill="${U('turf')}"/><path d="${stripes}" fill="#fff" opacity=".045"/>
        ${kind === 'barrial' ? '<ellipse cx="110" cy="140" rx="34" ry="6" fill="#7a6a3a" opacity=".35"/><ellipse cx="262" cy="118" rx="22" ry="4" fill="#7a6a3a" opacity=".3"/>' : ''}
        <g stroke="#e9edf5" stroke-opacity=".55" stroke-width="1.3" fill="none"><path d="M20 92h320M180 92v78"/><ellipse cx="180" cy="124" rx="40" ry="10"/><path d="M-6 118h52l-16 42M366 118h-52l16 42"/></g>
        <ellipse cx="180" cy="128" rx="170" ry="26" fill="${U('pool')}" opacity=".5"/>`;
      const towers = (big ? [24, 336] : [24, 336]).map((x) => `<path d="M${x} 90V12" stroke="#3a4150" stroke-width="3"/><rect x="${x - 15}" y="3" width="30" height="12" rx="2" fill="#232833"/><path d="${Array.from({ length: 5 }, (_, i) => `M${x - 13 + i * 5.4} 5h4v3.5h-4zM${x - 13 + i * 5.4} 10h4v3.5h-4z`).join('')}" fill="#fffbe0"/>${cone(x + (x < 180 ? 8 : -8), 15, 15, 155, 70)}<circle cx="${x}" cy="9" r="20" fill="#fffbe0" opacity=".08"/>`).join('');
      const pr = rng(seed + 'p');
      const players = Array.from({ length: 8 }, (_, i) => { const x = 70 + pr() * 230, y = 104 + pr() * 46, k = 0.7 + (y - 100) / 70, t = i % 2; return `<g transform="translate(${x.toFixed(0)} ${y.toFixed(0)}) scale(${k.toFixed(2)})"><ellipse cx="0" cy="5.5" rx="5" ry="1.4" fill="#000" opacity=".35"/><circle cx="0" cy="-9" r="2.6" fill="#c98a5e"/><path d="M-3.4-6.4h6.8l.6 6.4h-8z" fill="${t ? '#e9edf5' : '#d42a30'}"/><path d="M-2 0l-1.2 5M2 0l1.2 5" stroke="#14151a" stroke-width="1.6"/></g>`; }).join('');
      return `<rect width="360" height="170" fill="${U('night')}"/>${stands}${pitch}${towers}${players}<circle cx="176" cy="128" r="2.4" fill="#fff"/><ellipse cx="176" cy="131" rx="3" ry=".8" fill="#000" opacity=".4"/>`;
    }
    if (kind === 'concierto') {
      const beams = [70, 140, 220, 290].map((x, i) => `<path d="M${x} 18l-38 104h76z" fill="${U('b' + i)}" class="beam" style="animation-delay:${i * 0.4}s"/>`).join('');
      return `<rect width="360" height="170" fill="#07050d"/><rect width="360" height="100" fill="${U('dusk')}" opacity=".25"/>
        <rect x="64" y="18" width="232" height="56" rx="2" fill="${U('led')}" opacity=".55" class="pulse"/><path d="M64 32h232M64 46h232M64 60h232M122 18v56M180 18v56M238 18v56" stroke="#05040a" stroke-opacity=".55"/>
        <rect x="40" y="6" width="280" height="7" fill="#2a2f3a"/><path d="M40 13l7-7${' 7 7 7-7'.repeat(19)}" stroke="#4d5668" fill="none"/>
        ${[70, 140, 220, 290].map((x, i) => fixture(x, 15, ['#ff3b3b', '#4da3ff', '#ffb020', '#b04dff'][i])).join('')}
        <rect x="16" y="38" width="32" height="58" rx="2" fill="${U('pl')}"/><rect x="312" y="38" width="32" height="58" rx="2" fill="${U('pl')}"/>
        <path d="${[0, 1, 2].map((k) => `M26 ${52 + k * 16}a6 6 0 1 0 12 0a6 6 0 1 0 -12 0M322 ${52 + k * 16}a6 6 0 1 0 12 0a6 6 0 1 0 -12 0`).join('')}" fill="#0b0d11" stroke="#3a4150"/>
        <path d="M50 90h260l14 10H36z" fill="#1d1830"/><path d="M36 100h288" stroke="#b04dff" stroke-opacity=".6" stroke-width="1.5"/>
        <g fill="#05040a"><path d="M176 60a6 6 0 1 1 12 0a6 6 0 1 1-12 0zM174 68h16l2 22h-20zM186 70l10-6 1 2-10 6z"/>
          <path d="M120 64a5.5 5.5 0 1 1 11 0a5.5 5.5 0 1 1-11 0zM118 72h15l2 18h-19z"/><path d="M232 64a5.5 5.5 0 1 1 11 0a5.5 5.5 0 1 1-11 0zM230 72h15l2 18h-19z"/></g>
        <path d="M114 82l26-7M226 76l26 7" stroke="#3a2d4a" stroke-width="4" stroke-linecap="round"/><path d="M182 68v24" stroke="#5b6476" stroke-width="1.5"/>
        <ellipse cx="182" cy="82" rx="14" ry="5" fill="#120f1c" stroke="#2a2040"/>
        ${pool(182, 92, 70, 9)}${beams}<ellipse cx="180" cy="100" rx="170" ry="26" fill="${U('haze')}"/>
        <rect x="0" y="100" width="360" height="70" fill="#07060c"/>
        ${crowd(seed + 'a', 128, 18, 0, 360, 1.0, ['#0d0b14', '#120f1c', '#0a0810'], { arms: 0.45, phones: 0.25, delay: 0.2 })}
        ${crowd(seed + 'b', 152, 14, -10, 370, 1.35, ['#050408', '#08060c'], { arms: 0.35 })}`;
    }
    if (kind === 'boxeo' || kind === 'lucha') {
      const lucha = kind === 'lucha';
      return `<rect width="360" height="170" fill="#05060a"/>
        <rect x="0" y="0" width="360" height="70" fill="${lucha ? U('dusk') : U('night')}" opacity="${lucha ? 0.35 : 0.6}"/>
        <rect x="70" y="2" width="220" height="10" rx="2" fill="${U('pl')}"/>${[0, 1, 2, 3, 4, 5].map((i) => fixture(88 + i * 37, 12)).join('')}
        ${cone(180, 14, 100, 100, 130, U('cone'))}
        ${crowd(seed + 'a', 64, 30, 0, 360, 0.55, ['#1a1726', '#14121e', '#201b2e'], { anim: false })}
        ${crowd(seed + 'b', 80, 26, 0, 360, 0.66, ['#221d30', '#1a1726', '#2a2433'], { arms: lucha ? 0.35 : 0.15, delay: 0.25 })}
        ${lucha ? '<rect x="130" y="20" width="100" height="22" rx="3" fill="#1d3b5e" stroke="#ffb020"/><text x="180" y="35.5" font-size="11" font-family="Barlow Condensed,Arial Narrow,sans-serif" font-weight="800" fill="#ffb020" text-anchor="middle" letter-spacing="1">¡TRIPLE AAA!</text>' : ''}
        ${ring(u, lucha ? ['#ffb020', '#e9edf5', '#ff3b3b'] : ['#e9edf5', '#d42a30', '#e9edf5'], U('mat'), kind)}
        <g fill="#0b0c10">${lucha
          ? '<path d="M150 78a6 6 0 1 1 12 0a6 6 0 1 1-12 0zM146 86h20l-2 18h-16zM196 74a6 6 0 1 1 12 0a6 6 0 1 1-12 0zM194 82h18l-2 20h-14zM166 88l28-4"/><path d="M152 76h8v-3h-8z" fill="#ffb020"/><path d="M198 72h8v-3h-8z" fill="#2ecc71"/>'
          : '<path d="M156 76a6 6 0 1 1 12 0a6 6 0 1 1-12 0zM154 84h16l-1 20h-14zM192 76a6 6 0 1 1 12 0a6 6 0 1 1-12 0zM190 84h16l-1 20h-14z"/><circle cx="172" cy="86" r="3.6" fill="#d42a30"/><circle cx="188" cy="88" r="3.6" fill="#2f6fb3"/>'}</g>
        <rect x="0" y="126" width="360" height="44" fill="#05060a"/>
        ${crowd(seed + 'c', 150, 15, -10, 370, 1.3, ['#07080c', '#0b0c12'], { arms: lucha ? 0.4 : 0.2 })}`;
    }
    if (kind === 'funeral') {
      return `<rect width="360" height="170" fill="${U('wallW')}"/>
        <path d="M130 92V26a50 50 0 0 1 100 0v66z" fill="#2a201c"/><path d="M146 92V30a34 34 0 0 1 68 0v62z" fill="#efe6d4" opacity=".14"/>
        <path d="M180 30v40M168 44h24" stroke="#d9b44a" stroke-width="3" stroke-linecap="round"/>
        ${cone(180, 0, 18, 100, 60, U('poolW'))}
        <rect x="110" y="84" width="140" height="14" rx="3" fill="${U('wood')}"/><path d="M110 86h140" stroke="#fff" stroke-opacity=".2"/><rect x="170" y="84" width="20" height="14" fill="#d9b44a" opacity=".5"/>
        ${[[86, 82], [274, 82], [124, 78], [236, 78]].map(([x, y], i) => `<path d="M${x - 2} ${y + 14}l-6 14M${x + 2} ${y + 14}l6 14" stroke="#3a2818" stroke-width="1.6"/><path d="M${x - 16} ${y}a16 12 0 0 1 32 0q0 14-16 14t-16-14z" fill="${['#f4f1ea', '#e9e2d0', '#f2b6c6', '#f4f1ea'][i]}"/><path d="M${x - 10} ${y - 4}a5 5 0 1 0 10 0a5 5 0 1 0 -10 0M${x} ${y + 2}a5 5 0 1 0 10 0a5 5 0 1 0 -10 0M${x - 14} ${y + 4}a4 4 0 1 0 8 0a4 4 0 1 0 -8 0" fill="${['#fff', '#f7d9a8', '#fff', '#f2b6c6'][i]}"/><path d="M${x - 14} ${y + 6}q14 10 28 0" stroke="#3f6b4a" stroke-width="2" fill="none"/>`).join('')}
        ${[[60, 60], [300, 60]].map(([x, y]) => `<rect x="${x - 2}" y="${y}" width="4" height="30" fill="#e9e2d0"/><ellipse cx="${x}" cy="${y - 3}" rx="2.2" ry="4" fill="#ffd27a" class="flicker"/><circle cx="${x}" cy="${y - 3}" r="12" fill="${U('flame')}" opacity=".5"/>`).join('')}
        <path d="M0 98h360v72H0z" fill="${U('floor')}"/>
        ${pool(180, 104, 120, 10, true)}
        ${crowd(seed + 'a', 130, 12, 0, 360, 0.95, ['#14151a', '#1d1f26', '#22242c'], { heads: true, anim: false })}
        ${crowd(seed + 'b', 154, 10, -10, 370, 1.25, ['#0b0c10', '#121318'], { heads: true, anim: false })}`;
    }
    if (kind === 'autos') {
      return `<rect width="360" height="170" fill="#05070c"/><rect width="360" height="96" fill="${U('night')}" opacity=".6"/>
        <rect x="70" y="10" width="220" height="44" rx="3" fill="#0f1828" stroke="#4da3ff" stroke-opacity=".7"/><text x="180" y="38" font-size="18" font-family="${FONT_D}" font-weight="800" fill="#e9edf5" text-anchor="middle" letter-spacing="4">NUEVO MODELO</text>
        ${[60, 120, 240, 300].map((x, i) => `${fixture(x, 6)}${cone(x, 10, 5, 110, 26, i % 2 ? U('coneB') : U('cone'), 'beam')}`).join('')}
        <ellipse cx="180" cy="112" rx="110" ry="18" fill="#141924"/><ellipse cx="180" cy="108" rx="104" ry="15" fill="#1d2433"/><ellipse cx="180" cy="108" rx="104" ry="15" fill="none" stroke="#4da3ff" stroke-opacity=".6"/>
        ${pool(180, 104, 100, 14)}
        <path d="M100 102q4-30 40-36q40-6 64-4q32 4 48 22q8 10 8 18z" fill="${U('cover')}"/>
        <path d="M120 80q30-14 70-14q26 2 40 10" stroke="#fff" stroke-opacity=".35" stroke-width="2" fill="none"/><path d="M140 70q20 20 10 32M210 66q-6 20 4 36" stroke="#000" stroke-opacity=".25" stroke-width="2" fill="none"/>
        <path d="M100 102h160" stroke="#000" stroke-opacity=".5" stroke-width="2"/><path d="M196 62l18-20" stroke="#d42a30" stroke-width="1.6"/><path d="M212 42h8v8z" fill="#d42a30"/>
        <rect x="0" y="118" width="360" height="52" fill="#06070b"/>
        ${crowd(seed + 'a', 140, 14, 0, 360, 1.0, ['#11141c', '#161a24', '#0d1016'], { phones: 0.45, delay: 0.2 })}
        ${crowd(seed + 'b', 160, 10, -10, 370, 1.3, ['#07080c', '#0b0d12'], { phones: 0.3 })}`;
    }
    if (kind === 'irl') {
      const r = rng(seed);
      const bld = Array.from({ length: 9 }, (_, i) => { const w = 34 + r() * 20, h = 40 + r() * 46, x = i * 42 - 10; return `<rect x="${x.toFixed(0)}" y="${(96 - h).toFixed(0)}" width="${w.toFixed(0)}" height="${h.toFixed(0)}" fill="${['#2a3346', '#232b3c', '#2f2a3a'][i % 3]}"/><path d="${Array.from({ length: Math.floor(h / 12) }, (_, k) => `M${(x + 5).toFixed(0)} ${(100 - h + k * 12).toFixed(0)}h6v5h-6zM${(x + w - 12).toFixed(0)} ${(100 - h + k * 12).toFixed(0)}h6v5h-6z`).join('')}" fill="#ffd27a" opacity="${(0.35 + r() * 0.5).toFixed(2)}"/>`; }).join('');
      return `<rect width="360" height="170" fill="${U('dusk')}"/>${bld}
        ${[40, 200, 330].map((x) => `<path d="M${x} 120V54h10" stroke="#14171d" stroke-width="2.4" fill="none"/><circle cx="${x + 10}" cy="56" r="2.6" fill="#ffd27a"/>${cone(x + 10, 58, 2, 62, 18, U('poolW'))}`).join('')}
        <path d="M0 96h360v12H0z" fill="#3a3f4a"/><path d="M0 108h360v62H0z" fill="${U('road')}"/><path d="M0 138h360" stroke="#e9edf5" stroke-width="2" stroke-dasharray="18 14" opacity=".55"/>
        <rect x="250" y="70" width="44" height="26" rx="2" fill="#d42a30"/><text x="272" y="87" font-size="9" font-family="${FONT_D}" font-weight="800" fill="#fff" text-anchor="middle">TIENDA</text><path d="M246 70h52l-4-8h-44z" fill="#ffb020"/>
        ${crowd(seed + 'a', 102, 10, 0, 360, 0.55, ['#1d2232', '#2a2433', '#232b3c'], { phones: 0.3, delay: 0.3 })}
        <g transform="translate(172 132)"><ellipse cx="0" cy="34" rx="18" ry="3.5" fill="#000" opacity=".4"/>
          <path d="M-12 34c0-18 4-30 12-30s12 12 12 30z" fill="#b04dff"/><path d="M-8 6q8-6 16 0" stroke="#fff" stroke-opacity=".3" stroke-width="2" fill="none"/>
          <circle cx="0" cy="-6" r="8" fill="#c98a5e"/><path d="M-8-8q2-10 8-10t9 9q-6-3-9-3t-8 4z" fill="#1f1610"/>
          <path d="M8 6l14-18" stroke="#c98a5e" stroke-width="4" stroke-linecap="round"/><path d="M20-12v-20" stroke="#14171d" stroke-width="2.6"/><path d="M14-34h12" stroke="#14171d" stroke-width="2.6"/>
          <rect x="15" y="-46" width="10" height="16" rx="2" fill="#14171d"/><rect x="16.5" y="-44" width="7" height="12" fill="#4da3ff" opacity=".8"/><circle cx="20" cy="-48" r="1.6" fill="#ff3b3b" class="blink"/></g>
        ${crowd(seed + 'b', 158, 9, -10, 370, 1.25, ['#0b0c10', '#11141a'], { phones: 0.2, anim: false })}`;
    }
    // Interiores clásicos
    let wall = '#222838', floor = U('floor'), deco = '', front = '', extra = '';
    const crowd2 = (y1, k1, y2, k2, cols, opts) => crowd(seed + 'a', y1, 12, 0, 360, k1, cols, Object.assign({ heads: true }, opts || {})) + crowd(seed + 'b', y2, 9, -10, 370, k2, cols.map((c) => shade(c, -0.4)), Object.assign({ heads: true, delay: 0.3 }, opts || {}));
    if (kind === 'misa') {
      wall = '#241f2e';
      deco = `${[40, 110, 250, 320].map((x, i) => `<path d="M${x - 14} 82V34a14 14 0 0 1 28 0v48z" fill="${['#4da3ff', '#b04dff', '#ffb020', '#2ecc71'][i]}" opacity=".45"/><path d="M${x - 14} 82V34a14 14 0 0 1 28 0v48z" fill="none" stroke="#14111a" stroke-width="2"/><path d="M${x} 20v62M${x - 14} 52h28" stroke="#14111a" stroke-width="2"/>${cone(x, 70, 14, 40, 26, U('poolW'))}`).join('')}
        <path d="M150 90V30a30 30 0 0 1 60 0v60z" fill="#1a1622" stroke="#3a3346" stroke-width="2"/>${cone(180, 0, 14, 92, 40, U('poolW'))}
        <path d="M180 34v34M170 46h20" stroke="#d9b44a" stroke-width="3.5" stroke-linecap="round"/>
        <rect x="150" y="76" width="60" height="14" fill="#e9e2d0"/><rect x="150" y="76" width="60" height="4" fill="#d9b44a"/>
        ${[156, 204].map((x) => `<rect x="${x - 1.5}" y="64" width="3" height="12" fill="#f4f1d0"/><ellipse cx="${x}" cy="62" rx="2" ry="3.4" fill="#ffd27a" class="flicker"/><circle cx="${x}" cy="62" r="9" fill="${U('flame')}" opacity=".5"/>`).join('')}`;
      front = `<path d="${[112, 128, 144].map((y) => `M10 ${y + 10}h150v5H10zM200 ${y + 10}h150v5H200z`).join('')}" fill="${U('wood')}"/>${crowd2(128, 0.9, 154, 1.2, ['#2a2d35', '#3a3346', '#2f3a4a'])}`;
    } else if (kind === 'boda') {
      wall = '#2a2028';
      deco = `<path d="M0 14q90 30 180 0t180 0" stroke="#5b6476" fill="none"/>${Array.from({ length: 15 }, (_, i) => { const x = 12 + i * 24; const y = 14 + Math.sin((x / 360) * Math.PI * 2) * -10 + 8; return `<circle cx="${x}" cy="${y.toFixed(1)}" r="2.6" fill="#ffd27a" class="${i % 3 ? 'bulb' : ''}"/><circle cx="${x}" cy="${y.toFixed(1)}" r="7" fill="${U('flame')}" opacity=".4"/>`; }).join('')}
        <path d="M138 92V60a42 42 0 0 1 84 0v32" stroke="#e8d7c0" stroke-width="4" fill="none"/>
        <path d="${Array.from({ length: 13 }, (_, i) => { const a = Math.PI * (1 + i / 12); const x = 180 + Math.cos(a) * 42, y = 60 + Math.sin(a) * 42, rr = 4 + (i % 2); return `M${(x - rr).toFixed(1)} ${y.toFixed(1)}a${rr} ${rr} 0 1 0 ${2 * rr} 0a${rr} ${rr} 0 1 0 -${2 * rr} 0`; }).join('')}" fill="#f2b6c6"/>
        ${pool(180, 92, 60, 10, true)}
        <path d="M166 64a5 5 0 1 1 10 0a5 5 0 1 1-10 0zM160 92l11-24 11 24z" fill="#f4f1ea"/><path d="M186 63a5 5 0 1 1 10 0a5 5 0 1 1-10 0zM184 70h14v22h-14z" fill="#1d2129"/><path d="M191 70l-2 6h4z" fill="#f4f1ea"/>`;
      front = `${[60, 180, 300].map((x) => `<ellipse cx="${x}" cy="150" rx="40" ry="8" fill="#e9e2d0"/><path d="M${x - 2} 132h4v12h-4z" fill="#3f6b4a"/><circle cx="${x}" cy="130" r="5" fill="#f2b6c6"/><circle cx="${x}" cy="128" r="10" fill="${U('flame')}" opacity=".35"/>`).join('')}${crowd(seed, 126, 11, 20, 340, 0.9, ['#2f4f7a', '#7a2f3f', '#3f6b4a', '#5a4a7a'], { heads: true })}`;
    } else if (kind === 'lanzamiento') {
      wall = '#0b1220';
      deco = `<rect x="96" y="12" width="168" height="64" rx="4" fill="#132238" stroke="#4da3ff" class="pulse"/><rect x="96" y="12" width="168" height="64" rx="4" fill="${U('lcd')}" opacity=".4"/>
        <text x="180" y="46" font-size="22" font-family="${FONT_D}" font-weight="800" fill="#e9edf5" text-anchor="middle" letter-spacing="2">NUEVO</text>
        <text x="180" y="62" font-size="8" font-family="${FONT_D}" font-weight="600" fill="#9ec5ff" text-anchor="middle" letter-spacing="3">LANZAMIENTO OFICIAL</text>
        ${cone(180, 0, 8, 94, 34)}${pool(180, 92, 40, 6)}
        <rect x="164" y="80" width="32" height="14" rx="2" fill="${U('wht')}"/><rect x="170" y="64" width="20" height="16" rx="3" fill="${U('red')}"/><rect x="172" y="66" width="16" height="3" fill="#fff" opacity=".5"/>
        ${[[60, 30, '#ff3b3b'], [76, 42, '#4da3ff'], [290, 28, '#ffb020'], [306, 44, '#ff3b3b']].map(([x, y, c]) => `<ellipse cx="${x}" cy="${y}" rx="7" ry="9" fill="${c}" class="crowd"/><ellipse cx="${x - 2}" cy="${y - 3}" rx="2" ry="3" fill="#fff" opacity=".4"/><path d="M${x} ${y + 9}q-3 20 0 40" stroke="#8b95a8" fill="none"/>`).join('')}`;
      floor = U('floorC');
      front = crowd2(128, 0.9, 154, 1.2, ['#1d2232', '#2a2d35', '#23283a'], { phones: 0.4 });
    } else if (kind === 'graduacion') {
      wall = '#1a1f33';
      deco = `<path d="M0 0h70q-10 50 0 96H0z" fill="${U('red')}"/><path d="M360 0h-70q10 50 0 96h70z" fill="${U('red')}"/><path d="M20 0q-6 50 0 96M44 0q-6 50 0 96M340 0q6 50 0 96M316 0q6 50 0 96" stroke="#000" stroke-opacity=".25" stroke-width="3"/>
        <rect x="90" y="16" width="180" height="22" rx="2" fill="#1f2c4a" stroke="#d9b44a"/><text x="180" y="31.5" font-size="11" font-family="${FONT_D}" font-weight="800" fill="#d9b44a" text-anchor="middle" letter-spacing="1">PROMOCIÓN 2026</text>
        ${cone(180, 0, 10, 94, 40)}${pool(180, 92, 50, 7)}
        <path d="M160 92V62h40v30z" fill="${U('wood')}"/><rect x="156" y="58" width="48" height="6" fill="#7a6248"/><path d="M180 58v-6" stroke="#2a2f3a" stroke-width="2"/><circle cx="180" cy="50" r="2.5" fill="#2a2f3a"/>`;
      floor = U('floorC');
      const r = rng(seed + 'g');
      front = crowd(seed, 128, 12, 0, 360, 0.9, ['#14151a', '#1d1f26'], { heads: true }) + `<path d="${Array.from({ length: 12 }, (_, i) => { const x = 15 + i * 30 + (r() - 0.5) * 6; return `M${(x - 9).toFixed(1)} 113l9-4 9 4-9 4z`; }).join('')}" fill="#0b0c10"/>` + crowd(seed + 'b', 154, 9, -10, 370, 1.2, ['#0b0c10', '#14151a'], { heads: true, delay: 0.3 });
    } else {
      wall = '#1c2232';
      deco = `<rect x="70" y="8" width="220" height="80" fill="#e9edf5" opacity=".07"/>
        <path d="${Array.from({ length: 4 }, (_, rr) => Array.from({ length: 6 }, (_, c) => `M${80 + c * 36 + (rr % 2) * 18} ${14 + rr * 18}h22v8h-22z`).join('')).join('')}" fill="#4da3ff" opacity=".22"/>
        ${cone(180, 0, 20, 86, 70)}
        <rect x="110" y="72" width="140" height="20" fill="#1d3b5e"/><rect x="110" y="72" width="140" height="3" fill="#4da3ff"/>
        ${[140, 180, 220].map((x, i) => `<circle cx="${x}" cy="60" r="6" fill="${['#c98a5e', '#e2b48f', '#b97f55'][i]}"/><path d="M${x - 9} 74a9 9 0 0 1 18 0z" fill="#2a2d35"/><path d="M${x + 4} 72l4-8" stroke="#1d2129" stroke-width="1.5"/><circle cx="${x + 8}" cy="63" r="1.8" fill="#1d2129"/>`).join('')}`;
      front = crowd2(128, 0.9, 154, 1.2, ['#2a2d35', '#23283a', '#33263a'], { phones: 0.35 });
    }
    return `<rect width="360" height="170" fill="${wall}"/>${deco}
      <path d="M0 92h360v78H0z" fill="${floor}"/><path d="M0 92h360" stroke="#fff" stroke-opacity=".08" stroke-width="2"/>${extra}${front}`;
  }

  // Marcador para el fútbol (iniciales de los equipos y reloj que corre solo con CSS)
  const STOP = /^(liga|barrial|parroquial|club|deportivo|atl[eé]tico|del|de|la|el|los|las|fc|sporting|federaci[oó]n|nacional|f[uú]tbol|torneo|campeonato)$/i;
  function teamCode(name) {
    const words = String(name || '').split(/\s+/).filter(Boolean);
    const main = words.find((w) => !STOP.test(w));
    if (main) return main.normalize('NFD').replace(/[̀-ͯ]/g, '').slice(0, 3).toUpperCase();
    const ini = words.map((w) => w[0]).join('').toUpperCase();
    return (ini || 'LOC').slice(0, 3);
  }
  const AWAY = ['AND', 'COT', 'NOR', 'SUR', 'VOL', 'CHI', 'PAS', 'TUN'];
  function scoreboard(u, info, goal) {
    const client = (info && info.client) || 'Local';
    const h = hash(client + ((info && info.seed) || ''));
    const home = teamCode(client);
    let away = AWAY[h % AWAY.length];
    if (away === home) away = AWAY[(h + 1) % AWAY.length];
    const gh = (h >> 3) % 3 + (goal ? 1 : 0), ga = (h >> 5) % 2;
    const min = 10 + ((h >> 7) % 70);
    const digits = (n, cls) => `<g class="${cls}">${Array.from({ length: n + 1 }, (_, i) => `<text x="0" y="${7.5 + i * 10}" font-size="9" font-family="${FONT_M}" fill="#e9edf5" text-anchor="middle">${i % n}</text>`).join('')}</g>`;
    return `<g transform="translate(8 8)">
      <rect width="146" height="20" rx="4" fill="#0d0f14" fill-opacity=".92" stroke="#2a3242"/>
      <rect x="0" y="0" width="34" height="20" rx="4" fill="${U('red')}"/><rect x="30" y="0" width="4" height="20" fill="#d42a30"/>
      <text x="17" y="14" font-size="10.5" font-family="${FONT_D}" font-weight="800" fill="#fff" text-anchor="middle">${esc(home)}</text>
      <text x="51" y="14.5" font-size="11" font-family="${FONT_M}" fill="${goal ? '#ffb020' : '#fff'}" text-anchor="middle">${gh}-${ga}</text>
      <rect x="68" y="0" width="34" height="20" fill="#1d3b5e"/>
      <text x="85" y="14" font-size="10.5" font-family="${FONT_D}" font-weight="800" fill="#fff" text-anchor="middle">${away}</text>
      <text x="121" y="14" font-size="9" font-family="${FONT_M}" fill="#e9edf5" text-anchor="end">${min}:</text>
      <clipPath id="${u}clk"><rect x="120" y="5" width="18" height="10"/></clipPath>
      <g clip-path="url(#${u}clk)"><g transform="translate(125 5)">${digits(6, 'sb-t')}</g><g transform="translate(131.5 5)">${digits(10, 'sb-u')}</g></g>
    </g>`;
  }
  // Marcador de pelea (boxeo / lucha)
  function fightBoard(kind, info) {
    const h = hash((info && info.client) || kind);
    return `<g transform="translate(8 8)"><rect width="120" height="20" rx="4" fill="#0d0f14" fill-opacity=".92" stroke="#2a3242"/>
      <rect width="40" height="20" rx="4" fill="${U('red')}"/><text x="20" y="14" font-size="10" font-family="${FONT_D}" font-weight="800" fill="#fff" text-anchor="middle">${kind === 'lucha' ? 'CAÍDA' : 'ROUND'}</text>
      <text x="52" y="14.5" font-size="11" font-family="${FONT_M}" fill="#ffb020" text-anchor="middle">${(h % 3) + 1}</text>
      <text x="96" y="14.5" font-size="10" font-family="${FONT_M}" fill="#e9edf5" text-anchor="middle">${(h >> 4) % 3}:${String(10 + ((h >> 6) % 49)).padStart(2, '0')}</text></g>`;
  }

  const badge = (iconName, color) => `<g transform="translate(300 34)" class="fx-blink"><rect width="48" height="34" rx="6" fill="#0d0f14" fill-opacity=".9" stroke="${color}" stroke-width="1.5"/><g transform="translate(12 5)" color="${color}">${icon(iconName, '', 24)}</g></g>`;
  const FX = {
    lluvia: () => {
      const seg = (n, off, len, dx) => Array.from({ length: n }, (_, i) => `M${((i * 47 + off * 13) % 390) - 15} ${((i * 29 + off * 31) % 180) - 10}l-${dx} ${len}`).join('');
      return `<rect width="360" height="170" fill="#1a2a44" opacity=".34"/>
        <g class="fx-rain fx-rain-far"><path d="${seg(34, 3, 8, 2)}" stroke="#9ec5ff" stroke-width=".7" opacity=".4"/></g>
        <g class="fx-rain"><path d="${seg(26, 0, 14, 4)}" stroke="#bcd8ff" stroke-width="1.2" opacity=".65"/></g>
        <g class="fx-rain fx-rain-near"><path d="${seg(12, 7, 26, 7)}" stroke="#e1efff" stroke-width="2" opacity=".55" stroke-linecap="round"/></g>
        ${[[70, 160], [190, 150], [300, 162], [130, 140]].map(([x, y], i) => `<ellipse cx="${x}" cy="${y}" rx="10" ry="2.5" fill="none" stroke="#bcd8ff" stroke-width="1" class="ripple" style="animation-delay:${i * 0.3}s"/>`).join('')}`;
    },
    luz: () => `<rect width="360" height="170" fill="#000" fill-opacity=".75" class="fx-dark"/><g class="fx-blink"><circle cx="20" cy="20" r="4" fill="#ff3b3b"/><circle cx="20" cy="20" r="10" fill="#ff3b3b" opacity=".25"/><circle cx="340" cy="20" r="4" fill="#ff3b3b"/><circle cx="340" cy="20" r="10" fill="#ff3b3b" opacity=".25"/></g><rect x="128" y="74" width="104" height="20" rx="4" fill="#0d0f14" stroke="#ffb020"/><text x="180" y="88" font-size="10" font-family="${FONT_D}" font-weight="800" fill="#ffb020" text-anchor="middle">SIN ENERGÍA</text>`,
    cable: (ctx) => `<g class="fx-spark" transform="translate(${ctx.firstCamX} 140)"><path d="M0 0l8-10 4 6 10-12" stroke="#ffd23a" stroke-width="3" fill="none"/><path d="M-6 -4l-8-6M4 4l6 8" stroke="#fff" stroke-width="1.5"/><circle cx="0" cy="0" r="9" fill="${U('flame')}"/></g>`,
    internet: () => `${badge('wifi_off', '#ff3b3b')}<g class="fx-glitch" opacity=".5"><rect y="60" width="360" height="4" fill="#ff3b3b" opacity=".3"/><rect y="104" width="360" height="3" fill="#4da3ff" opacity=".3"/></g>`,
    acople: () => `<g class="fx-wave">${[0, 1, 2, 3].map((i) => `<circle cx="180" cy="90" r="${18 + i * 20}" fill="none" stroke="${i % 2 ? '#ffb020' : '#ff3b3b'}" stroke-width="2.2" style="animation-delay:${i * 0.22}s"/>`).join('')}</g>`,
    bateria: () => `<g transform="translate(300 34)" class="fx-blink"><rect width="48" height="30" rx="6" fill="#0d0f14" fill-opacity=".9" stroke="#ffb020" stroke-width="1.5"/><rect x="9" y="9" width="26" height="12" rx="2" fill="none" stroke="#ffb020" stroke-width="2"/><rect x="11" y="11" width="5" height="8" fill="#ff3b3b"/><path d="M37 13v4" stroke="#ffb020" stroke-width="2"/></g>`,
    epico: (ctx) => `<rect width="360" height="170" fill="#fff" opacity="0" class="fx-flash"/>${Array.from({ length: 30 }, (_, i) => `<rect x="${(i * 53) % 360}" y="-12" width="${4 + (i % 3)}" height="${7 + (i % 4)}" rx="1" fill="${['#ff3b3b', '#ffb020', '#4da3ff', '#2ecc71', '#ffd34d'][i % 5]}" class="fx-confetti" style="animation-delay:${(i % 9) * 0.13}s;animation-duration:${1.8 + (i % 4) * 0.25}s"/>`).join('')}
      ${ctx.football ? `<g class="fx-pop"><rect x="120" y="58" width="120" height="34" rx="6" fill="${U('red')}"/><text x="180" y="83" font-size="24" font-family="${FONT_D}" font-weight="800" fill="#fff" text-anchor="middle" letter-spacing="2">¡GOOOL!</text></g>` : ''}`,
    tarde: () => badge('clock', '#ffb020'),
    falla: (ctx) => `<rect width="360" height="170" fill="url(#${ctx.u}noise)" class="fx-glitch"/><g class="fx-glitch" style="animation-delay:-.1s"><rect y="40" width="360" height="6" fill="#ff3b3b" opacity=".18"/><rect y="118" width="360" height="5" fill="#2ecc71" opacity=".18"/></g>`,
    logo: (ctx) => `<g transform="translate(${ctx.board ? 200 : 14} ${ctx.board ? 8 : 14})" class="fx-pop"><rect width="80" height="22" rx="4" fill="${U('org')}"/><text x="40" y="15" font-size="10" font-family="${FONT_D}" font-weight="800" fill="#1a1205" text-anchor="middle">TU LOGO AQUÍ</text></g>
      <g transform="translate(80 118)"><rect width="200" height="18" rx="3" fill="#0d0f14" fill-opacity=".85" stroke="#ffb020"/><rect width="6" height="18" rx="2" fill="#ffb020"/><text x="14" y="12.5" font-size="8.5" font-family="${FONT_B}" font-weight="600" fill="#e9edf5">Video publicitario del cliente</text></g>`,
    vip: () => `${cone(180, 0, 10, 170, 40)}<path d="M160 170l8-58h24l8 58z" fill="${U('red')}" opacity=".7"/>
      <g transform="translate(300 34)"><rect width="48" height="22" rx="5" fill="${U('gold')}"/><text x="24" y="15.5" font-size="11" font-family="${FONT_D}" font-weight="800" fill="#1a1205" text-anchor="middle">VIP</text></g>`,
    permiso: () => badge('clients', '#ffb020'),
    transporte: () => `${badge('clock', '#ffb020')}${vanSide(-6, 128, 0.6, false)}`,
    robo: () => `${badge('lock', '#ff3b3b')}<path d="M40 150c10-30 30-40 40-60" stroke="#ff3b3b" stroke-width="2" stroke-dasharray="4 4" fill="none" class="fx-blink"/>`,
    senal: () => `<rect width="360" height="170" fill="#000" opacity=".35"/><g transform="translate(180 82)"><circle r="16" fill="none" stroke="#2a3242" stroke-width="4"/><g class="spin" style="animation-duration:.9s"><path d="M0 -16a16 16 0 0 1 16 16" stroke="#e9edf5" stroke-width="4" fill="none" stroke-linecap="round"/></g></g>${badge('stream', '#ff3b3b')}`,
    guion: () => badge('log', '#ffb020'),
    multitud: () => crowd('multitud', 150, 4, 30, 330, 3.4, ['#06070a', '#0a0b0f'], { anim: false }),
  };

  // Art.scene(tipo, imprevisto, cámaras, terminado, gear, info)
  //   gear: tipos de equipo que llevaste (opcional). info: { client, seed } (opcional)
  function scene(type, incident, camCount, done, gear, info) {
    try {
      const g = Array.isArray(gear) ? gear.filter((x) => typeof x === 'string') : null;
      const u = uid('s');
      const kind = sceneKind(type);
      const football = FOOTBALL.includes(kind);
      const fight = kind === 'boxeo' || kind === 'lucha';
      const inline = ensureShared() ? '' : sharedDefs();
      const bg = sceneBg(kind, u, info);
      const hasDrone = !!g && g.includes('dron4k');
      const hasJib = !!g && g.includes('grua');
      const hasVan = !!g && g.includes('unidad_movil');
      const hasGen = !!g && g.includes('generador');
      const hasSat = !!g && g.includes('vip_satelital');
      const total = Math.max(1, Math.min(Number(camCount) || 1, 6));
      let camTypes;
      if (g) {
        camTypes = g.filter((t) => { const it = catalogItem(t); return (it ? it.cat === 'cam' : /^cam_|^vip_cam/.test(t)) && t !== 'dron4k' && t !== 'grua'; });
        if (!camTypes.length && !hasDrone && !hasJib) camTypes = ['cam_basic'];
      } else camTypes = Array.from({ length: total }, () => 'cam_pro');
      camTypes = camTypes.slice(0, 5);
      const n = camTypes.length;
      const left = hasJib ? 120 : 40, right = hasVan ? 250 : 320;
      const xs = n === 1 ? [hasVan ? 230 : 250] : camTypes.map((_, i) => left + i * ((right - left) / Math.max(1, n - 1)));
      const firstCamX = xs.length ? xs[0] : 96;
      const cams = camTypes.map((t, i) => sceneCam(xs[i].toFixed(0), 136, t, 0.85, incident === 'cable' && i === 0)).join('');
      const jib = hasJib ? `<g><ellipse cx="56" cy="168" rx="20" ry="3" fill="#000" opacity=".45"/><path d="M44 170l12-36 12 36M56 134v36" stroke="#5b6476" stroke-width="2.4" stroke-linecap="round"/><rect x="49" y="128" width="14" height="8" rx="2" fill="${U('gm')}"/>
        <g class="jib" style="transform-origin:56px 132px"><path d="M22 150L150 70" stroke="#14171d" stroke-width="6" stroke-linecap="round"/><path d="M22 150L150 70" stroke="${U('cyal')}" stroke-width="3.6" stroke-linecap="round"/>
        <rect x="10" y="144" width="16" height="14" rx="2" fill="${U('gm')}"/><path d="M150 70v8" stroke="#14171d" stroke-width="2"/>
        <rect x="140" y="76" width="20" height="12" rx="2.5" fill="${U('al')}"/><rect x="158" y="78" width="6" height="8" rx="1.5" fill="${U('cyp')}"/><circle cx="144" cy="74" r="2" fill="#ff3b3b" class="blink"/></g></g>` : '';
      const drone = hasDrone ? `<g transform="translate(250 34)"><path d="M0 12l-18 50h36z" fill="${U('coneB')}" opacity=".5"/>${droneSmall(0, 0, 1.3, true)}</g>` : '';
      const van = hasVan ? vanSide(276, 124, 0.95, true) : '';
      const gen = hasGen ? `<g transform="translate(6 146)"><ellipse cx="15" cy="21" rx="18" ry="2.5" fill="#000" opacity=".45"/><rect width="30" height="20" rx="2" fill="${U('org')}"/><rect x="3" y="4" width="12" height="9" fill="#1d2129"/><circle cx="9" cy="8.5" r="2" fill="${incident === 'luz' ? '#2ecc71' : '#e9edf5'}"/><path d="M24 0v-6h5" stroke="#3a4150" stroke-width="2" fill="none"/><circle cx="31" cy="-9" r="3" fill="#c5ccd6" opacity=".35" class="puff"/></g>` : '';
      const sat = hasSat ? `<g transform="translate(${hasVan ? 250 : 330} 150) scale(.55)"><path d="M0 0l-12 26M0 0l12 26" stroke="#5b6476" stroke-width="3"/><g transform="rotate(-30 0 -6)"><ellipse cx="0" cy="-6" rx="20" ry="8" fill="${U('dishg')}"/></g></g>` : '';
      const ctx = { u, football, firstCamX, board: football || fight };
      const fx = !done && FX[incident] ? FX[incident](ctx) : '';
      const viewers = 120 + (hash(kind + (info && info.client)) % 900) * (football || kind === 'concierto' || fight ? 12 : 1);
      const vtxt = viewers >= 1000 ? (viewers / 1000).toFixed(1).replace('.', ',') + ' mil' : String(viewers);
      const counter = hasVan ? '' : `<g transform="translate(286 148)"><rect width="64" height="16" rx="3" fill="#0d0f14" fill-opacity=".78"/><circle cx="9" cy="8" r="3" fill="none" stroke="#e9edf5" stroke-width="1.4"/><circle cx="9" cy="8" r="1.2" fill="#e9edf5"/><text x="58" y="11.5" font-size="8.5" font-family="${FONT_M}" fill="#e9edf5" text-anchor="end">${vtxt}</text></g>`;
      return `<svg class="scene" viewBox="0 0 360 170" role="img" aria-label="Escena del evento">
      <defs>${inline}<pattern id="${u}noise" width="6" height="6" patternUnits="userSpaceOnUse"><rect width="6" height="3" fill="#ffffff14"/><rect y="3" width="3" height="3" fill="#00000040"/></pattern></defs>
      ${bg}${(extTipo(type) || {}).overlay ? overlayTemporada(extTipo(type).overlay, u) : ''}${jib}${van}${sat}${gen}${cams}${drone}
      <rect width="360" height="170" fill="${U('vig')}"/>
      ${football ? scoreboard(u, info, incident === 'epico' && !done) : fight ? fightBoard(kind, info) : ''}${fx}
      <g transform="translate(10 148)"><rect width="62" height="16" rx="3" fill="#ff3b3b"/><circle cx="10" cy="8" r="3" fill="#fff" class="blink"/><text x="38" y="12" font-size="10" font-family="${FONT_D}" font-weight="800" fill="#fff" text-anchor="middle">EN VIVO</text></g>
      ${counter}
    </svg>`;
    } catch (e) {
      return '<svg class="scene" viewBox="0 0 360 170" role="img" aria-label="Escena del evento"><rect width="360" height="170" fill="#161a22"/><text x="180" y="90" font-size="14" fill="#ff3b3b" text-anchor="middle" font-family="Barlow Condensed,Arial Narrow,sans-serif" font-weight="800">EN VIVO</text></svg>';
    }
  }

  const hasIcon = (name) => Object.prototype.hasOwnProperty.call(P, name) || Object.prototype.hasOwnProperty.call(ALIAS, name);
  root.Art = { icon, hasIcon, portrait, hq, scene, item, avatar, rarity, RARITIES, SUBTIPOS, subtipo: (t, o) => { try { return subtipoOf(t, o); } catch (e) { return 'case'; } }, PORTRAIT_NAMES };
})(typeof window !== 'undefined' ? window : globalThis);
