/* =========================================================
   EN VIVO Tycoon — Gráficos (todo dibujado con SVG, sin imágenes)
   Art.icon(nombre)        → ícono de línea
   Art.portrait(personaje) → retrato (ramiro, mega, marca, dirigente)
   Art.hq(estado)          → la sede de tu productora (crece con la historia)
   Art.scene(evento, imprevisto, cámaras) → escena animada del evento en vivo
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

  /* ---------- Sede de la productora ---------- */
  function tripod(x, y, color, scale) {
    const k = scale || 1;
    return `<g transform="translate(${x} ${y}) scale(${k})">
      <path d="M0 0l-9 26M0 0l9 26M0 0v26" stroke="#5b6476" stroke-width="2" stroke-linecap="round"/>
      <rect x="-10" y="-11" width="18" height="11" rx="2" fill="${color}"/><rect x="8" y="-8" width="6" height="5" rx="1" fill="${color}"/>
      <circle cx="-4" cy="-5.5" r="2" fill="#0d0f14"/></g>`;
  }

  function hq(s) {
    const stage = s.storyDone ? 3 : s.chapter >= 4 ? 3 : s.chapter >= 2 ? 2 : s.chapter >= 1 ? 1 : 0;
    const cams = s.equip.filter((e) => /^cam_/.test(e.type));
    const camColor = (t) => (t === 'cam_cine' ? '#e9edf5' : t === 'cam_pro' ? '#9aa6bb' : '#4d5668');
    const shown = cams.slice(0, 6);
    let building, label;
    if (stage === 0) {
      label = 'Garaje';
      building = `<rect x="70" y="40" width="220" height="100" fill="#2b2f38"/><path d="M60 42l120-28 120 28z" fill="#3a3f4b"/>
        <rect x="95" y="62" width="170" height="78" fill="#1a1d24"/>${[0, 1, 2, 3, 4, 5].map((i) => `<path d="M95 ${70 + i * 12}h170" stroke="#2a2e37" stroke-width="2"/>`).join('')}
        <path d="M180 62v8" stroke="#8b95a8"/><circle cx="180" cy="74" r="4" fill="#ffd27a" class="bulb"/>`;
    } else if (stage === 1) {
      label = 'Oficina alquilada';
      building = `<rect x="60" y="30" width="240" height="110" fill="#2b3240"/><rect x="60" y="24" width="240" height="10" fill="#3a4354"/>
        <rect x="80" y="50" width="70" height="44" fill="#16202e" stroke="#4a5568"/><path d="M115 50v44M80 72h70" stroke="#4a5568"/>
        <rect x="210" y="70" width="60" height="70" fill="#1a1d24"/><rect x="208" y="44" width="64" height="14" rx="2" fill="var(--red)"/><text x="240" y="54" font-size="8" font-family="Barlow Condensed,Arial Narrow,sans-serif" font-weight="800" fill="#fff" text-anchor="middle">PRODUCTORA</text>`;
    } else if (stage === 2) {
      label = 'Estudio propio';
      building = `<rect x="40" y="26" width="280" height="114" fill="#283143"/><rect x="40" y="20" width="280" height="10" fill="#384358"/>
        <rect x="60" y="44" width="120" height="56" fill="#121a26" stroke="#4a5568"/>
        ${[0, 1, 2].map((i) => `<rect x="${68 + i * 38}" y="52" width="32" height="20" fill="#203048"/><rect x="${70 + i * 38}" y="54" width="28" height="16" fill="${['#2f6fb3', '#b33a3a', '#2f8f5b'][i]}" opacity=".7"/>`).join('')}
        <path d="M70 84h100" stroke="#3b4659" stroke-width="6"/>
        <rect x="220" y="40" width="80" height="16" rx="3" fill="var(--red)"/><circle cx="232" cy="48" r="3" fill="#fff" class="blink"/><text x="266" y="52" font-size="9" font-family="Barlow Condensed,Arial Narrow,sans-serif" font-weight="800" fill="#fff" text-anchor="middle">EN VIVO</text>
        <rect x="225" y="70" width="70" height="70" fill="#1a1d24"/>`;
    } else {
      label = s.storyDone ? 'Centro de producción' : 'Centro de producción';
      building = `<rect x="30" y="18" width="300" height="122" fill="#263045"/><rect x="30" y="12" width="300" height="10" fill="#36425a"/>
        <path d="M290 12V-10M280 -2l10 -8 10 8" stroke="#8b95a8" stroke-width="2" fill="none"/><circle cx="290" cy="-12" r="3" fill="var(--red)" class="blink"/>
        ${[0, 1, 2, 3].map((i) => `<rect x="${48 + i * 52}" y="34" width="44" height="30" fill="#15202f" stroke="#41506a"/><rect x="${50 + i * 52}" y="36" width="40" height="26" fill="${['#2f6fb3', '#b33a3a', '#2f8f5b', '#b38a2f'][i]}" opacity=".55"/>`).join('')}
        <rect x="48" y="74" width="200" height="8" rx="2" fill="#3b4659"/>
        <rect x="262" y="34" width="56" height="16" rx="3" fill="var(--red)"/><text x="290" y="46" font-size="9" font-family="Barlow Condensed,Arial Narrow,sans-serif" font-weight="800" fill="#fff" text-anchor="middle">EN VIVO</text>
        <rect x="262" y="70" width="56" height="70" fill="#1a1d24"/>`;
    }
    const van = s.rep >= 30 ? `<g transform="translate(250 112)"><rect x="0" y="0" width="70" height="26" rx="4" fill="#e9edf5"/><rect x="48" y="4" width="18" height="10" rx="2" fill="#4da3ff" opacity=".6"/><rect x="0" y="12" width="44" height="5" fill="var(--red)"/><circle cx="14" cy="28" r="5" fill="#111"/><circle cx="56" cy="28" r="5" fill="#111"/><path d="M20 0v-8M14 -12h12" stroke="#8b95a8" stroke-width="2"/></g>` : '';
    const camRow = shown.map((e, i) => tripod(28 + i * 34, 118, camColor(e.type), 0.8)).join('');
    return `<svg class="hq" viewBox="0 -20 360 170" role="img" aria-label="Tu sede: ${label}">
      <defs><linearGradient id="hqsky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#151b28"/><stop offset="1" stop-color="#0d0f14"/></linearGradient></defs>
      <rect x="0" y="-20" width="360" height="170" fill="url(#hqsky)"/>
      ${[[20, -5], [90, 2], [150, -10], [330, 0], [210, -14], [310, -15]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="1" fill="#8b95a8"/>`).join('')}
      ${building}
      <rect x="0" y="140" width="360" height="10" fill="#1e2430"/>
      ${camRow}${van}
      <rect x="8" y="-14" width="${label.length * 6.2 + 16}" height="18" rx="9" fill="#0d0f14cc" stroke="#2a3242"/>
      <text x="16" y="-1.5" font-size="10.5" font-family="IBM Plex Sans,system-ui,sans-serif" font-weight="600" fill="#e9edf5">${label}</text>
    </svg>`;
  }

  /* ---------- Escena del evento en vivo ---------- */
  const OUTDOOR = ['barrial', 'ligapro', 'final'];
  function sceneBg(type, outdoor) {
    if (OUTDOOR.includes(type)) {
      return `<rect width="360" height="170" fill="#0e1622"/>
        <path d="M0 95h360v75H0z" fill="#1f6b3a"/>${[0, 1, 2, 3, 4, 5].map((i) => `<path d="M${i * 60} 95h30v75h-30z" fill="#237540"/>`).join('')}
        <path d="M180 95v75M60 170l30-75M300 170l-30-75" stroke="#e9edf5" stroke-opacity=".5" stroke-width="1.5"/><ellipse cx="180" cy="128" rx="30" ry="9" fill="none" stroke="#e9edf5" stroke-opacity=".5" stroke-width="1.5"/>
        <path d="M0 95V55l60-12h240l60 12v40z" fill="#262d3a"/>${Array.from({ length: 34 }, (_, i) => `<circle cx="${8 + i * 10.5}" cy="${62 + (i % 3) * 9}" r="3.2" fill="${['#c94a4a', '#4a7ac9', '#d9b44a', '#8b95a8'][i % 4]}" class="crowd" style="animation-delay:${(i % 5) * 0.15}s"/>`).join('')}
        ${[30, 330].map((x) => `<path d="M${x} 52V12" stroke="#5b6476" stroke-width="3"/><rect x="${x - 14}" y="4" width="28" height="10" rx="2" fill="#f4f1d0"/><path d="M${x - 14} 14l-30 80h88l-30-80z" fill="#fffbe0" opacity=".06"/>`).join('')}`;
    }
    const wall = type === 'misa' ? '#2a2633' : type === 'concierto' ? '#16121f' : '#222838';
    let deco = '';
    if (type === 'misa') deco = `<path d="M150 20h60v60h-60z" fill="#1c1a24"/><path d="M180 26v40M168 38h24" stroke="#d9b44a" stroke-width="3"/>${[60, 300].map((x) => `<path d="M${x - 14} 70V30a14 14 0 0128 0v40z" fill="#2f4f7a" opacity=".7"/>`).join('')}`;
    else if (type === 'boda') deco = `<path d="M140 80q40-70 80 0" fill="none" stroke="#e8d7c0" stroke-width="5"/>${[150, 170, 190, 210].map((x, i) => `<circle cx="${x}" cy="${38 - (i === 1 || i === 2 ? 8 : 0)}" r="5" fill="${i % 2 ? '#f2b6c6' : '#fff'}"/>`).join('')}`;
    else if (type === 'concierto') deco = `${[70, 140, 220, 290].map((x, i) => `<path d="M${x} 0l-30 95h60z" fill="${['#ff3b3b', '#4da3ff', '#ffb020', '#b04dff'][i]}" opacity=".16" class="beam" style="animation-delay:${i * 0.4}s"/>`).join('')}<rect x="60" y="70" width="240" height="14" fill="#2d2440"/>`;
    else if (type === 'lanzamiento') deco = `<rect x="110" y="18" width="140" height="56" rx="4" fill="#132238" stroke="#4da3ff"/><text x="180" y="52" font-size="18" font-family="Barlow Condensed,Arial Narrow,sans-serif" font-weight="800" fill="#4da3ff" text-anchor="middle">NUEVO</text>`;
    else if (type === 'graduacion') deco = `<rect x="100" y="22" width="160" height="22" fill="#1f2c4a"/><text x="180" y="38" font-size="11" font-family="Barlow Condensed,Arial Narrow,sans-serif" font-weight="800" fill="#d9b44a" text-anchor="middle">PROMOCIÓN 2026</text>`;
    else deco = `<rect x="120" y="22" width="120" height="40" fill="#1a2232"/><text x="180" y="47" font-size="12" font-family="Barlow Condensed,Arial Narrow,sans-serif" font-weight="800" fill="#8b95a8" text-anchor="middle">RUEDA DE PRENSA</text>`;
    return `<rect width="360" height="170" fill="${wall}"/>${deco}
      <path d="M0 95h360v75H0z" fill="#3a3027"/><path d="M0 95h360" stroke="#4d4136" stroke-width="2"/>
      ${Array.from({ length: 13 }, (_, i) => `<g class="crowd" style="animation-delay:${(i % 4) * 0.2}s"><circle cx="${20 + i * 27}" cy="128" r="7" fill="${['#c98a5e', '#e2b48f', '#8a5a3a', '#d9a679'][i % 4]}"/><path d="M${10 + i * 27} 150a10 10 0 0120 0z" fill="${['#2f4f7a', '#7a2f3f', '#3f6b4a', '#5a4a7a'][i % 4]}"/></g>`).join('')}
      <rect x="150" y="84" width="60" height="12" rx="2" fill="#5c4a3a"/>`;
  }

  const FX = {
    lluvia: () => `<g class="fx-rain">${Array.from({ length: 40 }, (_, i) => `<path d="M${(i * 37) % 370} ${(i * 23) % 150}l-6 16" stroke="#9ec5ff" stroke-width="1.3" opacity=".7" style="animation-delay:${(i % 10) * -0.07}s"/>`).join('')}</g><rect width="360" height="170" fill="#1a2a44" opacity=".35"/>`,
    luz: () => '<rect width="360" height="170" fill="#000" fill-opacity=".72" class="fx-dark"/>',
    cable: () => `<g class="fx-spark" transform="translate(96 132)"><path d="M0 0l8-10 4 6 10-12" stroke="#ffd23a" stroke-width="3" fill="none"/><circle cx="0" cy="0" r="6" fill="#ffd23a" opacity=".5"/></g>`,
    internet: () => `<g transform="translate(300 18)" class="fx-blink"><rect width="48" height="34" rx="4" fill="#0d0f14e6" stroke="var(--red)"/><g transform="translate(12 5)" color="#ff3b3b">${icon('wifi_off', '', 24)}</g></g>`,
    acople: () => `<g class="fx-wave">${[0, 1, 2].map((i) => `<circle cx="180" cy="90" r="${20 + i * 22}" fill="none" stroke="#ff3b3b" stroke-width="2" style="animation-delay:${i * 0.25}s"/>`).join('')}</g>`,
    bateria: () => `<g transform="translate(300 18)" class="fx-blink"><rect width="48" height="30" rx="4" fill="#0d0f14e6" stroke="var(--amber)"/><rect x="9" y="9" width="26" height="12" rx="2" fill="none" stroke="#ffb020" stroke-width="2"/><rect x="11" y="11" width="5" height="8" fill="#ff3b3b"/><path d="M37 13v4" stroke="#ffb020" stroke-width="2"/></g>`,
    epico: () => `<rect width="360" height="170" fill="#fff" opacity="0" class="fx-flash"/>${Array.from({ length: 26 }, (_, i) => `<rect x="${(i * 53) % 360}" y="-10" width="5" height="9" fill="${['#ff3b3b', '#ffb020', '#4da3ff', '#2ecc71'][i % 4]}" class="fx-confetti" style="animation-delay:${(i % 8) * 0.12}s"/>`).join('')}`,
    tarde: () => `<g transform="translate(300 18)" class="fx-blink"><rect width="48" height="34" rx="4" fill="#0d0f14e6" stroke="var(--amber)"/><g transform="translate(12 5)" color="#ffb020">${icon('clock', '', 24)}</g></g>`,
    falla: () => '<rect width="360" height="170" fill="url(#noise)" class="fx-glitch"/>',
    logo: () => `<g transform="translate(14 14)"><rect width="74" height="22" rx="3" fill="#ffb020"/><text x="37" y="15" font-size="10" font-family="Barlow Condensed,Arial Narrow,sans-serif" font-weight="800" fill="#1a1205" text-anchor="middle">TU LOGO AQUÍ</text></g>`,
    vip: () => '<ellipse cx="180" cy="120" rx="40" ry="60" fill="#fffbe0" opacity=".12" class="fx-blink"/>',
  };

  function scene(type, incident, camCount, done) {
    const n = Math.max(1, Math.min(camCount || 1, 6));
    const xs = n === 1 ? [300] : Array.from({ length: n }, (_, i) => 40 + i * (280 / (n - 1)));
    const cams = xs.map((x, i) => `<g class="${incident === 'cable' && i === 0 ? 'cam-off' : ''}">${tripod(x, 132, '#e9edf5', 0.9)}<circle cx="${x - 7}" cy="${119}" r="2.2" fill="var(--red)" class="blink"/></g>`).join('');
    const fx = !done && FX[incident] ? FX[incident]() : '';
    return `<svg class="scene" viewBox="0 0 360 170" role="img" aria-label="Escena del evento">
      <defs><pattern id="noise" width="6" height="6" patternUnits="userSpaceOnUse"><rect width="6" height="3" fill="#ffffff10"/><rect y="3" width="3" height="3" fill="#00000030"/></pattern></defs>
      ${sceneBg(type)}${cams}${fx}
      <g transform="translate(12 148)"><rect width="62" height="16" rx="3" fill="var(--red)"/><circle cx="10" cy="8" r="3" fill="#fff" class="blink"/><text x="38" y="12" font-size="10" font-family="Barlow Condensed,Arial Narrow,sans-serif" font-weight="800" fill="#fff" text-anchor="middle">EN VIVO</text></g>
    </svg>`;
  }

  root.Art = { icon, portrait, hq, scene, PORTRAIT_NAMES };
})(typeof window !== 'undefined' ? window : globalThis);
