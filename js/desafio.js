/* =========================================================
   EN VIVO Tycoon — Desafío Técnico del Día (pantalla)
   Contrato: server/INTEGRAR_DUELOS_DESAFIO.md. Un reto por día, igual para todos: modificador del día de la semana,
   mismo contrato, misma maleta (personal y equipos con presupuesto) y misma semilla base. El juego arma el evento con
   la semilla del servidor, se juega EN VIVO y manda solo las decisiones; el validador da la calidad que cuenta.
   Uso desde ui.js (cargar DESPUÉS de js/duelos.js, que trae el motor EnVivoVivo):
     Desafio.render(elemento, ctx)   ctx = { G, A, estado(), toast, ask, openModal, closeModal, snd, sincronizar, Api? }
     Desafio.invalidar()
   Textos: I18N.T si existe (claves desafio.*), si no, el español de aquí.
   ========================================================= */
(function (root) {
  'use strict';
  const ES = {
    'desafio.titulo': 'Desafío Técnico del Día', 'desafio.cargando': 'Preparando el desafío de hoy…', 'desafio.entrar': 'Entra a tu cuenta para jugar el desafío del día.',
    'desafio.reintentar': 'Intentar de nuevo', 'desafio.hoy': 'Hoy, {dia}', 'desafio.semana': 'Esta semana',
    'desafio.intentos': 'Intentos: {n} de {max}', 'desafio.sin_intentos': 'Ya jugaste el desafío de hoy. Vuelve mañana.',
    'desafio.vip_extra': 'Con el Pase VIP tienes un intento más cada día.', 'desafio.cierra': 'Cierra a las 23:59',
    'desafio.contrato': 'El evento', 'desafio.camaras_pide': 'El cliente pide {n} cámaras', 'desafio.dificultad': 'Dificultad {n}',
    'desafio.exigencia': 'Exigencia de fama {n}', 'desafio.aire_libre': 'Al aire libre', 'desafio.bajo_techo': 'Bajo techo',
    'desafio.maleta': 'Arma tu equipo con la maleta del día', 'desafio.presupuesto': 'Presupuesto', 'desafio.puntos': '{n} pts',
    'desafio.max_camaras': 'Máximo {n} cámara(s) hoy', 'desafio.personal': 'Personal', 'desafio.equipos': 'Equipos', 'desafio.dueno': 'Tú (siempre vas)',
    'desafio.estado': 'estado {n} %', 'desafio.gastada': 'Gastada: puede fallar', 'desafio.empezar': 'Empezar el desafío',
    'desafio.empezar_pregunta': '¿Empezar con este equipo?<br><span class="small muted">Usas {n} de tus intentos de hoy. Tienes {min} minutos para terminarlo.</span>',
    'desafio.si_empezar': '¡Al aire!', 'desafio.preparando': 'El servidor está preparando el evento…', 'desafio.pasado': 'Te pasaste del presupuesto.',
    'desafio.sin_camara': 'Lleva al menos una cámara.', 'desafio.demasiadas_camaras': 'Hoy puedes llevar máximo {n} cámara(s).',
    'desafio.en_curso': 'Tienes un desafío en curso', 'desafio.continuar': 'Continuar', 'desafio.revisando': 'Tu intento se está revisando. El resultado aparece en unos minutos.',
    'desafio.ranking': 'Ranking de tu servidor', 'desafio.sin_ranking': 'Nadie jugó todavía. ¡Sé el primero!', 'desafio.participantes': '{n} productoras jugaron hoy',
    'desafio.mi_mejor': 'Tu mejor resultado: {q} ({e}) · puesto {p}', 'desafio.premios': 'Premios', 'desafio.premio_estrellas': 'Por terminar (una vez al día)',
    'desafio.premio_puesto': 'Top 10 al cerrar el día (si juegan {n} o más)', 'desafio.pases': 'Pases de Prensa: {n}',
    'desafio.cables': '{n} cable(s)', 'desafio.baterias': '{n} batería(s)', 'desafio.dinero': '${n}', 'desafio.pases_n': '{n} pase(s)',
    'desafio.puesto_n': '{n}º', 'desafio.puesto_rango': '4º a 10º', 'desafio.enviando': 'El servidor está repitiendo tu jugada…',
    'desafio.resultado': 'Resultado del desafío', 'desafio.calidad': 'Calidad', 'desafio.puesto': 'Puesto {n} en tu servidor',
    'desafio.premio_ganado': 'Recibiste', 'desafio.ya_premio': 'El premio por terminar ya lo recibiste hoy.', 'desafio.volver': 'Volver al desafío',
    'desafio.invalido': 'La jugada no se pudo repetir en el servidor y no cuenta.', 'desafio.ayer': 'Ayer quedaste en el puesto {n}: ${d} y {p} Pases de Prensa.',
    'desafio.tus_imprevistos': 'Tus imprevistos', 'desafio.pendiente': 'Tu jugada quedó guardada. El resultado aparece en unos minutos.',
    'desafio.falta_motor': 'Falta js/duelos.js (motor de eventos en línea).',
    'desafio.mod.lluvia': 'Lluvia garantizada', 'desafio.mod.una_camara': 'Una sola cámara', 'desafio.mod.internet': 'Internet inestable',
    'desafio.mod.exigente': 'Cliente exigente', 'desafio.mod.apagon': 'Apagón', 'desafio.mod.final': 'Final de campeonato', 'desafio.mod.todo': 'Todo junto',
  };
  const T = (k, p) => {
    try { if (root.I18N && root.I18N.T && (!root.I18N.T.has || root.I18N.T.has(k))) { const t = root.I18N.T(k, p); if (t && t !== k) return t; } } catch (e) { /* español */ }
    return String(ES[k] !== undefined ? ES[k] : k).replace(/\{(\w+)\}/g, (m, x) => (p && p[x] !== undefined ? p[x] : m));
  };
  const esc = (t) => String(t == null ? '' : t).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const num = (n) => Number(n || 0).toLocaleString((root.I18N && root.I18N.idioma) || 'es-EC');

  async function pedir(method, ruta, body) {
    if (root.Duelos && root.Duelos.pedir) return root.Duelos.pedir(method, ruta, body);
    const r = await fetch(ruta, { method, headers: { 'Content-Type': 'application/json', 'X-Envivo': '1' }, credentials: 'same-origin', cache: 'no-store', body: body ? JSON.stringify(body) : undefined });
    let j = null; try { j = await r.json(); } catch (e) { j = null; }
    if (!j || !r.ok || j.ok === false) { const e = new Error((j && j.error) || 'No se pudo completar. Intenta de nuevo.'); e.status = r.status; throw e; }
    return j;
  }

  function css() {
    if (root.Duelos && root.Duelos.css) root.Duelos.css();
    if (typeof document === 'undefined' || document.getElementById('desafio-css')) return;
    const s = document.createElement('style');
    s.id = 'desafio-css';
    s.textContent = `
      .df-hero{position:relative;overflow:hidden;background:radial-gradient(130% 120% at 0% 0%,#0f2440 0%,var(--panel) 60%);border-color:#1c3d66}
      .df-hero .df-ico{width:56px;height:56px;border-radius:16px;display:grid;place-items:center;background:#0f2440;border:1px solid #1c3d66;color:#8cc4ff;flex:none}
      .df-hero .df-ico .ico{width:30px;height:30px}
      .df-hero h2{font-size:26px;line-height:1.05}
      .df-semana{display:grid;grid-template-columns:repeat(7,minmax(0,1fr));gap:4px;margin-top:12px}
      .df-dia{border-radius:10px;padding:6px 2px;text-align:center;background:var(--panel2);border:1px solid var(--line);font-size:10.5px;color:var(--muted);min-width:0}
      .df-dia .ico{width:16px;height:16px;display:block;margin:0 auto 3px}
      .df-dia.hoy{border-color:#4da3ff;color:var(--text);background:#13253d}
      .df-meter{height:8px;border-radius:4px;background:var(--line);overflow:hidden;margin-top:6px}
      .df-meter i{display:block;height:100%;background:var(--green);transition:width .2s}
      .df-meter.mal i{background:var(--red)}
      .df-pres{position:sticky;top:calc(env(safe-area-inset-top,0px) + 58px);z-index:3;box-shadow:0 8px 18px -10px #000}
      .df-item{display:flex;align-items:center;gap:10px;padding:8px 0;border-top:1px solid var(--line)}.df-item:first-child{border-top:0}
      .df-item input{width:20px;height:20px;accent-color:#4da3ff;flex:none}
      .df-item label{flex:1;min-width:0;display:flex;align-items:center;gap:10px}
      .df-item .grow{min-width:0}.df-item b{display:block;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
      .df-costo{flex:none;font-family:"JetBrains Mono",monospace;font-size:12px;color:#8cc4ff;border:1px solid #1c3d66;border-radius:999px;padding:2px 8px}
      .df-tabla{width:100%;border-collapse:collapse;font-size:13px}
      .df-tabla td,.df-tabla th{padding:6px 4px;border-top:1px solid var(--line);text-align:left;vertical-align:top}
      .df-tabla th{color:var(--muted);font-weight:600;font-size:12px;border-top:0}
      .df-q{font-family:"JetBrains Mono",monospace;font-size:52px;font-weight:600;line-height:1;text-align:center}`;
    document.head.appendChild(s);
  }

  const st = { datos: null, cargando: false, error: '', vista: 'lobby', sel: null, vivo: null, final: null };

  function avatar(ctx, nombre, rol) {
    try { if (ctx.A.avatar) return ctx.A.avatar(nombre, rol, 44); } catch (e) { /* sin retrato */ }
    return ctx.A.icon('user');
  }
  function nombreRol(ctx, r, D) {
    const p = D && D.maleta.personal.find((x) => x.rol === r && x.rol_nombre);
    if (p) return p.rol_nombre;
    try { return (ctx.G.ROLES[r] && ctx.G.ROLES[r].name) || r; } catch (e) { return r; }
  }
  const nombreInc = (k) => (root.Duelos && root.Duelos.nombreInc ? root.Duelos.nombreInc(k) : String(k || '').replace(/_/g, ' '));

  async function cargar(ctx, el) {
    if (st.cargando) return;
    st.cargando = true; st.error = '';
    try { st.datos = await pedir('GET', '/api/desafio'); } catch (e) { st.error = e.status === 401 ? T('desafio.entrar') : e.message; }
    st.cargando = false;
    if (st.datos && !st.sel) st.sel = eleccionInicial(st.datos);
    pintar(ctx, el);
  }

  /* Elección inicial: lo más barato que cubre los roles principales (el jugador la cambia) */
  function eleccionInicial(D) {
    const M = D.maleta;
    const personal = new Set(), equipos = new Set();
    const barato = (lista, f) => lista.filter(f).sort((a, b) => a.costo - b.costo)[0];
    ['director', 'sonidista', 'tecnico_transmision'].forEach((r) => { const p = barato(M.personal, (x) => x.rol === r && !x.fijo); if (p) personal.add(p.id); });
    const cam = barato(M.equipos, (x) => x.cat === 'cam' && x.estado >= 40); if (cam) equipos.add(cam.id);
    ['switcher', 'encoder'].forEach((c) => { const e = barato(M.equipos, (x) => x.cat === c); if (e) equipos.add(e.id); });
    return { personal, equipos };
  }
  function costo(D) {
    const M = D.maleta;
    return [...st.sel.personal].reduce((a, id) => a + ((M.personal.find((x) => x.id === id) || {}).costo || 0), 0)
      + [...st.sel.equipos].reduce((a, id) => a + ((M.equipos.find((x) => x.id === id) || {}).costo || 0), 0);
  }
  const camarasElegidas = (D) => [...st.sel.equipos].filter((id) => (D.maleta.equipos.find((x) => x.id === id) || {}).cat === 'cam').length;

  function premioTexto(p) {
    return [p.cables || p[0] ? T('desafio.cables', { n: p.cables != null ? p.cables : p[0] }) : null,
      p.baterias || p[1] ? T('desafio.baterias', { n: p.baterias != null ? p.baterias : p[1] }) : null,
      p.dinero || p[2] ? T('desafio.dinero', { n: num(p.dinero != null ? p.dinero : p[2]) }) : null,
      p.pases || p[3] ? T('desafio.pases_n', { n: p.pases != null ? p.pases : p[3] }) : null].filter(Boolean).join(' · ');
  }

  function lobby(ctx) {
    const D = st.datos, A = ctx.A, M = D.maleta, m = D.modificador, c = D.contrato;
    const usado = costo(D), cams = camarasElegidas(D);
    const pasado = usado > M.presupuesto;
    const it = D.intentos;
    const puede = it.restantes > 0 && !D.abierto;
    const semana = D.semana.map((x) => `<div class="df-dia ${x.hoy ? 'hoy' : ''}">${A.icon(x.icono)}${esc(x.dia.slice(0, 3))}</div>`).join('');
    const personal = M.personal.map((p) => `<div class="df-item"><input type="checkbox" id="dfp-${p.id}" data-df="p" data-id="${p.id}" ${p.fijo || st.sel.personal.has(p.id) ? 'checked' : ''} ${p.fijo || !puede ? 'disabled' : ''}>
        <label for="dfp-${p.id}"><span class="dl-av">${avatar(ctx, p.nombre, p.rol)}</span><span class="grow"><b>${esc(p.fijo ? T('desafio.dueno') : p.nombre)}</b>
        <span class="dl-mini">${esc(nombreRol(ctx, p.rol, D))} · ${'★'.repeat(p.habilidad)}${p.nivel !== 'junior' ? ' · ' + esc(p.nivel.replace('_', ' ')) : ''}</span></span></label>
        <span class="df-costo">${p.costo}</span></div>`).join('');
    const equipos = M.equipos.map((e) => `<div class="df-item"><input type="checkbox" id="dfe-${e.id}" data-df="e" data-id="${e.id}" ${st.sel.equipos.has(e.id) ? 'checked' : ''} ${!puede ? 'disabled' : ''}>
        <label for="dfe-${e.id}"><span class="tile ${e.estado < 40 ? 't-red' : 't-blue'}">${A.icon(e.type)}</span><span class="grow"><b>${esc(e.nombre)}</b>
        <span class="dl-mini">${esc(e.estado < 40 ? T('desafio.gastada') : T('desafio.estado', { n: e.estado }))}</span></span></label>
        <span class="df-costo">${e.costo}</span></div>`).join('');
    const PE = D.premios.por_estrellas, PP = D.premios.por_puesto;
    return `
      <div class="card df-hero"><div class="row" style="gap:12px;align-items:flex-start"><div class="df-ico">${A.icon(m.icono)}</div>
          <div class="grow"><div class="small muted">${esc(T('desafio.hoy', { dia: m.dia_semana }))} · ${esc(T('desafio.cierra'))}</div><h2>${esc(T('desafio.mod.' + m.clave) !== 'desafio.mod.' + m.clave ? T('desafio.mod.' + m.clave) : m.nombre)}</h2>
          <p class="small" style="margin:6px 0 0">${esc(m.detalle)}</p></div></div>
        <div class="df-semana">${semana}</div>
        <div class="row between small" style="margin-top:12px"><span>${esc(T('desafio.intentos', { n: it.usados, max: it.max }))}</span><span class="tag">${A.icon('star', 'sm')}${esc(T('desafio.pases', { n: D.pases_prensa }))}</span></div>
        ${it.max < 2 ? `<p class="dl-mini" style="margin:6px 0 0">${esc(T('desafio.vip_extra'))}</p>` : ''}</div>
      ${D.ayer ? `<div class="card small" style="border-color:var(--amber)">🏆 ${esc(T('desafio.ayer', { n: D.ayer.puesto, d: num(D.ayer.dinero), p: D.ayer.pases }))}</div>` : ''}
      ${D.abierto ? (D.abierto.intento ? `<div class="card" style="border-color:#4da3ff"><p class="small" style="margin:0 0 8px">${A.icon('rec', 'sm')} ${esc(T('desafio.en_curso'))}</p>
          <button class="btn main" data-df="continuar">${A.icon('play', 'sm')} ${esc(T('desafio.continuar'))}</button></div>` : `<div class="card small muted">${esc(T('desafio.revisando'))}</div>`) : ''}
      ${D.mi_mejor ? `<div class="card small">${A.icon('trend', 'sm')} ${esc(T('desafio.mi_mejor', { q: D.mi_mejor.calidad, e: '⭐'.repeat(D.mi_mejor.estrellas), p: D.mi_mejor.puesto || '—' }))}</div>` : ''}
      <div class="sectitle">${esc(T('desafio.contrato'))}</div>
      <div class="card"><div class="row"><div class="tile t-amber">${A.icon(c.type)}</div><div class="grow"><h3>${esc(c.client)}</h3>
          <div class="dl-chips"><span class="tag">${esc(T('desafio.camaras_pide', { n: c.cams }))}</span><span class="tag">${esc(T('desafio.dificultad', { n: c.diff }))}</span>
          <span class="tag">${esc(c.outdoor ? T('desafio.aire_libre') : T('desafio.bajo_techo'))}</span><span class="tag amber">${esc(T('desafio.exigencia', { n: D.contexto.fama }))}</span></div></div></div></div>
      ${puede ? `<div class="sectitle">${esc(T('desafio.maleta'))}</div>
      <div class="card df-pres"><div class="row between small"><span>${esc(T('desafio.presupuesto'))}</span><b class="num ${pasado ? 'neg' : ''}" id="df-usado">${usado} / ${M.presupuesto}</b></div>
        <div class="df-meter ${pasado ? 'mal' : ''}"><i style="width:${Math.min(100, Math.round(usado / M.presupuesto * 100))}%"></i></div>
        <div class="dl-mini row" style="margin-top:6px;gap:6px">${esc(T('desafio.max_camaras', { n: M.max_camaras }))} · ${A.icon('cam_basic', 'sm')} <b class="num ${cams > M.max_camaras ? 'neg' : ''}">${cams}</b></div>
        <button class="btn main" data-df="empezar" ${pasado || !cams || cams > M.max_camaras ? 'disabled' : ''}>${A.icon('play', 'sm')} ${esc(T('desafio.empezar'))}</button></div>
      <div class="sectitle">${esc(T('desafio.personal'))}</div><div class="card">${personal}</div>
      <div class="sectitle">${esc(T('desafio.equipos'))}</div><div class="card">${equipos}</div>`
      : !D.abierto ? `<div class="card small muted">${esc(T('desafio.sin_intentos'))}</div>` : ''}
      <div class="sectitle">${esc(T('desafio.ranking'))} <span class="muted">· ${esc(T('desafio.participantes', { n: D.participantes }))}</span></div>
      <div class="card">${D.ranking.map((x) => `<div class="dl-rank ${st.datos && x.yo ? 'yo' : ''}"><span class="n">${x.puesto}</span><span class="nm">${esc(x.nombre)} ${'⭐'.repeat(x.estrellas)}</span><span class="num">${x.calidad}</span></div>`).join('') || `<p class="small muted" style="margin:0">${esc(T('desafio.sin_ranking'))}</p>`}</div>
      <div class="sectitle">${esc(T('desafio.premios'))}</div>
      <div class="card"><table class="df-tabla"><tr><th colspan="2">${esc(T('desafio.premio_estrellas'))}</th></tr>
          ${[5, 4, 3, 1].map((e) => `<tr><td>${'⭐'.repeat(e)}${e === 1 ? '–⭐⭐' : ''}</td><td>${esc(premioTexto(PE[e]))}</td></tr>`).join('')}</table>
        <table class="df-tabla" style="margin-top:10px"><tr><th colspan="2">${esc(T('desafio.premio_puesto', { n: D.premios.minimo_participantes }))}</th></tr>
          ${[1, 2, 3, 10].map((p) => `<tr><td>${esc(p === 10 ? T('desafio.puesto_rango') : T('desafio.puesto_n', { n: p }))}</td><td>${esc(premioTexto({ dinero: PP[p][0], pases: PP[p][1], baterias: PP[p][2] }))}</td></tr>`).join('')}</table></div>`;
  }

  function resultado(ctx) {
    const R = st.final, A = ctx.A, r = R.resultado;
    const valido = r.estado === 'valido';
    return `<div class="card"><div class="dl-paso">${esc(T('desafio.resultado'))}</div>
        ${valido ? `<div class="df-q" style="margin-top:8px">${r.calidad}</div><div style="text-align:center;font-size:22px">${'⭐'.repeat(r.estrellas)}</div>
          <p style="text-align:center;margin:8px 0 0"><b>${esc(T('desafio.puesto', { n: R.puesto }))}</b></p>` : `<p class="small neg">${esc(T('desafio.invalido'))}</p>`}</div>
      ${R.premio ? `<div class="card" style="border-color:var(--amber)"><b>${A.icon('gift', 'sm')} ${esc(R.premio.nuevo ? T('desafio.premio_ganado') : T('desafio.ya_premio'))}</b>
          ${R.premio.nuevo ? `<p class="small" style="margin:6px 0 0">${esc(premioTexto(R.premio))}</p>` : ''}</div>` : ''}
      ${r.incidentes && r.incidentes.length ? `<div class="sectitle">${esc(T('desafio.tus_imprevistos'))}</div><div class="card">${r.incidentes.map((x) => `<div class="dl-inc"><span>${esc(nombreInc(x.clave))}</span><b class="${x.q < 0 ? 'neg' : 'pos'}">${x.q > 0 ? '+' : ''}${x.q}</b></div>`).join('')}</div>` : ''}
      <div class="sectitle">${esc(T('desafio.ranking'))}</div>
      <div class="card">${(R.ranking || []).map((x) => `<div class="dl-rank"><span class="n">${x.puesto}</span><span class="nm">${esc(x.nombre)}</span><span class="num">${x.calidad}</span></div>`).join('')}</div>
      <button class="btn main" data-df="lobby">${esc(T('desafio.volver'))}</button>`;
  }

  function pintar(ctx, el) {
    css();
    if (st.vista === 'vivo' && st.vivo) { root.EnVivoVivo.pintar(el, st.vivo, ctx.A, 'df', () => enviar(ctx, el)); return; }
    if (!st.datos && !st.error) { el.innerHTML = `<div class="card muted">${esc(T('desafio.cargando'))}</div>`; cargar(ctx, el); return; }
    if (st.error) { el.innerHTML = `<div class="card"><p class="small neg">${esc(st.error)}</p><button class="btn sm" data-df="recargar">${esc(T('desafio.reintentar'))}</button></div>`; return; }
    if (!st.sel) st.sel = eleccionInicial(st.datos);
    el.innerHTML = st.vista === 'resultado' && st.final ? resultado(ctx) : lobby(ctx);
  }

  async function jugar(ctx, el, intento) {
    const V = root.EnVivoVivo;
    if (!V) { ctx.toast(T('desafio.falta_motor')); return; }
    try { await V.asegurar(); st.vivo = V.crear(ctx.G, intento); st.vista = 'vivo'; if (ctx.snd && ctx.snd.play) ctx.snd.play('live'); }
    catch (e) { ctx.toast(e.message); st.vista = 'lobby'; }
    pintar(ctx, el);
    try { el.scrollIntoView({ block: 'start' }); } catch (e) { /* nada */ }
  }

  async function enviar(ctx, el) {
    const V = root.EnVivoVivo, v = st.vivo;
    let fin;
    try { fin = V.terminar(v); } catch (e) { ctx.toast(e.message); return; }
    el.innerHTML = `<div class="card muted">${esc(T('desafio.enviando'))}</div>`;
    try {
      const r = await pedir('POST', '/api/desafio/terminar', { intento_id: v.intento.intento_id, decisiones: fin.decisiones, resultado: fin.resultado });
      st.vivo = null;
      if (r.pendiente) { ctx.toast(T('desafio.pendiente')); st.vista = 'lobby'; }
      else { st.final = r; st.vista = 'resultado'; if (ctx.snd && ctx.snd.play) ctx.snd.play('stars'); }
      try { if (ctx.Api && ctx.Api.refrescar) await ctx.Api.refrescar(); else if (root.Api && root.Api.refrescar) await root.Api.refrescar(); } catch (e) { /* luego */ }
      try { if (ctx.sincronizar) ctx.sincronizar(); } catch (e) { /* luego */ }
    } catch (e) { st.vivo = null; st.vista = 'lobby'; ctx.toast(e.message); }
    st.datos = null; st.sel = null;
    if (st.vista === 'resultado') el.innerHTML = resultado(ctx); else pintar(ctx, el);
  }

  function actualizarPresupuesto(ctx, el) {
    // Repinta sin perder la posición (la lista es larga)
    const y = typeof window !== 'undefined' ? window.scrollY : 0;
    el.innerHTML = lobby(ctx);
    try { window.scrollTo(0, y); } catch (e) { /* nada */ }
  }

  function clic(ctx, el, b) {
    const acc = b.dataset.df, D = st.datos;
    if (acc === 'recargar') { st.datos = null; st.error = ''; pintar(ctx, el); return; }
    if (acc === 'lobby') { st.vista = 'lobby'; st.final = null; pintar(ctx, el); return; }
    if (acc === 'continuar' && D && D.abierto && D.abierto.intento) { jugar(ctx, el, D.abierto.intento); return; }
    if (acc === 'empezar') {
      const cams = camarasElegidas(D);
      if (costo(D) > D.maleta.presupuesto) { ctx.toast(T('desafio.pasado')); return; }
      if (!cams) { ctx.toast(T('desafio.sin_camara')); return; }
      if (cams > D.maleta.max_camaras) { ctx.toast(T('desafio.demasiadas_camaras', { n: D.maleta.max_camaras })); return; }
      ctx.ask(T('desafio.empezar_pregunta', { n: 1, min: D.minutos }), T('desafio.si_empezar'), async () => {
        el.innerHTML = `<div class="card muted">${esc(T('desafio.preparando'))}</div>`;
        try {
          const r = await pedir('POST', '/api/desafio/empezar', { personal: [...st.sel.personal], equipos: [...st.sel.equipos] });
          jugar(ctx, el, r.intento);
        } catch (e) { ctx.toast(e.message); if (ctx.snd && ctx.snd.play) ctx.snd.play('error'); st.datos = null; pintar(ctx, el); }
      });
    }
  }

  function cambio(ctx, el, inp) {
    const set = inp.dataset.df === 'p' ? st.sel.personal : st.sel.equipos;
    if (inp.checked) set.add(inp.dataset.id); else set.delete(inp.dataset.id);
    actualizarPresupuesto(ctx, el);
  }

  root.Desafio = {
    render(el, ctx) {
      pintar(ctx, el);
      el.onclick = (ev) => { const b = ev.target.closest('button[data-df]'); if (b && !b.disabled && el.contains(b)) clic(ctx, el, b); };
      el.onchange = (ev) => { const i = ev.target.closest('input[data-df]'); if (i && el.contains(i)) cambio(ctx, el, i); };
    },
    invalidar() { st.datos = null; st.error = ''; st.sel = null; },
    T, _st: st,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = root.Desafio;
})(typeof window !== 'undefined' ? window : globalThis);
