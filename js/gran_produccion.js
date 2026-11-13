/* =========================================================
   EN VIVO Tycoon — Gran Producción de Asociación (evento de equipo semanal)
   Contrato: server/INTEGRAR_GRAN_PRODUCCION.md
     GET  /api/gran           todo lo de la pantalla (fase, producción, mi asociación, mis aportes, miembros, tabla, reglas, última)
     GET  /api/gran/resumen   liviano: { fase, produccion, en_asociacion, progreso, disponibles, espera }
     POST /api/gran/aportar   { frente: 'personal' | 'equipos' } → manda todos los turnos listos de ese frente
   El servidor decide y valida todo; aquí se muestra y se pide. Nada se gasta de la partida: la cuadrilla y los equipos
   "vuelven" al instante, y las transmisiones se cuentan solas con los eventos que se juegan en la partida.
   Dónde se ve:
     - Pestaña "Asociación" del chat: franja "🎬 Gran Producción · 63 % · faltan 20 h" (Chat llama GranProduccion.franja).
     - Inicio: franja mientras corre y el jugador está en una asociación (window.EnVivoInicio con banner(ctx)).
     - Pantalla propia (#gp-panel): progreso con los niveles, los 3 frentes, mi aporte (botones con turnos), premios fijos,
       aportes por miembro, tabla del servidor y tiempo restante. Se abre también con ?ir=gran (los avisos push).
   Textos: claves gp.* y error.gp_* de js/lang/es.js (los demás idiomas muestran el español hasta la traducción final).
   API: window.GranProduccion = { iniciar, abrir, cerrar, franja, refrescar, estado }.
   ========================================================= */
