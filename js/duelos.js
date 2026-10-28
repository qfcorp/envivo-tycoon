/* =========================================================
   EN VIVO Tycoon — Duelo de Productoras (pantalla)
   Contrato: server/INTEGRAR_DUELOS_DESAFIO.md. El servidor decide todo (semilla, contrato, equipos, resultado);
   aquí solo se muestra, se juega el intento EN VIVO y se mandan las decisiones.
   Uso desde ui.js:
     Duelos.render(elemento, ctx)   ctx = { G, A, estado(), toast, ask, openModal, closeModal, snd, sincronizar, Api? }
     Duelos.invalidar()             vuelve a pedir los datos la próxima vez
   Necesita window.Intento (server/validador/intento.js servido como js/intento.js): el juego arma el evento
   EXACTAMENTE como lo repite el validador. Si no está, lo carga solo desde js/intento.js.
   También:
     - window.EnVivoVivo: motor para jugar un intento (lo usa js/desafio.js).
     - Entregas tipo "fama" (premios de duelos): se aplican a la partida (s.rep) una sola vez.
   Textos: I18N.T si existe (claves duelo.*), si no, el español de aquí.
   ========================================================= */
(function (root) {
  'use strict';
  const ES = {
    'duelo.titulo': 'Duelo de Productoras', 'duelo.cargando': 'Abriendo los duelos…', 'duelo.entrar': 'Entra a tu cuenta para retar a otras productoras.',
    'duelo.reintentar': 'Intentar de nuevo', 'duelo.temporada': '{nombre}', 'duelo.puntaje': 'Puntaje', 'duelo.puesto': 'Puesto {n}',
    'duelo.sin_puesto': 'Sin puesto aún', 'duelo.record': '{g} ganados · {p} perdidos', 'duelo.racha': 'Racha de {n}',
    'duelo.hoy': 'Duelos de hoy', 'duelo.restantes': '{n} de {total}', 'duelo.extra': 'Intento extra · {precio}',
    'duelo.extra_max': 'Ya compraste los {n} extra de hoy', 'duelo.extra_ok': '¡Listo! Tienes un duelo más.',
    'duelo.extra_pregunta': '¿Comprar un intento extra por <b>{precio} créditos</b>?<br><span class="small muted">Te quedarán {quedan} créditos.</span>',
    'duelo.si_comprar': 'Sí, comprar', 'duelo.en_curso': 'Tienes un duelo en curso contra {rival}', 'duelo.continuar': 'Continuar',
    'duelo.revisando': 'Tu último duelo se está revisando. El resultado aparece en unos minutos.',
    'duelo.defensas': '{n} defensa(s) nueva(s) de tu equipo', 'duelo.mi_equipo': 'Tu equipo de duelo', 'duelo.registrar': 'Registrar mi equipo',
    'duelo.editar': 'Cambiar equipo', 'duelo.sin_equipo': 'Registra tu mejor equipo: con él te retan las demás productoras y con él juegas tus duelos.',
    'duelo.poder': 'Poder {n}', 'duelo.personas': '{n} personas', 'duelo.contrato': 'Contrato del duelo', 'duelo.nivel.facil': 'Fácil',
    'duelo.nivel.medio': 'Medio', 'duelo.nivel.dificil': 'Difícil', 'duelo.camaras': '{n} cámaras', 'duelo.fama_premio': '+{n} fama',
    'duelo.rivales': 'Rivales de tu servidor', 'duelo.sin_rivales': 'Todavía no hay otras productoras con equipo de duelo en tu servidor.',
    'duelo.retar': 'Retar', 'duelo.retado_max': 'Ya la retaste {n} veces hoy', 'duelo.ranking': 'Ranking de la temporada',
    'duelo.historial': 'Últimos duelos', 'duelo.sin_historial': 'Todavía no tienes duelos.', 'duelo.vs': 'vs',
    'duelo.ganaste': 'Ganaste', 'duelo.perdiste': 'Perdiste', 'duelo.empate': 'Empate', 'duelo.defendiste': 'Defendiste',
    'duelo.te_ganaron': 'Te ganaron', 'duelo.vencido': 'Se acabó el tiempo', 'duelo.imposible': 'Jugada no válida',
    'duelo.retar_pregunta': '¿Retar a <b>{rival}</b> por el contrato <b>{cliente}</b> ({nivel})?<br><span class="small muted">Usas 1 de tus duelos de hoy. Tienes {min} minutos para jugarlo; si no lo terminas, pierdes.</span>',
    'duelo.si_retar': '¡A competir!', 'duelo.preparando': 'Preparando el duelo…', 'duelo.en_vivo': 'EN VIVO', 'duelo.imprevisto': 'Imprevisto {n} de {total}', 'duelo.prob': '{n} % de salir bien',
    'duelo.siguiente': 'Siguiente', 'duelo.terminar': 'Ver resultado', 'duelo.enviando': 'El servidor está repitiendo tu jugada…',
    'duelo.tu': 'Tú', 'duelo.calidad': 'Calidad', 'duelo.cambio': 'Puntaje {n}', 'duelo.fama': '+{n} de fama',
    'duelo.volver': 'Volver a los duelos', 'duelo.otra_vez': 'Retar a otra productora', 'duelo.sus_imprevistos': 'Su jugada (equipo guardado)',
    'duelo.tus_imprevistos': 'Tu jugada', 'duelo.guardar': 'Guardar equipo', 'duelo.cancelar': 'Cancelar', 'duelo.guardado': 'Tu equipo de duelo quedó registrado.',
    'duelo.tope': 'Con tu fama, el servidor acepta personal hasta habilidad {n} (más el personal que compraste en la tienda).',
    'duelo.kit': 'Todos llevan el kit básico de duelo: {kit}.', 'duelo.exclusivos': 'Tus equipos del servidor', 'duelo.sin_exclusivos': 'No tienes equipos exclusivos en el servidor. Igual compites con el kit básico.',
    'duelo.personal': 'Tu personal', 'duelo.max_personal': 'Máximo {n} personas.', 'duelo.dueno': 'Tú', 'duelo.vip_guardado': 'Solo con VIP activo',
    'duelo.sin_intento_js': 'Falta el motor de eventos en línea (js/intento.js). Recarga el juego.', 'duelo.pendiente': 'Tu jugada quedó guardada. El resultado aparece en unos minutos.',
    'duelo.reglas': 'Mismo contrato, misma semilla y el mismo sorteo de imprevistos para los dos. Tú juegas en vivo; tu rival juega con su equipo guardado y decide como un productor prudente.',
    'duelo.fama_recibida': 'Fama de duelos: +{n}', 'duelo.liga': 'Liga {liga}', 'duelo.sin_cupos': 'Ya usaste tus duelos de hoy.',
    'duelo.inc.cable': 'Cable roto', 'duelo.inc.plano_perdido': 'No se ve la jugada', 'duelo.inc.toma_combo': 'Toma perfecta', 'duelo.inc.cable_pisado': 'Cable pisado', 'duelo.inc.internet': 'Se cayó el internet', 'duelo.inc.luz': 'Apagón',
    'duelo.inc.lluvia': 'Lluvia', 'duelo.inc.tarde': 'Alguien llegó tarde', 'duelo.inc.acople': 'Acople de audio', 'duelo.inc.bateria': 'Batería agotada',
    'duelo.inc.logo': 'Logo a última hora', 'duelo.inc.falla': 'Equipo gastado', 'duelo.inc.epico': 'Momento épico', 'duelo.inc.permiso': 'Permiso del local',
    'duelo.inc.transporte': 'Transporte varado', 'duelo.inc.robo': 'Robo de un equipo', 'duelo.inc.senal': 'Señal trabada', 'duelo.inc.guion': 'Cambio de guion',
    'duelo.inc.multitud': 'Gente tapando la cámara', 'duelo.inc.vip': 'Invitado importante', 'duelo.inc.marcador': 'Falla el marcador',
    'duelo.inc.entrevista': 'Entrevista sorpresa', 'duelo.inc.cobertura': 'Sin cobertura', 'duelo.inc.sin_repeticion': 'Sin repetición',
    'duelo.inc.colores': 'Colores distintos', 'duelo.inc.dron': 'Problema con el dron', 'duelo.inc.entrada': 'Entrada al aire', 'duelo.inc.pieza': 'Pieza perdida',
  };
  const T = (k, p) => {
    try { if (root.I18N && root.I18N.T && (!root.I18N.T.has || root.I18N.T.has(k))) { const t = root.I18N.T(k, p); if (t && t !== k) return t; } } catch (e) { /* español */ }
    return String(ES[k] !== undefined ? ES[k] : k).replace(/\{(\w+)\}/g, (m, x) => (p && p[x] !== undefined ? p[x] : m));
  };
  const esc = (t) => String(t == null ? '' : t).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const num = (n) => Number(n || 0).toLocaleString((root.I18N && root.I18N.idioma) || 'es-EC');
  const clon = (o) => JSON.parse(JSON.stringify(o));

  async function pedir(method, ruta, body) {
    const h = { 'Content-Type': 'application/json', 'X-Envivo': '1' };
    try { if (root.I18N && root.I18N.idioma) h['X-Envivo-Idioma'] = root.I18N.idioma; } catch (e) { /* nada */ }
    const r = await fetch(ruta, { method, headers: h, credentials: 'same-origin', cache: 'no-store', body: body ? JSON.stringify(body) : undefined });
    let j = null; try { j = await r.json(); } catch (e) { j = null; }
    if (!j || !r.ok || j.ok === false) { const e = new Error((j && j.error) || 'No se pudo completar. Intenta de nuevo.'); e.status = r.status; e.datos = j; throw e; }
    return j;
  }

  const nombreInc = (k) => { const t = T('duelo.inc.' + k); return t === 'duelo.inc.' + k ? String(k || '').replace(/_/g, ' ') : t; };

  /* ---------- Estilos (prefijo dl-) ---------- */
  function css() {
    if (typeof document === 'undefined' || document.getElementById('duelos-css')) return;
    const s = document.createElement('style');
    s.id = 'duelos-css';
    s.textContent = `
      .dl-hero{position:relative;overflow:hidden;background:radial-gradient(120% 140% at 100% 0%,#3a1519 0%,var(--panel) 55%);border-color:#5a2026}
      .dl-hero .dl-r{font-family:"JetBrains Mono",ui-monospace,monospace;font-size:34px;font-weight:600;line-height:1;font-variant-numeric:tabular-nums}
      .dl-liga{display:inline-flex;align-items:center;gap:5px;border-radius:999px;padding:3px 10px;font-size:12px;font-weight:700;letter-spacing:.4px;text-transform:uppercase;border:1px solid currentColor}
      .dl-liga.Bronce{color:#d9925a}.dl-liga.Plata{color:#c9d1dc}.dl-liga.Oro{color:#ffcf4d}.dl-liga.Platino{color:#7fe0d0}.dl-liga.Diamante{color:#8cc4ff}
      .dl-cupos{display:flex;gap:4px;margin-top:8px}.dl-cupos i{flex:1;height:6px;border-radius:3px;background:var(--line)}.dl-cupos i.on{background:var(--red)}.dl-cupos i.extra.on{background:var(--amber)}
      .dl-niveles{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px}
      .dl-nivel{background:var(--panel2);border:1px solid var(--line);border-radius:12px;padding:9px 8px;text-align:left;min-width:0}
      .dl-nivel.on{border-color:var(--red);background:#2a1a1f}
      .dl-nivel b{display:block;font-family:"Barlow Condensed","Arial Narrow",sans-serif;font-size:16px;text-transform:uppercase;letter-spacing:.5px}
      .dl-nivel span{display:block;font-size:11.5px;color:var(--muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
      .dl-nivel .ico{width:18px;height:18px;color:var(--amber)}
      .dl-nivel .dl-fama{color:var(--amber);font-weight:600}
      .dl-rival{display:flex;align-items:center;gap:10px}.dl-rival .grow{min-width:0}
      .dl-rival h3{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
      .dl-av{flex:none;width:44px;height:44px;border-radius:12px;overflow:hidden;display:grid;place-items:center;background:var(--panel2)}
      .dl-av svg{width:44px;height:44px;display:block}
      .dl-mini{font-size:12px;color:var(--muted)}
      .dl-rank{display:grid;grid-template-columns:28px minmax(0,1fr) auto;gap:8px;align-items:center;padding:7px 0;border-top:1px solid var(--line);font-size:14px}
      .dl-rank:first-child{border-top:0}.dl-rank.yo{color:var(--amber)}
      .dl-rank .n{font-family:"JetBrains Mono",monospace;color:var(--muted);text-align:right}
      .dl-rank .nm{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
      .dl-hist{display:flex;align-items:center;gap:10px;padding:8px 0;border-top:1px solid var(--line)}.dl-hist:first-child{border-top:0}
      .dl-res{flex:none;width:8px;align-self:stretch;border-radius:4px;background:var(--line)}.dl-res.g{background:var(--green)}.dl-res.p{background:var(--red)}.dl-res.e{background:var(--amber)}
      .dl-vs{display:grid;grid-template-columns:minmax(0,1fr) auto minmax(0,1fr);align-items:center;gap:8px;text-align:center}
      .dl-vs .q{font-family:"JetBrains Mono",monospace;font-size:40px;font-weight:600;line-height:1}
      .dl-vs .lado{min-width:0}.dl-vs .lado .nm{font-size:13px;color:var(--muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
      .dl-vs .x{font-family:"Barlow Condensed","Arial Narrow",sans-serif;font-size:18px;color:var(--muted)}
      .dl-banner{border-radius:12px;padding:10px 12px;font-family:"Barlow Condensed","Arial Narrow",sans-serif;font-size:24px;font-weight:800;text-transform:uppercase;letter-spacing:.6px;text-align:center}
      .dl-banner.g{background:#0e2e1d;color:#7fe0a8;border:1px solid #1a4d31}.dl-banner.p{background:#3a1519;color:#ff8f8f;border:1px solid #5a2026}.dl-banner.e{background:#3a2a0d;color:#ffcf6e;border:1px solid #5a4214}
      .dl-inc{display:flex;justify-content:space-between;gap:8px;font-size:13px;padding:5px 0;border-top:1px dashed var(--line)}.dl-inc:first-child{border-top:0}
      .dl-inc b{font-family:"JetBrains Mono",monospace}.dl-inc b.neg{color:var(--red)}.dl-inc b.pos{color:var(--green)}
      .dl-elige{display:flex;align-items:center;gap:10px;padding:8px 0;border-top:1px solid var(--line)}.dl-elige:first-child{border-top:0}
      .dl-elige input{width:20px;height:20px;accent-color:var(--red);flex:none}
      .dl-elige label{flex:1;min-width:0;display:flex;align-items:center;gap:10px}
      .dl-vivo .scene{margin-bottom:10px}
      .dl-paso{font-family:"Barlow Condensed","Arial Narrow",sans-serif;text-transform:uppercase;color:var(--muted);letter-spacing:1px;font-size:13px}
      .dl-texto{font-size:16px;line-height:1.4;margin:6px 0 4px}
      .dl-op{display:block;width:100%;text-align:left;border-radius:12px;padding:12px;margin-top:8px;background:var(--panel2);border:1px solid var(--line);font-weight:600}
      .dl-op:disabled{opacity:.45}.dl-op small{display:block;font-weight:400;color:var(--muted);margin-top:2px}
      .dl-op:not(:disabled):active{transform:scale(.99)}
      .dl-msg{border-radius:12px;padding:10px 12px;margin-top:10px;background:var(--panel2);border:1px solid var(--line)}
      .dl-msg b{font-family:"JetBrains Mono",monospace}
      .dl-chips{display:flex;flex-wrap:wrap;gap:6px;margin-top:6px}`;
    document.head.appendChild(s);
  }

  /* ---------- Motor para jugar un intento (compartido con el Desafío del Día) ---------- */
  let cargaIntento = null;
  function asegurarIntento() {
    if (root.Intento) return Promise.resolve(root.Intento);
    if (typeof document === 'undefined') return Promise.reject(new Error(T('duelo.sin_intento_js')));
    if (!cargaIntento) {
      cargaIntento = new Promise((ok, mal) => {
        const sc = document.createElement('script');
        sc.src = 'js/intento.js';
        sc.onload = () => (root.Intento ? ok(root.Intento) : mal(new Error(T('duelo.sin_intento_js'))));
        sc.onerror = () => { cargaIntento = null; mal(new Error(T('duelo.sin_intento_js'))); };
        document.head.appendChild(sc);
      });
    }
    return cargaIntento;
  }
  const Vivo = {
    asegurar: asegurarIntento,
    /* Arma el evento con el MISMO estado que usa el validador (Intento.crearEstado) y lo empieza. */
    crear(G, intento) {
      const I = root.Intento;
      if (!I) throw new Error(T('duelo.sin_intento_js'));
      const datos = clon(intento);
      const est = I.crearEstado(G, datos);
      const { s, contractId, staffIds, equipIds } = est;
      // Plan de cámaras a mano del intento (opcional, con índices de equipo.equip / equipo.staff): igual que el validador
      const col = I.colocacionDe ? I.colocacionDe(datos, est) : null;
      const P = root.Premium; const antes = P ? !!P.vip : false;
      if (P && P.setVip) P.setVip(datos.vip === true);
      let r;
      try { r = col ? G.startEvent(s, contractId, staffIds, equipIds, col) : G.startEvent(s, contractId, staffIds, equipIds); } finally { if (P && P.setVip) P.setVip(antes); }
      if (!r || !r.ok) throw new Error((r && r.msg) || 'No se pudo empezar el evento.');
      return { G, s, intento: datos, decisiones: [], ultimo: null, resultado: null,
        contrato: s.currentEvent.contract, gear: s.equip.map((e) => e.type), camaras: s.equip.filter((e) => G.CATALOG[e.type] && G.CATALOG[e.type].cat === 'cam').length };
    },
    incidente(v) { return v.resultado ? null : v.G.currentIncident(v.s); },
    clave(v) { const ev = v.s.currentEvent; return ev && ev.incidents[ev.step] ? ev.incidents[ev.step].key : null; },
    elegir(v, i) {
      const r = v.G.resolveIncident(v.s, i);
      if (r && r.ok) { v.decisiones.push(i); v.ultimo = r; }
      return r;
    },
    terminar(v) {
      const f = v.G.finishEvent(v.s);
      if (!f || !f.ok) throw new Error((f && f.msg) || 'No se pudo terminar el evento.');
      v.resultado = f.result;
      const out = { decisiones: v.decisiones.slice(), resultado: { quality: f.result.quality, stars: f.result.stars } };
      if (Array.isArray(v.intento.colocacion)) out.colocacion = v.intento.colocacion.slice();   // va con las decisiones
      return out;
    },
    /* Pinta el paso actual del evento en vivo. alTerminar() se llama cuando no quedan imprevistos. */
    pintar(el, v, A, pref, alTerminar) {
      const inc = Vivo.incidente(v);
      const c = v.contrato;
      const escena = (k, done) => { try { return A.scene(c.type, k, v.camaras, done, v.gear, { client: c.client, seed: v.intento.seed }); } catch (e) { return ''; } };
      if (!inc) {
        el.innerHTML = `<div class="dl-vivo">${escena(null, true)}<div class="card"><p class="dl-texto">${esc(v.ultimo ? v.ultimo.msg : '')}</p>
          <button class="btn main" data-${pref}="fin-vivo">${A.icon('check', 'sm')} ${esc(T('duelo.terminar'))}</button></div></div>`;
        el.querySelector(`[data-${pref}="fin-vivo"]`).onclick = (e) => { e.currentTarget.disabled = true; alTerminar(); };
        return;
      }
      const clave = Vivo.clave(v);
      el.innerHTML = `<div class="dl-vivo">${escena(clave, false)}
        <div class="card"><div class="dl-paso">${esc(T('duelo.imprevisto', { n: inc.n, total: inc.total }))}</div>
          <p class="dl-texto">${esc(inc.text)}</p>
          ${inc.choices.map((o) => `<button class="dl-op" data-${pref}="op" data-i="${o.i}" ${o.ok ? '' : 'disabled'}>${esc(o.label)}${typeof o.prob === 'number' ? `<small>${esc(T('duelo.prob', { n: Math.round(o.prob * 100) }))}</small>` : ''}${o.ok ? '' : `<small>${esc(o.why || '')}</small>`}</button>`).join('')}
        </div></div>`;
      el.querySelectorAll(`[data-${pref}="op"]`).forEach((b) => {
        b.onclick = () => {
          const r = Vivo.elegir(v, Number(b.dataset.i));
          if (!r || !r.ok) return;
          const card = el.querySelector('.card');
          card.querySelectorAll('.dl-op').forEach((x) => { x.disabled = true; });
          const q = Number(r.q) || 0;
          card.insertAdjacentHTML('beforeend', `<div class="dl-msg"><b class="${q < 0 ? 'neg' : 'pos'}">${q > 0 ? '+' : ''}${q}</b> ${esc(r.msg)}</div>
            <button class="btn main" data-${pref}="sig">${esc(Vivo.incidente(v) ? T('duelo.siguiente') : T('duelo.terminar'))}</button>`);
          card.querySelector(`[data-${pref}="sig"]`).onclick = (e) => { e.currentTarget.disabled = true; if (Vivo.incidente(v)) Vivo.pintar(el, v, A, pref, alTerminar); else alTerminar(); };
        };
      });
    },
  };

  /* ---------- Entregas tipo "fama" (premios de duelos): se aplican una vez a la partida ---------- */
  function instalarFama() {
    const P = root.Premium;
    if (!P || P.__famaDuelos || typeof P.aplicarEntregas !== 'function') return;
    const orig = P.aplicarEntregas;
    P.aplicarEntregas = function (s, entregas) {
      const hechos = [];
      (entregas || []).forEach((en) => {
        if (!en || en.tipo !== 'fama' || typeof en.id !== 'number') return;
        s.premium = s.premium && typeof s.premium === 'object' ? s.premium : {};
        if (!Array.isArray(s.premium.aplicadas)) s.premium.aplicadas = [];
        if (s.premium.aplicadas.includes(en.id)) return;
        s.premium.aplicadas.push(en.id);
        const n = Math.max(0, Math.min(10, Number(en.cantidad) || 0));
        s.rep = Math.min(100, (Number(s.rep) || 0) + n);
        const t = T('duelo.fama_recibida', { n });
        if (Array.isArray(s.log)) { s.log.unshift({ day: s.day, text: '⚔️ ' + t }); if (s.log.length > 80) s.log.length = 80; }
        hechos.push(t);
      });
      return hechos.concat(orig.call(this, s, entregas) || []);
    };
    P.__famaDuelos = true;
  }
  instalarFama();

  /* ---------- Pantalla ---------- */
  const st = { datos: null, cargando: false, error: '', vista: 'lobby', nivel: 'medio', vivo: null, duelo: null, rival: null, final: null };

  function avatar(ctx, nombre, rol, tam) {
    try { if (ctx.A.avatar) return ctx.A.avatar(nombre, rol || 'camarografo', tam || 44); } catch (e) { /* sin retrato */ }
    return ctx.A.icon('user');
  }
  function nombreRol(ctx, r) { try { return (ctx.G.ROLES[r] && ctx.G.ROLES[r].name) || r; } catch (e) { return r; } }

  async function cargar(ctx, el) {
    if (st.cargando) return;
    st.cargando = true; st.error = '';
    try { st.datos = await pedir('GET', '/api/duelos'); } catch (e) { st.error = e.message; if (e.status === 401) st.error = T('duelo.entrar'); }
    st.cargando = false;
    pintar(ctx, el);
  }

  function liga(l) { return `<span class="dl-liga ${esc(l)}">${esc(T('duelo.liga', { liga: l }))}</span>`; }

  function resultadoDe(d) {
    if (d.motivo === 'vencido' && d.rol === 'retador') return ['p', T('duelo.vencido')];
    if (d.empate) return ['e', T('duelo.empate')];
    if (d.rol === 'retador') return d.gane ? ['g', T('duelo.ganaste')] : ['p', d.motivo === 'jugada_imposible' ? T('duelo.imposible') : T('duelo.perdiste')];
    return d.gane ? ['g', T('duelo.defendiste')] : ['p', T('duelo.te_ganaron')];
  }

  function lobby(ctx) {
    const D = st.datos, A = ctx.A, r = D.rating, c = D.cupos;
    const tot = c.gratis + c.extra;
    const barras = Array.from({ length: tot }, (_, i) => `<i class="${i < tot - c.restantes ? '' : 'on'} ${i >= c.gratis ? 'extra' : ''}"></i>`).join('');
    const contratos = D.contratos.map((x) => `<button class="dl-nivel ${x.nivel === st.nivel ? 'on' : ''}" data-dl="nivel" data-k="${x.nivel}">
        <div class="row" style="gap:6px">${A.icon(x.contrato.type)}<b>${esc(T('duelo.nivel.' + x.nivel))}</b></div>
        <span>${esc(x.contrato.client)}</span><span>${esc(T('duelo.camaras', { n: x.contrato.cams }))}</span><span class="dl-fama">${esc(T('duelo.fama_premio', { n: x.fama_premio }))}</span></button>`).join('');
    const eq = D.equipo;
    const rivales = D.rivales.map((v) => `<div class="card dl-rival"><div class="dl-av">${avatar(ctx, v.nombre, 'director', 44)}</div>
        <div class="grow"><h3>${v.siglas ? `<span class="muted">[${esc(v.siglas)}]</span> ` : ''}${esc(v.nombre)}${v.vip ? ' ⭐' : ''}</h3>
          <div class="dl-mini">${esc(v.liga)} · <span class="num">${num(v.rating)}</span> · ${esc(T('duelo.poder', { n: v.poder }))}${v.retos_hoy ? ' · ' + esc(T('duelo.retado_max', { n: v.retos_hoy })) : ''}</div></div>
        ${window.Visitas ? window.Visitas.boton(v.id) : ''}<button class="btn sm main" data-dl="retar" data-id="${v.id}" ${!eq || !c.restantes || D.abierto || v.retos_hoy >= D.reglas.max_par_dia ? 'disabled' : ''}>${A.icon('rival', 'sm')} ${esc(T('duelo.retar'))}</button></div>`).join('');
    const abierto = D.abierto;
    return `
      <div class="card dl-hero"><div class="row between"><div><div class="small muted">${esc(D.temporada.nombre)}</div>
          <div class="row" style="gap:10px;margin-top:4px"><span class="dl-r">${num(r.rating)}</span>${liga(r.liga)}</div>
          <div class="small muted" style="margin-top:6px">${esc(r.puesto ? T('duelo.puesto', { n: r.puesto }) : T('duelo.sin_puesto'))} · ${esc(T('duelo.record', { g: r.ganados, p: r.perdidos }))}${r.racha > 1 ? ' · 🔥 ' + esc(T('duelo.racha', { n: r.racha })) : ''}</div></div>
          ${A.portrait ? `<div style="flex:none">${A.portrait('mega', 56)}</div>` : ''}</div>
        <div class="row between small" style="margin-top:12px"><span>${esc(T('duelo.hoy'))}</span><b class="num">${esc(T('duelo.restantes', { n: c.restantes, total: tot }))}</b></div>
        <div class="dl-cupos">${barras}</div>
        <button class="btn sm" data-dl="extra" style="margin-top:10px" ${c.extra >= c.extra_max ? 'disabled' : ''}>${A.icon('gem', 'sm')} ${esc(c.extra >= c.extra_max ? T('duelo.extra_max', { n: c.extra_max }) : T('duelo.extra', { precio: c.precio_extra }))}</button>
      </div>
      ${abierto ? (abierto.intento ? `<div class="card" style="border-color:var(--red)"><p class="small" style="margin:0 0 8px">${A.icon('rec', 'sm')} ${esc(T('duelo.en_curso', { rival: abierto.rival.nombre }))}</p>
          <button class="btn main" data-dl="continuar">${A.icon('play', 'sm')} ${esc(T('duelo.continuar'))}</button></div>`
        : `<div class="card small muted">${esc(T('duelo.revisando'))}</div>`) : ''}
      ${D.defensas_nuevas ? `<div class="card small" style="border-color:var(--amber)">🛡️ ${esc(T('duelo.defensas', { n: D.defensas_nuevas }))}</div>` : ''}
      <div class="sectitle">${esc(T('duelo.mi_equipo'))}</div>
      <div class="card">${eq ? `<div class="row between"><div class="grow"><b>${esc(T('duelo.poder', { n: eq.poder }))}</b>
            <div class="dl-mini">${esc(eq.resumen.camaras.slice(0, 2).join(' · '))} · ${esc(T('duelo.personas', { n: eq.resumen.personas }))}</div></div>
            <button class="btn sm" data-dl="equipo">${A.icon('people', 'sm')} ${esc(T('duelo.editar'))}</button></div>`
        : `<p class="small muted" style="margin:0 0 8px">${esc(T('duelo.sin_equipo'))}</p><button class="btn main" data-dl="equipo">${A.icon('people', 'sm')} ${esc(T('duelo.registrar'))}</button>`}</div>
      <div class="sectitle">${esc(T('duelo.contrato'))}</div>
      <div class="dl-niveles">${contratos}</div>
      <p class="small muted">${esc(T('duelo.reglas'))}</p>
      <div class="sectitle">${esc(T('duelo.rivales'))}</div>
      ${rivales || `<div class="card small muted">${esc(T('duelo.sin_rivales'))}</div>`}
      <div class="sectitle">${esc(T('duelo.ranking'))}</div>
      <div class="card">${D.ranking.map((x) => `<div class="dl-rank ${x.yo ? 'yo' : ''}"><span class="n">${x.puesto}</span><span class="nm">${esc(x.nombre)}</span><span class="num">${num(x.rating)}</span></div>`).join('') || `<p class="small muted">${esc(T('duelo.sin_historial'))}</p>`}</div>
      <div class="sectitle">${esc(T('duelo.historial'))}</div>
      <div class="card">${D.historial.map((d) => { const [k, t] = resultadoDe(d); return `<div class="dl-hist"><span class="dl-res ${k}"></span>
          <div class="grow"><b>${esc(t)}</b> <span class="muted">${esc(T('duelo.vs'))} ${esc(d.rival.nombre)}</span>${window.Visitas ? ' ' + window.Visitas.boton(d.rival.id) : ''}
          <div class="dl-mini">${esc(d.contrato.client)} · ${d.calidad_mia === null ? '—' : d.calidad_mia} : ${d.calidad_rival === null ? '—' : d.calidad_rival}</div></div>
          <span class="num ${d.cambio < 0 ? 'neg' : ''}">${d.cambio > 0 ? '+' : ''}${d.cambio}</span></div>`; }).join('') || `<p class="small muted">${esc(T('duelo.sin_historial'))}</p>`}</div>`;
  }

  function editorEquipo(ctx) {
    const D = st.datos, A = ctx.A, s = ctx.estado();
    const actual = D.equipo;
    const elegidosInv = new Set(actual ? actual.inventario.map((x) => x.id) : D.inventario_elegible.map((x) => x.id));
    const canon = (r) => { try { return ctx.G.canonRole ? ctx.G.canonRole(r) : r; } catch (e) { return r; } };
    const staff = (s.staff || []).slice().sort((a, b) => (b.owner ? 1 : 0) - (a.owner ? 1 : 0) || b.skill - a.skill);
    const max = 12;
    return `<div class="card"><h2>${esc(T('duelo.mi_equipo'))}</h2>
        <p class="small muted">${esc(T('duelo.tope', { n: D.tope_habilidad }))}</p>
        <p class="small muted">${esc(T('duelo.kit', { kit: D.kit.map((k) => (k.cantidad > 1 ? k.cantidad + '× ' : '') + k.nombre).join(', ') }))}</p></div>
      <div class="sectitle">${esc(T('duelo.personal'))} <span class="muted">· ${esc(T('duelo.max_personal', { n: max }))}</span></div>
      <div class="card" id="dl-personal">${staff.map((p, i) => `<div class="dl-elige"><input type="checkbox" id="dlp${i}" data-i="${i}" ${p.owner || i < max ? 'checked' : ''} ${p.owner ? 'disabled' : ''}>
          <label for="dlp${i}"><span class="dl-av">${avatar(ctx, p.name, canon(p.role), 44)}</span><span class="grow"><b>${esc(p.owner ? T('duelo.dueno') : p.name)}</b>
          <span class="dl-mini" style="display:block">${esc(nombreRol(ctx, canon(p.role)))} · ${'★'.repeat(Math.max(1, Math.min(5, p.skill)))}${p.tier && p.tier !== 'junior' ? ' · ' + esc(String(p.tier).replace('_', ' ')) : ''}</span></span></label></div>`).join('')}</div>
      <div class="sectitle">${esc(T('duelo.exclusivos'))}</div>
      <div class="card" id="dl-inv">${D.inventario_elegible.map((x) => `<div class="dl-elige"><input type="checkbox" id="dli${x.id}" data-id="${x.id}" ${elegidosInv.has(x.id) ? 'checked' : ''}>
          <label for="dli${x.id}"><span class="tile t-amber">${A.icon(x.item)}</span><span class="grow"><b>${esc(x.nombre)}</b> <span class="muted small">#${String(x.serie).padStart(4, '0')}</span>
</span></label></div>`).join('') || `<p class="small muted" style="margin:0">${esc(T('duelo.sin_exclusivos'))}</p>`}</div>
      <button class="btn main" data-dl="guardar-equipo">${A.icon('check', 'sm')} ${esc(T('duelo.guardar'))}</button>
      <button class="btn" data-dl="lobby">${esc(T('duelo.cancelar'))}</button>`;
  }

  function resultado(ctx) {
    const A = ctx.A, R = st.final, d = R.duelo;
    const [k, t] = resultadoDe(d);
    const s = ctx.estado ? ctx.estado() : null;
    const yo = (s && s.staff && s.staff.find((p) => p.owner)) || { name: T('duelo.tu') };
    const lista = (arr) => (arr || []).map((x) => `<div class="dl-inc"><span>${esc(nombreInc(x.clave))}</span><b class="${x.q < 0 ? 'neg' : 'pos'}">${x.q > 0 ? '+' : ''}${x.q}</b></div>`).join('');
    return `<div class="card"><div class="dl-banner ${k}">${esc(t)}</div>
        <div class="dl-vs" style="margin-top:14px"><div class="lado"><div class="dl-av" style="margin:0 auto 6px">${avatar(ctx, yo.name, 'camarografo', 44)}</div><div class="q">${d.calidad_mia === null ? '—' : d.calidad_mia}</div><div class="nm">${esc(T('duelo.tu'))} ${d.estrellas_mia ? '⭐'.repeat(d.estrellas_mia) : ''}</div></div>
          <div class="x">${esc(T('duelo.vs'))}</div>
          <div class="lado"><div class="dl-av" style="margin:0 auto 6px">${avatar(ctx, d.rival.nombre, 'director', 44)}</div><div class="q">${d.calidad_rival === null ? '—' : d.calidad_rival}</div><div class="nm">${esc(d.rival.nombre)} ${d.estrellas_rival ? '⭐'.repeat(d.estrellas_rival) : ''}</div></div></div>
        <div class="dl-chips" style="justify-content:center;margin-top:12px"><span class="tag ${d.cambio < 0 ? 'red' : 'amber'}">${esc(T('duelo.cambio', { n: (d.cambio > 0 ? '+' : '') + d.cambio }))}</span>
          ${d.fama ? `<span class="tag amber">${A.icon('star', 'sm')}${esc(T('duelo.fama', { n: d.fama }))}</span>` : ''}${R.rating ? liga(R.rating.liga) : ''}</div></div>
      ${R.detalle ? `<div class="sectitle">${esc(T('duelo.tus_imprevistos'))}</div><div class="card">${lista(R.detalle.retador) || '<p class="small muted">—</p>'}</div>
        <div class="sectitle">${esc(T('duelo.sus_imprevistos'))}</div><div class="card">${lista(R.detalle.defensor) || '<p class="small muted">—</p>'}</div>` : ''}
      <button class="btn main" data-dl="lobby">${esc(T('duelo.volver'))}</button>`;
  }

  function pintar(ctx, el) {
    css();
    if (st.vista === 'vivo' && st.vivo) {
      Vivo.pintar(el, st.vivo, ctx.A, 'dl', () => enviar(ctx, el));
      return;
    }
    if (!st.datos && !st.error) { el.innerHTML = `<div class="card muted">${esc(T('duelo.cargando'))}</div>`; cargar(ctx, el); return; }
    if (st.error) { el.innerHTML = `<div class="card"><p class="small neg">${esc(st.error)}</p><button class="btn sm" data-dl="recargar">${esc(T('duelo.reintentar'))}</button></div>`; return; }
    if (st.vista === 'equipo') el.innerHTML = editorEquipo(ctx);
    else if (st.vista === 'resultado' && st.final) el.innerHTML = resultado(ctx);
    else el.innerHTML = lobby(ctx);
  }

  async function empezarVivo(ctx, el, intento) {
    try {
      await Vivo.asegurar();
      st.vivo = Vivo.crear(ctx.G, intento);
      st.vista = 'vivo';
      if (ctx.snd && ctx.snd.play) ctx.snd.play('live');
    } catch (e) { ctx.toast(e.message); st.vista = 'lobby'; }
    pintar(ctx, el);
    try { el.scrollIntoView({ block: 'start' }); } catch (e) { /* nada */ }
  }

  async function enviar(ctx, el) {
    const v = st.vivo;
    let fin;
    try { fin = Vivo.terminar(v); } catch (e) { ctx.toast(e.message); return; }
    el.innerHTML = `<div class="card muted">${esc(T('duelo.enviando'))}</div>`;
    try {
      const r = await pedir('POST', '/api/duelos/jugar', { duelo_id: v.intento.duelo_id, decisiones: fin.decisiones, resultado: fin.resultado });
      st.vivo = null;
      if (r.pendiente) { ctx.toast(T('duelo.pendiente')); st.vista = 'lobby'; st.datos = null; pintar(ctx, el); return; }
      st.final = r; st.vista = 'resultado';
      if (ctx.snd && ctx.snd.play) ctx.snd.play(r.duelo.gane ? 'stars' : 'incident');
      await sincronizar(ctx);
    } catch (e) {
      st.vivo = null; ctx.toast(e.message); st.vista = 'lobby';
      if (e.datos && e.datos.duelo) st.final = { duelo: e.datos.duelo };
    }
    st.datos = null;
    if (st.vista === 'resultado') { el.innerHTML = resultado(ctx); cargarSilencio(); } else pintar(ctx, el);
  }
  async function cargarSilencio() { try { st.datos = await pedir('GET', '/api/duelos'); } catch (e) { /* al volver */ } }
  async function sincronizar(ctx) {
    try { if (ctx.Api && ctx.Api.refrescar) await ctx.Api.refrescar(); else if (root.Api && root.Api.refrescar) await root.Api.refrescar(); } catch (e) { /* luego */ }
    try { if (ctx.sincronizar) ctx.sincronizar(); } catch (e) { /* luego */ }
  }

  function clic(ctx, el, b) {
    const acc = b.dataset.dl;
    const D = st.datos;
    if (acc === 'recargar') { st.datos = null; st.error = ''; pintar(ctx, el); return; }
    if (acc === 'lobby') { st.vista = 'lobby'; st.final = null; if (!st.datos) st.error = ''; pintar(ctx, el); return; }
    if (acc === 'nivel') { st.nivel = b.dataset.k; pintar(ctx, el); return; }
    if (acc === 'equipo') { st.vista = 'equipo'; pintar(ctx, el); return; }
    if (acc === 'continuar' && D && D.abierto && D.abierto.intento) { empezarVivo(ctx, el, D.abierto.intento); return; }
    if (acc === 'extra') {
      const cr = (root.Api && root.Api.estado && root.Api.estado.creditos) || 0;
      ctx.ask(T('duelo.extra_pregunta', { precio: D.cupos.precio_extra, quedan: num(Math.max(0, cr - D.cupos.precio_extra)) }), T('duelo.si_comprar'), async () => {
        try { const r = await pedir('POST', '/api/duelos/extra', {}); D.cupos = r.cupos; if (root.Api && root.Api.estado) root.Api.estado.creditos = r.creditos; ctx.toast(T('duelo.extra_ok')); if (ctx.snd) ctx.snd.play('buy'); }
        catch (e) { ctx.toast(e.message); if (ctx.snd) ctx.snd.play('error'); }
        pintar(ctx, el);
      });
      return;
    }
    if (acc === 'retar') {
      const rv = D.rivales.find((x) => x.id === Number(b.dataset.id));
      const ct = D.contratos.find((x) => x.nivel === st.nivel);
      if (!rv || !ct) return;
      if (!D.cupos.restantes) { ctx.toast(T('duelo.sin_cupos')); return; }
      ctx.ask(T('duelo.retar_pregunta', { rival: esc(rv.nombre), cliente: esc(ct.contrato.client), nivel: esc(T('duelo.nivel.' + st.nivel)), min: D.reglas.minutos }), T('duelo.si_retar'), async () => {
        el.innerHTML = `<div class="card muted">${esc(T('duelo.preparando'))}</div>`;
        try { const r = await pedir('POST', '/api/duelos/retar', { rival_id: rv.id, nivel: st.nivel }); st.rival = r.rival; st.datos = null; empezarVivo(ctx, el, r.intento); cargarSilencio(); }
        catch (e) { ctx.toast(e.message); if (ctx.snd) ctx.snd.play('error'); st.datos = null; pintar(ctx, el); }
      });
      return;
    }
    if (acc === 'guardar-equipo') {
      const s = ctx.estado();
      const staff = (s.staff || []).slice().sort((a, c) => (c.owner ? 1 : 0) - (a.owner ? 1 : 0) || c.skill - a.skill);
      const canon = (r) => { try { return ctx.G.canonRole ? ctx.G.canonRole(r) : r; } catch (e) { return r; } };
      const personal = [];
      el.querySelectorAll('#dl-personal input').forEach((x) => { const p = staff[Number(x.dataset.i)]; if (p && (x.checked || p.owner)) personal.push({ rol: canon(p.role), habilidad: Math.max(1, Math.min(5, p.skill | 0)), nivel: p.tier || 'junior', dueno: !!p.owner }); });
      const inventario = [];
      el.querySelectorAll('#dl-inv input').forEach((x) => { if (x.checked) inventario.push(Number(x.dataset.id)); });
      b.disabled = true;
      pedir('POST', '/api/duelos/equipo', { personal: personal.slice(0, 12), inventario })
        .then((r) => { D.equipo = r.equipo; st.vista = 'lobby'; ctx.toast(T('duelo.guardado')); if (ctx.snd) ctx.snd.play('hire'); st.datos = null; pintar(ctx, el); })
        .catch((e) => { b.disabled = false; ctx.toast(e.message); if (ctx.snd) ctx.snd.play('error'); });
    }
  }

  root.EnVivoVivo = Vivo;
  root.Duelos = {
    render(el, ctx) {
      instalarFama();
      pintar(ctx, el);
      el.onclick = (ev) => { const b = ev.target.closest('[data-dl]'); if (b && !b.disabled && el.contains(b)) clic(ctx, el, b); };
    },
    invalidar() { st.datos = null; st.error = ''; },
    T, instalarFama, nombreInc, css, pedir, _st: st,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = root.Duelos;
})(typeof window !== 'undefined' ? window : globalThis);
