/* =========================================================
   La productora por dentro: el centro de Inicio (como la ciudad de los juegos de estrategia).
   - Hub.escena(estado, info) → <svg class="hq hub-svg"> con el edificio cortado: 9 cuartos + techo + calle.
     Cambia con el local (garaje → oficina → estudio → centro), de día y de noche, con la gente y el tráfico
     de siempre (Art.hq), la decoración en la sala, las cámaras en la bodega y los vehículos en el garaje.
   - Hub.inicio(d) → el bloque de Inicio: la escena con sus botones (lugares que se tocan), la línea
     "qué hacer ahora" y el capítulo actual. ui.js pone debajo el botón para pasar el día.
   - Cada lugar abre lo MISMO que abría su fila de antes: una pestaña (Clientes, Personal, Bodega, Registro)
     o una hoja de abajo con las tarjetas de los módulos (window.EnVivoInicio) que le tocan.
   - Un módulo nuevo elige su lugar con { hub: 'misiones' | 'sala' | ... } al registrarse; si no, va a "Más".
   - Avisos en cada lugar: número (ofertas, equipos por reparar), "!" cuando hay algo para reclamar y un punto
     cuando cambió algo desde la última vez que lo abriste. Lugares sin abrir: "En obra" y dicen por qué.
   Textos solo en español (regla del dueño).
   ========================================================= */