(function (root) {
  'use strict';
  const ID = 'gran_produccion';
  const CADA_MS = 60000;

  const st = { ctx: null, datos: null, resumen: null, abierto: false, ocupado: false, error: '', timer: null, tick: null, iniciado: false, cuenta: undefined, resumenEn: 0, noDisponible: false };

  /* ---------- Utilidades ---------- */
  const I18 = () => root.I18N || null;
  function t(k, p) {
    try { if (st.ctx && typeof st.ctx.T === 'function') return st.ctx.T(k, p); if (I18()) return I18().T(k, p); } catch (e) { /* abajo */ }
    return k;
  }
  const esc = (x) => String(x == null ? '' : x).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const num = (n) => (I18() && I18().num ? I18().num(n) : String(n));
  const dinero = (n) => (I18() && I18().money ? I18().money(n) : '$' + n);
  function fmt(seg) {
    seg = Math.max(0, Math.round(Number(seg) || 0));
    const d = Math.floor(seg / 86400), h = Math.floor((seg % 86400) / 3600), m = Math.floor((seg % 3600) / 60);
    if (d > 0) return t('gp.t_d', { d, h });
    if (h > 0) return t('gp.t_h', { h, m });
    return t('gp.t_m', { m: Math.max(1, m) });
  }
  const Api = () => (st.ctx && st.ctx.Api) || root.Api || {};
  const logueado = () => { const A = Api(), E = A.estado; return !!(A.disponible && E && E.logueado); };
  const enAsoc = () => { const E = Api().estado; return !!(E && E.asociacion); };
  const cuentaId = () => { const E = Api().estado; return E && E.jugador ? E.jugador.id : null; };
  const toast = (m) => { try { if (st.ctx && st.ctx.toast) st.ctx.toast(m); else if (root.toast) root.toast(m); } catch (e) { /* nada */ } };
  const sonido = (n) => { try { if (st.ctx && st.ctx.snd) st.ctx.snd.play(n); } catch (e) { /* nada */ } };
  const temaNombre = (p) => (p ? (I18() && I18().T.has && I18().T.has('gp.tema.' + p.tema) ? t('gp.tema.' + p.tema) : p.nombre || p.tema) : '');
  const nivelNombre = (k) => (k ? t('gp.nivel.' + k) : '—');
  // Momento en que se recibió cada respuesta: el reloj de la pantalla descuenta desde ahí
  const restante = (seg, en) => Math.max(0, (Number(seg) || 0) - Math.floor((Date.now() - (en || Date.now())) / 1000));

  async function pedir(metodo, ruta, cuerpo) {
    let r, j = null;
    try {
      r = await root.fetch(ruta, { method: metodo, credentials: 'same-origin', cache: 'no-store', body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo),
        headers: { 'Content-Type': 'application/json', 'X-Envivo': '1', 'Accept-Language': (I18() && I18().idioma) || 'es' } });
    } catch (e) { const x = new Error(t('gp.err_red')); x.status = 0; throw x; }
    try { j = await r.json(); } catch (e) { j = null; }
    if (!j || typeof j !== 'object' || !r.ok || j.ok === false) {
      const c = j && j.codigo;
      let msg = null;
      if (c === 'gp_espera' && j.espera) msg = t('gp.err_espera', { t: fmt(j.espera) });
      else if (c === 'gp_miembro_nuevo' && j.espera) msg = t('gp.espera', { t: fmt(j.espera) });
      else if (c && I18() && I18().T.has && I18().T.has('error.' + c)) msg = I18().T('error.' + c, j);
      if (!msg) msg = j && j.error ? (I18() && I18().TL ? I18().TL(j.error) : j.error) : t('gp.error_carga');
      const x = new Error(msg); x.status = r.status; x.codigo = c || null; x.datos = j || {};
      throw x;
    }
    return j;
  }

  function premiosTxt(lista) {
    return (lista || []).map((p) => {
      const n = Number(p.cantidad) || 0;
      if (p.tipo === 'dinero') return t('gp.premio.dinero', { m: dinero(n) });
      if (p.tipo === 'creditos') return t('gp.premio.creditos', { n });
      if (p.tipo === 'consumible') return t(p.item === 'battery' ? 'gp.premio.battery' : 'gp.premio.cable', { n });
      if (p.tipo === 'reparar_todo') return t('gp.premio.reparar_todo');
      return p.nombre || p.tipo;
    }).join(' · ');
  }

  /* ---------- Estilos ---------- */
  function css() {
    if (!root.document || document.getElementById('gp-css')) return;
    const s = document.createElement('style');
    s.id = 'gp-css';
    s.textContent = `
      #gp-panel{position:fixed;inset:0;z-index:27;background:var(--bg);display:flex;flex-direction:column;padding-top:env(safe-area-inset-top,0px)}
      #gp-panel[hidden]{display:none}
      .gp-top{display:flex;align-items:center;gap:8px;padding:10px max(16px,env(safe-area-inset-right,0px)) 8px max(16px,env(safe-area-inset-left,0px));border-bottom:1px solid var(--line)}
      .gp-top h2{flex:1;min-width:0;margin:0;font-size:18px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
      .gp-cuerpo{flex:1;overflow-y:auto;overflow-x:hidden;padding:12px max(16px,env(safe-area-inset-right,0px)) calc(24px + env(safe-area-inset-bottom,0px)) max(16px,env(safe-area-inset-left,0px))}
      .gp-cuerpo .card{margin-bottom:10px}
      .gp-hero{position:relative;padding:14px;border-radius:14px;border:1px solid #ffd27a66;background:linear-gradient(135deg,#1b1406 0%,#0d0f14 60%,#14101f 100%);margin-bottom:10px;overflow:hidden}
      .gp-hero h3{margin:2px 0 4px;font-size:18px;line-height:1.25;overflow-wrap:anywhere}
      .gp-ico{font-size:30px;line-height:1}
      .gp-reloj{font-family:var(--f-head);font-weight:800;color:var(--amber);font-size:15px}
      .gp-pausa{color:var(--amber);font-weight:700}
      .gp-barra{position:relative;height:16px;border-radius:9px;background:#ffffff14;margin:22px 0 6px;overflow:visible}
      .gp-barra>i{display:block;height:100%;border-radius:9px;background:linear-gradient(90deg,var(--amber),#ffd27a);max-width:100%}
      .gp-marca{position:absolute;top:-18px;transform:translateX(-50%);font-size:10px;color:var(--muted);white-space:nowrap}
      .gp-marca::after{content:"";position:absolute;left:50%;top:15px;width:1px;height:20px;background:#ffffff40}
      .gp-marca.on{color:var(--amber);font-weight:700}
      .gp-pct{font-size:26px;font-weight:800;font-family:var(--f-head)}
      .gp-frentes{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px;margin:10px 0}
      .gp-frente{background:var(--panel);border:1px solid var(--line);border-radius:12px;padding:8px;min-width:0;text-align:center}
      .gp-frente b{display:block;font-size:15px}
      .gp-frente .bar{margin-top:6px}
      .gp-frente small{display:block;color:var(--muted);font-size:11px;overflow-wrap:anywhere}
      .gp-btns{display:flex;gap:8px;flex-wrap:wrap}
      .gp-btns .btn{flex:1 1 140px;min-width:0;margin:0;font-size:14px;line-height:1.25;padding:11px 6px}
      .gp-btns .btn small{display:block;font-weight:400;font-size:11px;color:var(--muted)}
      .gp-btns .btn[disabled]{opacity:.55}
      .gp-fila{display:flex;align-items:center;gap:8px;min-width:0;padding:6px 0;border-bottom:1px solid var(--line)}
      .gp-fila:last-child{border-bottom:0}
      .gp-fila .grow{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
      .gp-fila.yo{color:var(--amber);font-weight:700}
      .gp-fila .n{flex:none;font-variant-numeric:tabular-nums;font-size:12px;color:var(--muted)}
      .gp-sig{flex:none;display:inline-block;border-radius:6px;padding:1px 6px;color:#fff;font-size:12px}
      .gp-niv{display:flex;gap:8px;align-items:flex-start;padding:6px 0;border-bottom:1px solid var(--line)}
      .gp-niv:last-child{border-bottom:0}
      .gp-niv.on{color:var(--amber)}
      .gp-niv b{flex:none;min-width:92px}
      .gp-niv span{flex:1;min-width:0;font-size:12px;overflow-wrap:anywhere}
      .gp-aviso{border-color:var(--amber)!important;background:#221c0e!important}
      .gp-franja{display:flex;align-items:center;gap:8px;width:100%;text-align:start;background:linear-gradient(90deg,#2a2412,#151720);border:0;border-bottom:1px solid var(--line);
        padding:8px max(16px,env(safe-area-inset-right,0px)) 8px max(16px,env(safe-area-inset-left,0px));font-size:13px;font-weight:600;color:var(--text,#fff)}
      .gp-franja[hidden]{display:none}
      .gp-franja .grow{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
      .gp-franja i{font-style:normal;flex:none;background:var(--red);color:#fff;border-radius:9px;padding:0 7px;font-size:11px}
      .gp-card{position:relative;margin:0 0 12px;padding:12px 14px;border-radius:14px;border:1px solid #ffd27a66;background:linear-gradient(135deg,#1b1406 0%,#0d0f14 60%,#14101f 100%)}
      .gp-card h2{margin:0 0 4px;font-size:16px;overflow-wrap:anywhere}
      .gp-card .bar{margin:6px 0 10px}
      .gp-card .btn{margin:0}`;
    document.head.appendChild(s);
  }

  /* ---------- Resumen (franjas) ---------- */
  async function consultarResumen(forzar) {
    const c = logueado() ? cuentaId() : null;
    if (c !== st.cuenta) { st.cuenta = c; st.resumen = null; st.datos = null; }
    if (!logueado() || !enAsoc() || st.noDisponible) { st.resumen = null; pintarFranjas(); return; }
    if (st.pidiendo || (!forzar && Date.now() - st.resumenEn < CADA_MS / 2)) return;
    st.resumenEn = Date.now(); st.pidiendo = true;
    try { st.resumen = await pedir('GET', '/api/gran/resumen'); st.resumen._en = Date.now(); }
    catch (e) { if (e.status === 404) st.noDisponible = true; }
    finally { st.pidiendo = false; }
    pintarFranjas();
  }
  function ciclo() {
    clearTimeout(st.timer);
    if (!root.document || document.visibilityState !== 'hidden') consultarResumen(false);
    st.timer = setTimeout(ciclo, CADA_MS);
  }
  const corre = (r) => !!(r && r.produccion && (r.fase === 'en_curso' || r.fase === 'pausada'));
  function textoFranja(r) {
    const p = r.produccion;
    const reloj = r.fase === 'pausada' ? t('gp.en_pausa') : t('gp.faltan', { t: fmt(restante(p.quedan_seg, r._en)) });
    return `${p.icono || '🎬'} ${t('gp.titulo')} · ${num(r.progreso || 0)} % · ${reloj}`;
  }
  function pintarFranjas() {
    if (!root.document) return;
    document.querySelectorAll('.gp-franja').forEach((el) => {
      const r = st.resumen;
      el.hidden = el.dataset.visible === '0' || !(corre(r) && r.en_asociacion);
      if (el.hidden) return;
      el.innerHTML = `<span class="grow">${esc(textoFranja(r))}</span>${r.disponibles > 0 ? `<i>${esc(t('gp.listos', { n: r.disponibles }))}</i>` : ''}<span aria-hidden="true">›</span>`;
    });
    // La franja de Inicio la vuelve a pintar ui.js (render), solo si lo que muestra cambió (sin producción: nunca)
    const r = st.resumen;
    const clave = corre(r) && r.en_asociacion ? JSON.stringify([r.fase, r.progreso, r.disponibles]) : '';
    if (clave === (st.ultimaFranja || '')) return;
    st.ultimaFranja = clave;
    try {
      if (st.ctxInicio && typeof st.ctxInicio.render === 'function' && !st.pintandoInicio) {
        st.pintandoInicio = true;
        setTimeout(() => { st.pintandoInicio = false; try { st.ctxInicio.render(); } catch (e) { /* nada */ } }, 0);
      }
    } catch (e) { /* nada */ }
  }

  /* ---------- Acciones ---------- */
  async function cargar() {
    st.error = '';
    try { st.datos = await pedir('GET', '/api/gran'); st.datos._en = Date.now(); actualizarResumenDesdeVista(); }
    catch (e) { st.error = e.message; if (e.status === 404) st.noDisponible = true; }
    if (st.abierto) pintar();
  }
  function actualizarResumenDesdeVista() {
    const d = st.datos;
    if (!d) return;
    const disp = d.yo && d.produccion && d.produccion.estado === 'en_curso' && !d.yo.espera ? Object.values(d.yo.disponibles || {}).reduce((a, b) => a + (Number(b) || 0), 0) : 0;
    st.resumen = { ok: true, fase: d.fase, produccion: d.produccion, en_asociacion: d.en_asociacion, progreso: d.asociacion ? d.asociacion.progreso : null, disponibles: disp, espera: d.yo ? d.yo.espera : 0, _en: d._en };
    pintarFranjas();
  }
  async function aportar(frente) {
    if (st.ocupado) return;
    st.ocupado = true; pintar();
    try {
      const r = await pedir('POST', '/api/gran/aportar', { frente });
      st.datos = r; st.datos._en = Date.now(); actualizarResumenDesdeVista();
      toast(t(frente === 'personal' ? 'gp.ok_personal' : 'gp.ok_equipos', { n: r.aporte.cantidad, pct: r.asociacion ? r.asociacion.progreso : 0 }));
      sonido('hire');
    } catch (e) {
      toast(e.message); sonido('error');
      if (e.status === 409) cargar();
    } finally { st.ocupado = false; if (st.abierto) pintar(); }
  }

  /* ---------- Pantalla ---------- */
  function vistaPronto(d) {
    const px = d.proxima;
    let o = '';
    if (d.ultima) o += vistaUltima(d.ultima);
    if (!px) return o + `<div class="card"><p class="small muted">${esc(t('gp.apagada'))}</p></div>` + vistaComo(d);
    o += `<div class="gp-hero"><div class="gp-ico">${esc(px.icono || '🎬')}</div><div class="small muted">${esc(t('gp.proxima'))}</div>
      <h3>${esc(temaNombre(px))}</h3><div class="gp-reloj">${esc(t('gp.empieza_en', { t: fmt(restante(px.empieza_seg, d._en)) }))}</div>
      <p class="small muted" style="margin:6px 0 0">${esc(t('gp.dura', { h: px.horas }))}</p></div>`;
    if (!d.en_asociacion) o += `<div class="card gp-aviso small">${esc(t('gp.sin_asoc'))}</div>`;
    return o + vistaComo(d) + vistaPremios(d, null);
  }
  function vistaUltima(u) {
    const a = u.asociacion;
    let txt = u.estado === 'cancelada' ? t('gp.ultima_cancelada') : a && a.progreso > 0 ? t('gp.ultima_res', { pct: a.progreso, nivel: nivelNombre(a.nivel), puesto: a.puesto }) : t('gp.ultima_sin');
    return `<div class="card"><div class="small muted">${esc(t('gp.ultima', { tema: temaNombre(u) }))}</div><b>${esc(txt)}</b>
      ${u.premio ? `<div class="small" style="margin-top:4px">🎁 ${esc(t('gp.tu_premio', { p: premiosTxt(u.premio.premios) }))}</div>` : ''}</div>`;
  }
  function vistaComo(d) {
    const F = {}; (d.reglas.frentes || []).forEach((f) => { F[f.id] = f; });
    return `<div class="card"><b>${esc(t('gp.como_t'))}</b>
      <p class="small" style="margin:6px 0 0">👷 ${esc(t('gp.como_personal', { max: F.personal ? F.personal.max : 8, h: F.personal ? Math.round(F.personal.cada_seg / 3600) : 4 }))}</p>
      <p class="small" style="margin:4px 0 0">🎛️ ${esc(t('gp.como_equipos', { max: F.equipos ? F.equipos.max : 8 }))}</p>
      <p class="small" style="margin:4px 0 0">📡 ${esc(t('gp.como_transmision', { max: F.transmision ? F.transmision.max : 12 }))}</p>
      <p class="small muted" style="margin:6px 0 0">${esc(t('gp.como_meta'))}</p></div>`;
  }
  function vistaPremios(d, actual) {
    const niv = d.reglas.niveles || [];
    let o = `<div class="sectitle">${esc(t('gp.premios_t'))}</div><div class="card"><p class="small muted" style="margin:0 0 4px">${esc(t('gp.premios_info'))}</p>`;
    o += niv.map((n) => `<div class="gp-niv${n.id === actual ? ' on' : ''}"><b>${n.id === actual ? '✓ ' : ''}${esc(nivelNombre(n.id))} · ${num(n.pct)} %</b><span>${esc(premiosTxt(n.premios))}</span></div>`).join('');
    o += (d.reglas.puestos || []).map((p) => `<div class="gp-niv"><b>🏆 ${esc(t('gp.puesto_n', { n: p.puesto }))}</b><span>+ ${esc(premiosTxt(p.premios))} <span class="muted">(${esc(t('gp.puesto_cond'))})</span></span></div>`).join('');
    return o + '</div>';
  }
  function vistaCurso(d) {
    const p = d.produccion, a = d.asociacion, yo = d.yo;
    const pausa = p.estado === 'pausada';
    let o = `<div class="gp-hero"><div class="row" style="display:flex;gap:10px;align-items:center"><div class="gp-ico">${esc(p.icono || '🎬')}</div>
      <div style="flex:1;min-width:0"><div class="small muted">${esc(t('gp.cubre'))}</div><h3>${esc(temaNombre(p))}</h3></div></div>
      <div class="${pausa ? 'gp-pausa' : 'gp-reloj'}" data-gp="reloj">${esc(pausa ? t('gp.pausada') : t('gp.faltan', { t: fmt(restante(p.quedan_seg, d._en)) }))}</div>`;
    if (!a) return o + `</div><div class="card gp-aviso small">${esc(t('gp.sin_asoc'))}</div>` + vistaComo(d) + vistaPremios(d, null);
    const pct = a.progreso;
    const marcas = (d.reglas.niveles || []).filter((n) => n.pct > 1).map((n) => `<span class="gp-marca${pct >= n.pct ? ' on' : ''}" style="left:${Math.min(100, n.pct / 2)}%">${esc(nivelNombre(n.id))}</span>`).join('');
    o += `<div class="gp-barra" role="progressbar" aria-valuemin="0" aria-valuemax="200" aria-valuenow="${pct}" aria-label="${esc(t('gp.progreso', { pct }))}">${marcas}<i style="width:${Math.min(100, pct / 2)}%"></i></div>
      <div style="display:flex;align-items:baseline;gap:8px;flex-wrap:wrap"><span class="gp-pct" data-gp="pct">${num(pct)} %</span>
      <span class="small">${esc(a.nivel ? t('gp.nivel_actual', { nivel: nivelNombre(a.nivel) }) : t('gp.sin_nivel'))}</span>
      ${a.siguiente ? `<span class="small muted">· ${esc(t('gp.siguiente', { nivel: nivelNombre(a.siguiente.id), pct: a.siguiente.pct }))}</span>` : ''}</div>
      <p class="small muted" style="margin:6px 0 0">${esc(t('gp.meta_info', { n: a.activos }))}${a.puesto ? ' · ' + esc(t('gp.puesto_actual', { n: a.puesto })) : ''}</p></div>`;
    const ICO = { personal: '👷', equipos: '🎛️', transmision: '📡' };
    o += `<div class="gp-frentes">${['personal', 'equipos', 'transmision'].map((f) => { const tot = a.totales[f], meta = a.metas[f];
      return `<div class="gp-frente"><b>${ICO[f]} ${num(tot)}/${num(meta)}</b><small>${esc(t('gp.frente.' + f))}</small><div class="bar"><i style="width:${Math.min(100, Math.round(100 * tot / Math.max(1, meta)))}%"></i></div></div>`; }).join('')}</div>`;
    // Mi aporte
    o += `<div class="sectitle">${esc(t('gp.tu_aporte'))}</div><div class="card">`;
    if (yo.otra_asociacion) o += `<p class="small">${esc(t('gp.otra_asoc'))}</p>`;
    else if (yo.espera > 0) o += `<p class="small">⏳ ${esc(t('gp.espera', { t: fmt(restante(yo.espera, d._en)) }))}</p>`;
    else if (pausa) o += `<p class="small">${esc(t('gp.pausada_txt'))}</p>`;
    else {
      o += `<div class="gp-btns">${['personal', 'equipos'].map((f) => {
        const n = yo.disponibles[f] || 0, lleno = yo.aportes[f] >= yo.max[f];
        const sub = lleno ? t('gp.completo') : n > 0 ? t('gp.listos', { n }) : yo.proximo_seg[f] ? t('gp.proximo', { t: fmt(restante(yo.proximo_seg[f], d._en)) }) : '';
        return `<button class="btn ${n > 0 ? 'main' : ''}" data-gp="aportar" data-frente="${f}"${n > 0 && !st.ocupado ? '' : ' disabled'}>${ICO[f]} ${esc(t('gp.btn.' + f))}${n > 1 ? ' (×' + n + ')' : ''}<small>${esc(sub)} · ${num(yo.aportes[f])}/${num(yo.max[f])}</small></button>`;
      }).join('')}</div>`;
    }
    o += `<p class="small" style="margin:8px 0 0">📡 ${esc(t('gp.transm_txt', { n: yo.aportes.transmision, max: yo.max.transmision }))}</p>
      <p class="small muted" style="margin:4px 0 0">${esc(t('gp.no_gasta'))}</p></div>`;
    // Miembros
    o += `<div class="sectitle">${esc(t('gp.miembros_t'))}</div><div class="card">` + (d.miembros || []).map((m) =>
      `<div class="gp-fila${m.yo ? ' yo' : ''}"><span class="grow">${esc(m.nombre)}${m.yo ? ' · ' + esc(t('gp.tu')) : ''}</span><span class="n">👷 ${m.personal} · 🎛️ ${m.equipos} · 📡 ${m.transmision}</span><b>${num(m.total)}</b></div>`).join('')
      + `<p class="small muted" style="margin:6px 0 0">${esc(t('gp.tope_info'))}</p></div>`;
    // Tabla del servidor
    o += `<div class="sectitle">${esc(t('gp.tabla_t'))}</div><div class="card">` + ((d.tabla || []).length ? d.tabla.map((x) =>
      `<div class="gp-fila${x.mia ? ' yo' : ''}"><span class="n">${x.posicion}.</span><span class="gp-sig" style="background:${/^#[0-9a-f]{6}$/i.test(x.color || '') ? x.color : 'var(--red)'}">${esc(x.siglas)}</span><span class="grow">${esc(x.nombre)}</span><span class="n">${esc(nivelNombre(x.nivel))}</span><b>${num(x.progreso)} %</b></div>`).join('')
      : `<p class="small muted">${esc(t('gp.tabla_vacia'))}</p>`) + `<p class="small muted" style="margin:6px 0 0">${esc(t('gp.tabla_info'))}</p></div>`;
    return o + vistaPremios(d, a.nivel) + vistaComo(d);
  }
  function pintar() {
    const p = root.document && document.getElementById('gp-panel');
    if (!p || !st.abierto) return;
    const d = st.datos;
    let cuerpo;
    if (!logueado()) cuerpo = `<p class="small muted">${esc(t('gp.sin_sesion'))}</p>`;
    else if (!d) cuerpo = st.error ? `<p class="small muted">${esc(st.error)}</p><button class="btn" data-gp="recargar">${esc(t('gp.reintentar'))}</button>` : `<p class="small muted">${esc(t('gp.cargando'))}</p>`;
    else if (d.fase === 'en_curso' || d.fase === 'pausada') cuerpo = vistaCurso(d);
    else cuerpo = vistaPronto(d);
    const sc = p.querySelector('.gp-cuerpo') ? p.querySelector('.gp-cuerpo').scrollTop : 0;
    const a = d && d.asociacion;
    p.innerHTML = `<div class="gp-top"><h2>🎬 ${esc(t('gp.titulo'))}${a ? ` <span class="small muted">· ${esc(a.siglas)}</span>` : ''}</h2>
      <button class="btn sm" data-gp="cerrar" aria-label="${esc(t('gp.cerrar'))}">✕</button></div><div class="gp-cuerpo">${cuerpo}</div>`;
    const c = p.querySelector('.gp-cuerpo'); if (c) c.scrollTop = sc;
  }
  function construir() {
    css();
    if (root.document && !document.getElementById('gp-panel')) {
      const p = document.createElement('div');
      p.id = 'gp-panel'; p.hidden = true; p.setAttribute('role', 'dialog');   // aria-modal solo mientras está abierta (otros módulos lo miran)
      document.body.appendChild(p);
    }
  }
  function abrir() {
    construir();
    st.abierto = true;
    const el = document.getElementById('gp-panel');
    el.hidden = false; el.setAttribute('aria-modal', 'true');
    pintar(); cargar();
    clearInterval(st.tick);
    st.tick = setInterval(() => { if (st.abierto && !st.ocupado) pintar(); }, 30000);   // el reloj baja solo
  }
  function cerrar() {
    st.abierto = false;
    clearInterval(st.tick);
    const p = document.getElementById('gp-panel'); if (p) { p.hidden = true; p.removeAttribute('aria-modal'); }
  }
  function alClic(ev) {
    const f = ev.target.closest('.gp-franja, [data-gp]');
    if (!f) return;
    if (f.classList.contains('gp-franja') || f.dataset.gp === 'abrir') { ev.preventDefault(); abrir(); return; }
    if (f.disabled) return;
    const k = f.dataset.gp;
    if (k === 'cerrar') { ev.preventDefault(); cerrar(); }
    else if (k === 'recargar') { ev.preventDefault(); cargar(); }
    else if (k === 'aportar') { ev.preventDefault(); aportar(f.dataset.frente); }
  }

  /* ---------- Franja de Inicio (ui.js la pone arriba de la productora) ---------- */
  function banner(ctx) {
    st.ctxInicio = ctx;
    if (!st.ctx) iniciar(ctx);
    consultarResumen(false);
    const r = st.resumen;
    if (!corre(r) || !r.en_asociacion) return '';
    css();
    const p = r.produccion;
    const pausa = r.fase === 'pausada';
    return `<div class="gp-card" data-gp="card"><h2>${esc(p.icono || '🎬')} ${esc(t('gp.titulo'))}: ${esc(temaNombre(p))}</h2>
      <div class="small">${esc(t('gp.progreso', { pct: r.progreso || 0 }))} · ${esc(pausa ? t('gp.en_pausa') : t('gp.faltan', { t: fmt(restante(p.quedan_seg, r._en)) }))}</div>
      <div class="bar"><i style="width:${Math.min(100, (r.progreso || 0) / 2)}%;background:var(--amber)"></i></div>
      <button class="btn ${r.disponibles > 0 ? 'main' : ''}" data-gp="abrir">${esc(r.disponibles > 0 ? t('gp.aportar_n', { n: r.disponibles }) : t('gp.ver'))}</button></div>`;
  }

  /* ---------- API pública ---------- */
  function iniciar(ctx) {
    if (ctx && (ctx.Api || ctx.toast)) st.ctx = Object.assign({}, st.ctx || {}, ctx);
    if (st.iniciado) { consultarResumen(true); return; }
    st.iniciado = true;
    if (!root.document) return;
    construir();
    document.addEventListener('click', alClic);
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') ciclo(); });
    try { if (I18() && I18().onChange) I18().onChange(() => { pintarFranjas(); if (st.abierto) pintar(); }); } catch (e) { /* nada */ }
    ciclo();
    // Aviso push "/?ir=gran": abre la pantalla en cuanto haya sesión
    try {
      if (/[?&]ir=gran\b/.test(root.location.search || '')) {
        let n = 0;
        const esperar = () => { if (logueado()) abrir(); else if (++n < 20) setTimeout(esperar, 500); };
        esperar();
      }
    } catch (e) { /* nada */ }
  }
  const GranProduccion = {
    iniciar, abrir, cerrar,
    refrescar() { consultarResumen(true); if (st.abierto) cargar(); },
    /** Franja dentro de la pestaña "Asociación" del chat (debajo de la barra de Ayudas). */
    franja(panel, visible) {
      if (!panel || !root.document) return;
      css();
      let el = panel.querySelector('#gp-franja');
      if (!el) {
        el = document.createElement('button');
        el.id = 'gp-franja'; el.className = 'gp-franja'; el.type = 'button'; el.hidden = true;
        const barra = panel.querySelector('#chat-asoc-barra');
        if (barra && barra.parentNode) barra.parentNode.insertBefore(el, barra.nextSibling); else panel.insertBefore(el, panel.firstChild);
      }
      el.dataset.visible = visible ? '1' : '0';
      if (!visible) { el.hidden = true; return; }
      pintarFranjas();
      consultarResumen(false);
    },
    get estado() { return { datos: st.datos, resumen: st.resumen, abierto: st.abierto }; },
  };
  root.GranProduccion = GranProduccion;
  root.EnVivoInicio = root.EnVivoInicio || [];
  if (!root.EnVivoInicio.some((m) => m && m.id === ID)) root.EnVivoInicio.push({ id: ID, orden: -5, banner, clic: () => abrir() });
  if (root.GranProduccionCtx) iniciar(root.GranProduccionCtx);
  if (typeof module !== 'undefined' && module.exports) module.exports = GranProduccion;
})(typeof window !== 'undefined' ? window : globalThis);
