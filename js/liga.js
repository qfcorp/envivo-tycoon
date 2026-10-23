/* =========================================================
   EN VIVO Tycoon — Liga Semanal de Productoras (pantalla)
   Contrato: server/INTEGRAR_LIGA.md (GET /api/liga, POST /api/liga/tomar · abandonar · descartar ·
   intento · completar, GET/POST /api/liga/tienda). El servidor decide todo; esta pantalla muestra y pide.
   Uso desde ui.js:  Liga.render(elemento, ctx)
     ctx = { A (Art), estado() (partida), guardar(), toast(msg), ask(html, boton, fn),
             jugarIntento(intento) -> Promise<{decisiones, resultado}>   (juega el evento con la semilla
               del servidor; ver server/validador/README.md "Lado del juego"),
             equipoIntento(s)? (equipo a registrar; si no, todo el personal y los equipos),
             abrirAsociaciones()? }
   Liga.progresoLocal(s, tarea) -> avance del encargo contando lo jugado que todavía no llegó al servidor.
   Textos: usa I18N si existe (claves liga.*) y si no, el español de aquí.
   ========================================================= */
(function (root) {
  'use strict';
  const ES = {
    'liga.titulo': 'Liga Semanal', 'liga.cargando': 'Abriendo la liga…', 'liga.reintentar': 'Intentar de nuevo',
    'liga.error': 'No se pudo abrir la liga.', 'liga.termina': 'Termina en {t}', 'liga.terminada': 'La semana terminó',
    'liga.fichas': 'fichas', 'liga.fichas_de_liga': 'Fichas de liga', 'liga.puntos': 'puntos', 'liga.pts': 'pts',
    'liga.tab.encargos': 'Encargos', 'liga.tab.grupo': 'Grupo', 'liga.tab.tienda': 'Tienda',
    'liga.sin_asociacion': 'La Liga Semanal se juega en asociación', 'liga.sin_asociacion_txt': 'Únete a una asociación (o crea la tuya) para competir cada semana con otras productoras, subir de liga y ganar fichas.',
    'liga.ir_asociaciones': 'Buscar asociación',
    'liga.mi_encargo': 'Tu encargo', 'liga.sin_encargo': 'No tienes encargo. Toma uno del tablero.', 'liga.usados': 'Usaste {n} de {max} encargos esta semana',
    'liga.jugar': 'Jugar el encargo', 'liga.abandonar': 'Abandonar', 'liga.enviar': 'Enviar {n} resultado(s)',
    'liga.abandonar_pregunta': '¿Abandonar <b>{t}</b>? Vuelve al tablero con el avance en 0 y el encargo usado no se devuelve.',
    'liga.vence': 'Quedan {t}', 'liga.por_enviar': '+{n} por enviar', 'liga.listo': '¡Listo para entregar!',
    'liga.tablero': 'Tablero de la asociación', 'liga.tomar': 'Tomar', 'liga.descartar': 'Descartar',
    'liga.descartar_pregunta': '¿Descartar <b>{t}</b>? En 10 minutos aparece otro encargo.',
    'liga.lo_hace': 'Lo hace {n}', 'liga.tuyo': 'Tu encargo', 'liga.nuevo_en': 'Nuevo encargo en {t}', 'liga.horas': '{n} h',
    'liga.hechas': 'Hechos esta semana', 'liga.hecho_por': '{n} · +{p} pts',
    'liga.banderas': 'Banderas', 'liga.bandera_n': 'Bandera {n}: {p} pts · {f} fichas',
    'liga.grupo': 'Grupo {n}', 'liga.grupo_txt': 'Suben los primeros y bajan los últimos (y los que no sumen puntos).',
    'liga.sube': 'Sube', 'liga.baja': 'Baja', 'liga.tu_asociacion': 'Tu asociación',
    'liga.ultima': 'Semana pasada: puesto {p} · {r} · ganaste {f} fichas', 'liga.r.sube': 'subieron a la {l}', 'liga.r.baja': 'bajaron a la {l}', 'liga.r.queda': 'siguen en la {l}',
    'liga.tienda_txt': 'Las fichas se ganan con las banderas y el puesto final. Lo de la tienda no se vende en el mercado.',
    'liga.canjear': 'Canjear', 'liga.canjear_pregunta': '¿Canjear <b>{n}</b> por {f} fichas?', 'liga.canjeado': '¡Listo! {n} llegó a tu productora.',
    'liga.tienes': 'Lo tienes', 'liga.limite': '{c}/{m} esta semana', 'liga.te_faltan': 'Te faltan {n} fichas',
    'liga.tomado': 'Encargo tomado. ¡A trabajar!', 'liga.descartado': 'Encargo descartado.', 'liga.abandonado': 'Encargo devuelto al tablero.',
    'liga.cuenta': '¡Cuenta para el encargo! ({a}/{m})', 'liga.no_cuenta': 'Ese evento no cumplió el encargo.', 'liga.completado': '¡Encargo completado! +{p} puntos para la asociación',
    'liga.pendiente': 'Resultado guardado: el servidor lo revisa en un momento.', 'liga.sin_juego': 'Actualiza el juego para jugar encargos de la liga.',
    'liga.sin_internet': 'Sin conexión. Tu resultado quedó guardado y se enviará después.',
  };
  const T = (k, p) => {
    try { if (root.I18N && root.I18N.T && (!root.I18N.T.has || root.I18N.T.has(k))) return root.I18N.T(k, p); } catch (e) { /* español */ }
    return String(ES[k] || k).replace(/\{(\w+)\}/g, (m, x) => (p && p[x] !== undefined ? p[x] : m));
  };
  const esc = (t) => String(t == null ? '' : t).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const num = (n) => Number(n || 0).toLocaleString('es-EC');
  const CORTES = ['internet', 'luz', 'senal', 'cable', 'bateria', 'falla'];
  const ESTRELLAS = [85, 70, 55, 40];

  const st = { ctx: null, el: null, datos: null, tienda: null, vista: 'encargos', cargando: false, error: '', reloj: null, base: 0, ocupado: false, cargadoEn: 0 };

  /* ---------- Gráficos propios ---------- */
  const icon = (n, cls, size) => {
    const A = (st.ctx && st.ctx.A) || root.Art;
    try { return A.icon(n, cls, size); } catch (e) { return ''; }
  };
  const ficha = (size) => `<svg class="lg-ficha" width="${size || 16}" height="${size || 16}" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9.5" fill="#3a2a0d" stroke="#ffb020" stroke-width="2"/><circle cx="12" cy="12" r="5.5" fill="none" stroke="#ffb020" stroke-width="1.5" stroke-dasharray="2 2"/><path d="M12 8.6l1 2.1 2.3.3-1.7 1.6.4 2.3-2-1.1-2 1.1.4-2.3-1.7-1.6 2.3-.3z" fill="#ffcf6e"/></svg>`;
  const bandera = (on, size) => `<svg width="${size || 16}" height="${size || 16}" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 21V3.5" stroke="${on ? '#ffb020' : '#56607a'}" stroke-width="2" stroke-linecap="round"/><path d="M6 4h11l-2.5 4L17 12H6z" fill="${on ? '#ffb020' : 'none'}" stroke="${on ? '#ffb020' : '#56607a'}" stroke-width="1.6" stroke-linejoin="round"/></svg>`;
  const LIGA_ICONO = ['barrial', 'trend', 'star', 'stream', 'crown'];
  function escudo(liga, size) {
    const c = (liga && liga.color) || '#c58b5a', i = liga ? liga.indice : 0, s = size || 52;
    return `<svg class="lg-escudo" width="${s}" height="${s}" viewBox="0 0 52 52" aria-hidden="true">
      <path d="M26 3l19 6v15c0 12-8 20-19 25C15 44 7 36 7 24V9z" fill="${c}22" stroke="${c}" stroke-width="2.4" stroke-linejoin="round"/>
      <path d="M26 8.5l14 4.4V24c0 9-5.7 15.3-14 19.4C17.7 39.3 12 33 12 24V12.9z" fill="${c}33"/>
      <g transform="translate(14 13)" color="${c}">${icon(LIGA_ICONO[i] || 'star', '', 24)}</g>
      ${Array.from({ length: i + 1 }, (_, k) => `<circle cx="${26 + (k - i / 2) * 5}" cy="44" r="1.6" fill="${c}"/>`).join('')}</svg>`;
  }

  function css() {
    if (typeof document === 'undefined' || document.getElementById('liga-css')) return;
    const s = document.createElement('style');
    s.id = 'liga-css';
    s.textContent = `
      .lg{min-width:0}
      .lg-head{display:flex;gap:12px;align-items:center}
      .lg-head .grow{min-width:0}
      .lg-liga{font-family:"Barlow Condensed","Arial Narrow",sans-serif;font-size:24px;font-weight:700;line-height:1;text-transform:uppercase;letter-spacing:.5px}
      .lg-asoc{display:flex;align-items:center;gap:6px;margin-top:4px;font-size:13px;min-width:0}
      .lg-asoc span:last-child{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
      .lg-sig{flex:none;font-family:"JetBrains Mono",ui-monospace,monospace;font-size:11px;font-weight:700;padding:1px 6px;border-radius:6px;color:#0d0f14}
      .lg-reloj{display:inline-flex;align-items:center;gap:5px;margin-top:6px;font-size:12px;color:var(--muted)}
      .lg-reloj .ico{width:14px;height:14px}
      .lg-chip{flex:none;display:flex;flex-direction:column;align-items:center;gap:2px;background:var(--panel2);border:1px solid var(--line);border-radius:12px;padding:6px 10px}
      .lg-chip b{font-family:"JetBrains Mono",ui-monospace,monospace;font-size:16px;display:flex;align-items:center;gap:4px}
      .lg-chip small{font-size:10px;color:var(--muted)}
      .lg-score{margin-top:14px}
      .lg-score .row{font-size:13px}
      .lg-pista{position:relative;height:12px;margin:22px 4px 6px;background:var(--panel2);border-radius:8px;border:1px solid var(--line)}
      .lg-pista i{position:absolute;left:0;top:0;bottom:0;border-radius:8px;background:linear-gradient(90deg,#ff3b3b,#ffb020)}
      .lg-flag{position:absolute;top:-21px;transform:translateX(-50%);display:flex;flex-direction:column;align-items:center}
      .lg-flag::after{content:"";width:2px;height:6px;background:var(--line)}
      .lg-flag.on::after{background:#ffb020}
      .lg-flags-lbl{display:flex;justify-content:space-between;font-size:10px;color:var(--muted);font-family:"JetBrains Mono",ui-monospace,monospace;margin:0 0 2px}
      .lg-tabs{display:flex;gap:6px;margin:4px 0 12px}
      .lg-tabs button{flex:1;min-width:0;background:var(--panel);border:1px solid var(--line);border-radius:10px;padding:9px 4px;font-weight:600;font-size:14px}
      .lg-tabs button.on{border-color:var(--red);background:#2a1a1f;color:#fff}
      .lg-mia{border-color:var(--red);background:linear-gradient(160deg,#2a1a1f,var(--panel) 60%)}
      .lg-mia h3{font-size:19px;margin:2px 0 4px;overflow-wrap:anywhere}
      .lg-et{font-family:"Barlow Condensed","Arial Narrow",sans-serif;font-size:13px;text-transform:uppercase;letter-spacing:1px;color:var(--amber)}
      .lg-barra{height:9px;background:var(--panel2);border-radius:9px;overflow:hidden;margin-top:8px;display:flex}
      .lg-barra i{display:block;height:100%;background:var(--green)}
      .lg-barra i.pend{background:repeating-linear-gradient(45deg,#ffb020,#ffb020 4px,#c98a12 4px,#c98a12 8px)}
      .lg-acc{display:flex;gap:8px;margin-top:12px}
      .lg-acc .btn{margin:0}
      .lg-acc .btn.main{flex:1}
      .lg-acc .btn.sm{flex:none;padding:12px 14px;font-size:13px}
      .lg-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}
      .lg-t{position:relative;background:var(--panel);border:1px solid var(--line);border-radius:var(--radius);padding:11px;display:flex;flex-direction:column;gap:6px;min-width:0;min-height:154px}
      .lg-t.tomada{background:var(--panel)}
      .lg-t.mia{border-color:var(--red);box-shadow:inset 0 0 0 1px #ff3b3b55}
      .lg-t.espera{border-style:dashed;align-items:center;justify-content:center;text-align:center;color:var(--muted);font-size:12px}
      .lg-t .tile{width:38px;height:38px;border-radius:10px}
      .lg-t .tile .ico{width:20px;height:20px}
      .lg-t-top{display:flex;justify-content:space-between;align-items:flex-start;gap:6px}
      .lg-pts{font-family:"JetBrains Mono",ui-monospace,monospace;font-size:12px;font-weight:700;color:var(--amber);background:#3a2a0d;border:1px solid #5a4214;border-radius:8px;padding:2px 6px;white-space:nowrap}
      .lg-t h4{margin:0;font-size:13.5px;line-height:1.25;font-weight:600;overflow-wrap:anywhere;display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden}
      .lg-t .meta{display:flex;justify-content:space-between;align-items:center;font-size:11px;color:var(--muted);margin-top:auto;gap:4px}
      .lg-t .meta span{display:inline-flex;align-items:center;gap:3px;white-space:nowrap}
      .lg-t .meta .ico{width:12px;height:12px}
      .lg-t .btn.sm{width:100%;padding:8px 6px}
      .lg-t .quien{display:flex;align-items:center;gap:6px;font-size:11.5px;color:var(--muted);min-width:0}
      .lg-t .quien b{flex:none;width:20px;height:20px;border-radius:50%;background:var(--panel2);border:1px solid var(--line);display:grid;place-items:center;font-size:9px;color:var(--text)}
      .lg-t .quien span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
      .lg-t-acc{display:flex;gap:6px}
      .lg-t-acc .btn.sm{flex:1;min-width:0}
      .lg-x{flex:none;width:36px;display:grid;place-items:center;background:var(--panel2);border:1px solid var(--line);border-radius:12px;color:var(--muted);padding:0}
      .lg-x .ico{width:16px;height:16px}
      .lg-hecha{display:flex;align-items:center;gap:8px;padding:8px 0;border-bottom:1px solid var(--line);font-size:13px;min-width:0}
      .lg-hecha:last-child{border-bottom:0}
      .lg-hecha .grow{flex:1 1 0;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
      .lg-hecha .small{flex:0 1 auto;max-width:34%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
      .lg-rank{width:100%;border-collapse:collapse;font-size:13px;table-layout:fixed}
      .lg-rank td{padding:9px 4px;border-bottom:1px solid var(--line);vertical-align:middle}
      .lg-rank td:last-child{text-align:right;font-family:"JetBrains Mono",ui-monospace,monospace;font-weight:700}
      .lg-rank tr.sube td:first-child{box-shadow:inset 3px 0 0 var(--green)}
      .lg-rank tr.baja td:first-child{box-shadow:inset 3px 0 0 var(--red)}
      .lg-rank tr.mia td{background:#2a1a1f}
      .lg-rank .pos{width:34px;text-align:center;font-family:"JetBrains Mono",ui-monospace,monospace;color:var(--muted)}
      .lg-rank .nom{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
      .lg-rank .nom small{display:block;color:var(--muted);font-size:11px;overflow:hidden;text-overflow:ellipsis}
      .lg-rank .fl{width:58px;white-space:nowrap}
      .lg-rank .fl svg{margin-right:-3px}
      .lg-rank .pt{width:70px}
      .lg-escalera{display:flex;gap:4px;margin-top:10px}
      .lg-escalera span{flex:1;min-width:0;text-align:center;font-size:10px;padding:5px 2px;border-radius:8px;border:1px solid var(--line);color:var(--muted);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
      .lg-escalera span.on{color:#0d0f14;font-weight:700}
      .lg-art{display:flex;gap:10px;align-items:center}
      .lg-art .grow{min-width:0}
      .lg-art h4{margin:0;font-size:14px}
      .lg-art p{margin:2px 0 0;font-size:12px;color:var(--muted)}
      .lg-precio{display:inline-flex;align-items:center;gap:4px;font-family:"JetBrains Mono",ui-monospace,monospace;font-weight:700;color:var(--amber)}
      .lg-art .btn.sm{flex:none;min-width:86px}
      .lg-art .motivo{font-size:11px;color:var(--muted);text-align:right;max-width:96px}
      .lg-vacio{text-align:center;color:var(--muted);font-size:13px}`;
    document.head.appendChild(s);
  }

  /* ---------- Servidor ---------- */
  async function pedir(method, ruta, body) {
    const h = { 'Content-Type': 'application/json', 'X-Envivo': '1' };
    try { if (root.I18N && root.I18N.idioma) h['X-Envivo-Idioma'] = root.I18N.idioma; } catch (e) { /* nada */ }
    let r;
    try {
      r = await fetch(ruta, { method, headers: h, credentials: 'same-origin', cache: 'no-store', body: body === undefined ? undefined : JSON.stringify(body) });
    } catch (e) { const err = new Error(T('liga.sin_internet')); err.red = true; throw err; }
    let j = null;
    try { j = await r.json(); } catch (e) { j = null; }
    if (!j || !r.ok || j.ok === false) {
      const err = new Error((j && j.error) || T('liga.error'));
      err.status = r.status; err.codigo = j && j.codigo;
      throw err;
    }
    j._http = r.status;
    return j;
  }

  /* ---------- Reglas compartidas con el servidor (Liga::cumple de server/src/Liga.php) ---------- */
  function cumple(c, contrato, res, equipo) {
    c = c || {}; contrato = contrato || {}; res = res || {};
    const est = res.estrellas !== undefined ? res.estrellas : res.stars;
    const duelo = res.duelo !== undefined ? res.duelo : res.duel;
    if ((est || 0) < Math.max(1, c.min_estrellas || 1)) return false;
    if (c.evento && c.evento.length && !c.evento.includes(contrato.type)) return false;
    if (c.stream && !contrato.stream) return false;
    if (c.outdoor && !contrato.outdoor) return false;
    if (c.min_diff && (contrato.diff || 0) < c.min_diff) return false;
    if (c.duelo === 'won' && duelo !== 'won') return false;
    if (c.sin_cortes) {
      if (!contrato.stream) return false;
      if ((res.incidentes || []).some((x) => CORTES.includes(x.clave) && x.q < 0)) return false;
    }
    if (c.senior && !((equipo && equipo.staff) || []).some((p) => p.tier === 'senior' || p.tier === 'internacional' || (p.skill || 0) >= 4)) return false;
    return true;
  }

  function memoria(s) {
    if (!s || typeof s !== 'object') return null;
    if (!s.liga || typeof s.liga !== 'object') s.liga = {};
    if (!Array.isArray(s.liga.pendientes)) s.liga.pendientes = [];
    if (!Array.isArray(s.liga.registro)) s.liga.registro = [];
    return s.liga;
  }

  /* Avance del encargo: lo que ya contó el servidor + lo jugado aquí que todavía no se envió (y que cumple). */
  function progresoLocal(s, tarea) {
    const meta = Math.max(1, (tarea && tarea.meta) || 1);
    const servidor = Math.min(meta, (tarea && tarea.avance) || 0);
    const L = s && s.liga && typeof s.liga === 'object' ? s.liga : {};
    const mias = (Array.isArray(L.pendientes) ? L.pendientes : []).filter((p) => tarea && p.tarea_id === tarea.id);
    const buenas = mias.filter((p) => cumple(tarea.criterio, p.contrato, p.resultado, p.equipo)).length;
    const jugados = (Array.isArray(L.registro) ? L.registro : []).filter((r) => tarea && r.tarea_id === tarea.id).length;
    const hecho = Math.min(meta, servidor + buenas);
    return { servidor, pendientes: buenas, por_enviar: mias.length, jugados, hecho, meta, pct: Math.round((hecho / meta) * 100), listo: hecho >= meta };
  }

  /* Equipo que se registra en el servidor para el intento: todo el personal y los equipos que funcionan. */
  function equipoDe(s) {
    const ent = (v, a, b, d) => { const n = Math.round(Number(v)); return Number.isFinite(n) ? Math.max(a, Math.min(b, n)) : d; };
    let dueno = false;
    const staff = ((s && s.staff) || []).slice(0, 12).map((p) => {
      const o = { role: String(p.role), skill: ent(p.skill, 1, 5, 1), morale: ent(p.morale, 0, 100, 80) };
      if (p.owner && !dueno) { o.owner = true; dueno = true; }
      if (p.name) o.name = String(p.name).slice(0, 40);
      if (p.tier) o.tier = String(p.tier);
      return o;
    });
    const equip = ((s && s.equip) || []).filter((e) => e && e.type && e.condition >= 1).slice(0, 40).map((e) => ({ type: String(e.type), condition: ent(e.condition, 1, 100, 1) }));
    return { staff, equip };
  }

  /* ---------- Tiempo ---------- */
  function tiempo(seg) {
    seg = Math.max(0, Math.floor(seg));
    const d = Math.floor(seg / 86400), h = Math.floor(seg / 3600) % 24, m = Math.floor(seg / 60) % 60, x = seg % 60;
    if (d > 0) return `${d} d ${h} h`;
    if (h > 0) return `${h} h ${String(m).padStart(2, '0')} min`;
    return `${String(m).padStart(2, '0')}:${String(x).padStart(2, '0')}`;
  }
  const pasado = () => (Date.now() - st.base) / 1000;
  const quedan = (seg) => (seg == null ? null : seg - pasado());

  function tic() {
    if (!st.el || !st.el.isConnected) { clearInterval(st.reloj); st.reloj = null; return; }
    let recargar = false;
    st.el.querySelectorAll('[data-cuenta]').forEach((n) => {
      const q = quedan(Number(n.dataset.cuenta));
      if (q <= 0 && n.dataset.recargar) recargar = true;
      n.textContent = T(n.dataset.texto, { t: tiempo(q) });
    });
    if ((recargar || Date.now() - st.cargadoEn > 60000) && !st.cargando && !st.ocupado) cargar();
  }

  /* ---------- Pintar ---------- */
  function cabecera(d) {
    const L = d.liga || (d.ligas || [])[0];
    const a = d.asociacion;
    const max = d.banderas && d.banderas.length ? d.banderas[d.banderas.length - 1].puntos : 1;
    const pct = Math.min(100, ((a ? a.puntos : 0) / max) * 100);
    return `<div class="card">
      <div class="lg-head">${escudo(L, 54)}
        <div class="grow"><div class="lg-liga" style="color:${esc(L.color)}">${esc(L.nombre)}</div>
          ${a ? `<div class="lg-asoc"><span class="lg-sig" style="background:${esc(a.color)}">${esc(a.siglas)}</span><span>${esc(a.nombre)}</span></div>` : ''}
          <div class="lg-reloj">${icon('clock')}<span data-cuenta="${d.semana.quedan_seg}" data-texto="liga.termina" data-recargar="1">${esc(T('liga.termina', { t: tiempo(d.semana.quedan_seg) }))}</span></div></div>
        <div class="lg-chip"><b>${ficha(16)}<span class="num" id="liga-fichas">${num(d.fichas)}</span></b><small>${esc(T('liga.fichas'))}</small></div></div>
      ${a ? `<div class="lg-score"><div class="row between"><span class="muted">${esc(T('liga.banderas'))}</span><b class="num">${num(a.puntos)} <span class="muted small">${esc(T('liga.pts'))}</span></b></div>
        <div class="lg-pista" role="img" aria-label="${esc(num(a.puntos) + ' ' + T('liga.puntos'))}"><i style="width:${pct}%"></i>
          ${d.banderas.map((b) => `<span class="lg-flag ${b.alcanzada ? 'on' : ''}" style="left:${(b.puntos / max) * 100}%" title="${esc(T('liga.bandera_n', { n: b.n, p: num(b.puntos), f: b.fichas }))}">${bandera(b.alcanzada, 15)}</span>`).join('')}</div>
        <div class="lg-flags-lbl"><span>0</span>${d.banderas.map((b) => `<span>${num(b.puntos)}</span>`).join('')}</div></div>` : ''}
    </div>`;
  }

  function pestanas(d) {
    const v = ['encargos', 'grupo', 'tienda'];
    return `<div class="lg-tabs" role="tablist">${v.map((k) => `<button role="tab" data-liga="vista" data-v="${k}" class="${st.vista === k ? 'on' : ''}" aria-selected="${st.vista === k}">${esc(T('liga.tab.' + k))}</button>`).join('')}</div>`;
  }

  function iniciales(n) { return esc(String(n || '?').split(/\s+/).filter(Boolean).slice(0, 2).map((x) => x[0]).join('').toUpperCase()); }

  function tarjeta(t, d) {
    if (t.estado === 'espera') {
      return `<div class="lg-t espera" data-tarea="${t.id}">${icon('clock', 'lg')}<span data-cuenta="${t.aparece_seg}" data-texto="liga.nuevo_en" data-recargar="1">${esc(T('liga.nuevo_en', { t: tiempo(t.aparece_seg) }))}</span></div>`;
    }
    const mia = !!t.mia, tomada = t.estado === 'tomada';
    const s = st.ctx && st.ctx.estado ? st.ctx.estado() : null;
    const pr = mia ? progresoLocal(s, t) : { hecho: t.avance, meta: t.meta, pct: Math.round((t.avance / t.meta) * 100) };
    const puedoTomar = !d.mi_tarea && d.mis_tareas && d.mis_tareas.usadas < d.mis_tareas.max;
    const tono = mia ? 't-red' : tomada ? '' : 't-amber';
    return `<div class="lg-t ${tomada ? 'tomada' : ''} ${mia ? 'mia' : ''}" data-tarea="${t.id}">
      <div class="lg-t-top"><div class="tile ${tono}">${icon(t.icono)}</div><span class="lg-pts">+${num(t.puntos)}</span></div>
      <h4>${esc(t.titulo)}</h4>
      ${tomada ? `<div class="quien"><b>${iniciales(t.jugador && t.jugador.nombre)}</b><span>${esc(mia ? T('liga.tuyo') : T('liga.lo_hace', { n: (t.jugador && t.jugador.nombre) || '?' }))}</span></div>
          <div class="lg-barra" style="margin-top:0"><i style="width:${pr.pct}%"></i></div>` : ''}
      <div class="meta"><span>${icon('check')}${pr.hecho}/${t.meta}</span><span>${icon('clock')}${esc(T('liga.horas', { n: t.horas }))}</span></div>
      ${!tomada ? `<div class="lg-t-acc"><button class="btn sm ${puedoTomar ? 'main' : ''}" data-liga="tomar" data-id="${t.id}" ${puedoTomar ? '' : 'disabled'}>${esc(T('liga.tomar'))}</button>
        ${d.asociacion && d.asociacion.puede_descartar ? `<button class="lg-x" data-liga="descartar" data-id="${t.id}" title="${esc(T('liga.descartar'))}" aria-label="${esc(T('liga.descartar') + ': ' + t.titulo)}">${icon('close')}</button>` : ''}</div>` : ''}
    </div>`;
  }

  function miEncargo(d) {
    const t = d.mi_tarea;
    const m = d.mis_tareas || { usadas: 0, max: 9 };
    const usados = `<p class="small muted" style="margin:8px 0 0">${esc(T('liga.usados', { n: m.usadas, max: m.max }))}</p>`;
    if (!t) return `<div class="card"><div class="lg-et">${esc(T('liga.mi_encargo'))}</div><p class="small" style="margin:6px 0 0">${esc(T('liga.sin_encargo'))}</p>${usados}</div>`;
    const s = st.ctx && st.ctx.estado ? st.ctx.estado() : null;
    const pr = progresoLocal(s, t);
    const pSrv = Math.round((pr.servidor / pr.meta) * 100), pPen = pr.pct - pSrv;
    const puedeJugar = !!(st.ctx && st.ctx.jugarIntento);
    return `<div class="card lg-mia">
      <div class="row between"><span class="lg-et">${esc(T('liga.mi_encargo'))}</span><span class="lg-pts">+${num(t.puntos)} ${esc(T('liga.pts'))}</span></div>
      <div class="row" style="margin-top:8px"><div class="tile t-red">${icon(t.icono)}</div><div class="grow"><h3>${esc(t.titulo)}</h3>
        <div class="small muted"><span data-cuenta="${t.vence_seg}" data-texto="liga.vence">${esc(T('liga.vence', { t: tiempo(t.vence_seg) }))}</span></div></div></div>
      <div class="row between small" style="margin-top:10px"><span><b class="num">${pr.hecho}/${pr.meta}</b>${pr.pendientes ? ` <span style="color:var(--amber)">${esc(T('liga.por_enviar', { n: pr.pendientes }))}</span>` : ''}</span>
        ${pr.listo ? `<span class="up">${esc(T('liga.listo'))}</span>` : ''}</div>
      <div class="lg-barra"><i style="width:${pSrv}%"></i>${pPen > 0 ? `<i class="pend" style="width:${pPen}%"></i>` : ''}</div>
      <div class="lg-acc">
        ${pr.por_enviar ? `<button class="btn main" data-liga="enviar">${icon('cloud')}${esc(T('liga.enviar', { n: pr.por_enviar }))}</button>`
          : `<button class="btn main" data-liga="jugar" ${puedeJugar && !pr.listo ? '' : 'disabled'}>${icon('play')}${esc(T('liga.jugar'))}</button>`}
        <button class="btn sm" data-liga="abandonar">${esc(T('liga.abandonar'))}</button></div>
      ${usados}</div>`;
  }

  function vistaEncargos(d) {
    const hechas = d.hechas || [];
    return `${miEncargo(d)}
      <div class="sectitle">${esc(T('liga.tablero'))}</div>
      <div class="lg-grid">${(d.tablero || []).map((t) => tarjeta(t, d)).join('')}</div>
      ${hechas.length ? `<div class="sectitle">${esc(T('liga.hechas'))} (${hechas.length})</div><div class="card" style="padding:4px 14px">
        ${hechas.map((h) => `<div class="lg-hecha">${icon(h.icono, 'sm')}<span class="grow">${esc(h.titulo)}</span><span class="small muted">${esc((h.jugador && h.jugador.nombre) || '?')}</span><span class="lg-pts" style="flex:none">+${num(h.puntos)}</span></div>`).join('')}</div>` : ''}`;
  }

  function vistaGrupo(d) {
    const g = d.grupo;
    if (!g) return '';
    const u = d.ultima_semana;
    const ligas = d.ligas || [];
    return `${u ? `<div class="card small">${icon(u.resultado === 'sube' ? 'trend' : u.resultado === 'baja' ? 'refresh' : 'check', 'sm')} ${esc(T('liga.ultima', { p: u.posicion, f: num(u.fichas_ganadas), r: T('liga.r.' + u.resultado, { l: u.liga_nueva ? u.liga_nueva.nombre : '' }) }))}</div>` : ''}
      <div class="card" style="padding:10px 12px">
        <div class="row between"><h3>${esc(T('liga.grupo', { n: g.numero }))}</h3><span class="small" style="color:${esc(g.liga.color)}">${esc(g.liga.nombre)}</span></div>
        <table class="lg-rank" style="margin-top:6px"><tbody>
        ${g.ranking.map((r) => `<tr class="${r.zona || ''} ${r.mia ? 'mia' : ''}">
          <td class="pos">${r.posicion}</td>
          <td class="nom"><span class="lg-sig" style="background:${esc(r.color)}">${esc(r.siglas)}</span> ${esc(r.nombre)}<small>${r.mia ? esc(T('liga.tu_asociacion')) + ' · ' : ''}${r.zona === 'sube' ? `<span class="up">${esc(T('liga.sube'))}</span>` : r.zona === 'baja' ? `<span class="down">${esc(T('liga.baja'))}</span>` : esc(r.servidor || '')}</small></td>
          <td class="fl">${Array.from({ length: 4 }, (_, k) => bandera(k < r.banderas, 13)).join('')}</td>
          <td class="pt">${num(r.puntos)}</td></tr>`).join('')}
        </tbody></table>
        <p class="small muted" style="margin:10px 0 0">${esc(T('liga.grupo_txt'))}</p>
        <div class="lg-escalera">${ligas.map((l) => `<span class="${d.liga && l.indice === d.liga.indice ? 'on' : ''}" style="${d.liga && l.indice === d.liga.indice ? `background:${esc(l.color)};border-color:${esc(l.color)}` : `border-color:${esc(l.color)}55`}">${esc(l.nombre.replace(/^Liga /, ''))}</span>`).join('')}</div>
      </div>`;
  }

  function vistaTienda() {
    const t = st.tienda;
    if (!t) return `<div class="card lg-vacio">${esc(T('liga.cargando'))}</div>`;
    return `<div class="card"><div class="row between"><b>${esc(T('liga.fichas_de_liga'))}</b><span class="lg-precio" style="font-size:18px">${ficha(20)} ${num(t.fichas)}</span></div>
        <p class="small muted" style="margin:6px 0 0">${esc(T('liga.tienda_txt'))}</p></div>
      ${(t.articulos || []).map((a) => {
        const falta = a.fichas - t.fichas;
        const extra = a.motivo === 'Ya lo tienes' ? T('liga.tienes') : a.motivo || (!a.alcanza ? T('liga.te_faltan', { n: num(falta) }) : a.max_semana ? T('liga.limite', { c: a.compradas_semana, m: a.max_semana }) : '');
        return `<div class="card lg-art"><div class="tile ${a.tipo === 'cosmetico' ? 't-blue' : 't-amber'}">${icon(a.icono)}</div>
          <div class="grow"><h4>${esc(a.nombre)}</h4><p>${esc(a.detalle)}</p><span class="lg-precio small">${ficha(14)} ${num(a.fichas)}</span></div>
          <div style="display:flex;flex-direction:column;align-items:flex-end;gap:4px"><button class="btn sm ${a.disponible && a.alcanza ? 'main' : ''}" data-liga="canjear" data-id="${esc(a.id)}" ${a.disponible && a.alcanza ? '' : 'disabled'}>${esc(T('liga.canjear'))}</button>
          ${extra ? `<span class="motivo">${esc(extra)}</span>` : ''}</div></div>`;
      }).join('')}`;
  }

  function pintar() {
    const el = st.el;
    if (!el) return;
    const d = st.datos;
    if (!d) {
      el.innerHTML = st.error ? `<div class="card"><p class="small neg">${esc(st.error)}</p><button class="btn sm" data-liga="recargar">${esc(T('liga.reintentar'))}</button></div>`
        : `<div class="card lg-vacio">${esc(T('liga.cargando'))}</div>`;
      return;
    }
    if (d.sin_asociacion) {
      el.innerHTML = `<div class="lg">${cabecera(d)}<div class="card"><h3>${esc(T('liga.sin_asociacion'))}</h3><p class="small muted">${esc(T('liga.sin_asociacion_txt'))}</p>
        <div class="lg-escalera">${(d.ligas || []).map((l) => `<span style="border-color:${esc(l.color)}">${esc(l.nombre.replace(/^Liga /, ''))}</span>`).join('')}</div>
        ${st.ctx && st.ctx.abrirAsociaciones ? `<button class="btn main" data-liga="asociaciones">${icon('people')}${esc(T('liga.ir_asociaciones'))}</button>` : ''}</div>
        ${st.vista === 'tienda' ? vistaTienda() : `<button class="btn" data-liga="vista" data-v="tienda">${ficha(16)} ${esc(T('liga.tab.tienda'))}</button>`}</div>`;
      return;
    }
    el.innerHTML = `<div class="lg">${cabecera(d)}${pestanas(d)}
      <div data-vista="${st.vista}">${st.vista === 'grupo' ? vistaGrupo(d) : st.vista === 'tienda' ? vistaTienda() : vistaEncargos(d)}</div></div>`;
  }

  async function cargar() {
    if (st.cargando) return;
    st.cargando = true;
    try {
      st.datos = await pedir('GET', '/api/liga');
      st.base = Date.now(); st.cargadoEn = Date.now(); st.error = '';
      if (st.vista === 'tienda') await cargarTienda(true);
    } catch (e) { st.error = e.message; if (!st.datos) st.datos = null; }
    st.cargando = false;
    pintar();
  }
  async function cargarTienda(sinPintar) {
    try { st.tienda = await pedir('GET', '/api/liga/tienda'); } catch (e) { toast(e.message); }
    if (!sinPintar) pintar();
  }

  function toast(m) { if (st.ctx && st.ctx.toast) st.ctx.toast(m); }
  function preguntar(html, boton, fn) { if (st.ctx && st.ctx.ask) st.ctx.ask(html, boton, fn); else fn(); }
  function guardar() { try { if (st.ctx && st.ctx.guardar) st.ctx.guardar(); } catch (e) { /* nada */ } }
  function usar(j) { if (j && j.liga) { st.datos = j.liga; st.base = Date.now(); st.cargadoEn = Date.now(); } }

  async function accion(fn) {
    if (st.ocupado) return;
    st.ocupado = true;
    try { await fn(); } catch (e) { toast(e.message); if (e.status === 409 || e.status === 404) await cargar(); } finally { st.ocupado = false; pintar(); }
  }

  /* Manda un resultado guardado. Lo saca de la lista salvo que no haya internet (se reintenta después). */
  async function enviarUno(s, p) {
    try {
      const r = await pedir('POST', '/api/liga/completar', { intento_id: p.intento_id, firma: p.firma, decisiones: p.decisiones, resultado: p.resultado });
      quitarPendiente(s, p);
      const reg = memoria(s);
      if (reg) { const x = reg.registro.find((y) => y.intento_id === p.intento_id); if (x) x.cuenta = !!(r.intento && r.intento.cuenta); }
      usar(r);
      if (r.tarea_completada) toast(T('liga.completado', { p: num(r.puntos) }));
      else if (r.intento && r.intento.estado === 'pendiente') toast(T('liga.pendiente'));
      else if (r.intento && r.intento.cuenta) { const t = st.datos && st.datos.mi_tarea; toast(T('liga.cuenta', { a: t ? t.avance : '?', m: t ? t.meta : '?' })); }
      else toast(T('liga.no_cuenta'));
      return true;
    } catch (e) {
      if (!e.red) quitarPendiente(s, p);   // el servidor lo rechazó: no sirve reintentar
      throw e;
    }
  }
  function quitarPendiente(s, p) { const L = memoria(s); if (L) L.pendientes = L.pendientes.filter((x) => x.intento_id !== p.intento_id); guardar(); }

  async function jugar() {
    const ctx = st.ctx;
    if (!ctx || !ctx.jugarIntento) { toast(T('liga.sin_juego')); return; }
    const s = ctx.estado ? ctx.estado() : null;
    const equipo = ctx.equipoIntento ? ctx.equipoIntento(s) : equipoDe(s);
    const r = await pedir('POST', '/api/liga/intento', { equipo });
    const it = r.intento;
    const jugado = await ctx.jugarIntento(it);
    if (!jugado || !Array.isArray(jugado.decisiones)) return;   // lo cerró sin terminar: el intento se vence solo
    const res = jugado.resultado || {};
    const p = { intento_id: it.id, tarea_id: it.tarea_id, firma: it.firma, contrato: it.contrato, equipo: it.equipo, decisiones: jugado.decisiones,
      resultado: { calidad: res.calidad !== undefined ? res.calidad : res.quality, estrellas: res.estrellas !== undefined ? res.estrellas : res.stars,
        duelo: res.duelo !== undefined ? res.duelo : (res.duel || null), incidentes: res.incidentes || [] } };
    const L = memoria(s);
    if (L) {
      L.pendientes.push(p);
      L.registro.unshift({ intento_id: it.id, tarea_id: it.tarea_id, tipo: it.contrato.type, calidad: p.resultado.calidad, estrellas: p.resultado.estrellas, cuenta: null, fecha: new Date().toISOString() });
      L.registro.length = Math.min(L.registro.length, 30);
      guardar();
    }
    await enviarUno(s, p);
  }

  async function enviarPendientes() {
    const s = st.ctx && st.ctx.estado ? st.ctx.estado() : null;
    const L = memoria(s);
    for (const p of (L ? L.pendientes.slice() : [])) await enviarUno(s, p);
  }

  function clic(b) {
    const acc = b.dataset.liga, id = Number(b.dataset.id);
    const d = st.datos || {};
    const tarea = (d.tablero || []).find((t) => t.id === id);
    if (acc === 'recargar') { st.error = ''; pintar(); cargar(); return; }
    if (acc === 'vista') { st.vista = b.dataset.v; pintar(); if (st.vista === 'tienda') cargarTienda(); return; }
    if (acc === 'asociaciones') { st.ctx.abrirAsociaciones(); return; }
    if (acc === 'tomar') { accion(async () => { usar(await pedir('POST', '/api/liga/tomar', { tarea_id: id })); toast(T('liga.tomado')); }); return; }
    if (acc === 'descartar' && tarea) {
      preguntar(T('liga.descartar_pregunta', { t: esc(tarea.titulo) }), T('liga.descartar'), () => accion(async () => { usar(await pedir('POST', '/api/liga/descartar', { tarea_id: id })); toast(T('liga.descartado')); }));
      return;
    }
    if (acc === 'abandonar' && d.mi_tarea) {
      preguntar(T('liga.abandonar_pregunta', { t: esc(d.mi_tarea.titulo) }), T('liga.abandonar'), () => accion(async () => { usar(await pedir('POST', '/api/liga/abandonar', {})); toast(T('liga.abandonado')); }));
      return;
    }
    if (acc === 'jugar') { accion(jugar); return; }
    if (acc === 'enviar') { accion(enviarPendientes); return; }
    if (acc === 'canjear') {
      const a = st.tienda && (st.tienda.articulos || []).find((x) => x.id === b.dataset.id);
      if (!a) return;
      preguntar(T('liga.canjear_pregunta', { n: esc(a.nombre), f: num(a.fichas) }), T('liga.canjear'), () => accion(async () => {
        const r = await pedir('POST', '/api/liga/tienda', { articulo: a.id });
        st.tienda = r.tienda || st.tienda;
        if (st.datos) st.datos.fichas = r.fichas;
        toast(T('liga.canjeado', { n: a.nombre }));
        if (st.ctx && st.ctx.alCanjear) st.ctx.alCanjear(r);   // ui.js: refrescar /api/estado y aplicar la entrega
      }));
    }
  }

  root.Liga = {
    render(el, ctx) {
      css();
      st.el = el; st.ctx = ctx || {};
      pintar();
      cargar();
      el.onclick = (ev) => { const b = ev.target.closest('[data-liga]'); if (b && !b.disabled && el.contains(b)) clic(b); };
      if (!st.reloj) st.reloj = setInterval(tic, 1000);
    },
    recargar: () => cargar(),
    invalidar() { st.datos = null; st.tienda = null; st.error = ''; },
    progresoLocal, cumple, equipoDe, tiempo,
    enviarPendientes: () => enviarPendientes().catch(() => false),
    _estado: st,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = root.Liga;
})(typeof window !== 'undefined' ? window : globalThis);