(function (root) {
  'use strict';
  const doc = root.document;
  const TX = {
    obra: 'En obra', mas: 'Más', cerrar: 'Cerrar', ir_online: 'Ir a En línea',
    l_logros: 'Logros', l_historia: 'Historia', l_control: 'Control', l_misiones: 'Misiones', l_sala: 'Sala',
    l_personal: 'Personal', l_flota: 'Flota', l_clientes: 'Clientes', l_bodega: 'Bodega', l_antena: 'En línea',
    l_sede: 'Tu sede', l_buzon: 'Buzón',
    t_logros: 'Logros y combos', t_historia: 'Tu historia', t_misiones: 'Misiones y premios',
    t_sala: 'Sala de espera', t_flota: 'Flota y movilización', t_antena: 'En línea', t_sede: 'Tu sede',
    t_buzon: 'Buzón', t_mas: 'Más opciones',
    lock_control: 'La sala de control se arma cuando pasas a Estudio propio.',
    lock_antena: 'La antena se instala al terminar el capítulo 1 (o al entrar con tu cuenta).',
    lock_buzon: 'Crea una cuenta para recibir regalos en tu buzón.',
    antena_vacia: 'Liga, Copa y Duelos contra otras productoras.',
    buzon_vacio: 'No tienes regalos por reclamar.', buzon_abrir: 'Abrir buzón',
    aria_ofertas: '{n} ofertas', aria_reparar: '{n} equipos por reparar', aria_reclamar: 'hay algo para reclamar', aria_nuevo: 'hay novedades',
    ahora_primer: 'Prepara tu primer evento: tienes {n} ofertas', ahora_ofertas: 'Prepara un evento: tienes {n} ofertas',
    ahora_oferta1: 'Prepara un evento: tienes 1 oferta', ahora_buscar: 'Busca clientes: redes, anuncio o visita',
    ahora_premio: 'Reclama tu premio en la pizarra', ahora_logros: 'Reclama tus logros en la vitrina',
    ahora_buzon: 'Tienes regalos en el buzón', ahora_temporada: 'Evento especial: mira la oferta en la pizarra',
    cap: 'Capítulo {n}', cap_libre: 'Modo libre',
  };
  const t = (k, p) => String(TX[k] || k).replace(/\{(\w+)\}/g, (m, x) => (p && p[x] != null ? String(p[x]) : m));
  const esc = (v) => String(v == null ? '' : v).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const K = () => (root.Art && root.Art._k) || null;
  const U = (k) => `url(#am-${k})`;
  const lsGet = (k) => { try { return JSON.parse(root.localStorage.getItem(k)); } catch (e) { return null; } };
  const lsSet = (k, v) => { try { root.localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* nada */ } };

  /* ---------- Geometría (viewBox 0 0 360 400) ---------- */
  const VB_W = 360, VB_H = 400;
  const ROWS = [{ y: 96, h: 76 }, { y: 180, h: 76 }, { y: 264, h: 80 }];   // arriba, medio, planta baja (piso 344)
  const COLS = [{ x: 14, w: 106 }, { x: 127, w: 106 }, { x: 240, w: 106 }];
  const SUELO = 344;
  // Lugares: cuarto (fila, columna) o rectángulo [x, y, w, h]; color de la franja de la etiqueta
  const LUGARES = [
    { k: 'logros', r: 0, c: 0, ic: 'gem', col: '#ffd27a', mods: ['logros'] },
    { k: 'historia', r: 0, c: 1, ic: 'flag', col: '#ffb020', extras: ['historia', 'ultimo', 'ayuda'] },
    { k: 'control', r: 0, c: 2, ic: 'rec', col: '#ff3b3b', tab: 'registro', lock: (d) => d.etapa < 2 && t('lock_control') },
    { k: 'misiones', r: 1, c: 0, ic: 'target', col: '#2ecc71', mods: ['diario', 'misiones', 'temporadas'] },
    { k: 'sala', r: 1, c: 1, ic: 'planta', col: '#ff8fb1', mods: ['decoracion', 'visitas'] },
    { k: 'personal', r: 1, c: 2, ic: 'people', col: '#4da3ff', tab: 'personal' },
    { k: 'flota', r: 2, c: 0, ic: 'unidad_movil', col: '#c5ccd6', mods: ['flota'] },
    { k: 'clientes', r: 2, c: 1, ic: 'clients', col: '#ff3b3b', tab: 'clientes' },
    { k: 'bodega', r: 2, c: 2, ic: 'box', col: '#ffb020', tab: 'bodega' },
    { k: 'antena', rect: [14, 26, 104, 62], ic: 'online', col: '#5ad1ff', abajo: true, mods: ['servidores', 'edad_servidor', 'copa', 'estrellas'], lock: (d) => !d.tutorial && !d.logueado && t('lock_antena') },
    { k: 'sede', rect: [136, 46, 164, 44], ic: 'home', col: '#ff3b3b', abajo: true, extras: ['local'], mods: ['sede'], extras2: ['cuenta'] },
    { k: 'buzon', rect: [104, 344, 50, 54], ic: 'gift', col: '#ffd27a', mods: ['buzon'], abajo: true, sinObra: true, lock: (d) => !d.logueado && t('lock_buzon') },
  ];
  const POR_K = {};
  LUGARES.forEach((L) => { POR_K[L.k] = L; });
  // Módulo → lugar (los que no están aquí van a su { hub } o a "Más")
  const MAPA = {};
  LUGARES.forEach((L) => (L.mods || []).forEach((m) => { MAPA[m] = L.k; }));
  ['pase', 'vip', 'impulsos'].forEach((m) => { MAPA[m] = 'mas'; });
  const rectDe = (L) => (L.rect ? L.rect : [COLS[L.c].x, ROWS[L.r].y, COLS[L.c].w, ROWS[L.r].h]);
  const lugarDeModulo = (m) => (m && m.hub && (POR_K[m.hub] || m.hub === 'mas') ? m.hub : MAPA[m && m.id] || 'mas');

  /* =========================================================
     Dibujo
     ========================================================= */
  const SKIN = [
    { fach: '#6e4234', fach2: '#5a3328', losa: '#3e2620', borde: '#8f5b47', piso: '#4a3f38', luz: 'foco' },   // garaje: ladrillo y lata
    { fach: '#4e596b', fach2: '#434d5e', losa: '#323a48', borde: '#6f7b8f', piso: '#5a4636', luz: 'panel' },  // oficina alquilada
    { fach: '#26324a', fach2: '#1f2a40', losa: '#161e30', borde: '#d42a30', piso: '#2c3242', luz: 'spot' },   // estudio propio
    { fach: '#1b2436', fach2: '#16202f', losa: '#0f1522', borde: '#5ad1ff', piso: '#262e3e', luz: 'spot' },   // centro de producción
  ];
  const r1 = (n) => Math.round(n * 10) / 10;

  // Fondo de un cuarto (coordenadas locales: 0..w, 0..h; piso en h-9)
  function cuarto(w, h, pared, sk, noche, etapa, abierto) {
    const F = h - 9;
    const luz = noche ? 0.16 : 0.07;
    let fx = '';
    if (sk.luz === 'foco') fx = `<path d="M${w / 2} 0v5" stroke="#8b95a8" stroke-width=".8"/><circle cx="${w / 2}" cy="6.5" r="2.2" fill="#ffd27a"/>`;
    else if (sk.luz === 'panel') fx = `<rect x="${w / 2 - 14}" y="0" width="28" height="2.4" rx="1" fill="#e9edf5" opacity=".85"/>`;
    else fx = [0.25, 0.75].map((f) => `<path d="M${w * f - 3} 0h6l-1 3h-4z" fill="#14171d"/><circle cx="${w * f}" cy="3.4" r="1.2" fill="#fffbe0"/>`).join('');
    const cono = sk.luz === 'spot'
      ? [0.25, 0.75].map((f) => `<path d="M${w * f - 2} 3h4l14 ${F - 3}h-32z" fill="#ffe9b8" opacity="${luz}"/>`).join('')
      : `<path d="M${w / 2 - 6} 3h12l26 ${F - 3}h-64z" fill="#ffe9b8" opacity="${luz}"/>`;
    return `<rect width="${w}" height="${h}" fill="${pared}"/>${abierto || ''}
      <rect y="${F - 14}" width="${w}" height="14" fill="#000" opacity=".12"/>
      <rect y="${F}" width="${w}" height="9" fill="${sk.piso}"/><path d="M0 ${F}h${w}" stroke="#000" stroke-opacity=".45" stroke-width="1.2"/>
      ${etapa >= 3 ? `<path d="M0 ${F + 4}h${w}" stroke="#fff" stroke-opacity=".08"/>` : ''}
      ${cono}${fx}<rect width="${w}" height="3" fill="#000" opacity=".3"/>`;
  }
  // Persona sencilla (pies en y)
  const persona = (x, y, ropa, piel, k, extra) => `<g transform="translate(${x} ${y}) scale(${k || 1})"><path d="M-1.4-7v7M1.4-7v7" stroke="#22283a" stroke-width="2" stroke-linecap="round"/>
    <rect x="-3.4" y="-16" width="6.8" height="9.5" rx="2.4" fill="${ropa}"/><circle cy="-19" r="3" fill="${piel}"/><path d="M-3-19.4a3 3 0 016 0z" fill="#2a1a14"/>${extra || ''}</g>`;
  const ROPA = ['#d42a30', '#2f6fb3', '#2f8f5b', '#b38a2f', '#8a3b8a', '#e9edf5', '#14171d'];
  const PIEL = ['#c98a5e', '#8d5a3b', '#e0b48c', '#a8714a'];

  /* --- cada cuarto --- */
  function dFlota(w, h, sk, noche, info, k) {
    const F = h - 9;
    const puerta = `<rect width="${w}" height="11" fill="#5b6476"/>${[2, 5, 8].map((y) => `<path d="M0 ${y}h${w}" stroke="#3a4150" stroke-width=".8"/>`).join('')}<path d="M0 11h${w}" stroke="#14171d" stroke-width="1.4"/>`;
    const tablero = `<rect x="6" y="18" width="24" height="18" fill="#7a6248"/>${[[10, 22, 8], [18, 21, 9], [25, 23, 7]].map(([x, y, l]) => `<path d="M${x} ${y}v${l}" stroke="#c5ccd6" stroke-width="1.4" stroke-linecap="round"/>`).join('')}`;
    let dentro;
    if (info.vehiculos > 0) {
      // El vehículo de verdad (js/movilizacion.js); si no está, la unidad móvil de la sede
      let v = '';
      try { const Mv = root.Movilizacion; if (Mv && Mv.dibujo && Mv.vehPropio && info.vehTipo) v = Mv.dibujo(Mv.vehPropio(info.vehTipo, info.nombre || ''), 96, 46).replace('<svg ', `<svg x="5" y="${F - 44}" `); } catch (e) { v = ''; }
      const kk = 0.9;
      dentro = (v ? `<ellipse cx="53" cy="${F + 1}" rx="44" ry="3" fill="#000" opacity=".4"/>${v}` : k.vanSide(12, r1(F - 34 * kk), kk, info.etapa >= 2, false))
        + (info.vehiculos > 1 ? `<rect x="88" y="${F - 30}" width="14" height="5" rx="1" fill="#14171d"/><text x="95" y="${F - 26}" font-size="4.6" font-family="${k.FONT_D}" fill="#fff" text-anchor="middle">+${info.vehiculos - 1}</text>` : '');
    } else {
      dentro = `<ellipse cx="${w / 2}" cy="${F + 3}" rx="24" ry="2.6" fill="#000" opacity=".35"/>
        <rect x="44" y="17" width="28" height="17" rx="1.5" fill="#f5c542"/><path d="M44 30h28" stroke="#14171d" stroke-width="2.4" stroke-dasharray="2.4 2.4"/>
        <rect x="50" y="20" width="16" height="6" rx="1" fill="#14171d"/><path d="M53 23h10" stroke="#f5c542" stroke-width="1.2"/>
        <path d="M86 ${F}l4-14 4 14z" fill="#ff7a1f"/><path d="M87.4 ${F - 6}h5.2" stroke="#fff" stroke-width="1.6"/><rect x="83" y="${F - 1}" width="14" height="2" fill="#c45a12"/>`;
    }
    return cuarto(w, h, noche ? '#3c4250' : '#454b58', sk, noche, info.etapa) + puerta + tablero + dentro;
  }
  function dClientes(w, h, sk, noche, info) {
    const F = h - 9, e = info.etapa;
    const pared = e >= 2 ? '#2d3c55' : noche ? '#3e4a5c' : '#4a5668';
    const puerta = `<rect x="84" y="${F - 50}" width="20" height="50" fill="#14171d"/><rect x="86" y="${F - 48}" width="16" height="46" fill="#bcd8ff" opacity="${noche ? 0.25 : 0.45}"/><circle cx="99" cy="${F - 24}" r="1" fill="#c5ccd6"/>`;
    const cartel = e >= 2
      ? `<rect x="22" y="14" width="44" height="18" rx="2" fill="#14171d"/><circle cx="30" cy="23" r="3" fill="#ff3b3b"/><path d="M36 20h24M36 25h16" stroke="#e9edf5" stroke-width="1.6"/>`
      : `<rect x="26" y="14" width="30" height="20" fill="#e9edf5"/><rect x="29" y="17" width="24" height="10" fill="#2f6fb3"/><path d="M31 31h18" stroke="#8b95a8"/>`;
    const mesa = e === 0
      ? `<rect x="10" y="${F - 20}" width="56" height="3" fill="#a9b2bf"/><path d="M14 ${F - 17}l6 17M62 ${F - 17}l-6 17" stroke="#8b95a8" stroke-width="1.4"/>`
      : `<rect x="8" y="${F - 21}" width="60" height="4" rx="1" fill="#6b4a2a"/><rect x="10" y="${F - 17}" width="56" height="17" fill="${e >= 2 ? '#c9d1dc' : '#5a3d24'}"/>${e >= 2 ? `<rect x="10" y="${F - 10}" width="56" height="2" fill="#ff3b3b"/>` : ''}`;
    const dueno = persona(38, F - 8, '#d42a30', '#c98a5e', 0.9);
    const tel = `<g transform="translate(16 ${F - 25})"><rect width="10" height="4" rx="1.4" fill="#d42a30"/><rect x="-1" y="-2.6" width="12" height="2.6" rx="1.3" fill="#a81f25"/>
      ${info.ofertas > 0 ? '<g class="hub-ring" stroke="#ffd27a" stroke-width="1" fill="none" stroke-linecap="round"><path d="M-3-5q-2 2-1 5"/><path d="M13-5q2 2 1 5"/></g>' : ''}</g>`;
    const pantalla = e >= 1 ? `<rect x="46" y="${F - 35}" width="16" height="12" rx="1" fill="#14171d"/><rect x="47.5" y="${F - 33.5}" width="13" height="9" fill="${U('lcd')}"/><path d="M54 ${F - 23}v2" stroke="#3a4150" stroke-width="1.4"/>` : `<rect x="44" y="${F - 27}" width="14" height="7" rx="1" fill="#2a2e37"/><path d="M43 ${F - 20}h16" stroke="#5b6476" stroke-width="1.4"/>`;
    const clientes = Array.from({ length: Math.min(2, info.ofertas) }, (_, i) => persona(74 + i * 8, F, ROPA[(i + 1) % ROPA.length], PIEL[(i + 2) % 4], 0.95,
      `<rect x="${i ? -7 : 3}" y="-8" width="5" height="4" rx=".6" fill="#3a2a1a"/>`)).join('');
    return cuarto(w, h, pared, info.sk, noche, e) + cartel + puerta + dueno + mesa + tel + pantalla + clientes;
  }
  function dBodega(w, h, sk, noche, info, k) {
    const F = h - 9, e = info.etapa;
    const n = Math.max(1, Math.min(12, info.equipos));
    const est = `<path d="M6 12v${F - 12}M66 12v${F - 12}" stroke="#7c8594" stroke-width="2"/>${[F - 44, F - 26, F - 8].map((y) => `<rect x="5" y="${y}" width="62" height="2.4" fill="#8b95a8"/>`).join('')}`;
    const cajas = Array.from({ length: n }, (_, i) => {
      const fila = Math.floor(i / 4), col = i % 4;   // se llena desde el estante de abajo
      if (fila > 2) return '';
      const x = 9 + col * 14, y = [F - 8, F - 26, F - 44][fila] - 11;
      return e === 0
        ? `<rect x="${x}" y="${y}" width="12" height="11" fill="#b08a5a"/><path d="M${x} ${y + 3}h12M${x + 6} ${y}v3" stroke="#8a6a40" stroke-width=".8"/>`
        : `<rect x="${x}" y="${y}" width="12" height="11" rx="1.2" fill="#2a2e37" stroke="#8b95a8" stroke-width=".6"/><rect x="${x + 4}" y="${y + 4}" width="4" height="2" fill="${['#ffb020', '#4da3ff', '#2ecc71', '#ff3b3b'][i % 4]}"/>`;
    }).join('');
    const cam = k.sceneCam(88, r1(F - 31 * 0.55), info.camTipo || 'cam_basic', 0.55);
    const dano = info.danos > 0 ? `<g transform="translate(24 ${F - 40})" class="hub-chispa"><path d="M0-9l8 14H-8z" fill="#ffb020" stroke="#14171d" stroke-width=".8"/><path d="M0-4v4" stroke="#14171d" stroke-width="1.6"/><circle cy="2.6" r=".9" fill="#14171d"/></g>
      <g stroke="#ffd27a" stroke-width=".9" stroke-linecap="round" class="hub-chispa"><path d="M82 ${F - 46}l-3-3M96 ${F - 46}l3-3M89 ${F - 50}v-4"/></g>` : '';
    return cuarto(w, h, noche ? '#3d3833' : '#4a443d', sk, noche, e) + est + cajas + cam + dano;
  }
  function dMisiones(w, h, sk, noche, info) {
    const F = h - 9, e = info.etapa;
    const osc = e === 0 || e >= 2;   // pizarra verde (garaje) o pantalla (estudio y centro)
    const pizarra = `<rect x="6" y="19" width="56" height="30" rx="1.5" fill="${e === 0 ? '#2f4a3a' : e >= 2 ? '#0b0d12' : '#f4f6f9'}" stroke="${e >= 2 ? '#3a4150' : '#8b95a8'}" stroke-width="1.4"/>
      ${[0, 1, 2].map((i) => `<rect x="11" y="${24 + i * 8}" width="5" height="5" fill="none" stroke="${osc ? '#e9edf5' : '#3a4150'}" stroke-width=".8"/>${i < info.misHechas ? `<path d="M11.6 ${26.4 + i * 8}l1.6 1.8 3-4" stroke="#2ecc71" stroke-width="1.3" fill="none"/>` : ''}<path d="M20 ${26.5 + i * 8}h${30 - i * 6}" stroke="${e >= 2 ? ['#2ecc71', '#ffb020', '#4da3ff'][i] : osc ? '#c9d1dc' : '#5b6476'}" stroke-width="1.4"/>`).join('')}`;
    const cal = `<rect x="74" y="20" width="26" height="24" rx="1.5" fill="#f4f6f9"/><rect x="74" y="20" width="26" height="6" rx="1.5" fill="#d42a30"/>
      <text x="87" y="40.5" font-size="13" font-weight="800" text-anchor="middle" font-family="${K().FONT_D}" fill="#14171d">${esc(info.dia)}</text>`;
    const mesa = `<rect x="52" y="${F - 13}" width="46" height="3" fill="#6b4a2a"/><path d="M56 ${F - 10}v10M94 ${F - 10}v10" stroke="#4a3a2e" stroke-width="1.6"/>`;
    const regalo = info.premio
      ? `<g transform="translate(62 ${F - 13})"><circle cy="-8" r="13" fill="#ffd27a" opacity=".22" class="hub-brilla"/><rect x="-8" y="-13" width="16" height="13" fill="#d42a30"/><rect x="-9" y="-16" width="18" height="4" fill="#ff5a5a"/><path d="M0-16v16" stroke="#ffd27a" stroke-width="2.4"/><path d="M0-16q-6-6-6-1t6 1q6-6 6-1t-6 1" fill="none" stroke="#ffd27a" stroke-width="1.4"/></g>`
      : `<rect x="66" y="${F - 20}" width="10" height="7" rx="1" fill="#e9edf5" opacity=".8"/><path d="M68 ${F - 18}h6" stroke="#8b95a8" stroke-width=".8"/>`;
    const silla = `<path d="M20 ${F}v-12h12v12M20 ${F - 6}h12" stroke="#5b6476" stroke-width="1.6" fill="none"/>`;
    return cuarto(w, h, noche ? '#33465a' : '#3e5268', sk, noche, e) + pizarra + cal + mesa + regalo + silla;
  }
  function dSala(w, h, sk, noche, info, abs, s) {
    // La decoración real (js/decoracion.js) en este cuarto; vacía: una banca vieja y la bombilla
    let deco = '';
    try { const D = root.Decoracion; if (D && D.capa) deco = D.capa(s, info.etapa, info.ctx, abs); } catch (e) { deco = ''; }
    if (deco) return { abs: deco };
    const F = h - 9;
    return { local: cuarto(w, h, noche ? '#363a4a' : '#3e4354', sk, noche, info.etapa)
      + `<rect x="26" y="${F - 14}" width="54" height="5" rx="1.5" fill="#6b5a48"/><path d="M30 ${F - 9}v9M76 ${F - 9}v9" stroke="#4a3a2e" stroke-width="2"/>
      <rect x="40" y="16" width="26" height="18" fill="none" stroke="#5b6476" stroke-width="1.2" stroke-dasharray="3 2"/>` };
  }
  function dPersonal(w, h, sk, noche, info) {
    const F = h - 9, e = info.etapa;
    const lockers = [0, 1, 2].map((i) => `<rect x="${70 + i * 11}" y="${F - 50}" width="10" height="50" fill="${e >= 2 ? '#3f6fa8' : '#6b7688'}"/><path d="M${72 + i * 11} ${F - 44}h6M${72 + i * 11} ${F - 41}h6" stroke="#14171d" stroke-width=".7"/><circle cx="${77.5 + i * 11}" cy="${F - 25}" r=".8" fill="#e9edf5"/>`).join('');
    const cafe = `<rect x="4" y="${F - 18}" width="26" height="18" fill="#5a4636"/><rect x="4" y="${F - 19}" width="26" height="2" fill="#7a5f48"/><rect x="8" y="${F - 30}" width="10" height="11" rx="1" fill="#14171d"/><circle cx="15.5" cy="${F - 27}" r=".8" fill="#2ecc71"/><rect x="11" y="${F - 22.5}" width="4" height="3" fill="#e9edf5"/>`;
    const n = Math.max(1, Math.min(4, info.personas));
    const gente = Array.from({ length: n }, (_, i) => persona(36 + i * 9, F, i === 0 ? '#d42a30' : ROPA[(i * 2) % ROPA.length], PIEL[i % 4], 0.95)).join('');
    return cuarto(w, h, noche ? '#3d3a4f' : '#484560', sk, noche, e) + lockers + cafe + gente;
  }
  function dLogros(w, h, sk, noche, info) {
    const F = h - 9, e = info.etapa;
    const n = Math.min(12, info.trofeos);
    const copa = (x, y, i) => { const c = i % 4 === 3 ? '#c5ccd6' : i % 5 === 4 ? '#c98a5e' : '#ffd27a'; return `<path d="M${x - 3.4} ${y - 10}h6.8v2.6a3.4 3.4 0 01-6.8 0z" fill="${c}"/><path d="M${x} ${y - 4}v2.4" stroke="${c}" stroke-width="1.4"/><rect x="${x - 2.4}" y="${y - 1.6}" width="4.8" height="1.6" fill="#6b4a2a"/>`; };
    const repisas = [F - 32, F - 14];   // abajo de la etiqueta del lugar
    const vitrina = e === 0
      ? `<rect x="14" y="${F - 18}" width="44" height="18" fill="#8a6440"/><path d="M14 ${F - 9}h44M36 ${F - 18}v18" stroke="#5a3d24" stroke-width="1"/>`
      : `<rect x="10" y="20" width="64" height="${F - 20}" fill="#1a1d24" stroke="#8b95a8" stroke-width="1.2"/>${repisas.map((y) => `<rect x="11" y="${y}" width="62" height="2" fill="#8b95a8"/>`).join('')}<path d="M12 22l18 ${F - 24}" stroke="#fff" stroke-opacity=".07" stroke-width="6"/>`;
    const copas = Array.from({ length: n }, (_, i) => {
      if (e === 0) return i < 4 ? copa(20 + i * 10, F - 18, i) : '';
      const fila = Math.floor(i / 6), col = i % 6;
      return fila < 2 ? copa(17 + col * 10, repisas[fila], i) : '';
    }).join('');
    const placa = `<rect x="80" y="18" width="20" height="26" rx="2" fill="#6b4a2a"/><circle cx="90" cy="28" r="6" fill="#ffd27a"/><path d="M90 24.5l1.1 2.3 2.5.3-1.8 1.7.5 2.5-2.3-1.2-2.3 1.2.5-2.5-1.8-1.7 2.5-.3z" fill="#c68a12"/><path d="M84 39h12" stroke="#c9a25a" stroke-width="1.2"/>`;
    return cuarto(w, h, noche ? '#3e3528' : '#4a4030', sk, noche, e) + vitrina + copas + placa;
  }
  function dHistoria(w, h, sk, noche, info) {
    const F = h - 9, e = info.etapa;
    const ventana = e >= 1 ? `<rect x="6" y="12" width="22" height="26" fill="${noche ? '#0b1222' : '#86b6e0'}" stroke="#6b7688" stroke-width="1.4"/><path d="M17 12v26M6 25h22" stroke="#6b7688" stroke-width="1"/>${noche ? '<circle cx="12" cy="17" r=".8" fill="#fff"/>' : ''}<path d="M8 38v-6h4v-4h5v10z" fill="${noche ? '#1a2338' : '#5d7a99'}"/>` : '';
    // El personaje del capítulo, en videollamada en el monitor
    let por = '';
    try { por = root.Art.portrait(info.personaje || 'ramiro', 27).replace(/^<svg class="portrait" width="27" height="27"/, `<svg class="portrait" x="${44}" y="${F - 47}" width="27" height="27"`); } catch (e2) { por = ''; }
    const monitor = `<rect x="41" y="${F - 50}" width="33" height="33" rx="2" fill="#14171d"/>${por}<path d="M57.5 ${F - 17}v4M50 ${F - 13}h15" stroke="#3a4150" stroke-width="1.6"/>`;
    const escritorio = e === 0
      ? `<rect x="34" y="${F - 13}" width="48" height="2.4" fill="#e9edf5"/><path d="M38 ${F - 11}l-3 11M78 ${F - 11}l3 11" stroke="#c5ccd6" stroke-width="1.4"/>`
      : `<rect x="32" y="${F - 13}" width="54" height="4" rx="1" fill="#6b4a2a"/><rect x="34" y="${F - 9}" width="12" height="9" fill="#5a3d24"/><rect x="72" y="${F - 9}" width="12" height="9" fill="#5a3d24"/>`;
    const libros = e >= 2 ? `<rect x="80" y="12" width="22" height="2" fill="#6b4a2a"/>${[0, 1, 2, 3, 4].map((i) => `<rect x="${81 + i * 4}" y="${4 + (i % 2)}" width="3" height="${8 - (i % 2)}" fill="${['#d42a30', '#2f6fb3', '#ffd27a', '#2f8f5b', '#8a3b8a'][i]}"/>`).join('')}${e === 3 ? '<rect x="80" y="18" width="20" height="14" fill="#c9a25a"/><rect x="82" y="20" width="16" height="10" fill="#1d3b5e"/><path d="M84 28l4-4 3 3 3-5 2 6" stroke="#ffd27a" stroke-width=".9" fill="none"/>' : ''}` : '';
    const planta = `<path d="M94 ${F}l-3-9h10l-3 9z" fill="#b5653a"/><ellipse cx="96" cy="${F - 14}" rx="6" ry="7" fill="#2f8f5b"/><ellipse cx="93" cy="${F - 18}" rx="3" ry="5" fill="#3fa86a"/>`;
    const lona = e === 0 ? `<path d="M0 0h${w}v6q-${w / 4} 6-${w / 2} 0t-${w / 2} 0z" fill="#2f6fb3" opacity=".85"/>` : '';
    return cuarto(w, h, e === 0 ? (noche ? '#4a3a32' : '#5a463b') : noche ? '#3a2f2a' : '#4a3c33', sk, noche, e) + ventana + libros + monitor + escritorio + planta + lona;
  }
  function dControl(w, h, sk, noche, info) {
    const F = h - 9, e = info.etapa;
    if (e < 2) {
      // En obra: andamio, cinta y cono
      const tubo = '#8b95a8';
      return `<rect width="${w}" height="${h}" fill="${noche ? '#232733' : '#2c313d'}"/><rect y="${F}" width="${w}" height="9" fill="#3a3430"/>
        ${[0, 1, 2, 3].map((i) => `<rect x="${8 + i * 18}" y="${16 + (i % 2) * 6}" width="16" height="${F - 16 - (i % 2) * 6}" fill="#6e4234" opacity=".55"/>`).join('')}
        <path d="M18 6v${F - 6}M60 6v${F - 6}M96 6v${F - 6}M14 26h86M14 ${F - 22}h86" stroke="${tubo}" stroke-width="2"/>
        <path d="M18 26L60 ${F - 22}M60 26L96 ${F - 22}" stroke="${tubo}" stroke-width="1.2"/>
        <rect x="14" y="${F - 24}" width="86" height="4" fill="#8a6440"/>
        <g transform="rotate(-8 53 40)"><rect x="-4" y="36" width="114" height="7" fill="#ffd21f"/><path d="M-4 36${Array.from({ length: 12 }, (_, i) => `m${i ? 6 : 2} 0l4 7h3l-4-7z`).join('')}" fill="#14171d"/></g>
        <path d="M82 ${F}l4-13 4 13z" fill="#ff7a1f"/><path d="M83.4 ${F - 5}h5.2" stroke="#fff" stroke-width="1.5"/>`;
    }
    const pant = [0, 1, 2].map((c) => [0, 1].map((f) => {
      const x = 8 + c * 31, y = 9 + f * 17, pgm = c === 1 && f === 0;
      return `<rect x="${x}" y="${y}" width="29" height="15" fill="#0b0d12" stroke="${pgm ? '#ff3b3b' : '#3a4150'}" stroke-width="${pgm ? 1.4 : 0.8}"/><rect x="${x + 1.5}" y="${y + 1.5}" width="26" height="12" fill="${['#1d3b5e', '#2f8f5b', '#4a2a5e', '#5e3b1d', '#1d4f5e', '#3b1d1d'][c * 2 + f]}"/><path d="M${x + 3} ${y + 10}h${8 + c * 4}" stroke="#e9edf5" stroke-opacity=".6"/>`;
    }).join('')).join('');
    const mesa = `<path d="M4 ${F - 12}h98l-6 12H10z" fill="#2a2e37"/><path d="M8 ${F - 12}h90" stroke="#5b6476" stroke-width="1.2"/>${Array.from({ length: 10 }, (_, i) => `<rect x="${14 + i * 8}" y="${F - 10}" width="2" height="4" fill="${i === 3 ? '#ff3b3b' : '#8b95a8'}"/>`).join('')}`;
    const operador = `<g transform="translate(40 ${F - 12})"><rect x="-5" y="-12" width="10" height="12" rx="3" fill="#14171d"/><circle cy="-15" r="3.6" fill="#2a1a14"/><path d="M-4-17a4 4 0 018 0" stroke="#5b6476" stroke-width="1.2" fill="none"/></g>`;
    const tally = `<circle cx="99" cy="6" r="4.4" fill="#ff3b3b" fill-opacity=".25" class="hqv-tally"/><circle cx="99" cy="6" r="1.7" fill="#ff3b3b" class="hqv-tally"/>`;
    return cuarto(w, h, '#151b27', sk, noche, e) + pant + mesa + operador + tally;
  }

  /* --- techo: antena y letrero --- */
  function techo(e, sk, noche, nombre, k, id) {
    const letr = (x, y, size, fill, def, maxW) => {
      const tx = (nombre || def).toUpperCase().slice(0, 24);
      const largo = tx.length * size * 0.56 > maxW;
      return `<text x="${x}" y="${y}" font-size="${size}" font-family="${k.FONT_D}" font-weight="800" fill="${fill}" text-anchor="middle"${largo ? ` textLength="${maxW}" lengthAdjust="spacingAndGlyphs"` : ''}>${esc(tx)}</text>`;
    };
    const tally = (x, y) => `<circle cx="${x}" cy="${y}" r="4.6" fill="#ff3b3b" fill-opacity=".22" class="hqv-tally"/><circle cx="${x}" cy="${y}" r="1.8" fill="#ff3b3b" class="hqv-tally"/>`;
    const ondas = (x, y) => `<g class="hqv-ondas" transform="translate(${x} ${y})" stroke="${noche ? '#7fd8ff' : '#e9f6ff'}">${[0, 0.8, 1.6].map((d) => `<path class="hqv-onda" style="animation-delay:${d}s" d="M-7-6a9 9 0 000 12M7-6a9 9 0 010 12"/>`).join('')}</g>`;
    let antena, letrero, extra = '';
    if (e === 0) {
      // techo de lata, antena de TV de casa, letrero pintado a mano sobre dos palos
      extra = `<path d="M2 92L8 84h344l6 8z" fill="#8b95a8"/>${Array.from({ length: 30 }, (_, i) => `<path d="M${10 + i * 11.6} 85v7" stroke="#5b6476" stroke-width="1"/>`).join('')}`;
      antena = `<path d="M66 86V40" stroke="#8b95a8" stroke-width="2"/>${[46, 54, 62].map((y, i) => `<path d="M${56 + i * 2} ${y}h${20 - i * 4}" stroke="#c5ccd6" stroke-width="1.4"/>`).join('')}<path d="M66 40l-12-10M66 40l12-10" stroke="#c5ccd6" stroke-width="1.4"/>`;
      letrero = `<path d="M166 86V70M296 86V70" stroke="#5a3d24" stroke-width="3"/><rect x="152" y="50" width="158" height="24" rx="2" fill="#a07a4a"/><path d="M152 58h158M152 66h158" stroke="#8a6440" stroke-width=".8"/>${letr(231, 67, 14, '#b3262c', 'PRODUCCIONES', 140)}${tally(304, 56)}`;
    } else if (e === 1) {
      extra = `<rect x="4" y="82" width="352" height="8" fill="${sk.borde}"/><rect x="250" y="58" width="22" height="24" fill="#6b7688"/><rect x="246" y="56" width="30" height="4" fill="#8b95a8"/>`;
      antena = `<path d="M66 82V44" stroke="#8b95a8" stroke-width="2"/><g transform="rotate(-25 66 54)"><ellipse cx="66" cy="54" rx="13" ry="5" fill="${U('dish')}"/><path d="M66 54v-8" stroke="#8b95a8" stroke-width="1.2"/></g>${[38, 44].map((y) => `<path d="M58 ${y}h16" stroke="#c5ccd6" stroke-width="1.2"/>`).join('')}`;
      letrero = `<path d="M170 82V74M290 82V74" stroke="#5b6476" stroke-width="3"/><rect x="150" y="50" width="162" height="25" rx="3" fill="${U('red')}"/><rect x="150" y="50" width="162" height="5" rx="2" fill="#fff" opacity=".18"/>${letr(231, 68, 15, '#fff', 'PRODUCTORA', 144)}${tally(304, 57)}<rect class="hqv-halo" x="148" y="48" width="166" height="29" rx="4" fill="none" stroke="#ff5a5a" stroke-width="1.6"/>`;
    } else if (e === 2) {
      extra = `<rect x="4" y="82" width="352" height="8" fill="#1b2438"/><path d="M4 86h352" stroke="${sk.borde}" stroke-width="2"/>`;
      antena = `<path d="M60 82L66 26L72 82M62 66h8M63 50h6M64 38h4M61 74l9-16M63 58l6-14" stroke="#8b95a8" stroke-width="1.4" fill="none"/><circle cx="66" cy="24" r="2" fill="#ff3b3b" class="blink"/>${ondas(66, 24)}
        <g transform="rotate(-30 92 70)"><ellipse cx="92" cy="70" rx="12" ry="4.6" fill="${U('dish')}"/></g><path d="M92 82v-10" stroke="#8b95a8" stroke-width="1.6"/>`;
      letrero = `<path d="M170 82V76M290 82V76" stroke="#3a4150" stroke-width="3"/><rect x="146" y="48" width="170" height="28" rx="3" fill="#0d0f14" stroke="${sk.borde}" stroke-width="2"/>${letr(240, 68, 15, '#fff', 'EN VIVO', 132)}${tally(160, 62)}<rect class="hqv-halo" x="144" y="46" width="174" height="32" rx="4" fill="none" stroke="#ff5a5a" stroke-width="1.6"/>`;
    } else {
      extra = `<rect x="4" y="82" width="352" height="8" fill="#0f1522"/><path d="M4 89h352" stroke="${sk.borde}" stroke-width="1.6" opacity=".8"/>
        <ellipse cx="128" cy="80" rx="12" ry="3" fill="#2a3242"/><text x="128" y="82" font-size="5" font-family="${k.FONT_D}" fill="#8b95a8" text-anchor="middle">H</text>`;
      antena = `<path d="M56 82L62 18L68 82M58 66h8M59 50h6M60 34h4M57 74l9-16M59 58l6-14" stroke="#c5ccd6" stroke-width="1.4" fill="none"/><circle cx="62" cy="16" r="2.2" fill="#ff3b3b" class="blink"/>${ondas(62, 16)}
        ${[[88, 64, 14], [106, 72, 9]].map(([x, y, r]) => `<g transform="rotate(-32 ${x} ${y})"><ellipse cx="${x}" cy="${y}" rx="${r}" ry="${r * 0.4}" fill="${U('dish')}"/><path d="M${x} ${y}v-${r * 0.6}" stroke="#8b95a8"/></g><path d="M${x} 82v-${82 - y - 2}" stroke="#8b95a8" stroke-width="1.6"/>`).join('')}`;
      letrero = `<path d="M176 82V78M286 82V78" stroke="#3a4150" stroke-width="3"/><rect x="144" y="44" width="174" height="34" rx="3" fill="#05070b" stroke="#2a3242" stroke-width="1.4"/>
        <rect x="147" y="47" width="168" height="28" fill="url(#${id}led)" opacity=".35"/>${letr(236, 67, 16, '#fff', 'EN VIVO', 140)}${tally(156, 54)}<rect class="hqv-halo" x="142" y="42" width="178" height="38" rx="4" fill="none" stroke="#5ad1ff" stroke-width="1.6"/>`;
    }
    return { extra, antena, letrero };
  }

  /* --- la escena completa --- */
  function escena(s, info) {
    const k = K();
    const A = root.Art;
    if (!k || !A || !s) return A && A.hq ? A.hq(s) : '';
    try {
      const e = Math.max(0, Math.min(3, info.etapa | 0));
      const sk = SKIN[e];
      const noche = ((s.day || 1) % 2) === 0;
      const id = k.uid('hb');
      const inline = k.ensureShared() ? '' : `<defs>${k.sharedDefs()}</defs>`;
      const inf = Object.assign({ sk }, info, { etapa: e });
      // cielo
      const cielo = noche
        ? `<path d="${[[20, 10], [90, 18], [150, 6], [330, 14], [210, 4], [310, 30], [48, 26], [250, 20], [120, 2], [178, 26]].map(([x, y]) => `M${x} ${y}h1.2v1.2h-1.2z`).join('')}" fill="#e9edf5" opacity=".8"/><circle cx="266" cy="22" r="9" fill="#f4f1d0"/><circle cx="270" cy="19" r="8" fill="#0b1222"/><circle cx="266" cy="22" r="20" fill="#f4f1d0" opacity=".06"/>`
        : `<circle cx="266" cy="22" r="12" fill="#ffe9a3"/><circle cx="266" cy="22" r="24" fill="#ffe9a3" opacity=".22"/>
          ${[[30, 20, 0.9, 0], [200, 12, 0.8, -7], [330, 52, 0.6, -13]].map(([x, y, kk, d]) => `<g transform="translate(${x} ${y}) scale(${kk})"><g class="hqv-nube" style="animation-delay:${d}s"><path d="M-18 4a8 8 0 018-10 12 12 0 0122-2 9 9 0 018 12z" fill="#fff" opacity=".9"/></g></g>`).join('')}`;
      const ciudad = `<path d="M0 92V60h18v-8h14v40h10V44h22v48M300 92V50h16v-6h14v48h12V62h18v30" fill="${noche ? '#111a2c' : '#7a95b0'}" opacity="${noche ? 1 : 0.55}"/>
        ${noche ? [[6, 66], [22, 58], [48, 52], [56, 64], [306, 56], [320, 50], [348, 70]].map(([x, y]) => `<rect x="${x}" y="${y}" width="3" height="3" fill="#ffd27a" opacity=".6"/>`).join('') : ''}`;
      const vida = k.vidaSede(s, e, noche, id);
      const T = techo(e, sk, noche, info.nombre, k, id);
      // fachada con los huecos de los cuartos
      const fach = `<rect x="8" y="88" width="344" height="${SUELO - 88}" fill="${sk.fach}"/>
        ${e === 0 ? Array.from({ length: 22 }, (_, i) => `<path d="M8 ${96 + i * 11.4}h344" stroke="${sk.fach2}" stroke-width="1"/>`).join('') : ''}
        ${e === 1 ? [120, 233].map((x) => `<rect x="${x + 1}" y="100" width="5" height="240" fill="${sk.fach2}"/>`).join('') + '<rect x="10" y="150" width="4" height="10" fill="#8b95a8"/><rect x="346" y="232" width="4" height="10" fill="#8b95a8"/>' : ''}
        ${e === 2 ? `<rect x="8" y="88" width="4" height="${SUELO - 88}" fill="${sk.borde}"/><rect x="348" y="88" width="4" height="${SUELO - 88}" fill="${sk.borde}"/>` : ''}
        ${e === 3 ? `<path d="M8 92h344" stroke="${sk.borde}" stroke-width="1.4" opacity=".7"/>${[11, 122, 235, 349].map((x) => `<path d="M${x} 92V${SUELO}" stroke="#5ad1ff" stroke-opacity=".35" stroke-width="1.2"/>`).join('')}` : ''}
        ${[172, 256].map((y) => `<rect x="8" y="${y}" width="344" height="8" fill="${sk.losa}"/>${e >= 2 ? `<rect x="8" y="${y + 3}" width="344" height="1.6" fill="${sk.borde}" opacity="${e === 3 ? 0.8 : 1}"/>` : ''}`).join('')}
        ${e === 2 ? `<rect x="8" y="${SUELO - 2}" width="344" height="2" fill="${sk.borde}"/>` : ''}
        ${e === 3 ? `<rect x="8" y="${SUELO - 2}" width="344" height="2" fill="#5ad1ff" opacity=".8"/>` : ''}`;
      // cuartos
      const cuartos = LUGARES.filter((L) => L.r != null).map((L) => {
        const [x, y, w, h] = rectDe(L);
        let local = '', abs = '';
        if (L.k === 'flota') local = dFlota(w, h, sk, noche, inf, k);
        else if (L.k === 'clientes') local = dClientes(w, h, sk, noche, inf);
        else if (L.k === 'bodega') local = dBodega(w, h, sk, noche, inf, k);
        else if (L.k === 'misiones') local = dMisiones(w, h, sk, noche, inf);
        else if (L.k === 'personal') local = dPersonal(w, h, sk, noche, inf);
        else if (L.k === 'logros') local = dLogros(w, h, sk, noche, inf);
        else if (L.k === 'historia') local = dHistoria(w, h, sk, noche, inf);
        else if (L.k === 'control') local = dControl(w, h, sk, noche, inf);
        else if (L.k === 'sala') { const r = dSala(w, h, sk, noche, inf, [x, y, w, h], s); local = r.local || ''; abs = r.abs || ''; }
        const cp = `${id}c${L.k}`;
        return `<g class="hub-cuarto" data-cuarto="${L.k}">${local ? `<clipPath id="${cp}"><rect width="${w}" height="${h}"/></clipPath><g transform="translate(${x} ${y})" clip-path="url(#${cp})">${local}</g>` : ''}${abs}
          <rect x="${x}" y="${y}" width="${w}" height="${h}" fill="none" stroke="#000" stroke-opacity=".35" stroke-width="1.4"/></g>`;
      }).join('');
      // vapor de la cafetera (si la hay en la sala)
      let vapor = '';
      try {
        const D = root.Decoracion;
        if (D && D.lista && s.decor && D.lista(s).some((x) => x.activo && x.it && x.it.k === 'cafetera')) {
          const [x, y, w, h] = rectDe(POR_K.sala);
          let kk = h / 80; if (200 * kk > w) kk = w / 200;
          const cx = x + (w - 200 * kk) / 2 + 21 * kk, cy = y + h - 80 * kk + 43.6 * kk;
          const humo = (hx, d) => `<path class="hqv-humo" style="animation-delay:${d}s" d="M${hx} ${r1(cy)}q-.9-1.3 0-2.6t0-2.6"/>`;
          vapor = `<g class="hq-vida hqv-vapor">${humo(r1(cx - 0.7), 0)}${humo(r1(cx + 0.8), 1.8)}</g>`;
        }
      } catch (err) { vapor = ''; }
      const cosm = k.cosmeticosSede ? k.cosmeticosSede(s, 236, 44) : { cielo: '', piso: '' };
      const calle = `<rect x="0" y="${SUELO}" width="360" height="${VB_H - SUELO}" fill="${noche ? '#141823' : '#4a5160'}"/>
        <rect x="0" y="${SUELO}" width="360" height="28" fill="${noche ? '#1f2532' : '#8f99aa'}"/>${Array.from({ length: 12 }, (_, i) => `<path d="M${i * 32} ${SUELO}v28" stroke="${noche ? '#2a3242' : '#7c8594'}"/>`).join('')}
        <rect x="0" y="${SUELO + 28}" width="360" height="3" fill="${noche ? '#2a3242' : '#c5ccd6'}"/>
        <path d="M0 ${SUELO + 44}h360" stroke="${noche ? '#2a3242' : '#e9edf5'}" stroke-width="1.4" stroke-dasharray="12 9" opacity=".6"/>`;
      // buzón en la vereda
      const buzon = `<g transform="translate(128 ${SUELO + 22})"><path d="M0 0v-12" stroke="#3a4150" stroke-width="2.4"/><rect x="-8" y="-24" width="16" height="12" rx="6" fill="#2f6fb3"/><rect x="-8" y="-18" width="16" height="6" fill="#2f6fb3"/><path d="M-5-17h10" stroke="#14171d" stroke-width="1.4"/>
        ${info.buzon > 0 ? '<path d="M8-24v-8h6v4h-6" fill="#ff3b3b" stroke="#ff3b3b" stroke-width="1"/>' : '<path d="M8-14v-8" stroke="#8b95a8" stroke-width="1.2"/>'}</g>`;
      const poste = `<path d="M354 ${SUELO + 26}V${SUELO - 40}h-8" stroke="#3a4150" stroke-width="2" fill="none"/>${noche ? `<g class="hqv-poste"><circle cx="346" cy="${SUELO - 38}" r="2.5" fill="#ffd27a"/><path d="M344 ${SUELO - 36}h4l14 60h-32z" fill="${U('poolW')}"/></g>` : `<circle cx="346" cy="${SUELO - 38}" r="2.5" fill="#8b95a8"/>`}`;
      const ledDef = e === 3 ? `<linearGradient id="${id}led" x1="0" x2="1"><stop offset="0" stop-color="#ff3b3b"/><stop offset=".5" stop-color="#b04dff"/><stop offset="1" stop-color="#4da3ff"/></linearGradient>` : '';
      const label = info.local || '';
      return `<svg class="hq hub-svg" viewBox="0 0 ${VB_W} ${VB_H}" role="img" aria-label="${esc(label)}" data-etapa="${e}" data-noche="${noche ? 1 : 0}">
        ${inline}<defs>${ledDef}</defs>
        <rect width="${VB_W}" height="${SUELO}" fill="${noche ? U('night') : U('day')}"/>
        ${cielo}<g transform="translate(0 24)">${vida.cielo}</g>${ciudad}
        ${T.extra}${T.antena}${T.letrero}
        <g transform="translate(0 8)">${cosm.cielo}</g>
        ${fach}${cuartos}${vapor}
        ${calle}${buzon}<g transform="translate(0 222)">${cosm.piso}</g>
        <g transform="translate(0 215)">${vida.gente}</g>${poste}<g transform="translate(0 245)">${vida.trafico}</g>
        <rect x="6" y="5" width="${Math.min(240, Math.round(label.length * 6.4 + 18))}" height="19" rx="9.5" fill="#0d0f14cc" stroke="#2a3242"/>
        <text x="15" y="18.4" font-size="11" font-family="${k.FONT_B}" font-weight="600" fill="#e9edf5">${esc(label)}</text>
      </svg>`;
    } catch (err) {
      try { console.error('[hub escena]', err); } catch (e2) { /* nada */ }
      return A.hq(s);
    }
  }

  /* =========================================================
     El hub de Inicio (botones sobre la escena, hoja de abajo)
     ========================================================= */
  const VISTOS = 'envivo_hub_vistos';
  const CLAIM = '[data-acc="reclamar"],[data-acc="todo"],[data-acc="cofre"],[data-acc="tarjeta"],[data-acc="fondo_todo"],[data-acc="mensual"],[data-acc="flores"],[data-acc="reparar"],.btn.green';
  let D = null;           // datos del último pintado (ui.js)
  let abierta = null;     // lugar con la hoja abierta
  let vistos = null;

  let memo = new Map();   // lo analizado en este pintado (el mismo html se mira varias veces)
  function analizar(html) {
    if (!html || !doc) return { claim: 0, firma: '' };
    if (memo.has(html)) return memo.get(html);
    const r = analizar0(html);
    memo.set(html, r);
    return r;
  }
  function analizar0(html) {
    try {
      const tp = doc.createElement('template');
      tp.innerHTML = html;
      const c = tp.content;
      // Botones para reclamar que se pueden usar (los cofres bloqueados o ya abiertos solo muestran qué traen)
      const claim = [...c.querySelectorAll(CLAIM)].filter((b) => !b.hasAttribute('disabled') && !/\b(bloq|hecho|lock|ok)\b/.test(b.className)).length;
      const tit = [...c.querySelectorAll('h2,h3,.story-tag')].map((x) => x.textContent.trim());
      const bot = [...c.querySelectorAll('.btn.main:not([disabled]),.btn.green:not([disabled])')].map((x) => (x.dataset.act || x.dataset.acc || '') + x.textContent.replace(/[\d.,$%:+\-]+/g, '').trim());
      const s = tit.concat(bot).join('|');
      let h = 0;
      for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
      return { claim, firma: s ? String(h) : '' };
    } catch (e) { return { claim: 0, firma: '' }; }
  }

  // Contenido de cada lugar: módulos (en su orden) + extras que manda ui.js
  function contenido(k) {
    const d = D;
    if (!d) return [];
    const L = POR_K[k] || {};
    const out = [];
    (L.extras || []).forEach((x) => { if (d.extras && d.extras[x]) out.push({ id: x, html: d.extras[x], extra: true }); });
    (d.modulos || []).forEach((m) => { if (m.html && lugarDeModulo(m) === k) out.push({ id: m.id, html: m.html }); });
    (L.extras2 || []).forEach((x) => { if (d.extras && d.extras[x]) out.push({ id: x, html: d.extras[x], extra: true }); });
    return out;
  }
  function estadoLugar(k) {
    const d = D;
    const L = POR_K[k];
    const lock = L && L.lock ? L.lock(d) : false;
    if (lock) return { lock };
    if (k === 'clientes') return { n: d.ofertas, tono: 'red' };
    if (k === 'bodega') return { n: d.danos, tono: 'amb' };
    if (L && L.tab) return {};
    const xs = contenido(k).filter((x) => !(x.extra && (x.id === 'ultimo' || x.id === 'ayuda')));
    let claim = 0, firma = '';
    xs.forEach((x) => { const a = analizar(x.html); claim += a.claim; firma += a.firma; });
    if (claim) return { claim, firma };
    if (firma && vistos && vistos[k] == null) { vistos[k] = firma; lsSet(VISTOS, vistos); }   // lo primero que se ve no es "nuevo"
    return { nuevo: !!firma && !!vistos && vistos[k] !== firma, firma };
  }

  function boton(L, st) {
    const [x, y, w, h] = rectDe(L);
    const pc = (v, tot) => `${(v / tot * 100).toFixed(3)}%`;
    const lbl = st.lock && !L.sinObra ? t('obra') : t('l_' + L.k);
    let badge = '', aria = t('l_' + L.k), cls = '';
    if (st.lock) { cls = ' lock'; aria += ': ' + st.lock; }
    else if (st.n > 0) { badge = `<span class="hs-b ${st.tono === 'amb' ? 'amb' : ''}">${st.n > 99 ? '99+' : st.n}</span>`; aria += ': ' + t(L.k === 'clientes' ? 'aria_ofertas' : 'aria_reparar', { n: st.n }); cls = ' pide'; }
    else if (st.claim) { badge = '<span class="hs-b amb">!</span>'; aria += ': ' + t('aria_reclamar'); cls = ' pide'; }
    else if (st.nuevo) { badge = '<span class="hs-b nuevo"></span>'; aria += ': ' + t('aria_nuevo'); }
    const act = !st.lock && L.tab ? `data-act="tab" data-tab="${L.tab}"` : '';
    const I = D.I || (() => '');
    return `<button type="button" class="hs${cls}${L.abajo ? ' abajo' : ''}${L.rect ? ' afuera' : ''}" data-hub="${L.k}" ${act} style="left:${pc(x, VB_W)};top:${pc(y, VB_H)};width:${pc(w, VB_W)};height:${pc(h, VB_H)};--hc:${L.col}" aria-label="${esc(aria)}">
      <span class="hs-pill">${I(st.lock ? 'lock' : L.ic, 'sm')}<b>${esc(lbl)}</b></span>${badge}</button>`;
  }

  function ahora() {
    const d = D;
    if (d.danos > 0 && d.dnstrip) return d.dnstrip;
    const ofertas = d.ofertas || 0;
    const btn = (attrs, ic, txt, tono) => `<button type="button" class="hub-ahora ${tono || ''}" ${attrs}><span class="ha-ic">${d.I(ic, 'sm')}</span><span class="grow">${esc(txt)}</span><span class="ha-fl" aria-hidden="true">&#8250;</span></button>`;
    const primer = !(d.S.stats && d.S.stats.events);
    if (primer && ofertas) return btn('data-act="tab" data-tab="clientes"', 'clients', t('ahora_primer', { n: ofertas }), 'roja');
    // Evento especial de temporada con su oferta (js/temporadas.js): que no se pierda dentro de la pizarra
    const tm = (d.modulos || []).find((m) => m.id === 'temporadas');
    if (tm && /data-acc="oferta"/.test(tm.html || '')) return btn('data-hub="misiones"', 'calendar', t('ahora_temporada'), 'ambar');
    const em = estadoLugar('misiones');
    if (em.claim) return btn('data-hub="misiones"', 'gift', t('ahora_premio'), 'ambar');
    const bz = estadoLugar('buzon');
    if (bz.claim) return btn('data-hub="buzon"', 'gift', t('ahora_buzon'), 'ambar');
    const lg = estadoLugar('logros');
    if (lg.claim) return btn('data-hub="logros"', 'gem', t('ahora_logros'), 'ambar');
    if (ofertas) return btn('data-act="tab" data-tab="clientes"', 'clients', ofertas === 1 ? t('ahora_oferta1') : t('ahora_ofertas', { n: ofertas }), 'roja');
    return btn('data-act="tab" data-tab="clientes"', 'social', t('ahora_buscar'), '');
  }

  function capitulo() {
    const d = D, c = d.cap;
    if (!c) return '';
    const st = estadoLugar('historia');
    return `<button type="button" class="hub-cap" data-hub="historia" aria-label="${esc(c.titulo)}">
      <span class="hc-por">${d.A.portrait(d.personaje || 'ramiro', 44)}</span>
      <span class="hc-tx"><small>${esc(c.tag)}${c.titulo ? ` · ${esc(c.titulo)}` : ''}</small><b>${esc(c.objetivo)}</b>${c.progreso ? `<span class="hc-pr num">${esc(c.progreso)}</span>` : ''}</span>
      ${st.nuevo ? '<span class="hs-b nuevo" style="position:static;flex:none"></span>' : ''}</button>`;
  }

  function masEstado() {
    let claim = 0;
    (D.modulos || []).forEach((m) => { if (m.html && lugarDeModulo(m) === 'mas') claim += analizar(m.html).claim; });
    return claim;
  }

  /** Bloque de Inicio. d: datos que arma ui.js (ver datosHub en ui.js). */
  function inicio(d) {
    D = d;
    memo = new Map();
    ponerCss();
    if (!vistos) vistos = lsGet(VISTOS);
    const primera = !vistos;
    if (primera) vistos = {};
    const estados = {};
    LUGARES.forEach((L) => { estados[L.k] = estadoLugar(L.k); });
    // Primera vez: lo que hay ya cuenta como visto (sin puntos en todo)
    if (primera) { LUGARES.forEach((L) => { if (estados[L.k].firma) { vistos[L.k] = estados[L.k].firma; estados[L.k].nuevo = false; } }); lsSet(VISTOS, vistos); }
    // Lo que está abierto se da por visto
    if (abierta && estados[abierta] && estados[abierta].firma && vistos[abierta] !== estados[abierta].firma) { vistos[abierta] = estados[abierta].firma; estados[abierta].nuevo = false; lsSet(VISTOS, vistos); }
    const mc = masEstado();
    const html = `<div class="card hqcard hubcard" data-etapa="${d.etapa}"><div class="hub">${escena(d.S, { etapa: d.etapa, nombre: d.nombre, local: d.local, ofertas: d.ofertas, danos: d.danos,
      equipos: d.equipos, camTipo: d.camTipo, vehiculos: d.vehiculos, vehTipo: d.vehTipo, personas: d.personas, trofeos: d.trofeos, dia: d.S.day, premio: !!estados.misiones.claim,
      misHechas: d.misHechas || 0, personaje: d.personaje, buzon: estados.buzon.claim || 0, ctx: d.ctx })}
      ${LUGARES.map((L) => boton(L, estados[L.k])).join('')}
      <button type="button" class="hub-mas" data-hub="mas" aria-label="${esc(t('mas'))}"><span aria-hidden="true">&#8943;</span>${mc ? '<span class="hs-b amb">!</span>' : ''}</button>
      </div></div>
      ${ahora()}${capitulo()}${abierta ? hojaHtml(abierta) : ''}`;
    // La hoja abierta se pinta otra vez con lo nuevo: se queda donde estaba
    if (abierta && doc) {
      const v = doc.querySelector('#hubSheet .hub-sh');
      const sc = v ? v.scrollTop : 0;
      if (sc) setTimeout(() => { const n = doc.querySelector('#hubSheet .hub-sh'); if (n) n.scrollTop = sc; }, 0);
    }
    return html;
  }

  /* ---------- Hoja de abajo ----------
     Va dentro de #tab-inicio (se pinta junto con Inicio): al reclamar o comprar, ui.js pinta otra vez y la hoja
     sale al día sola. Se cierra al cambiar de pestaña (ui.js llama a Hub.cerrar). */
  function htmlHoja(k) {
    const d = D;
    const xs = contenido(k);
    let html = xs.map((x) => x.html).join('');
    if (k === 'antena') html = `<button class="btn main" data-act="tab" data-tab="online">${d.I('online')}${esc(t('ir_online'))}</button>` + (html || `<p class="small muted">${esc(t('antena_vacia'))}</p>`);
    if (k === 'buzon' && !html) html = `<p class="small muted">${esc(t('buzon_vacio'))}</p><button class="btn" data-ext="buzon" data-acc="abrir">${d.I('gift')}${esc(t('buzon_abrir'))}</button>`;
    if (k === 'mas') {
      html = (d.modulos || []).filter((m) => m.html && lugarDeModulo(m) === 'mas').map((m) => m.html).join('') + (d.extras && d.extras.mas ? d.extras.mas : '');
    }
    return html;
  }
  // Título de la hoja: el del módulo si el lugar tiene uno solo y el módulo lo da (ya traducido); si no, el del hub
  function tituloHoja(k) {
    const L = POR_K[k];
    if (L && L.mods && L.mods.length === 1 && !L.extras) {
      const m = (D.modulos || []).find((x) => x.id === L.mods[0]);
      if (m && m.titulo) return m.titulo;
    }
    return k === 'mas' ? t('t_mas') : t('t_' + k);
  }
  function hojaHtml(k) {
    const L = POR_K[k];
    const tit = tituloHoja(k);
    return `<div id="hubSheet" class="hub-sheet on" data-lugar="${esc(k)}"><div class="hub-sh" role="dialog" aria-modal="true" aria-label="${esc(tit)}">
      <div class="hub-sh-cab"><h2 class="hub-sh-t">${D.I(L ? L.ic : 'sparkle')} ${esc(tit)}</h2><button type="button" class="btn sm hub-sh-x" data-hub-cerrar="1" aria-label="${esc(t('cerrar'))}">${D.I('close', 'sm')}</button></div>
      <div class="hub-sh-cuerpo">${htmlHoja(k)}</div></div></div>`;
  }
  /** Lugar de la sede donde está lo que busca `sel` (para las pruebas y las guías), o null. */
  function buscar(sel) {
    if (!D || !doc) return null;
    const ks = LUGARES.filter((L) => !L.tab).map((L) => L.k).concat('mas');
    for (const k of ks) {
      try { const tp = doc.createElement('template'); tp.innerHTML = htmlHoja(k); if (tp.content.querySelector(sel)) return k; } catch (e) { /* sigue */ }
    }
    return null;
  }
  function abrir(k) {
    if (!D || !doc) return;
    abierta = k;
    const st = POR_K[k] ? estadoLugar(k) : {};
    if (st.firma) { vistos = vistos || {}; vistos[k] = st.firma; lsSet(VISTOS, vistos); }
    const viejo = doc.getElementById('hubSheet');
    if (viejo) viejo.remove();
    const sec = doc.getElementById('tab-inicio');
    if (!sec) return;
    sec.insertAdjacentHTML('beforeend', hojaHtml(k).replace('class="hub-sheet on"', 'class="hub-sheet on entra"'));
    // Quitar el punto del lugar ya visto
    const b = doc.querySelector(`.hs[data-hub="${k}"] .hs-b.nuevo`);
    if (b) b.remove();
    try { doc.querySelector('#hubSheet .hub-sh-x').focus({ preventScroll: true }); } catch (e) { /* nada */ }
  }
  function cerrar() {
    abierta = null;
    const el = doc && doc.getElementById('hubSheet');
    if (el) el.remove();
  }
  function tocar(k, el) {
    if (!D) return;
    const L = POR_K[k];
    if (L && L.tab && !(L.lock && L.lock(D))) return;   // lo hace ui.js (data-act="tab")
    if (D.snd) D.snd();
    if (L && L.lock) {
      const why = L.lock(D);
      if (why) { if (D.toast) D.toast(why); if (el) { el.classList.remove('neg'); void el.offsetWidth; el.classList.add('neg'); } return; }
    }
    abrir(k);
  }
  if (doc) {
    doc.addEventListener('click', (e) => {
      const x = e.target.closest && e.target.closest('[data-hub-cerrar]');
      if (x || (e.target && e.target.id === 'hubSheet')) { cerrar(); return; }
      const b = e.target.closest && e.target.closest('[data-hub]');
      if (!b || b.disabled) return;
      const k = b.dataset.hub;
      const L = POR_K[k];
      // Bloqueado: no dejar que ui.js cambie de pestaña
      if (L && L.lock && L.lock(D || {})) { e.stopPropagation(); e.preventDefault(); }
      tocar(k, b);
    }, true);
    doc.addEventListener('keydown', (e) => { if (e.key === 'Escape' && abierta) cerrar(); });
  }

  /* ---------- Estilos ---------- */
  const CSS = `
  .hubcard{padding:0;overflow:hidden;background:#0d0f14}
  @media (max-width:560px){.hubcard{margin-inline:calc(-1 * max(16px, env(safe-area-inset-left, 0px)));border-radius:0;border-inline:0}}
  .hub{position:relative;user-select:none;-webkit-user-select:none}
  .hub .hub-svg{display:block;width:100%;height:auto;border:0;border-radius:0}
  .hs{position:absolute;padding:0;margin:0;background:none;border:0;border-radius:3px;touch-action:manipulation;min-width:44px;min-height:44px;transition:box-shadow .15s}
  .hs:active,.hs:focus-visible{outline:none;box-shadow:inset 0 0 0 2px #ffd27a,0 0 16px #ffb02066;background:#ffd27a14}
  .hs-pill{position:absolute;left:3px;top:3px;display:inline-flex;align-items:center;gap:3px;max-width:calc(100% - 6px);padding:1px 6px 1px 4px;border-radius:3px;background:#0b0d12e0;border-inline-start:3px solid var(--hc,#ff3b3b);font:800 12.5px/1.25 var(--f-head);letter-spacing:.4px;color:#fff;white-space:nowrap;overflow:hidden;box-shadow:0 1px 4px #0008}
  .hs-pill b{overflow:hidden;text-overflow:ellipsis;font-weight:800}
  .hs-pill .ico{width:13px;height:13px;margin:0;flex:none;color:var(--hc,#fff)}
  .hs.abajo .hs-pill{top:auto;bottom:3px;left:50%;transform:translateX(-50%);max-width:none}
  .hs-b{position:absolute;right:-2px;top:-5px;min-width:20px;height:20px;border-radius:10px;background:var(--red);color:#fff;font:700 12px/20px var(--f-mono);text-align:center;padding:0 5px;box-shadow:0 0 0 2px #0b0d12;pointer-events:none}
  .hs-b.amb{background:var(--amber);color:#1a1200}
  .hs-b.nuevo{min-width:11px;width:11px;height:11px;padding:0;background:#5ad1ff;top:7px;right:7px}
  .hs.pide{box-shadow:inset 0 0 0 1.5px #ffb02088}
  .hs.afuera.pide{box-shadow:none}
  .hs.pide .hs-b{animation:hsLate 1.6s ease-in-out infinite}
  @keyframes hsLate{50%{box-shadow:0 0 0 2px #0b0d12,0 0 0 6px #ffb02033}}
  .hs.lock .hs-pill{background:#14171dd9;color:#c9d1dc;border-inline-start-color:#ffd21f}
  .hs.lock .hs-pill .ico{color:#ffd21f}
  .hs.neg{animation:hsNo .35s}
  @keyframes hsNo{25%{transform:translateX(-3px)}75%{transform:translateX(3px)}}
  .hub-mas{position:absolute;right:8px;top:4px;width:44px;height:44px;border-radius:50%;border:1px solid #2a3242;background:#0b0d12d9;color:#fff;font:700 22px/1 var(--f-body);display:grid;place-items:center;padding:0}
  .hub-mas .hs-b{right:-4px;top:-4px}
  .hub-svg .hub-ring{animation:hubRing .9s ease-in-out infinite alternate}
  @keyframes hubRing{from{opacity:.2}to{opacity:1}}
  .hub-svg .hub-chispa{animation:hubChispa 1.2s steps(2) infinite}
  @keyframes hubChispa{50%{opacity:.25}}
  .hub-svg .hub-brilla{animation:hubBrilla 2s ease-in-out infinite;transform-box:fill-box;transform-origin:center}
  @keyframes hubBrilla{50%{opacity:.05;transform:scale(1.25)}}
  .hub-ahora{display:flex;align-items:center;gap:10px;width:100%;margin:0 0 10px;padding:11px 12px;border-radius:4px 12px 12px 4px;border:1px solid var(--line);border-inline-start:4px solid var(--muted);background:var(--panel);color:var(--text);font:600 15px/1.3 var(--f-body);text-align:start;min-height:48px}
  .hub-ahora.roja{border-inline-start-color:var(--red);background:linear-gradient(90deg,#ff3b3b1f,transparent 70%),var(--panel)}
  .hub-ahora.ambar{border-inline-start-color:var(--amber);background:linear-gradient(90deg,#ffb0201f,transparent 70%),var(--panel)}
  .hub-ahora .ha-ic{display:grid;place-items:center;width:28px;height:28px;border-radius:50%;background:#0b0d12;flex:none}
  .hub-ahora .ha-ic .ico{margin:0}
  .hub-ahora .ha-fl,.hub-cap .ha-fl{font-size:22px;color:var(--muted);line-height:1}
  .hub-ahora .grow{flex:1;min-width:0}
  .hubcard + .hub-ahora,.hubcard + .redstrip{margin-top:0}
  .hub-turno{display:flex;align-items:center;gap:6px;flex-wrap:wrap;margin:-2px 0 8px;padding:0 4px;color:var(--muted)}
  .hub-cap{display:flex;align-items:center;gap:10px;width:100%;margin:0 0 10px;padding:8px 12px 8px 8px;border-radius:12px;border:1px solid var(--line);background:var(--panel);color:var(--text);text-align:start}
  .hub-cap .hc-por{flex:none;line-height:0}.hub-cap .hc-por svg{border-radius:10px}
  .hub-cap .hc-tx{flex:1;min-width:0;display:flex;flex-direction:column;gap:1px}
  .hub-cap small{color:var(--amber);font:800 13px/1.2 var(--f-head);letter-spacing:.5px}
  .hub-cap b{font-size:14px;font-weight:600;line-height:1.3;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
  .hub-cap .hc-pr{font-size:12px;color:var(--muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  .hub-sheet{position:fixed;inset:0;z-index:4;background:#000a;display:none;align-items:flex-end;justify-content:center;padding-bottom:calc(57px + env(safe-area-inset-bottom, 0px))}
  .hub-sheet.on{display:flex}
  .hub-sh{background:var(--panel);border:1px solid var(--line);border-radius:18px 18px 0 0;width:100%;max-width:640px;max-height:calc(100vh - var(--hdr-h, 120px) - 63px);max-height:calc(100dvh - var(--hdr-h, 120px) - 63px - env(safe-area-inset-bottom, 0px));overflow:auto;overscroll-behavior:contain;padding:0 14px 16px}
  .hub-sheet.entra .hub-sh{animation:hubSube .22s ease-out}
  @keyframes hubSube{from{transform:translateY(40px);opacity:.4}}
  .hub-sh-cab{position:sticky;top:0;z-index:2;display:flex;align-items:center;justify-content:space-between;gap:10px;padding:14px 0 10px;background:var(--panel)}
  .hub-sh-t{font-size:22px;display:flex;align-items:center;gap:8px}
  .hub-sh-x{margin:0;min-width:44px;min-height:44px}
  .hub-sh-cuerpo > .card:last-child{margin-bottom:0}
  @media (prefers-reduced-motion:reduce){.hs.pide .hs-b,.hub-svg .hub-ring,.hub-svg .hub-chispa,.hub-svg .hub-brilla,.hub-sheet.entra .hub-sh,.hs.neg{animation:none!important}}`;
  function ponerCss() {
    try {
      if (!doc || !doc.head || doc.getElementById('hub-css')) return;
      const st = doc.createElement('style'); st.id = 'hub-css'; st.textContent = CSS; doc.head.appendChild(st);
    } catch (e) { /* nada */ }
  }

  root.Hub = { inicio, escena, abrir, cerrar, tocar, buscar, abierta: () => abierta, LUGARES, MAPA, lugarDeModulo, TX, t };
  // Carga con defer: si Inicio ya se pintó sin el hub, se pinta otra vez
  try { if (doc && doc.querySelector('#tab-inicio.on') && !doc.querySelector('#tab-inicio .hubcard') && typeof root.EnVivoRepintar === 'function') root.EnVivoRepintar(); } catch (e) { /* nada */ }
  if (typeof module !== 'undefined' && module.exports) module.exports = root.Hub;
})(typeof window !== 'undefined' ? window : globalThis);
