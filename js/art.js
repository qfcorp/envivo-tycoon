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

  const ALIAS = { dron4k: 'dron', kit_reparacion: 'wrench', caja_chica: 'money', estrella: 'role_cam', inicio: 'gift', vip30: 'crown' };
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

  // Subtipos soportados (para equipos nuevos: CATALOG[k].subtipo o Art.item(k, s, {subtipo}))
  const SUBTIPOS = Object.keys(DRAW).filter((k) => !['gems', 'crown', 'gift', 'star', 'toolkit', 'cash'].includes(k));
  const SUB_ALIAS = { camara: 'eng', camcorder: 'camcorder', mano: 'camcorder', hombro: 'eng', eng: 'eng', ptz: 'ptz', robotica: 'ptz', sistema: 'system', estudio: 'system', system: 'system', box: 'system', cine: 'cine',
    switcher: 'switcher', mezclador: 'switcher', laptop: 'laptop', consola: 'console', mixer: 'console', console: 'console', mic: 'mic_wireless', microfono: 'mic_wireless', inalambrico: 'mic_wireless',
    encoder: 'encoder', mochila: 'bonding', bonding: 'bonding', backpack: 'bonding', router: 'router', ups: 'ups', bateria: 'vbattery', battery: 'vbattery', vmount: 'vbattery',
    cable: 'cable_reel', fibra: 'cable_reel', carrete: 'cable_reel', lluvia: 'raincover', cobertor: 'raincover', dron: 'drone', drone: 'drone', grua: 'jib', jib: 'jib',
    unidad_movil: 'ob_van', ob: 'ob_van', van: 'ob_van', generador: 'generator', replay: 'replay', repeticion: 'replay', intercom: 'intercom', satelite: 'satellite', satelital: 'satellite',
    monitor: 'monitor', luz: 'light', light: 'light', led: 'light', maleta: 'case', case: 'case' };
  const TYPE_SUB = {
    cam_basic: 'camcorder', cam_pro: 'eng', cam_cine: 'system', vip_cam8k: 'cine', switch_basic: 'laptop', switch_pro: 'switcher', vip_switcher: 'switcher',
    audio_basic: 'console', audio_pro: 'console', mics: 'mic_wireless', encoder: 'encoder', router4g: 'router', ups: 'ups', raincover: 'raincover',
    cable: 'cable_reel', battery: 'vbattery', dron4k: 'drone', grua: 'jib', unidad_movil: 'ob_van', generador: 'generator', vip_satelital: 'satellite',
    kit_reparacion: 'toolkit', caja_chica: 'cash', vip30: 'crown', inicio: 'gift', estrella: 'star',
  };
  const CAT_SUB = { cam: 'eng', switcher: 'switcher', audio: 'console', mics: 'mic_wireless', encoder: 'encoder', internet: 'router', power: 'ups', rain: 'raincover',
    replay: 'replay', intercom: 'intercom', light: 'light', luz: 'light', monitor: 'monitor', cable: 'cable_reel', bonding: 'bonding', drone: 'drone', dron: 'drone' };
  const norm = (t) => String(t || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  function subtipoOf(type, o) {
    const it = catalogItem(type);
    const cands = [o && o.subtipo, it && it.subtipo];
    for (const c of cands) { const k = norm(c); if (DRAW[k]) return k; if (SUB_ALIAS[k]) return SUB_ALIAS[k]; }
    if (TYPE_SUB[type]) return TYPE_SUB[type];
    if (/^creditos/.test(String(type))) return 'gems';
    const n = norm(type);
    const rx = [[/ptz/, 'ptz'], [/eng|hombro/, 'eng'], [/sistema|system|estudio|box/, 'system'], [/cine|8k|6k/, 'cine'], [/replay|repetic/, 'replay'], [/intercom|clear/, 'intercom'],
      [/mochila|bond|backpack|lu\d/, 'bonding'], [/unidad|ob_?van|movil|truck/, 'ob_van'], [/dron|drone/, 'drone'], [/grua|jib|crane/, 'jib'], [/cable|fibra|sdi/, 'cable_reel'],
      [/bater|battery|vmount|v_mount/, 'vbattery'], [/monitor/, 'monitor'], [/luz|light|led|panel/, 'light'], [/sat/, 'satellite'], [/gener/, 'generator'], [/router|4g|5g|modem/, 'router'],
      [/encoder|srt/, 'encoder'], [/mic/, 'mic_wireless'], [/audio|consola|mixer/, 'console'], [/switch|atem|mezcl/, 'switcher'], [/laptop|vmix/, 'laptop'], [/ups/, 'ups'], [/cam/, 'eng']];
    for (const [re, k] of rx) if (re.test(n)) return k;
    const cat = norm((o && o.cat) || (it && it.cat));
    if (CAT_SUB[cat]) return CAT_SUB[cat];
    return 'case';
  }
  function itemParams(type, r) {
    const p = { vip: r.key === 'vip' };
    if (type === 'audio_basic') { p.channels = 8; p.screen = false; }
    if (type === 'audio_pro') { p.channels = 12; p.screen = true; }
    if (type === 'cam_cine') p.tag = '4K';
    if (p.vip) { p.acc = '#f0b829'; p.tag = '8K'; }
    if (type === 'cam_pro') p.tag = 'HD';
    return p;
  }
  const ITEM_LABEL = (type) => { const it = catalogItem(type); return it ? it.name : ''; };

  // Art.item(tipo, tamaño, { subtipo, cat, rarity, label }) → render del equipo con brillo de rareza
  function itemRaw(type, size, opts) {
    const o = opts || {};
    const s = size || 96;
    const r = (o.rarity && RARITIES[RARITY_ALIAS[norm(o.rarity)] || o.rarity]) || rarity(type);
    const sub = subtipoOf(type, o);
    let body;
    try { body = DRAW[sub](itemParams(type, r)); } catch (e) { try { body = DRAW.case({}); } catch (e2) { body = ''; } }
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
          <rect x="200" y="46" width="54" height="11" rx="2" fill="#0d0f14"/><text x="227" y="54.5" font-size="7" font-family="${FONT_D}" font-weight="800" fill="#ff3b3b" text-anchor="middle">PRODUCCIONES</text>`;
      } else if (stage === 1) {
        label = 'Oficina alquilada'; roofY = 24; roofX = 120;
        building = `<rect x="60" y="30" width="240" height="110" fill="${W}"/><rect x="56" y="24" width="248" height="10" fill="#3a4354"/><path d="M60 34h240v5H60z" fill="#000" opacity=".25"/>
          ${[0, 1, 2].map((i) => `<rect x="${80 + i * 40}" y="48" width="30" height="40" fill="#16202e" stroke="#4a5568"/>${glowWin(82 + i * 40, 50, 26, 36, i === 1 ? 1 : 0.7)}<path d="M${95 + i * 40} 48v40" stroke="#4a5568"/>`).join('')}
          <rect x="210" y="70" width="60" height="70" fill="#1a1d24"/>${glowWin(214, 74, 52, 40, 0.6)}
          <rect x="206" y="44" width="68" height="16" rx="3" fill="${U('red')}"/><text x="240" y="55.5" font-size="9" font-family="${FONT_D}" font-weight="800" fill="#fff" text-anchor="middle">PRODUCTORA</text>`;
      } else if (stage === 2) {
        label = 'Estudio propio'; roofY = 20; roofX = 110;
        building = `<rect x="40" y="26" width="280" height="114" fill="${W}"/><rect x="36" y="20" width="288" height="10" fill="#384358"/><path d="M40 30h280v5H40z" fill="#000" opacity=".25"/>
          <rect x="60" y="44" width="120" height="56" fill="#121a26" stroke="#4a5568"/>
          ${[0, 1, 2].map((i) => `<rect x="${68 + i * 38}" y="52" width="32" height="20" fill="#203048"/><rect x="${70 + i * 38}" y="54" width="28" height="16" fill="${['#2f6fb3', '#b33a3a', '#2f8f5b'][i]}" opacity="${night ? 0.9 : 0.6}"/>`).join('')}
          <path d="M70 84h100" stroke="#3b4659" stroke-width="6"/>${glowWin(60, 100, 120, 40, 0.4)}
          <rect x="218" y="40" width="84" height="16" rx="3" fill="${U('red')}"/><circle cx="230" cy="48" r="3" fill="#fff" class="blink"/><text x="266" y="52" font-size="9" font-family="${FONT_D}" font-weight="800" fill="#fff" text-anchor="middle">EN VIVO</text>
          <rect x="225" y="70" width="70" height="70" fill="#1a1d24"/>${glowWin(229, 74, 62, 40, 0.5)}`;
      } else {
        label = 'Centro de producción'; roofY = 12; roofX = 190;
        building = `<rect x="30" y="18" width="300" height="122" fill="${W}"/><rect x="26" y="12" width="308" height="10" fill="#36425a"/><path d="M30 22h300v5H30z" fill="#000" opacity=".25"/>
          ${[0, 1, 2, 3].map((i) => `<rect x="${48 + i * 52}" y="34" width="44" height="30" fill="#15202f" stroke="#41506a"/><rect x="${50 + i * 52}" y="36" width="40" height="26" fill="${['#2f6fb3', '#b33a3a', '#2f8f5b', '#b38a2f'][i]}" opacity="${night ? 0.85 : 0.5}"/>`).join('')}
          ${[0, 1, 2, 3, 4].map((i) => glowWin(48 + i * 42, 88, 34, 18, 0.55)).join('')}
          <rect x="48" y="74" width="200" height="8" rx="2" fill="#3b4659"/>
          <rect x="262" y="34" width="56" height="16" rx="3" fill="${U('red')}"/><text x="290" y="46" font-size="9" font-family="${FONT_D}" font-weight="800" fill="#fff" text-anchor="middle">EN VIVO</text>
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
          ${[[40, -6, 1], [190, -12, 0.8]].map(([x, y, k]) => `<g transform="translate(${x} ${y}) scale(${k})" class="cloud"><path d="M-18 4a8 8 0 018-10 12 12 0 0122-2 9 9 0 018 12z" fill="#fff" opacity=".9"/><path d="M-18 4h38" stroke="#c9dcec" stroke-width="2"/></g>`).join('')}`;
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
      const lamp = `<path d="M346 140V100" stroke="#3a4150" stroke-width="2"/><path d="M346 100h-8" stroke="#3a4150" stroke-width="2"/><circle cx="337" cy="102" r="2.5" fill="${night ? '#ffd27a' : '#8b95a8'}"/>${night ? cone(337, 104, 2, 36, 16, U('poolW')) : ''}`;
      return `<svg class="hq" viewBox="0 -20 360 170" role="img" aria-label="${esc(label)}">
      <defs>${inline}${wall}</defs>
      <rect x="0" y="-20" width="360" height="170" fill="${sky}"/>
      ${skyDeco}${hills}
      <ellipse cx="180" cy="141" rx="170" ry="5" fill="#000" opacity=".35"/>
      ${building}${roof.join('')}
      <rect x="0" y="140" width="360" height="10" fill="${night ? '#1a1f2a' : '#5b6476'}"/><path d="M0 141h360" stroke="${night ? '#2a3242' : '#8f99aa'}" stroke-width="1.5"/><path d="M0 146h360" stroke="${night ? '#2a3242' : '#e9edf5'}" stroke-width="1" stroke-dasharray="10 8" opacity=".5"/>
      ${lamp}${side.join('')}${camRow}${van}
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
  function sceneKind(type) {
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
      ${bg}${jib}${van}${sat}${gen}${cams}${drone}
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
