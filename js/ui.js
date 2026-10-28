/* =========================================================
   EN VIVO Tycoon — Pantallas (interfaz)
   Usa las reglas de js/logic.js (Game), los dibujos de js/art.js (Art)
   y, si existe, los sonidos de js/sound.js (Sound).
   ========================================================= */
(function () {
  'use strict';
  const G = window.Game;
  const A = window.Art;
  const SAVE_KEY = 'envivo_tycoon_save_v1';
  const $ = (id) => document.getElementById(id);
  const esc = (t) => String(t).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  // Idiomas (js/i18n.js): T() para los textos de la pantalla, TL() para los textos que vienen de la lógica
  const I18 = window.I18N || null;
  const T = (k, p) => (I18 ? I18.T(k, p) : k);
  const TL = (t) => (I18 ? I18.TL(t) : t);
  // Dinero: el signo va antes del símbolo ("-$24", no "$-24")
  const M0 = (n) => (I18 ? I18.money(n) : G.money(n));
  const M = (n) => { const v = Math.round(Number(n) || 0); return v < 0 ? '-' + M0(-v) : M0(v); };
  const N = (n) => (I18 ? I18.num(n) : String(n));
  const I = (name, cls) => A.icon(name, cls);
  const AY = (k) => (window.Ayuda ? window.Ayuda.btn(k) : '');   // botón "?" (js/ayuda.js)
  // Quita el emoji del inicio de los textos de la lógica (ahora hay dibujos)
  const noEmoji = (t) => String(t).replace(/^(\p{Extended_Pictographic}|️|‍|\s)+/u, '');
  // Textos de la lógica que traen clave y parámetros ({ k, p }): se arman otra vez con G.tx (así salen en el idioma
  // elegido cuando js/i18n.js trae I18N.juego). Si no traen clave, el texto guardado pasa por TL().
  const gtx = (o, txt) => {
    try { if (o && o.k && G.tx) { const t = G.tx(o.k, o.p || undefined); if (typeof t === 'string' && t !== o.k) return TL(t); } } catch (e) { /* abajo */ }
    return TL(txt !== undefined ? txt : (o && o.text) || '');
  };
  function enlazarTraductor() {
    try { if (G.setTraductor && I18 && I18.juego) G.setTraductor(I18.juego); } catch (e) { /* sin traductor */ }
  }
  // Puestos y niveles del personal
  const normRole = (r) => { try { return G.normRole ? G.normRole(r) : r; } catch (e) { return r; } };
  const roleIcon = (r) => { const k = normRole(r); return A.hasIcon && A.hasIcon('role_' + k) ? 'role_' + k : ((G.ROLES[k] || {}).icon || 'people'); };
  const tierOf = (p) => (p && p.tier && G.TIERS && G.TIERS[p.tier] ? p.tier : 'junior');
  const tierName = (t) => TL((G.TIERS && G.TIERS[t] && G.TIERS[t].name) || t);
  const tierBadge = (p) => `<span class="lvl lvl-${tierOf(p)}">${esc(tierName(tierOf(p)))}</span>`;
  const venueName = () => { try { return TL(G.venue ? G.venue(S).name : (G.dailyCostBreakdown ? G.dailyCostBreakdown(S).place : '')); } catch (e) { return ''; } };

  /* ---------- Sonido (opcional: si js/sound.js no está, no pasa nada) ---------- */
  const snd = {
    play(n, x) { try { if (window.Sound) window.Sound.play(n, x); } catch (e) { /* sin sonido */ } },
    amb(k) { try { if (window.Sound) window.Sound.ambience(k); } catch (e) { /* sin sonido */ } },
    unlock() { try { if (window.Sound) window.Sound.unlock(); } catch (e) { /* sin sonido */ } },
    muted() { try { return window.Sound ? window.Sound.isMuted() : true; } catch (e) { return true; } },
    toggle() { try { if (window.Sound) window.Sound.setMuted(!window.Sound.isMuted()); } catch (e) { /* sin sonido */ } },
  };
  // Para los módulos: sirve como snd('buy') y como snd.play('buy')
  const sndCtx = Object.assign((n, x) => snd.play(n, x), snd);
  /* ---------- Música (opcional: si js/musica.js no está, no pasa nada) ---------- */
  const mus = {
    go(t) { try { if (window.Musica) window.Musica.tema(t); } catch (e) { /* sin música */ } },
    stinger() { try { if (window.Musica) window.Musica.stinger(); } catch (e) { /* sin música */ } },
    init() { try { if (window.Musica) window.Musica.iniciar(); } catch (e) { /* sin música */ } },
    muted() { try { return window.Musica ? window.Musica.isMuted() : true; } catch (e) { return true; } },
    toggle() { try { if (window.Musica) window.Musica.setMuted(!window.Musica.isMuted()); } catch (e) { /* sin música */ } },
    actual() { try { return window.Musica && window.Musica.temaActual ? window.Musica.temaActual() : null; } catch (e) { return null; } },
  };
  /* ---------- Analítica propia (opcional: js/analitica.js, server/INTEGRAR_ANALITICA.md) ---------- */
  const AN = (n, d) => { try { if (window.Analitica) window.Analitica.evento(n, d); else if ((window.__anCola = window.__anCola || []).length < 100) window.__anCola.push([n, d]); } catch (e) { /* sin analítica */ } };
  let anVistaPrev = '';   // tienda_abierta y modo_online_abierto: una vez por cada vez que se entra
  function anVista() { const k = tab === 'online' ? 'online:' + vistaOnline : tab; if (k === anVistaPrev) return; anVistaPrev = k; if (tab === 'tienda') AN('tienda_abierta'); else if (tab === 'online') AN('modo_online_abierto', { modo: String(vistaOnline || 'hub') }); }
  const temaDeEvento = (type) => (type === 'concierto' ? 'concierto' : 'en_vivo');
  const esFuneral = (type) => /funeral|velorio|sepelio/.test(type || '');
  // Imprevistos graves: la música pasa a tensión. Los demás solo llevan un golpe ("última hora").
  const INC_GRAVE = /^(luz|internet|falla|robo|senal|senal_irl|cobertura|lluvia|transporte|dron)$/;

  /* ---------- Compras de Google Play (solo dentro de la app de Android) ---------- */
  // js/googleplay.js llega después (defer): se busca cada vez
  let GP = window.GooglePlay || null;
  const enApp = () => { try { GP = GP || window.GooglePlay || null; return !!(GP && GP.enApp()); } catch (e) { return false; } };
  let playOk = false;        // hay Play Billing en este celular
  let preciosPlay = {};      // id → { precio, ... } con el precio de Google Play

  /* ---------- Límites (de la lógica si los exporta) ---------- */
  const BAL = () => G.BALANCE || {};
  const maxStaff = () => { try { if (G.maxStaff && S) return G.maxStaff(S); } catch (e) { /* abajo */ } return BAL().maxStaff || 18; };
  const enBodega = () => { try { if (G.cuentaBodega && S) return G.cuentaBodega(S); } catch (e) { /* abajo */ } return S ? S.equip.length : 0; };
  const maxEquip = () => { try { if (G.maxEquip && S) return G.maxEquip(S); } catch (e) { /* abajo */ } return BAL().maxEquip || 80; };
  // Límite de quiebra: crece con los gastos diarios (G.bankruptLimit); con una lógica vieja, el fijo
  const bankruptAt = () => { try { if (G.bankruptLimit && S) return G.bankruptLimit(S); } catch (e) { /* abajo */ } return typeof BAL().bankruptAt === 'number' ? BAL().bankruptAt : -300; };
  const bkInfo = () => { try { return G.bankruptInfo && S ? G.bankruptInfo(S) : null; } catch (e) { return null; } };
  const isCam = (e) => ((G.CATALOG[e.type] || {}).cat === 'cam');
  // Varios eventos por día: turno de hoy (G.turnoDia). Con una lógica vieja (un evento = un día), null
  const turnoHoy = () => { try { return G.turnoDia && S ? G.turnoDia(S) : null; } catch (e) { return null; } };
  const turnoNom = (i) => T('dia.turno.' + Math.max(0, Math.min(4, Number(i) || 0)));   // 3 y 4: turnos extra del Pase VIP
  const esJornada = (c) => { try { return !!(G.jornadaCompleta && G.jornadaCompleta(c)); } catch (e) { return false; } };

  /* ---------- Datos chicos de la pantalla (aparte de la partida, que es de la lógica) ---------- */
  const RES_KEY = 'envivo_resultado_pendiente'; // resultado que falta ver (si se recarga en esa pantalla)
  const DIA_KEY = 'envivo_dia_inicio';          // dinero al empezar el día (para "Te quedó en caja")
  const lsGet = (k) => { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : null; } catch (e) { return null; } };
  const lsSet = (k, v) => { try { if (v == null) localStorage.removeItem(k); else localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* sin espacio o modo privado */ } };
  let dia0 = lsGet(DIA_KEY);
  function marcarDia() {
    if (!S) return;
    if (!dia0 || dia0.day !== S.day || typeof dia0.money !== 'number') { dia0 = { day: S.day, money: S.money }; lsSet(DIA_KEY, dia0); }
  }
  function olvidarDia() { dia0 = null; lsSet(DIA_KEY, null); lsSet(RES_KEY, null); }

  /* ---------- Plan del evento (opcional: js/plan_evento.js) ---------- */
  const PE = window.PlanEvento || null;
  // Nombres que se muestran: el dueño y la cámara de Don Ramiro salen de su clave (cambian con el idioma)
  const nmP = (p) => { try { if (p && p.owner && G.staffName) return TL(G.staffName(p)); } catch (e) { /* abajo */ } return TL((p && p.name) || ''); };
  const nmE = (e) => { try { if (e && e.starter && G.equipName) return TL(G.equipName(e)); } catch (err) { /* abajo */ } return e ? TL(e.nick || (G.CATALOG[e.type] || {}).name || e.type) : ''; };
  const eqName = (id) => nmE(S.equip.find((x) => x.id === id));

  let S = null;            // estado del juego
  let tab = 'inicio';
  let prep = null;         // selección al preparar un evento
  let afterResult = null;  // capítulo completado pendiente de mostrar (solo con una lógica sin capCompletados)
  let VI = null;           // evento en línea que se está jugando (liga / festival): { v, resolver, incidentes, modo }
  const evS = () => (VI ? VI.v.s : S);   // estado del evento en vivo: la partida o el intento en línea (aparte)
  let catSel = lsGet('envivo_cat') || 'cam';   // categoría elegida en la tienda de equipos
  let rolBuscar = '';      // puesto elegido para buscar personal
  let diaAntes = null;     // dinero antes de descansar (para el resumen del día)
  let diaCerrado = false;  // en esta sesión se cerró un día (botón, visitar clientes o el último turno): toca su resumen

  /* ---------- Módulos de Inicio (temporadas, sede...) ----------
     Un módulo hace window.EnVivoInicio.push({ id, orden, tarjeta(ctx) → html, clic(ctx, accion, el) }).
     Sus botones llevan data-ext="<id>" data-acc="<acción>". */
  window.EnVivoInicio = window.EnVivoInicio || [];
  function ctxInicio() {
    // Lo mismo que ctxModulo (VIP, pase, estrellas...), pero `estado` es la partida misma (como siempre en Inicio)
    return { ...ctxModulo(), G, S: () => S, get estado() { return S; }, nombreProductora, A, T, TL, M, money: M, N, esc, I, toast, openModal, closeModal, ask,
      render: () => render(), save: () => save(), snd: sndCtx, mus };
  }
  /* ---------- Contexto para los módulos de monetización (js/vip.js, js/pase.js, js/estrellas.js) ----------
     server/MONETIZACION.md: onComprar(productoId) abre el pago de siempre (Pago Plux en la web, Google Play en la app);
     precio(productoId) da el precio REAL que se cobra en este canal (null si en la app Google Play no lo tiene). */
  function ctxModulo() {
    return { Api, A, G, T, TL, I18N: I18, M, money: M, N, esc, I, nombreProductora,
      estado: () => S, S: () => S, guardar: () => save(), save: () => save(), render: () => render(),
      toast, ask, openModal, closeModal, snd: sndCtx, mus,
      vip: !!(Pm && Pm.vip), enApp: () => enApp(),
      onComprar: (id) => comprar(id), comprar: (id) => comprar(id),
      precio: (id, usd) => precioReal(id, usd),
      sincronizar: () => sincronizarNube(),
      alReclamar: () => sincronizarNube(),
      pedir: (method, ruta, body) => apiReq(method, ruta, body) };
  }
  // Estrellas usa el mismo contexto: su botón de dinero muestra ctx.precio (Google Play dentro de la app)
  const ctxEstrellas = () => ctxModulo();
  // Trae /api/estado otra vez y aplica las entregas nuevas en la partida (después de reclamar o de una compra)
  async function sincronizarNube() {
    try { if (Api.refrescar) await Api.refrescar(); } catch (e) { /* se aplica la próxima vez */ }
    try { aplicarEntregas(); save(); render(); } catch (e) { /* nada */ }
  }
  function modulosInicio() {
    return (window.EnVivoInicio || []).filter((m) => m && m.id).slice().sort((a, b) => (a.orden || 0) - (b.orden || 0));
  }
  function tarjetasInicio() {
    const ctx = ctxInicio();
    return modulosInicio().map((m) => {
      if (typeof m.tarjeta !== 'function') return '';
      try { return m.tarjeta(ctx) || ''; } catch (e) { console.error('[inicio ' + m.id + ']', e); return ''; }
    }).join('');
  }
  // Fecha del celular (o ?fecha=AAAA-MM-DD para demos): la usan las temporadas. Se guarda en la partida (s.temporada.fecha)
  // y la lógica solo mira esa fecha guardada, nunca el reloj.
  const fechaPedida = (() => { try { if (typeof window.__ENVIVO_FECHA === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(window.__ENVIVO_FECHA)) return window.__ENVIVO_FECHA; const m = /[?&]fecha=(\d{4}-\d{2}-\d{2})\b/.exec(location.search); return m ? m[1] : null; } catch (e) { return null; } })();
  function fechaHoy() {
    if (fechaPedida) return fechaPedida;
    const d = new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }
  function aplicarFecha() {
    try { if (window.Temporadas && S) window.Temporadas.setFecha(fechaHoy(), S); } catch (e) { /* sin temporadas */ }
  }

  /* ---------- Guardado ---------- */
  function save() {
    // Se está abriendo otra vez con la partida de la nube, u otro dispositivo tomó la partida: aquí no se guarda nada
    if (nubeRecargando) return;
    if (nubeBloqueo) { nubeAvisoOtro(); return; }
    try { localStorage.setItem(SAVE_KEY, G.serialize(S)); } catch (e) { /* sin espacio o modo privado */ }
    if (nubeInfo) lsSet(NUBE_KEY, nubeInfo);   // la versión de la nube va siempre junto a la partida guardada aquí
    nubePendiente = true;
    nubeLuego();
  }
  /* ---------- Partida en la nube ----------
     Una partida por cuenta, con versión (server/src/Partidas.php). Esta pestaña recuerda de qué versión de la nube partió
     (nubeInfo.rev, guardada junto a la partida) y la manda al guardar. Si otro celular, computadora o pestaña guardó o
     tiene la partida abierta, el servidor responde 409 y aquí NO se pisa nada:
       - Al abrir el juego o entrar a la cuenta: si la nube es más nueva y aquí no hubo avance, se usa la de la nube; si
         las dos avanzaron, se pregunta cuál usar (día, dinero y eventos de cada una). Después esta pestaña toma la partida.
       - Con el juego abierto (al volver a la pestaña, al volver internet y cada minuto mientras se ve): si otro dispositivo
         la tomó, "Tu partida se abrió en otro dispositivo" → "Usar la partida más nueva" (baja la de la nube y abre el
         juego otra vez); aquí ya no se sube nada. Si aquí hay avance que la nube no tiene, se pregunta cuál usar.
       - Sin internet se juega igual (se guarda en el celular); al volver la red se resuelve con las mismas reglas. */
  const Api = window.Api || { disponible: false, logueado: () => false };
  const Pm = window.Premium;
  const NUBE_KEY = 'envivo_nube';   // { cuenta, rev, clave }: versión de la nube de la que partió la partida guardada aquí
  const NUBE_AVISO = 'envivo_nube_cargada';
  // Código de esta pestaña (nuevo cada vez que se abre el juego): así otra pestaña del mismo navegador también cuenta
  const NUBE_DISP = (() => {
    try { const a = new Uint8Array(12); crypto.getRandomValues(a); return 'd' + Array.from(a, (b) => b.toString(16).padStart(2, '0')).join(''); }
    catch (e) { return 'd' + Math.random().toString(36).slice(2, 12) + Date.now().toString(36); }
  })();
  let nubeT = null, nubeEstado = '';
  let nubeInfo = lsGet(NUBE_KEY);
  let nubeLista = null;        // cuenta con la que esta pestaña ya revisó la nube y tomó la partida
  let nubeBloqueo = false;     // otro dispositivo guardó o tomó la partida: aquí no se sube ni se guarda nada
  let nubeRecargando = false;  // se bajó la partida de la nube y el juego se abre otra vez
  let nubePendiente = false;   // hubo guardados que la nube todavía no tiene
  let nubeSubiendo = null, nubeRevisando = null, nubeUltima = 0;
  const nubeCuenta = () => (Api.estado && Api.estado.jugador ? Api.estado.jugador.id : null);
  const nubeActiva = () => !!(Api.disponible && Api.logueado && Api.logueado());
  const nubeBase = () => (nubeInfo && nubeInfo.cuenta === nubeCuenta() && Number.isInteger(nubeInfo.rev) ? nubeInfo.rev : null);
  const nubeClave = (x) => (x ? [x.day, x.money, x.stats ? x.stats.events : 0].join('|') : '');
  // ¿Aquí hay avance (día, dinero o eventos) que la versión de la nube de la que partió no tiene?
  const nubeAvance = () => !nubeInfo || nubeInfo.cuenta !== nubeCuenta() || nubeClave(S) !== nubeInfo.clave;
  function nubeMarcar(rev, clave) { nubeInfo = { cuenta: nubeCuenta(), rev, clave }; lsSet(NUBE_KEY, nubeInfo); }
  const nubeLeer = (r) => { try { return r && r.datos ? G.deserialize(r.datos) : null; } catch (e) { return null; } };
  const esConflicto = (e) => !!(e && (e.codigo === 'partida_desactualizada' || e.codigo === 'otro_dispositivo'));
  /* ¿La versión más nueva de la nube la guardó ESTA pestaña y nadie más la tiene abierta? Pasa cuando la respuesta de un
     guardado no llegó (red lenta del celular, se pasó el tiempo, se cortó) o cuando se revisó la nube justo mientras
     subía (al volver a la pestaña, cada minuto). Antes eso se tomaba como "otro dispositivo": se dejaba de guardar y
     "Usar la partida más nueva" volvía a una versión vieja (la fama y las reparaciones del último evento se perdían).
     Lo que hay en la nube salió de esta misma partida, así que la de aquí es igual o más nueva: se sigue sobre esa versión. */
  const nubeEsMia = (n) => !!(n && n.guardo && n.guardo === NUBE_DISP && Number.isInteger(n.rev) && (!n.activo || n.activo.dispositivo === NUBE_DISP));
  function nubeLuego() {
    if (!nubeActiva() || cloudPendiente) return;
    if (nubeBloqueo) { nubeAvisoOtro(); return; }
    clearTimeout(nubeT);
    nubeT = setTimeout(subirNube, 4000);
  }
  async function subirNube(tomar, reintento) {
    if (!nubeActiva() || cloudPendiente || nubeBloqueo || nubeRecargando) return;
    const base = nubeBase();
    if (nubeLista !== nubeCuenta() || base === null) return revisarNube('subir');   // primero ver cómo está la nube
    if (nubeSubiendo) { await nubeSubiendo; return subirNube(tomar, reintento); }    // un guardado a la vez
    clearTimeout(nubeT);
    const datos = G.serialize(S), clave = nubeClave(S);
    nubePendiente = false;
    let bien = false, otraVez = false;
    nubeSubiendo = (async () => {
      try {
        const r = await Api.subirPartida(datos, { base, dispositivo: NUBE_DISP, tomar: !!tomar });
        nubeMarcar(r.rev, clave); nubeEstado = 'ok'; bien = true;
      } catch (e) {
        nubePendiente = true; nubeEstado = 'error';
        const n = e && e.respuesta ? e.respuesta.nube : null;
        // Un guardado anterior de esta pestaña sí llegó (no llegó la respuesta): se sigue sobre esa versión, una vez
        if (e && e.codigo === 'partida_desactualizada' && !reintento && nubeEsMia(n) && n.rev > base) { nubeMarcar(n.rev, ''); otraVez = true; }
        else if (esConflicto(e)) nubeConflicto();   // otro dispositivo guardó o tomó la partida: no se pisa
      }
    })();
    try { await nubeSubiendo; } finally { nubeSubiendo = null; }
    if (otraVez) return subirNube(tomar, true);
    if (bien && nubePendiente) nubeLuego();   // se guardó algo más mientras subía
  }
  // Revisa la nube (al abrir, al volver a la pestaña, al volver internet y cada minuto). Una revisión a la vez.
  function revisarNube(motivo) {
    if (!nubeActiva() || cloudPendiente || nubeRecargando) return Promise.resolve();
    if (nubeBloqueo) { if (motivo !== 'reloj') nubeAvisoOtro(); return Promise.resolve(); }
    if (!nubeRevisando) nubeRevisando = nubeRevisar(0).catch((e) => console.error('[nube]', e)).finally(() => { nubeRevisando = null; });
    return nubeRevisando;
  }
  async function nubeRevisar(intentos, vueltas) {
    // Primero que termine el guardado que está subiendo (si no, su versión nueva parece de "otro dispositivo")
    if (nubeSubiendo) { try { await nubeSubiendo; } catch (e) { /* nada */ } }
    const base = nubeBase();
    if (base === null) return nubeSinBase();
    let m;
    try { m = await Api.partidaMeta(NUBE_DISP); } catch (e) { return; }   // sin red: se sigue con la del celular
    // Mientras se preguntaba, esta pestaña subió otra versión: se pregunta otra vez con la versión al día
    if ((nubeSubiendo || nubeBase() !== base) && (vueltas || 0) < 3) return nubeRevisar(intentos, (vueltas || 0) + 1);
    if (!m.hay || m.rev < base) return nubeSinBase();
    // La versión nueva es un guardado de esta misma pestaña cuya respuesta no llegó: se sigue sobre ella (y se sube lo de aquí)
    if (m.rev > base && nubeEsMia(m)) {
      nubeMarcar(m.rev, '');
      return nubeLista !== nubeCuenta() ? nubeTomar(intentos) : subirNube();
    }
    if (m.rev > base) return nubeLista === nubeCuenta() ? nubeConflicto() : nubeMasNueva();
    if (nubeLista !== nubeCuenta()) return nubeTomar(intentos);              // al día: esta pestaña toma la partida
    if (m.activo && m.activo.dispositivo !== NUBE_DISP) return nubeConflicto();   // otro dispositivo la tomó
    if (nubePendiente || nubeAvance()) return subirNube();                   // p. ej. avance de cuando no había internet
  }
  // Esta pestaña pasa a ser la que juega (los demás dispositivos dejan de guardar). Solo con la partida al día.
  async function nubeTomar(intentos) {
    try { await Api.activarPartida(nubeBase(), NUBE_DISP); }
    catch (e) { if (esConflicto(e) && (intentos || 0) < 2) return nubeRevisar((intentos || 0) + 1); return; }   // alguien guardó justo ahora
    nubeLista = nubeCuenta(); nubeBloqueo = false;
    try { if (sessionStorage.getItem(NUBE_AVISO)) { sessionStorage.removeItem(NUBE_AVISO); toast(T('nube.cargada')); } } catch (e) { /* nada */ }
    if (nubePendiente || nubeAvance()) return subirNube();
  }
  // Esta pestaña nunca se sincronizó con esta cuenta: comparar con la de la nube
  async function nubeSinBase() {
    let r;
    try { r = await Api.partida(); } catch (e) { return; }
    const nube = nubeLeer(r);
    if (!nube) { nubeMarcar(r.rev || 0, ''); nubeLista = nubeCuenta(); return subirNube(true); }   // no hay en la nube: sube la de aquí
    if (S.stats.events === 0 && S.day <= 1) return nubeUsar(nube, r.datos, r.rev, false);       // aquí recién empieza
    if (nubeClave(nube) === nubeClave(S)) { nubeMarcar(r.rev, nubeClave(nube)); return nubeTomar(0); }   // es la misma partida
    return nubeElegir(nube, r.datos, r.rev);
  }
  // Al abrir el juego: la nube tiene una versión más nueva que la de aquí
  async function nubeMasNueva() {
    let r;
    try { r = await Api.partida(); } catch (e) { return; }
    const nube = nubeLeer(r);
    if (!nube) return nubeSinBase();
    if (!nubeAvance() || nubeClave(nube) === nubeClave(S)) return nubeUsar(nube, r.datos, r.rev, false);
    return nubeElegir(nube, r.datos, r.rev);   // las dos avanzaron: que el jugador elija
  }
  // Usar la partida de la nube. En pleno evento o con el juego abierto hace rato: se guarda aquí y el juego se abre otra vez.
  function nubeUsar(nube, datos, rev, recargar) {
    if (recargar || S.currentEvent || VI) {
      nubeRecargando = true; nubeBloqueo = true; clearTimeout(nubeT);
      try {
        localStorage.setItem(SAVE_KEY, datos);
        nubeMarcar(rev, nubeClave(nube));
        try { sessionStorage.setItem(NUBE_AVISO, '1'); } catch (e) { /* sin aviso */ }
        location.reload();
        return;
      } catch (e) { nubeRecargando = false; nubeBloqueo = false; }   // no se pudo guardar aquí: se usa sin abrir otra vez
    }
    S = nube;
    aplicarFecha();
    nubeMarcar(rev, nubeClave(nube));
    try { localStorage.setItem(SAVE_KEY, G.serialize(S)); } catch (e) { /* sin espacio o modo privado */ }
    nubePendiente = false;
    render();
    return nubeTomar(0);
  }
  // Otra pestaña o dispositivo guardó o tomó la partida: aquí se deja de subir y se avisa
  async function nubeConflicto() {
    nubeBloqueo = true; clearTimeout(nubeT);
    if (nubeAvance()) {   // aquí hay avance que la nube no tiene: que el jugador elija (nunca se pisa sin preguntar)
      try {
        const r = await Api.partida();
        const nube = nubeLeer(r);
        if (nube && nubeClave(nube) !== nubeClave(S)) return nubeElegir(nube, r.datos, r.rev);
      } catch (e) { /* sin red: la ventana de abajo */ }
    }
    nubeAvisoOtro();
  }
  function nubeAvisoOtro() {
    if (nubeRecargando || cloudPendiente) return;
    if ($('overlay').classList.contains('on') && $('modal').querySelector('[data-nube-otro]')) return;
    eleccion = () => nubeUsarNueva();
    openModal(`<div data-nube-otro><h2>${I('cloud')} ${T('nube.otro_titulo')}</h2>
      <p>${T('nube.otro_texto')}</p>
      <button class="btn main" data-act="partida" data-k="nueva">${I('cloud')}${T('nube.otro_usar')}</button>
      <p class="small muted">${T('nube.otro_nota')}</p></div>`);
  }
  async function nubeUsarNueva() {
    let r;
    try { r = await Api.partida(); } catch (e) { toast(T('nube.sin_red')); eleccion = () => nubeUsarNueva(); return; }
    const nube = nubeLeer(r);
    // Aquí hay avance que esa versión no tiene (p. ej. un evento que terminó con el aviso tapado por el resultado):
    // se pregunta cuál usar, nunca se pisa sin preguntar
    if (nube && nubeAvance() && nubeClave(nube) !== nubeClave(S)) { closeModal(); nubeElegir(nube, r.datos, r.rev); return; }
    if (nube) { nubeUsar(nube, r.datos, r.rev, true); return; }
    // La otra pestaña no guardó nada todavía: esta toma la partida con la suya
    closeModal(); nubeBloqueo = false; nubeMarcar(r.rev || 0, ''); nubeLista = nubeCuenta(); render();
    await subirNube(true);
  }
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') { clearTimeout(nubeT); if (nubePendiente) subirNube(); }
    else nubeFoco();
  });
  function nubeFoco() { const t = Date.now(); if (t - nubeUltima < 3000) return; nubeUltima = t; revisarNube('foco'); }
  window.addEventListener('focus', nubeFoco);
  window.addEventListener('pageshow', (e) => { if (e.persisted) nubeFoco(); });
  window.addEventListener('online', () => {
    // Si el juego se abrió sin internet, ahora sí busca el servidor (cuenta, entregas y partida en la nube)
    if (Api.disponible === false && Api.iniciar) { Api.iniciar().then(() => { if (Api.disponible) alConectar(false); }).catch(() => {}); return; }
    revisarNube('red');
  });
  window.addEventListener('storage', (e) => { if (e.key === NUBE_KEY) revisarNube('reloj'); });   // otra pestaña de este navegador guardó
  setInterval(() => { if (document.visibilityState === 'visible') revisarNube('reloj'); }, 60000);
  // Para las pruebas automáticas
  window.__nube = { dispositivo: NUBE_DISP, get info() { return nubeInfo; }, get bloqueo() { return nubeBloqueo; }, get lista() { return nubeLista; },
    revisar: (m) => revisarNube(m || 'foco'), subir: async () => { if (nubeSubiendo) await nubeSubiendo; return subirNube(); } };
  let cloudPendiente = false;   // mientras el jugador elige entre la partida de la nube y la del celular
  function load() {
    try { const raw = localStorage.getItem(SAVE_KEY); return raw ? G.deserialize(raw) : null; } catch (e) { return null; }
  }

  /* ---------- Mensajes cortos ---------- */
  let toastT = null;
  function toast(msg) {
    const t = $('toast');
    t.textContent = msg;
    t.style.display = 'block';
    clearTimeout(toastT);
    toastT = setTimeout(() => { t.style.display = 'none'; }, 2600);
  }
  function act(res, okSound) {
    if (res && res.msg) toast(TL(res.msg));
    if (res) snd.play(res.ok ? (okSound || 'tap') : 'error');
    save(); render(); return res;
  }

  /* ---------- Ventana ---------- */
  // Alto de la barra de arriba (para que las ventanas no queden debajo de ella: ver index.html)
  try {
    const hdr = document.querySelector('header');
    const ponerAlto = () => document.documentElement.style.setProperty('--hdr-h', Math.ceil(hdr.getBoundingClientRect().height) + 'px');
    if (hdr) { ponerAlto(); if (window.ResizeObserver) new ResizeObserver(ponerAlto).observe(hdr); else window.addEventListener('resize', ponerAlto); }
  } catch (e) { /* sin barra */ }
  function openModal(html) { $('modal').innerHTML = html; $('overlay').classList.add('on'); $('modal').scrollTop = 0; }
  function closeModal() { $('overlay').classList.remove('on'); $('modal').innerHTML = ''; }
  let confirmCb = null;
  function ask(text, yesLabel, cb) {
    confirmCb = cb;
    openModal(`<h2>${T('comun.seguro')}</h2><p>${text}</p>
      <button class="btn main" data-act="confirm-yes">${yesLabel}</button>
      <button class="btn" data-act="close">${T('comun.cancelar')}</button>`);
  }

  /* ---------- Idioma ---------- */
  const GLOBO = '<svg class="ico sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c2.6 2.6 3.8 5.6 3.8 9s-1.2 6.4-3.8 9c-2.6-2.6-3.8-5.6-3.8-9S9.4 5.6 12 3z"/></svg>';
  const svgIco = (body, cls) => `<svg class="ico ${cls || ''}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;
  const NOTA = svgIco('<path d="M9 18V5l11-2v13"/><circle cx="6.5" cy="18" r="2.5"/><circle cx="17.5" cy="16" r="2.5"/>', 'sm');
  const NOTA_OFF = svgIco('<path d="M9 18V5l11-2v13"/><circle cx="6.5" cy="18" r="2.5"/><circle cx="17.5" cy="16" r="2.5"/><path d="M3 3l18 18"/>', 'sm');
  const AYUDA = svgIco('<circle cx="12" cy="12" r="9"/><path d="M9.6 9.2a2.5 2.5 0 0 1 4.8.9c0 1.7-2.4 2.2-2.4 3.7"/><path d="M12 17.2v.1"/>');
  function nombreIdioma() {
    if (!I18) return 'Español';
    const i = I18.idiomas.find((x) => x.code === I18.idioma);
    return i ? i.nombre : I18.idioma;
  }
  function pintarIdiomaBtn() {
    const b = $('langBtn');
    if (!b) return;
    const code = I18 ? I18.idioma : 'es';
    b.innerHTML = `${GLOBO}<span>${esc(code.split('-')[0].toUpperCase())}</span>`;
    b.setAttribute('aria-label', `${T('idioma.boton')}: ${nombreIdioma()}`);
    b.hidden = !I18;
  }
  function abrirIdiomas() {
    if (!I18) return;
    openModal(`<div class="row between"><h2>${T('idioma.titulo')}</h2><button class="btn sm" data-act="close" aria-label="${esc(T('comun.cerrar'))}">${I('close', 'sm')}</button></div>
      <div class="langlist">${I18.idiomas.map((l) => `<button class="btn ${l.code === I18.idioma ? 'main' : ''}" data-act="set-idioma" data-k="${esc(l.code)}" lang="${esc(l.code)}" dir="${l.dir}">${esc(l.nombre)}</button>`).join('')}</div>`);
  }

  /* ---------- Ayudantes visuales ---------- */
  const starsTxt = (n, max) => '★'.repeat(n) + '<span class="muted">' + '★'.repeat((max || 5) - n) + '</span>';
  function starsBig(n) {
    const path = 'M12 3l2.7 5.6 6.1.8-4.5 4.2 1.1 6.1L12 16.8l-5.4 2.9 1.1-6.1-4.5-4.2 6.1-.8z';
    return `<div class="starsvg" aria-label="${esc(T('estrellas.aria', { n }))}">${[1, 2, 3, 4, 5].map((i) =>
      `<svg viewBox="0 0 24 24" stroke-width="1.6" stroke-linejoin="round"><path class="${i <= n ? 'on' : 'off'}" style="animation-delay:${i * 0.15}s" d="${path}"/></svg>`).join('')}</div>`;
  }
  function condBar(v) {
    const cls = v < 40 ? 'red' : v < 70 ? 'amber' : '';
    return `<div class="bar ${cls}"><i style="width:${v}%"></i></div>`;
  }
  /* ---------- Rarezas, equipos y personas (dibujos de Art) ---------- */
  const rar = (type) => { try { return A.rarity ? A.rarity(type) : { key: 'comun', label: 'Común', color: '#9aa6bb' }; } catch (e) { return { key: 'comun', label: 'Común', color: '#9aa6bb' }; } };
  const rlabel = (r) => (I18 && I18.T.has('rareza.' + r.key) ? T('rareza.' + r.key) : TL(r.label));
  const rtag = (type) => { const r = rar(type); return `<span class="rtag" style="--rc:${r.color}">${esc(rlabel(r))}</span>`; };
  const itemArt = (type, size, cls) => { try { return A.item ? A.item(type, size).replace('class="itemart', `class="itemart ${cls || ''}`) : tile(type); } catch (e) { return tile(type); } };
  const avatarOf = (p, size) => { try { return A.avatar ? A.avatar(p.name, p.role, size || 52, { owner: p.owner, premium: p.premium }) : tile('role_' + p.role); } catch (e) { return tile('role_' + p.role); } };
  const itemName = (type) => TL((G.CATALOG[type] || { name: type }).name);
  const roleName = (r) => TL(G.ROLES[r] ? G.ROLES[r].name : r);
  const eventName = (type) => TL((G.EVENT_TYPES[type] || { name: type }).name);
  const wageFor = (p, diff) => { try { return G.eventWage ? G.eventWage(p, diff) : p.wage; } catch (e) { return p.wage; } };
  const emptyState = (iconName, title, text) => `<div class="card empty"><div class="ei">${I(iconName)}</div><b>${title}</b><div class="small">${text}</div></div>`;
  const reduceMotion = () => { try { return window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) { return false; } };
  function duelBars(you, mega, label) {
    const won = you > mega;
    return `<div class="duel ${won ? 'won' : ''}">
      <div class="row between small"><span>${I('rival', 'sm')} ${label || T('duelo.titulo')}</span>${label ? '' : `<b class="${won ? 'up' : 'down'}">${won ? T('duelo.ganando') : T('duelo.perdiendo')}</b>`}</div>
      <div class="lbl"><span>${T('duelo.tu_calidad')}</span><b class="num">${you}</b></div><div class="bar you"><i style="width:${Math.max(0, Math.min(100, you))}%"></i></div>
      <div class="lbl"><span>${T('duelo.mega_promete')}</span><b class="num">${mega}</b></div><div class="bar mega"><i style="width:${Math.max(0, Math.min(100, mega))}%"></i></div></div>`;
  }
  // Confeti de celebración (DOM liviano, solo transform/opacity)
  // Celulares modestos (4 núcleos o menos, 2 GB o menos): la mitad de confeti
  const equipoModesto = (() => { try { return (navigator.hardwareConcurrency || 8) <= 4 || (navigator.deviceMemory || 8) <= 2; } catch (e) { return false; } })();
  function confetti(n) {
    if (reduceMotion() || !n) return;
    if (equipoModesto) n = Math.max(6, Math.round(n / 2));
    const box = document.createElement('div');
    box.className = 'confetti';
    const cols = ['#ff3b3b', '#ffb020', '#4da3ff', '#2ecc71', '#ffd34d', '#b57bff'];
    let h = '';
    for (let i = 0; i < n; i++) {
      const left = Math.random() * 100;
      h += `<i style="left:${left.toFixed(1)}%;background:${cols[i % cols.length]};--x:${((Math.random() - 0.5) * 160).toFixed(0)}px;--y:${(70 + Math.random() * 40).toFixed(0)}vh;--r:${(360 + Math.random() * 540).toFixed(0)}deg;--d:${(1.4 + Math.random() * 1.2).toFixed(2)}s;--w:${(Math.random() * 0.4).toFixed(2)}s;${i % 3 ? '' : 'width:6px;height:6px;border-radius:50%;'}"></i>`;
    }
    box.innerHTML = h;
    document.body.appendChild(box);
    setTimeout(() => box.remove(), 3200);
  }
  // Cuenta de dinero animada en el resultado
  function countUp(el, to, ms) {
    if (!el) return;
    const fmt = (v) => (v < 0 ? '-' : '+') + M(Math.abs(v));
    if (reduceMotion()) { el.textContent = fmt(to); return; }
    const t0 = performance.now();
    let ultimo = null;
    const step = (t) => {
      if (!el.isConnected) return;
      const k = Math.min(1, (t - t0) / (ms || 900));
      const e = 1 - Math.pow(1 - k, 3);
      const v = Math.round(to * e);
      if (v !== ultimo) { ultimo = v; el.textContent = fmt(v); }   // solo si cambió el número
      if (k < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }

  const TILE_COLOR = { misa: 'amber', boda: 'amber', prensa: 'blue', barrial: 'green', graduacion: 'blue', lanzamiento: 'red', concierto: 'red', ligapro: 'green', final: 'amber',
    boxeo: 'red', lucha_libre: 'red', funeral: '', lanzamiento_autos: 'amber', irl: 'blue', internacional_unilateral: 'blue', internacional_host: 'blue' };
  const tile = (iconName, color) => `<div class="tile ${color ? 't-' + color : ''}">${I(iconName)}</div>`;
  function reqTags(c) {
    const t = [];
    if (c.story) t.push(`<span class="tag amber">${I('star')}${T('req.historia')}</span>`);
    if (c.rival) t.push(`<span class="tag rival">${I('rival')}${T('req.rival')}</span>`);
    t.push(`<span class="tag">${I('cam_basic')}${T('req.camaras', { n: c.cams })}</span>`);
    if (c.cams >= 2) t.push(`<span class="tag">${I('switch_pro')}${T('req.switcher')}</span>`);
    if (c.audio) t.push(`<span class="tag">${I('role_audio')}${T('req.audio')}</span>`);
    if (c.stream) t.push(`<span class="tag red">${I('stream')}${T('req.stream')}</span>`);
    if (c.outdoor) t.push(`<span class="tag amber">${I('outdoor')}${T('req.outdoor')}</span>`);
    return t.join('');
  }
  // Personaje de cada capítulo (si la lógica no lo indica)
  const CH_CHAR = ['ramiro', 'ramiro', 'marca', 'mega', 'dirigente', 'ramiro'];
  const charOf = (i) => (G.CHAPTERS[i] && G.CHAPTERS[i].character) || CH_CHAR[i] || 'ramiro';
  function speaker(key, html) {
    return `<div class="speaker">${A.portrait(key, 64)}<div class="grow"><div class="who">${esc(TL(A.PORTRAIT_NAMES[key] || ''))}</div></div></div>
      <div class="bubble story">${html}</div>`;
  }

  /* ---------- Render general ---------- */
  let lastHead = null, lastTab = null;
  function bump(id, up) {
    const el = $(id);
    if (!el || reduceMotion()) return;
    // 'bump-down' y no 'down': la clase global .down pinta el texto de rojo y se quedaba así
    el.classList.remove('bump', 'bump-down'); void el.offsetWidth;
    el.classList.add('bump'); if (!up) el.classList.add('bump-down');
  }
  /* ---------- Ayuda y soporte (solo con servidor) ---------- */
  const sinLeerSoporte = () => { try { return Math.max(0, Number(Api.estado && Api.estado.soporte_sin_leer) || 0); } catch (e) { return 0; } };
  function soporteBtn(extra) {
    if (!window.Soporte || Api.disponible !== true) return '';
    const n = sinLeerSoporte();
    return `<button class="btn ${extra || ''}" data-act="soporte">${AYUDA}${T('soporte.titulo')}${n ? `<span class="badge sop" aria-label="${esc(T('soporte.sin_leer', { n }))}">${N(n)}</span>` : ''}</button>`;
  }
  function ctxSoporte() {
    return { Api, A, estado: () => S, toast, snd, openModal,
      closeModal: () => { closeModal(); render(); if (Api.disponible && Api.logueado()) Api.refrescar().then(() => render()).catch(() => {}); } };
  }
  // Dinero, fama, día y créditos de arriba (también se llama con una ventana abierta: el resultado, una reparación…)
  function cabecera() {
    $('hMoney').textContent = M(S.money);
    $('hMoney').classList.toggle('neg', S.money < 0);
    $('hRep').textContent = Math.floor(S.rep);
    $('hDay').textContent = S.day;
    // Créditos (💎) arriba, solo con cuenta: tocarlos lleva a la Tienda
    const cg = $('cGem');
    if (cg) {
      const conCuenta = !!(Api.disponible && Api.estado && Api.estado.logueado);
      cg.hidden = !conCuenta;
      if (cg.parentElement) cg.parentElement.classList.toggle('con-gem', conCuenta);
      if (conCuenta) { $('hGem').textContent = N(Api.estado.creditos || 0); { const l = T('tienda.creditos_lbl'); $('lGem').textContent = l.charAt(0).toUpperCase() + l.slice(1); } }
    }
    if (lastHead) {
      if (S.money !== lastHead.m) bump('cMoney', S.money > lastHead.m);
      if (Math.floor(S.rep) !== lastHead.r) bump('cRep', Math.floor(S.rep) > lastHead.r);
      if (S.day !== lastHead.d) bump('cDay', true);
    }
    lastHead = { m: S.money, r: Math.floor(S.rep), d: S.day };
  }
  function render() {
    marcarDia();
    cabecera();
    if (lastTab !== tab) {
      const sec = $('tab-' + tab);
      if (sec && lastTab !== null) { sec.classList.remove('enter'); void sec.offsetWidth; sec.classList.add('enter'); }
      lastTab = tab;
    }
    $('badgeC').textContent = S.contracts.length || '';
    const bb = $('badgeB');   // equipos que pueden fallar en vivo
    if (bb) { const n = equiposEnRiesgo().length; bb.textContent = n || ''; if (n) bb.setAttribute('aria-label', T('danos.badge', { n })); else bb.removeAttribute('aria-label'); }
    $('muteBtn').innerHTML = I(snd.muted() ? 'close' : 'sound', 'sm');
    $('muteBtn').setAttribute('aria-label', snd.muted() ? T('head.sonido_on') : T('head.silenciar'));
    const mb = $('musicBtn');
    if (mb) {
      mb.hidden = !window.Musica;
      mb.innerHTML = mus.muted() ? NOTA_OFF : NOTA;
      mb.setAttribute('aria-label', mus.muted() ? T('head.musica_on') : T('head.musica_off'));
      mb.setAttribute('aria-pressed', mus.muted() ? 'false' : 'true');
    }
    pintarIdiomaBtn();
    // El registro completo se abre desde Inicio (su lugar en la barra lo ocupa "En línea")
    document.querySelectorAll('nav button').forEach((b) => b.classList.toggle('on', b.dataset.tab === (tab === 'registro' ? 'inicio' : tab)));
    // Las pestañas que no se ven quedan vacías (menos nodos en la página); se vuelven a pintar al abrirlas
    document.querySelectorAll('main section').forEach((s) => { const on = s.id === 'tab-' + tab; s.classList.toggle('on', on); if (!on && s.firstChild) s.textContent = ''; });
    if (Pm && Pm.tickVip(S)) { try { localStorage.setItem(SAVE_KEY, G.serialize(S)); } catch (e) { /* nada */ } }
    $('vipBadge').hidden = !(Pm && Pm.vip);
    const bo = $('badgeO');
    if (bo) bo.textContent = avisosOnline() || '';
    if (tab !== 'online' && montado) desmontarOnline();
    anVista();
    if (tab !== 'inicio' && window.Hub) window.Hub.cerrar();
    ({ inicio: renderInicio, clientes: renderClientes, personal: renderPersonal, bodega: renderBodega, tienda: renderTienda, registro: renderRegistro, online: renderOnline })[tab]();
    if (S.gameOver && !$('overlay').classList.contains('on')) showGameOver();
    else avisoCuentaTal();
    flechasFilas();
  }

  // Filas de categorías que se mueven de lado (tienda de equipos, tienda): flechas ‹ › para quien juega en computadora
  // (en el celular también ayudan a ver que hay más). Solo se ven si hay más a ese lado.
  function flechasFilas() {
    document.querySelectorAll('.catrow').forEach((row) => {
      if (!row.parentNode || (row.parentElement && row.parentElement.classList.contains('catwrap'))) return;
      const sl = row.scrollLeft;   // mover la fila al envoltorio la regresa al inicio: se conserva donde estaba
      const w = document.createElement('div');
      w.className = 'catwrap';
      row.parentNode.insertBefore(w, row);
      w.appendChild(row);
      row.scrollLeft = sl;
      const flecha = (dir) => {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'catflecha ' + (dir < 0 ? 'izq' : 'der');
        b.setAttribute('aria-label', dir < 0 ? '‹' : '›');
        b.innerHTML = dir < 0 ? '&#8249;' : '&#8250;';
        b.addEventListener('click', (e) => { e.stopPropagation(); row.scrollBy({ left: dir * Math.max(140, row.clientWidth * 0.7), behavior: reduceMotion() ? 'auto' : 'smooth' }); snd.play('tap'); });
        w.appendChild(b);
        return b;
      };
      const izq = flecha(-1), der = flecha(1);
      const ver = () => { const max = row.scrollWidth - row.clientWidth - 4; izq.hidden = row.scrollLeft <= 4; der.hidden = max <= 0 || row.scrollLeft >= max; };
      row.addEventListener('scroll', ver, { passive: true });
      ver();
      requestAnimationFrame(ver);
    });
  }

  function renderInicio() {
    const ch = G.CHAPTERS[S.chapter];
    const rent = G.dailyCost ? G.dailyCost(S) : 20 + 4 * (S.staff.length - 1);
    let cb = null;
    try { cb = G.dailyCostBreakdown ? G.dailyCostBreakdown(S) : null; } catch (e) { cb = null; }
    const tHoy = turnoHoy();
    const costBox = cb ? `<div class="costbox"><div class="ci">${I('home')}</div><div class="t">
        <b style="font-family:inherit">${esc(venueName() || TL(cb.place))}</b> · ${T('inicio.gastos_hoy')} <b class="neg">${M(cb.total)}</b>${AY('gastos')}
        <div class="small muted">${T('inicio.local', { m: M(cb.rent) })}${cb.staff ? ` · ${T('inicio.c_personal', { m: M(cb.staff + (cb.payroll || 0)) })}` : ''}${cb.equip ? ` · ${T('inicio.c_seguro', { m: M(cb.equip) })}` : ''}${cb.fijoExt && window.Decoracion ? ` · ${esc(window.Decoracion.t('c_decor', { m: M(cb.fijoExt) }))}` : ''}${cb.vehiculos && window.Movilizacion ? ` · ${esc(window.Movilizacion.t('gasto', { m: M(cb.vehiculos) }))}` : ''}</div>
        ${cb.nextPlace ? `<div class="small" style="color:var(--amber)">${T('inicio.siguiente_local', { n: cb.nextAt, tienes: cb.size, lugar: esc(TL(cb.nextPlace)), m: M(cb.nextRent) })}</div>` : ''}
      </div></div>` : '';
    let story;
    if (S.storyDone) {
      story = `<div class="card"><div class="story-tag">${T('historia.modo')}</div><h2>${T('historia.completada')}</h2>
        <p class="muted">${T('historia.libre')}</p></div>`;
    } else {
      story = `<div class="card"><div class="story-tag">${T('historia.tag')}</div><h2>${esc(TL(ch.title))}</h2>
        <div class="row" style="align-items:flex-start;margin-top:8px">${A.portrait(charOf(S.chapter), 52)}
          <p class="small muted grow" style="margin:0">${esc(TL(ch.intro))}</p></div>
        <p><b>${T('historia.objetivo')}</b> ${esc(TL(ch.goal))}</p>
        <p class="small">${T('historia.progreso')} <span class="num">${esc(TL(ch.progress(S)))}</span></p>
        <p class="small muted">${T('historia.premio')} <span class="pay" style="font-size:14px">${M(ch.reward)}</span></p></div>`;
    }
    // En rojo: avisar antes de la quiebra
    // Con la lógica nueva: bajo el límite (días de gracia) o si los gastos de mañana te dejan bajo el límite
    const bk = bkInfo();
    const strip = (txt) => `<div class="redstrip" role="status">${I('bolt', 'sm')}<span>${txt}</span></div>`;
    const lim = `<b class="num">${M(bankruptAt())}</b>`;
    const rojo = S.gameOver ? ''
      : bk && bk.enPeligro ? strip(T('inicio.peligro', { m: lim, n: bk.graceLeft }))
      : bk && bk.mananaPeligro ? strip(T('inicio.manana_peligro', { g: `<b class="num">${M(G.dailyCost(S))}</b>`, m: lim }))
      : S.money < 0 ? strip(T('inicio.en_rojo', { m: lim })) : '';
    // La productora por dentro (js/hub.js): cada cuarto es un botón; debajo, qué hacer ahora, el capítulo, el turno de hoy y cerrar el día
    const turnoTxt = tHoy ? `${T('dia.hoy', { turno: turnoNom(tHoy.turno), n: tHoy.n, max: tHoy.max })}${tHoy.n ? ` · ${T('dia.parte_cada', { m: M(tHoy.parte) })}` : ''}` : '';
    const hubHtml = window.Hub ? window.Hub.inicio(datosHub(story, costBox, turnoTxt)) : `<div class="card hqcard">${A.hq(S)}</div>`;
    $('tab-inicio').innerHTML = `${rojo}${hubHtml}
      ${tHoy ? `<div class="small turno-hoy hub-turno">${I('calendar', 'sm')} ${turnoTxt}${AY('dia')}</div>` : ''}
      <button class="btn" data-act="next-day">${I('sleep')}${tHoy ? T('inicio.cerrar_dia') : T('inicio.descansar')} <span class="muted small">(${tHoy ? T(tHoy.n ? 'inicio.cerrar_det' : 'inicio.cerrar_det0', { m: M(cb ? cb.total : rent) }) : T('inicio.gastos', { m: M(cb ? cb.total : rent) })})</span></button>`;
  }

  /* ---------- Datos para el hub de Inicio (js/hub.js) ----------
     Los módulos (window.EnVivoInicio) se pintan igual que antes; el hub los pone en su lugar de la sede
     ({ hub: 'misiones' | 'sala' | ... } al registrarse, o js/hub.js MAPA; si no, en "Más"). */
  function datosHub(story, costBox, turnoTxt) {
    const ctx = ctxInicio();
    const modulos = modulosInicio().map((m) => {
      let html = '';
      if (typeof m.tarjeta === 'function') { try { html = m.tarjeta(ctx) || ''; } catch (e) { console.error('[inicio ' + m.id + ']', e); html = ''; } }
      // Título para su hoja: el de siempre de Inicio ('inicio.pl.<id>', traducido) o el que dé el módulo
      let titulo = '';
      try { const kt = 'inicio.pl.' + m.id, tt = T(kt); titulo = tt && tt !== kt ? tt : typeof m.titulo === 'function' ? m.titulo(ctx) : typeof m.fila === 'function' ? ((m.fila(ctx) || {}).titulo || '') : ''; } catch (e) { titulo = ''; }
      return { id: m.id, hub: m.hub, html, titulo };
    });
    const ch = G.CHAPTERS[S.chapter];
    const ult = `<div class="card log"><h3 style="margin-bottom:6px">${T('inicio.ultimo')}</h3>${S.log.slice(0, 6).map((l) => `<p><span>${T('comun.dia_n', { n: l.day })}</span>${esc(gtx(l, l.text))}</p>`).join('')}
        <button class="btn sm" data-act="tab" data-tab="registro" style="margin-top:10px">${I('log', 'sm')} ${T('inicio.ver_registro')}</button></div>`;
    const ayuda = `<div class="card small muted hub-ayuda">${T('inicio.ayuda_texto', { clientes: `<b>${T('nav.clientes')}</b>`, bodega: `<b>${T('nav.bodega')}</b>`, m: M(-bankruptAt()) })}${window.Compartir ? window.Compartir.ayuda() : ''}</div>`;
    const local = `<div class="card"><div class="row between prod-nom-row">${S.productora
        ? `<b class="prod-nom">${esc(S.productora)}</b><button class="btn sm prod-nom-btn" data-act="nombre" aria-label="${esc(T('inicio.nombre_cambiar'))}">✎</button>`
        : `<button class="btn sm prod-nom-btn" data-act="nombre" style="width:100%">${I('flag', 'sm')}${T('inicio.nombre_poner')}</button>`}</div>
        <div class="row wrap small">
          <span class="tag">${I('people')}${T('inicio.personas', { n: S.staff.length })}</span>
          <span class="tag">${I('box')}${T('inicio.equipos', { n: S.equip.length })}</span>
          <span class="tag">${I('rec')}${T('inicio.eventos', { n: S.stats.events })}</span>
          ${S.stats.fiveStars ? `<span class="tag">${I('star')}${T('inicio.eventos_5e', { n: S.stats.fiveStars })}</span>` : ''}
        </div>${costBox}${turnoTxt ? `<div class="small turno-hoy" style="margin-top:8px">${I('calendar', 'sm')} ${turnoTxt}</div>` : ''}</div>`;
    const mas = `${installCard()}<button class="btn" data-act="idioma">${I('stream')}${T('idioma.boton')}: ${esc(nombreIdioma())}</button>
      ${soporteBtn()}${unirseDiscordBtn()}
      ${window.Compartir ? window.Compartir.inicio(ctxInicio()) : ''}
      <button class="btn" data-act="new-game">${I('refresh')}${T('inicio.nueva')}</button>`;
    let vehiculos = 0, vehTipo = '', trofeos = 0, misHechas = 0;
    try { const fl = G.flota ? G.flota(S) : []; vehiculos = fl.length; vehTipo = fl.length ? fl[fl.length - 1].type : ''; } catch (e) { vehiculos = 0; }
    try { trofeos = window.Logros && window.Logros.resumen ? window.Logros.resumen(S).hechos : Math.floor(S.stats.fiveStars / 2); } catch (e) { trofeos = 0; }
    try { misHechas = Math.min(3, (S.stats.events || 0)); } catch (e) { misHechas = 0; }
    const cams = S.equip.filter((e) => { const it = G.CATALOG[e.type]; return it && it.cat === 'cam' && !['dron4k', 'grua'].includes(e.type); });
    let etapa = 0;
    try { etapa = Math.max(0, Math.min(3, G.venue(S).nivel)); } catch (e) { etapa = 0; }
    return {
      S, A, T, I, esc, M, ctx, toast, snd: () => snd.play('tap'),
      etapa, local: venueName(), nombre: (S.productora || '').trim(),
      modulos, extras: { historia: story, ultimo: ult, ayuda, local, cuenta: cuentaCard(), mas },
      ofertas: S.contracts.length, danos: equiposEnRiesgo().length, dnstrip: stripDanos(),
      logueado: !!(Api.logueado && Api.logueado()), tutorial: tutorialHecho(),
      equipos: S.equip.length, camTipo: cams.length ? cams[cams.length - 1].type : 'cam_basic', vehiculos, vehTipo, personas: S.staff.length, trofeos, misHechas,
      personaje: charOf(S.storyDone ? 0 : S.chapter),
      cap: S.storyDone ? { tag: T('historia.modo'), titulo: '', objetivo: T('historia.completada') }
        : { tag: T('historia.tag'), titulo: TL(ch.title), objetivo: TL(ch.goal), progreso: TL(ch.progress(S)) },
    };
  }

  /* ---------- Nombre de la productora (S.productora): sale en el letrero del local y en los vehículos ---------- */
  const nombreProductora = () => (typeof S.productora === 'string' && S.productora.trim()) || T('inicio.nombre_def');
  function abrirNombre() {
    openModal(`<div class="row between"><h2>${T('inicio.nombre_titulo')}</h2><button class="btn sm" data-act="close" aria-label="${esc(T('comun.cerrar'))}">${I('close', 'sm')}</button></div>
      <p class="small muted">${T('inicio.nombre_ayuda')}</p>
      <form id="formNombre"><label class="field">${T('inicio.nombre_campo')}<input id="prod-nombre" maxlength="24" autocomplete="organization" value="${esc(S.productora || '')}" placeholder="${esc(T('inicio.nombre_ej'))}" required></label>
      <button class="btn main" type="submit">${I('check')}${T('inicio.nombre_guardar')}</button></form>`);
    setTimeout(() => { try { $('prod-nombre').focus(); } catch (e) { /* nada */ } }, 50);
  }
  function guardarNombre() {
    const v = ($('prod-nombre').value || '').replace(/[\u0000-\u001f<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, 24);
    if (!v) { snd.play('error'); return; }
    S.productora = v;
    save(); closeModal(); snd.play('hire'); toast(T('inicio.nombre_listo', { n: v })); render();
  }

  /* ---------- Aviso de cuenta: sin cuenta, la partida vive SOLO en este celular ----------
     Tarjeta fija en Inicio (después del tutorial) y una ventana que sale sola 3 veces en todo el juego
     (al terminar el tutorial, al día 15 y al capítulo 4), nunca durante un evento ni encima de otra ventana. */
  const sinCuenta = () => !!(Api.disponible && Api.estado && !Api.logueado());
  const tutorialHecho = () => !!(S.storyDone || S.chapter >= 1);
  function cuentaCard() {
    if (!sinCuenta() || !tutorialHecho()) return '';
    return `<div class="card aviso-cuenta">
      <p class="small muted" style="margin:0 0 4px">${T('avisoc.det', { d: S.day, n: S.stats.events })}</p>
      <button class="btn main" data-act="cuenta" data-modo="registro">${I('user')}${T('avisoc.crear')}</button>
      <button class="btn" data-act="cuenta-info">${I('tip')}${T('avisoc.porque')}</button></div>`;
  }
  function avisoCuenta() {
    const fila = (ic, color, txt) => `<div class="ac-fila"><span style="color:${color}">${I(ic, 'sm')}</span><span>${txt}</span></div>`;
    const no = [1, 2, 3, 4].map((i) => fila('x_circle', 'var(--red)', T('avisoc.solo' + i))).join('');
    const si = [1, 2, 3, 4].map((i) => fila('check', 'var(--green)', T('avisoc.con' + i))).join('');
    openModal(`<div class="row between"><div class="story-tag">${T('avisoc.tag')}</div><button class="btn sm" data-act="close" aria-label="${esc(T('comun.cerrar'))}">${I('close', 'sm')}</button></div>
      <h2>${T('avisoc.titulo')}</h2>
      <div class="ac-hq">${A.hq(S)}</div>
      <div class="row wrap small" style="margin:8px 0 4px">
        <span class="tag">${I('calendar')}${T('comun.dia_n', { n: S.day })}</span>
        <span class="tag">${I('money')}${M(S.money)}</span>
        <span class="tag">${I('people')}${T('inicio.personas', { n: S.staff.length })}</span>
        <span class="tag">${I('box')}${T('inicio.equipos', { n: S.equip.length })}</span>
        <span class="tag">${I('rec')}${T('inicio.eventos', { n: S.stats.events })}</span>
      </div>
      <h3 class="ac-h" style="color:#ff8f8f">${T('avisoc.solo_t')}</h3>${no}
      <h3 class="ac-h" style="color:#7fe0a8">${T('avisoc.con_t')}</h3>${si}
      <p class="small muted" style="margin-top:10px">${T('avisoc.gratis')}</p>
      <button class="btn main" data-act="cuenta" data-modo="registro">${I('user')}${T('avisoc.crear')}</button>
      <button class="btn" data-act="cuenta" data-modo="entrar">${T('cuenta.ya_tengo_entrar')}</button>
      <button class="btn sm" data-act="close" style="margin-top:4px">${T('avisoc.ahora_no')}</button>`);
  }
  let avisoTimer = null;
  const nivelAviso = () => (S.storyDone || S.chapter >= 4 ? 3 : S.day >= 15 ? 2 : 1);
  function avisoCuentaTal() {
    if (avisoTimer || tab !== 'inicio' || VI || S.gameOver || !sinCuenta() || !tutorialHecho()) return;
    const nivel = nivelAviso();
    if (Number(lsGet('envivo_aviso_cuenta') || 0) >= nivel) return;
    avisoTimer = setTimeout(() => {
      avisoTimer = null;
      if (tab !== 'inicio' || VI || $('overlay').classList.contains('on') || !sinCuenta()) return;
      lsSet('envivo_aviso_cuenta', nivel);
      avisoCuenta();
    }, 1200);
  }

  // Botón para instalar como app (solo si el navegador lo permite)
  function installCard() {
    const P = window.PWA;
    try {
      if (!P || P.isStandalone()) return '';
      if (P.canInstall()) return `<button class="btn" data-act="install">${I('box')}${T('pwa.instalar')}</button>`;
      if (P.isIOS()) return `<div class="card small muted">${I('tip', 'sm')} ${T('pwa.ios', { compartir: `<b>${T('pwa.compartir')}</b>`, agregar: `<b>${T('pwa.agregar')}</b>` })}</div>`;
    } catch (e) { /* sin instalación */ }
    return '';
  }

  /* ---------- Navegación v2: sub-pestañas fijas arriba de cada pestaña (reporte del dueño, oct. 2026:
     "estar para abajo en lista en todos los menús no sirve"). Cada pestaña muestra UNA sección a la vez; la última
     elegida se recuerda (localStorage). Los enlaces de otros módulos (Ver en la Bodega, ir-danos, hub...) eligen la
     sección correcta con irA(tab, sub). ---------- */
  const SUB_KEY = 'envivo_subtab';
  const SUBS = { personal: ['equipo', 'contratar', 'capacitar'], bodega: ['equipos', 'tienda', 'repuestos'], tienda: ['ofertas', 'creditos', 'vip', 'pase', 'mercado'] };
  const sub = Object.assign({ personal: 'equipo', bodega: 'equipos', tienda: 'ofertas', clientesOrden: 'llegada', shopOrden: 'rec', eqFiltro: 'todo', stFiltro: 'todo' }, (() => { const v = lsGet(SUB_KEY); return v && typeof v === 'object' ? v : {}; })());
  Object.keys(SUBS).forEach((t) => { if (!SUBS[t].includes(sub[t])) sub[t] = SUBS[t][0]; });
  const setSub = (k, v) => { sub[k] = v; lsSet(SUB_KEY, sub); };
  let shopBusca = '';       // búsqueda en la tienda de equipos (no se guarda)
  const ICO_BUSCA = svgIco('<circle cx="10.5" cy="10.5" r="6"/><path d="M15 15l5 5"/>', 'sm');
  // Botonera de sub-pestañas (como los botones de un switcher: la elegida queda "al aire", con su luz roja)
  // items: [{ k, t (texto), ic (html del ícono), n (contador), tono ('amb' | ''), extra (atributos) }]
  function subnav(tabK, items, actual, opts) {
    const o = opts || {};
    return `<div class="subnav-w"><div class="subnav sn-col ${o.cls || ''}" role="tablist" aria-label="${esc(o.aria || T('nav2.secciones'))}" style="--sn:${items.length}">${items.map((x) => {
      const on = x.k === actual;
      return `<button type="button" class="sn-k ${on ? 'on' : ''}" role="tab" aria-selected="${on}" data-act="${x.act || o.act || 'sub'}" data-t="${esc(tabK)}" data-k="${esc(x.k)}" ${x.extra || ''}>
        <span class="sn-ic">${x.ic || ''}</span><span class="sn-t">${esc(x.t)}</span>${x.n ? `<b class="sn-n ${x.tono || ''}">${typeof x.n === 'number' ? N(x.n) : esc(x.n)}</b>` : ''}</button>`;
    }).join('')}</div></div>`;
  }
  // Fila de filtros (chips): data-act="filtro" data-f="<estado>" data-k="<valor>"
  function chipsFiltro(f, items, actual, aria) {
    return `<div class="catrow fchips" role="group" aria-label="${esc(aria || T('nav2.filtros'))}">${items.map((x) =>
      `<button type="button" class="catchip ${x.k === actual ? 'on' : ''}" aria-pressed="${x.k === actual}" data-act="filtro" data-f="${esc(f)}" data-k="${esc(x.k)}">${x.ic || ''}<span>${esc(x.t)}</span>${x.n != null ? `<b>${N(x.n)}</b>` : ''}</button>`).join('')}</div>`;
  }
  // Ir a una pestaña y a una de sus secciones (deep link): tab, sección, y después de pintar, fn()
  function irA(t, s, fn) {
    if (VI) return;
    if (s && SUBS[t] && SUBS[t].includes(s)) setSub(t, s);
    if (t === 'tienda') vistaTienda = sub.tienda === 'mercado' ? 'mercado' : 'tienda';
    tab = t; mus.go('menu'); render(); window.scrollTo(0, 0);
    if (fn) { try { fn(); } catch (e) { /* nada */ } }
  }
  window.EnVivoIr = (t, s, extra) => {
    const x = extra || {};
    if (t === 'bodega' && x.cat) { catSel = x.cat; lsSet('envivo_cat', catSel); shopBusca = ''; }
    irA(t, s);
  };
  // Resalta y centra una tarjeta después de un deep link
  function resaltar(card) {
    if (!card) return;
    card.classList.add('combo-ir');
    try { card.scrollIntoView({ block: 'center' }); } catch (err) { /* nada */ }
  }

  // Contrato internacional en la tarjeta: requisitos armados de nuevo (en el idioma actual) con todo tu personal y equipo
  function intlVista(c) {
    if (!c || !c.internacional || !G.requisitosInternacional) return c;
    try { return Object.assign({}, c, { requisitos: G.requisitosInternacional(S, c, S.staff.map((p) => p.id), S.equip.map((e) => e.id)).map((r) => Object.assign({}, r, { texto: TL(r.texto) })) }); } catch (e) { return c; }
  }
  function renderClientes() {
    const tHoy = turnoHoy();
    // Orden de las ofertas (chips): mejor pago, la que vence antes o la más fácil
    const ord = sub.clientesOrden;
    const lista = S.contracts.slice().sort(ord === 'vence' ? (a, b) => a.daysLeft - b.daysLeft || b.pay - a.pay
      : ord === 'facil' ? (a, b) => a.diff - b.diff || b.pay - a.pay : ord === 'pago' ? (a, b) => b.pay - a.pay : () => 0);
    const cards = lista.map((c) => {
      const tmp = c.temporada ? `<div class="story-tag temp-oferta" style="margin-bottom:6px">${esc((G.EVENT_TYPES[c.type] || {}).icon || '')} ${T('temp.oferta_tag', { temporada: esc(TL(G.tx('temp.' + c.temporada + '.nombre'))) })}</div>` : '';
      const todoDia = tHoy && esJornada(c) ? `<span class="tag amber todo-dia">${I('calendar', 'sm')}${T('clientes.todo_dia')}</span>` : '';
      return `<div class="card ofc ${c.temporada ? 'temp-card' : ''}" ${c.temporada ? `data-temporada="${esc(c.temporada)}"` : ''}>${tmp}
        <div class="row">${tile(c.type, TILE_COLOR[c.type])}
          <div class="grow"><h3>${esc(eventName(c.type))}</h3><div class="small muted">${esc(TL(c.client))}</div></div>
          <div class="pay">${M(c.pay)}</div></div>
        <div style="margin-top:6px">${reqTags(c)}${todoDia}</div>
        ${PE ? PE.internacional(intlVista(c)) : ''}${c.internacional ? ayudaIntlHtml(c) : ''}
        ${c.rival && typeof c.rivalQuality === 'number' ? `<div class="duel small" style="margin-top:8px"><div class="row between"><span>${I('rival', 'sm')} ${T('clientes.mega_promete')} <b class="num">${c.rivalQuality}</b></span><span class="muted">${T('clientes.superala')}</span></div><div class="bar mega"><i style="width:${c.rivalQuality}%"></i></div></div>` : ''}
        <div class="of-pie">
          <span class="of-meta small"><span>${T('clientes.dificultad')} ${starsTxt(c.diff)}</span>
          <span class="${c.daysLeft <= 1 ? 'neg' : 'muted'}">${I('clock', 'sm')} ${tHoy && c.daysLeft <= 1 ? T('clientes.vence_hoy') : T('clientes.vence', { n: c.daysLeft })}</span></span>
          <button class="btn main of-btn" data-act="prep" data-id="${c.id}">${I('rec', 'sm')}${T('clientes.preparar')}</button>
        </div>
      </div>`;
    }).join('');
    // Buscar clientes: tres botones grandes, siempre a la vista (fijos arriba)
    const mkt = (k, ic, t, det, full, off) => `<button class="mk-t" data-act="mkt" data-k="${k}" ${off ? 'disabled' : ''} aria-label="${esc(full)}">
      <span class="mk-ic">${I(ic)}</span><b>${esc(t)}</b><small>${off ? esc(T('nav2.hecho_hoy')) : det}</small></button>`;
    const orden = S.contracts.length > 1 ? chipsFiltro('clientesOrden', [{ k: 'llegada', t: T('nav2.o_llegada') }, { k: 'pago', t: T('nav2.o_pago') }, { k: 'vence', t: T('nav2.o_vence') }, { k: 'facil', t: T('nav2.o_facil') }], ord, T('nav2.orden')) : '';
    $('tab-clientes').innerHTML = `
      <div class="subbar" role="group" aria-label="${esc(T('clientes.buscar'))}"><div class="mk-row">
        ${mkt('redes', 'social', T('nav2.redes'), esc(T('nav2.redes_det', { m: M(40) })), T('clientes.redes'), S.daily.redes)}
        ${mkt('anuncio', 'ad', T('nav2.anuncio'), esc(T('nav2.anuncio_det', { m: M(200) })), T('clientes.anuncio'), S.daily.anuncio)}
        ${mkt('visitar', 'walk', T('nav2.visitar'), esc(T('nav2.visitar_det')), T('clientes.visitar'), false)}
      </div></div>
      <div class="sectitle">${T('clientes.disponibles', { n: S.contracts.length })}</div>
      ${tHoy ? `<div class="turnos-hoy tn-strip small"><b>${I('calendar', 'sm')} ${T('clientes.turnos', { n: tHoy.libres })}</b>${AY('dia')}${tHoy.max > 3 ? ` <span class="muted">${T('dia.vip_turnos', { n: tHoy.max })}</span>` : ''}</div>` : ''}
      ${orden}
      ${cards || emptyState('clients', T('clientes.vacio_t'), T('clientes.vacio'))}`;
  }

  /* ---------- Personal internacional: el camino cuando un contrato internacional pide experiencia internacional ----------
     (reporte del dueño, oct. 2026: "¿cómo consigo personal internacional? estoy estancado, ni con diamantes puedo").
     Nunca un callejón sin salida: capacitar a alguien de tu equipo (dinero o 💎), contratar a un candidato que ya la tiene,
     buscar uno (dinero) o traerlo ya (💎). Los 💎 los descuenta SIEMPRE el servidor (/api/gastar "curso_intl:" / "personal_intl:"). */
  const IC = () => G.INTL_CREDITOS || { curso: 60, personal: 180 };
  const saldoCred = () => (Api.estado && Api.estado.creditos) || 0;
  const credBtn = (act, n, label, extra) => (Api.logueado()
    ? `<button class="btn sm" data-act="${act}" ${extra || ''} ${saldoCred() < n ? 'disabled' : ''}>${I('gem', 'sm')}${label}</button>${saldoCred() < n ? `<span class="small" style="color:var(--amber)">${T('intl.faltan_cred', { n: N(n - saldoCred()) })}</span>` : ''}` : '');
  // sel: ids que llevas en la preparación (si no, todo tu personal)
  function ayudaIntlHtml(c, sel) {
    if (!c || !c.internacional || !G.ayudaIntl) return '';
    let faltas = [];
    try { faltas = G.ayudaIntl(S, c); } catch (e) { faltas = []; }
    const fee = (x) => x.wage * ((BAL().wage && BAL().wage.hireFeeDays) || 2);
    const persona = (id) => S.staff.find((p) => p.id === id);
    let html = '';
    // En la preparación: alguien que ya cumple pero no lo llevas
    if (sel && G.requisitosInternacional) {
      let reqs = [];
      try { reqs = G.requisitosInternacional(S, c, [...sel], [...(prep ? prep.equip : [])]); } catch (e) { reqs = []; }
      const dirMal = reqs.some((r) => r.key === 'dir_intl' && !r.ok), eqMal = reqs.some((r) => r.key === 'equipo_intl' && !r.ok);
      const fuera = S.staff.filter((p) => !sel.has(p.id) && G.isIntlExp(p) && ((dirMal && normRole(p.role) === 'director') || (eqMal && normRole(p.role) !== 'director'))).slice(0, 3);
      if (fuera.length) html += `<div class="intl-fix">${fuera.map((p) => `<button class="btn sm main" data-act="intl-llevar" data-id="${p.id}">${I('check', 'sm')}${T('intl.llevar', { nombre: esc(nmP(p)) })}</button>`).join('')}</div>`;
    }
    faltas.forEach((f) => {
      const req = TL(G.tx('req.' + f.key, f.key === 'equipo_intl' ? { n: f.falta } : null));
      const rolN = roleName(f.rol).toLowerCase();
      const btns = [];
      f.cand.slice(0, 2).forEach((id) => { const x = S.candidates.find((k) => k.id === id); if (x) btns.push(`<button class="btn sm main" data-act="intl-hire" data-id="${x.id}" ${S.money < fee(x) ? 'disabled' : ''}>${I(roleIcon(x.role), 'sm')}${T('intl.contratar', { nombre: esc(TL(x.name)), m: M(fee(x)) })}</button>`); });
      f.curso.slice(0, 2).forEach((o) => {
        const p = persona(o.id);
        btns.push(`<div class="intl-op"><button class="btn sm ${btns.length ? '' : 'main'}" data-act="intl-curso" data-id="${o.id}" ${S.money < o.costo ? 'disabled' : ''}>${I('globe', 'sm')}${p.owner ? T('intl.capacitate', { m: M(o.costo) }) : T('intl.capacita', { nombre: esc(nmP(p)), m: M(o.costo) })}</button>${credBtn('intl-curso-cred', IC().curso, T('intl.curso_cred', { n: N(IC().curso) }), `data-id="${o.id}" data-k="${esc(normRole(p.role))}"`)}</div>`);
      });
      if (f.disponible) {
        btns.push(`<div class="intl-op"><button class="btn sm" data-act="intl-buscar" data-k="${esc(f.rol)}" ${S.money < f.buscar ? 'disabled' : ''}>${I('megaphone', 'sm')}${T('intl.buscar_rol', { rol: esc(rolN), m: M(f.buscar) })}</button>${credBtn('intl-personal-cred', IC().personal, T('intl.personal_cred', { rol: esc(roleName(f.rol)), n: N(IC().personal) }), `data-k="${esc(f.rol)}"`)}</div>`);
      }
      const jun = f.juniors.slice(0, 2).map((id) => `<p class="small muted" style="margin:4px 0 0">${T('intl.junior', { nombre: esc(nmP(persona(id))) })}</p>`).join('');
      html += `<div class="intl-fix" data-intl-falta="${esc(f.key)}"><b class="small">${I('globe', 'sm')} ${T('intl.falta_t', { req: esc(req) })}</b>
        <div class="small muted" style="margin:2px 0 6px">${T('intl.como')}</div>${btns.join('')}${jun}</div>`;
    });
    return html ? `<div class="card intl-ayuda">${html}</div>` : '';
  }
  // Toques del camino internacional (Clientes, preparación y Personal)
  function intlAccion(a, el, id) {
    const enPrep = prep && !S.currentEvent ? prep.id : null;
    const volver = () => { save(); if (enPrep !== null && S.contracts.some((c) => c.id === enPrep)) renderPrep(); else render(); };
    if (a === 'intl-llevar') { if (prep) { prep.staff.add(id); snd.play('tap'); renderPrep(); } return; }
    if (a === 'intl-curso') {
      const r = G.cursoIntl(S, id);
      toast(TL(r.msg)); snd.play(r.ok ? 'hire' : 'error');
      if (r.ok && prep) prep.staff.add(id);
      volver(); return;
    }
    if (a === 'intl-buscar') {
      const r = G.searchStaffIntl(S, el.dataset.k || rolBuscar || 'director');
      toast(TL(r.msg)); snd.play(r.ok ? 'tap' : 'error');
      volver(); return;
    }
    if (a === 'intl-hire') {
      const r = G.hire(S, id);
      toast(TL(r.msg)); snd.play(r.ok ? 'hire' : 'error');
      if (r.ok && prep) prep.staff.add(id);
      volver(); return;
    }
    if (a === 'intl-curso-cred') { canjearIntl('curso_intl:' + (el.dataset.k || 'director') + ':' + id, id); return; }
    if (a === 'intl-personal-cred') { canjearIntl('personal_intl:' + (el.dataset.k || 'director')); }
  }
  // 💎 por el servidor; la entrega llega con /api/estado y se aplica a la partida (js/premium.js). En la preparación se
  // queda abierta y se lleva a la persona.
  async function canjearIntl(item, staffId) {
    const enPrep = prep && !S.currentEvent ? prep.id : null;
    const antes = new Set(S.staff.map((p) => p.id));
    try { await Api.gastar(item); } catch (e) { toast(TL(e.message)); snd.play('error'); return; }
    snd.play('buy');
    try { await Api.refrescar(); } catch (e) { /* queda lo que ya había */ }
    aplicarEntregas();
    if (enPrep !== null && prep && prep.id === enPrep) {
      if (staffId) prep.staff.add(staffId);
      S.staff.forEach((p) => { if (!antes.has(p.id)) prep.staff.add(p.id); });
      save(); renderPrep(); return;
    }
    save(); render();
  }

  /* ---------- Personal ---------- */
  // Experiencia: eventos nacionales e internacionales trabajados
  // Nivel (Junior… Internacional) y experiencia: eventos nacionales e internacionales trabajados
  function expLine(p, conExp) {
    const nac = typeof p.eventos_nacionales === 'number' ? p.eventos_nacionales : (p.events || 0);
    const intl = p.eventos_internacionales || 0;
    return `<div class="exp small">${tierBadge(p)}<span class="skill" title="${esc(T('personal.habilidad'))}" aria-label="${esc(T('personal.habilidad'))} ${p.skill}/5">${starsTxt(p.skill)}</span></div>
      ${conExp ? `<div class="exp small"><span>${I('flag', 'sm')}${T('personal.nacionales', { n: nac })}</span><span class="${intl ? 'intl' : ''}">${I('globe', 'sm')}${T('personal.internacionales', { n: intl })}</span></div>` : ''}`;
  }
  // Experiencia en corto para las tarjetas de 2 columnas (el texto completo va en el título)
  function expCorta(p) {
    const nac = typeof p.eventos_nacionales === 'number' ? p.eventos_nacionales : (p.events || 0);
    const intl = p.eventos_internacionales || 0;
    return `<div class="exp small exp-c" title="${esc(T('personal.nacionales', { n: nac }) + ' · ' + T('personal.internacionales', { n: intl }))}"><span>${I('flag', 'sm')}<b class="num">${N(nac)}</b></span>${intl ? `<span class="intl">${I('globe', 'sm')}${T('personal.internacionales', { n: intl })}</span>` : `<span>${I('globe', 'sm')}<b class="num">0</b></span>`}</div>`;
  }
  function rolLine(p) {
    return `<div class="rolrow"><span class="roleic">${I(roleIcon(p.role), 'sm')}</span><span class="rn">${esc(roleName(normRole(p.role)))}</span></div>`;
  }
  // Capacitación internacional en la tarjeta de cada persona (si la puede hacer)
  function cursoHtml(p) {
    if (!G.puedeCursoIntl) return '';
    if (p.cursoIntl) return `<div class="small" style="margin-top:6px;color:var(--blue,#4da3ff)">${I('globe', 'sm')} ${T('intl.curso_hecho')}</div>`;
    if (!G.puedeCursoIntl(S, p).ok) return '';
    const costo = G.cursoIntlCosto(p);
    return `<div class="intl-op" style="margin-top:8px"><button class="btn sm" data-act="intl-curso" data-id="${p.id}" ${S.money < costo ? 'disabled' : ''}>${I('globe', 'sm')}${T('intl.curso', { m: M(costo) })}</button>${credBtn('intl-curso-cred', IC().curso, T('intl.curso_cred', { n: N(IC().curso) }), `data-id="${p.id}" data-k="${esc(normRole(p.role))}"`)}</div>`;
  }
  function renderPersonal() {
    const ord = (p) => (p.owner ? -1 : ((G.ROLES[normRole(p.role)] || {}).orden || 0));
    const max = maxStaff();
    const lleno = S.staff.length >= max;
    const fee = (c) => c.wage * ((BAL().wage && BAL().wage.hireFeeDays) || 2);
    // Quién puede hacer la capacitación internacional (sección Capacitar)
    const puedeCap = (p) => { try { return !!(G.puedeCursoIntl && !p.cursoIntl && G.puedeCursoIntl(S, p).ok); } catch (e) { return false; } };
    const nCap = S.staff.filter(puedeCap).length;
    const items = [
      { k: 'equipo', t: T('nav2.p_equipo'), ic: I('people', 'sm'), n: `${S.staff.length}/${max}` },
      { k: 'contratar', t: T('nav2.p_contratar'), ic: I('user', 'sm'), n: S.candidates.length || 0 },
    ];
    if (G.puedeCursoIntl) items.push({ k: 'capacitar', t: T('nav2.p_capacitar'), ic: I('globe', 'sm'), n: nCap || 0, tono: 'amb' });
    let s = sub.personal;
    if (!items.some((x) => x.k === s)) s = 'equipo';
    let cuerpo = '';
    if (s === 'equipo') {
      // Filtro por puesto (con cuántos tienes de cada uno)
      const cuenta = {};
      S.staff.forEach((p) => { const k = normRole(p.role); cuenta[k] = (cuenta[k] || 0) + 1; });
      const keys = (G.ROLE_KEYS || Object.keys(G.ROLES)).filter((k) => cuenta[k]);
      let f = sub.stFiltro;
      if (f !== 'todo' && !cuenta[f]) f = 'todo';
      const filtro = keys.length > 1 ? chipsFiltro('stFiltro', [{ k: 'todo', t: T('nav2.todos'), n: S.staff.length }]
        .concat(keys.map((k) => ({ k, t: roleName(k), ic: I(roleIcon(k), 'sm'), n: cuenta[k] }))), f) : '';
      const lista = S.staff.filter((p) => f === 'todo' || normRole(p.role) === f).sort((a, b) => ord(a) - ord(b) || (b.skill - a.skill));
      const staff = lista.map((p) => `<div class="card staffc sc2 ${p.owner ? 'owner' : ''}">
        <div class="sc-top">${avatarOf(p, 48)}<div class="sc-lv">${tierBadge(p)}<span class="skill" aria-label="${esc(T('personal.habilidad'))} ${p.skill}/5">${starsTxt(p.skill)}</span></div>${p.cursoIntl ? `<span class="sc-intl" title="${esc(T('intl.curso_hecho'))}">${I('globe', 'sm')}</span>` : ''}</div>
        <h3>${esc(nmP(p))}${p.premium ? `<span class="badge-p">${T('personal.estrella')}</span>` : ''}</h3>${rolLine(p)}${expCorta(p)}
        <div class="grow2"></div>
        ${p.owner ? `<p class="small muted sc-yo">${T('personal.eres_tu')}</p>` : `
        <div class="sc-mor small muted">${T('personal.moral', { n: p.morale })}</div>${condBar(p.morale)}
        <div class="sc-pie"><span class="small">${T('personal.cobra_corto', { m: `<b class="num">${M(p.wage)}</b>` })}</span>
          <button class="btn sm" data-act="fire" data-id="${p.id}">${T('personal.despedir')}</button></div>`}
      </div>`).join('');
      cuerpo = `<div class="sectitle">${T('personal.tu_equipo', { n: S.staff.length, max })}</div>${filtro}<div class="sgrid">${staff}</div>`;
    } else if (s === 'contratar') {
      const cands = S.candidates.map((c) => `<div class="card staffc sc2 cand">
        <div class="sc-top">${avatarOf(c, 48)}<div class="sc-lv">${tierBadge(c)}<span class="skill" aria-label="${esc(T('personal.habilidad'))} ${c.skill}/5">${starsTxt(c.skill)}</span></div></div>
        <h3>${esc(TL(c.name))}</h3>${rolLine(c)}${expCorta(c)}
        <div class="grow2"></div>
        <div class="small sc-sueldo">${T('personal.cobra_corto', { m: `<b class="num">${M(c.wage)}</b>` })}</div>
        ${lleno ? `<button class="btn sm" disabled>${T('personal.equipo_completo', { n: S.staff.length, max })}</button>`
          : `<button class="btn sm main" data-act="hire" data-id="${c.id}" ${S.money < fee(c) ? 'disabled' : ''}>${T('personal.contratar', { m: M(fee(c)) })}</button>`}
      </div>`).join('');
      const opciones = (G.ROLE_KEYS || Object.keys(G.ROLES)).map((k) => `<option value="${esc(k)}" ${rolBuscar === k ? 'selected' : ''}>${esc(roleName(k))}</option>`).join('');
      cuerpo = `${lleno ? `<div class="redstrip amberstrip" role="status">${I('home', 'sm')}<span>${T('personal.lleno_local', { lugar: esc(venueName()), n: S.staff.length, max })}</span></div>` : ''}
        <div class="card buscar">
          <label class="field" for="rolBuscar">${T('personal.buscar_puesto')}
            <select id="rolBuscar" data-act="rol-buscar"><option value="">${T('personal.cualquier_puesto')}</option>${opciones}</select></label>
          <button class="btn" data-act="search-staff" ${S.money < 30 ? 'disabled' : ''}>${I('megaphone')}${T('personal.vacante', { m: M(30) })}</button>
          ${G.intlPersonalDisponible && G.intlPersonalDisponible(S) ? (() => { const cb = BAL().intlPersonal ? BAL().intlPersonal.buscar : 400;
            return `<button class="btn" data-act="intl-buscar" data-k="" ${S.money < cb ? 'disabled' : ''}>${I('globe')}${T('intl.buscar', { m: M(cb) })}</button>
            <p class="small muted" style="margin:2px 0 6px">${T('intl.buscar_det')}</p>
            ${credBtn('intl-personal-cred', IC().personal, T('intl.personal_cred_gen', { n: N(IC().personal) }), 'data-k="" data-sel="1"')}`; })() : ''}
        </div>
        <div class="sectitle">${T('personal.candidatos')}</div>
        <p class="small muted" style="margin-top:-4px">${T('personal.pago_inicial')}</p>
        ${cands ? `<div class="sgrid">${cands}</div>` : emptyState('people', T('personal.vacio_t'), T('personal.vacio'))}`;
    } else {
      const pueden = S.staff.filter(puedeCap);
      const hechos = S.staff.filter((p) => p.cursoIntl);
      const fila = (p) => `<div class="card staffc capc"><div class="person">${avatarOf(p, 44)}
          <div class="grow who"><h3>${esc(nmP(p))}</h3>${rolLine(p)}${expLine(p, true)}</div></div>${cursoHtml(p)}</div>`;
      cuerpo = `<p class="small muted cap-det">${I('globe', 'sm')} ${T('nav2.cap_det')}</p>
        ${pueden.length ? pueden.map(fila).join('') : emptyState('globe', T('nav2.cap_vacio_t'), T('nav2.cap_vacio'))}
        ${hechos.length ? `<div class="sectitle">${T('nav2.cap_hechos')}</div><div class="rolesum">${hechos.map((p) => `<span class="tag">${I('globe')}${esc(nmP(p))}</span>`).join('')}</div>` : ''}`;
    }
    $('tab-personal').innerHTML = `${subnav('personal', items, s)}<div class="subpanel" data-sub="${s}">${cuerpo}</div><div style="height:12px"></div>`;
  }

  /* ---------- Bodega y tienda de equipos ---------- */
  // Requisitos de un equipo en corto: puestos con su nombre; equipos con rq.<clave>
  function rqLabel(k) {
    const rk = normRole(k);
    if (G.ROLES[rk]) return roleName(rk);
    if (I18 && I18.T.has('rq.' + k)) return T('rq.' + k);
    return String(k).replace(/_/g, ' ');
  }
  /* Para qué sirve cada equipo (item.<clave>.uso): frase corta y sencilla en las tarjetas, la preparación y el "?".
     El detalle técnico (desc), la calidad y lo que necesita salen en la hoja del "?" (js/ayuda.js). */
  const usoDe = (type) => { const it = G.CATALOG[type] || (G.CONSUMABLES && G.CONSUMABLES[type]); return it ? TL(it.uso || it.desc || '') : ''; };
  const usoHtml = (type, cls) => { const u = usoDe(type); return u ? `<div class="${cls || 'ds uso'}">${esc(u)}</div>` : ''; };
  // El "?" se arma aquí (js/ayuda.js carga después, con defer): ayuda.js atrapa data-ayuda-item y abre la hoja con itemInfo
  const infoBtn = (type) => { const it = G.CATALOG[type] || (G.CONSUMABLES && G.CONSUMABLES[type]); return it
    ? `<button type="button" class="ay-q ay-it" data-ayuda-item="${esc(type)}" aria-label="${esc(T('equipo.ver', { nombre: TL(it.name || type) }))}">?</button>` : ''; };
  function itemInfo(type) {
    const it = G.CATALOG[type] || (G.CONSUMABLES && G.CONSUMABLES[type]);
    if (!it) return null;
    const uso = TL(it.uso || '');
    const tec = TL(it.desc || '');
    const rq = (it.requiere || []).map(rqLabel), ac = (it.acepta || []).map(rqLabel);
    const meta = [];
    if (it.q) meta.push(`${T('bodega.calidad')} ${qPips(it.q)}`);
    if (rq.length) meta.push(`<b>${T('bodega.necesita')}</b> ${rq.map(esc).join(' · ')}`);
    if (ac.length) meta.push(`<b>${T('bodega.acepta')}</b> ${ac.map(esc).join(' · ')}`);
    if (it.alquiler) meta.push(esc(T('bodega.alquiler_det')));
    return {
      titulo: TL(it.name || type),
      top: `<div class="ay-it-top">${itemArt(type, 56, 'mini')}<h3>${esc(TL(it.name || type))}</h3></div>`,
      html: `<div class="ay-sub">${T('equipo.para_que')}</div><p class="ay-uso">${esc(uso || tec)}</p>
        ${uso && tec && tec !== uso ? `<div class="ay-sub">${T('equipo.detalle')}</div><p class="ay-tec">${esc(tec)}</p>` : ''}
        ${meta.length ? `<div class="ay-meta">${meta.join('<br>')}</div>` : ''}`,
    };
  }
  window.AyudaItemInfo = itemInfo;   // lo usa js/ayuda.js (Ayuda.setItemInfo también sirve)
  function qPips(q) {
    const n = Math.max(0, Math.min(6, q || 0));
    return `<span class="qp" aria-label="${esc(T('bodega.calidad_n', { n }))}">${[1, 2, 3, 4, 5, 6].map((i) => `<i class="${i <= n ? 'on' : ''}"></i>`).join('')}</span>`;
  }
  function categorias() {
    try { if (G.shopByCategory) return G.shopByCategory(S); } catch (e) { /* abajo */ }
    // Lógica sin categorías: todo en una lista
    return [{ key: 'todo', nombre: T('bodega.tienda'), icon: 'box', items: Object.keys(G.CATALOG).filter((k) => !G.CATALOG[k].premium)
      .map((k) => Object.assign({}, G.CATALOG[k], { key: k, locked: G.CATALOG[k].minRep > S.rep, owned: S.equip.filter((e) => e.type === k).length })) }];
  }
  function shopCard(it, llena, maxEq) {
    const k = it.key;
    const r = rar(k);
    const locked = !!it.locked;
    const owned = it.owned || 0;
    const rq = (it.requiere || []).map(rqLabel);
    const ac = (it.acepta || []).map(rqLabel);
    const label = locked ? `${I('lock', 'sm')} ${T('bodega.fama_min', { n: it.minRep })}` : llena ? T('bodega.llena', { n: enBodega(), max: maxEq })
      : it.alquiler ? T('bodega.reservar', { m: M(it.price) }) : M(it.price);
    return `<div class="card gear shopc rf r-${r.key} ${locked ? 'locked' : ''}" data-item="${esc(k)}">
      <div class="row between">${rtag(k)}${infoBtn(k)}</div>
      <div class="art">${itemArt(k, 110)}${owned ? `<span class="owned">×${owned}</span>` : ''}${it.alquiler ? `<span class="rent rentov" title="${esc(T('bodega.alquiler_det'))}">${I('clock', 'sm')}${T('bodega.alquiler')}</span>` : ''}${locked ? `<span class="lockov">${I('lock', 'lg')}</span>` : ''}</div>
      <div class="nm">${esc(TL(it.name))}</div>${usoHtml(k)}
      <div class="qrow">${T('bodega.calidad')} ${qPips(it.q)}</div>
      ${rq.length ? `<div class="rq"><b>${T('bodega.necesita')}</b> ${rq.map(esc).join(' · ')}</div>` : ''}
      ${ac.length ? `<div class="rq ac"><b>${T('bodega.acepta')}</b> ${ac.map(esc).join(' · ')}</div>` : ''}
      ${locked ? `<div class="lockwhy">${T('bodega.desbloquea', { n: it.minRep })}</div>` : ''}
      <div class="grow2"></div>
      <button class="btn ${locked || llena ? '' : 'green'}" data-act="buy" data-k="${esc(k)}" ${locked || llena || S.money < it.price ? 'disabled' : ''}>${label}</button></div>`;
  }
  /* ---------- Edición Exclusiva y equipos con créditos (arriba de cada categoría) ----------
     La lista y el costo los manda el servidor (/api/estado tienda.premium; lo apagado en el Centro de Control no sale).
     Sin conexión: los del catálogo con "creditos". Los de Edición Exclusiva también se compran con dinero del juego. */
  function premiumServidor() {
    try { const l = Api.estado && Api.estado.tienda && Api.estado.tienda.premium; return Array.isArray(l) ? l : null; } catch (e) { return null; }
  }
  function exclusivosDe(cat, items) {
    const srv = premiumServidor();
    const out = [];
    if (srv) srv.forEach((p) => {
      const en = (p && p.entrega) || {};
      const it = en.tipo === 'item' ? G.CATALOG[en.item] : null;
      if (it && it.cat === cat && !out.some((x) => x.key === en.item)) out.push({ key: en.item, it, id: p.id, creditos: Number(p.creditos) || 0, vip: !!p.vip });
    });
    else Object.keys(G.CATALOG).forEach((k) => {
      const it = G.CATALOG[k];
      if (it.cat === cat && (it.exclusivo || it.premium) && Number(it.creditos) > 0) out.push({ key: k, it, id: k, creditos: Number(it.creditos), vip: !!it.vip });
    });
    // Un exclusivo apagado en el Centro de Control sigue a la venta con dinero del juego (sin botón de créditos)
    (items || []).forEach((it) => { if (it.exclusivo && !out.some((x) => x.key === it.key)) out.push({ key: it.key, it: G.CATALOG[it.key] || it, id: it.key, creditos: 0, vip: false }); });
    return out.sort((a, b) => (b.it.exclusivo ? 1 : 0) - (a.it.exclusivo ? 1 : 0) || (b.it.q || 0) - (a.it.q || 0) || b.creditos - a.creditos);
  }
  function exPerks(it) {
    if (!it || !it.exclusivo) return '';
    const fc = Number(it.minRepCreditos) || 0;
    const l = [['bolt', T('bodega.ex_perk_desgaste')], ['wrench', T('bodega.ex_perk_reparar')], ['box', T('bodega.ex_perk_bultos')]];
    if (fc < it.minRep) l.push(['star', fc > 0 ? T('bodega.ex_perk_antes', { n: fc }) : T('bodega.ex_perk_ya')]);
    return `<ul class="exq-perks">${l.map(([ic, t]) => `<li>${I(ic, 'sm')}${esc(t)}</li>`).join('')}</ul>`;
  }
  function exCard(x, llena, maxEq) {
    const k = x.key, it = x.it;
    const owned = S.equip.filter((e) => e.type === k).length;
    const fc = Number(it.minRepCreditos) || 0;
    const bloq = S.rep < fc;
    const rq = (it.requiere || []).map(rqLabel), ac = (it.acepta || []).map(rqLabel);
    // Equipos VIP: se CANJEAN con el Pase VIP activo (el servidor igual lo rechazaría); después funcionan siempre
    const sinVip = x.vip && !!(Api.estado && Api.estado.logueado && !Api.estado.vip_activo);
    const cred = x.creditos > 0 ? `<button class="btn ex-cred" data-act="ex-canjear" data-k="${esc(x.id)}" aria-label="${esc(T('bodega.ex_canjear', { n: N(x.creditos) }))}" ${bloq || sinVip ? 'disabled' : ''}>${bloq
      ? `${I('lock', 'sm')} ${T('bodega.ex_fama_cred', { n: fc })}` : sinVip ? `${I('lock', 'sm')} VIP · ${I('gem', 'sm')}<span>${N(x.creditos)}</span>` : `${I('gem', 'sm')}<span>${N(x.creditos)}</span>`}</button>` : '';
    let libre = '';
    if (it.exclusivo) {
      const lk = it.minRep > S.rep;
      libre = `<button class="btn sm ex-free ${lk || llena ? '' : 'green'}" data-act="buy" data-k="${esc(k)}" ${lk || llena || S.money < it.price ? 'disabled' : ''}>${lk ? `${I('lock', 'sm')} ${T('bodega.fama_min', { n: it.minRep })}`
        : llena ? T('bodega.llena', { n: enBodega(), max: maxEq }) : T('bodega.ex_con_dinero', { m: M(it.price) })}</button>`;
    }
    return `<div class="card gear shopc exq rf r-${x.vip ? 'vip' : 'exclusivo'}" data-ex="${esc(k)}">
      <div class="exq-top"><span class="exb ${x.vip ? 'vip' : ''}">${I('gem', 'sm')}${x.vip ? 'VIP' : T('bodega.ex_badge')}</span><span class="row" style="gap:0">${owned ? `<span class="num small" style="color:#ffe08a">×${owned}</span>` : ''}${infoBtn(k)}</span></div>
      <div class="exq-body"><div class="art">${itemArt(k, 120)}</div>
        <div><div class="nm">${esc(TL(it.name))}</div>${usoHtml(k)}
        <div class="qrow">${T('bodega.calidad')} ${qPips(it.q)}</div>${exPerks(it)}</div></div>
      ${rq.length ? `<div class="rq"><b>${T('bodega.necesita')}</b> ${rq.map(esc).join(' · ')}</div>` : ''}
      ${ac.length ? `<div class="rq ac"><b>${T('bodega.acepta')}</b> ${ac.map(esc).join(' · ')}</div>` : ''}
      <div class="exq-btns">${cred}${libre}</div>
      ${it.exclusivo ? `<div class="ex-nota">${T('bodega.ex_gratis', { n: it.minRep })}</div>` : x.vip ? `<div class="ex-nota">${T('bodega.ex_vip')}</div>` : ''}</div>`;
  }
  function exCanjear(id) {
    if (!Api.logueado()) { snd.play('tap'); abrirCuenta('registro', T('bodega.ex_cuenta')); return; }
    // Si el equipo no rinde solo (le falta lente, cámara, soporte...), se ofrece el combo antes de canjear
    const p = (premiumServidor() || []).find((x) => x.id === id);
    const key = p && p.entrega && p.entrega.tipo === 'item' ? p.entrega.item : null;
    if (key && ofrecerCombo(key, 'creditos', id)) { snd.play('tap'); return; }
    canjear(id);
  }
  /* ---------- Equipos dañados: avisos para repararlos (resultado del evento, Inicio, Bodega y preparación) ----------
     Solo pantalla (la lógica no cambia): al salir al aire se anota el estado de lo que se llevó y, en cada imprevisto,
     lo que le restó (lluvia, luz, caída...). Al terminar se muestra antes → después con un botón para repararlo. */
  const DANOS_KEY = 'envivo_danos_evento';
  const WORN = () => (G.BALANCE && typeof G.BALANCE.worn === 'number' ? G.BALANCE.worn : 40);
  const reparable = (e) => { const it = e && G.CATALOG[e.type]; return !!it && !it.alquiler; };
  const costoRep = (e) => { try { return Math.max(0, G.repairCost(e) || 0); } catch (err) { return 0; } };
  const enRiesgo = (e) => reparable(e) && e.condition < WORN() && costoRep(e) > 0;
  const equiposEnRiesgo = () => (S && Array.isArray(S.equip) ? S.equip.filter(enRiesgo) : []);
  let resDanos = null;   // equipos dañados del último resultado: [{ id, type, antes, despues, causas }]
  function danosInicio() {
    const ev = S.currentEvent;
    if (!ev) return;
    const antes = {};
    S.equip.forEach((e) => { if (ev.equipIds.includes(e.id) && reparable(e)) antes[e.id] = e.condition; });
    lsSet(DANOS_KEY, { cid: ev.contract.id, antes, golpes: {} });
  }
  const condsEvento = () => { const ev = S.currentEvent, o = {}; if (ev) S.equip.forEach((e) => { if (ev.equipIds.includes(e.id)) o[e.id] = e.condition; }); return o; };
  function danosImprevisto(antes, key) {
    const ev = S.currentEvent, d = lsGet(DANOS_KEY);
    if (!ev || !d || d.cid !== ev.contract.id) return;
    let cambio = false;
    S.equip.forEach((e) => {
      const a = antes[e.id];
      if (typeof a === 'number' && e.condition < a) { (d.golpes[e.id] = d.golpes[e.id] || []).push(key || 'otro'); cambio = true; }
    });
    if (cambio) lsSet(DANOS_KEY, d);
  }
  // Al terminar: lo que quedó en riesgo, bajó mucho o lo dañó un imprevisto (lo más urgente primero)
  function danosFin(ids, cid) {
    const d = lsGet(DANOS_KEY);
    lsSet(DANOS_KEY, null);
    const tr = d && d.cid === cid ? d : null;
    const lista = [];
    S.equip.forEach((e) => {
      if (!ids.includes(e.id) || !reparable(e)) return;
      const antes = tr && typeof tr.antes[e.id] === 'number' ? tr.antes[e.id] : null;
      const causas = tr && Array.isArray(tr.golpes[e.id]) ? tr.golpes[e.id].filter((k, i, a) => a.indexOf(k) === i) : [];
      if (causas.length || e.condition < WORN() || (antes !== null && antes - e.condition >= 15)) lista.push({ id: e.id, type: e.type, antes, despues: e.condition, causas });
    });
    return lista.sort((a, b) => a.despues - b.despues);
  }
  const CAUSA_ICO = { lluvia: 'rain', luz: 'bolt', falla: 'wrench', dron: 'trend_down' };
  const causaTxt = (k) => T(I18 && I18.T.has('danos.causa.' + k) ? 'danos.causa.' + k : 'danos.causa.otro');
  function danosResHtml() {
    const xs = (resDanos || []).map((d) => ({ d, e: S.equip.find((x) => x.id === d.id) })).filter((x) => x.e);
    if (!xs.length) return '';
    const pend = xs.filter((x) => costoRep(x.e) > 0);
    const total = pend.reduce((a, x) => a + costoRep(x.e), 0);
    const filas = xs.map(({ d, e }) => {
      const rc = costoRep(e), falta = rc - S.money;
      const causa = d.causas.length ? d.causas.map((k) => `<span class="dn-causa">${I(CAUSA_ICO[k] || 'bolt', 'sm')}${esc(causaTxt(k))}</span>`).join('')
        : `<span class="dn-causa">${I('clock', 'sm')}${esc(T('danos.causa.desgaste'))}</span>`;
      // Ya reparado (aquí o en la Bodega): se muestra cómo quedó ahora, no cómo terminó el evento
      const ahora = Math.round(e.condition), rep = rc <= 0 && ahora > d.despues;
      const bar = rep ? `<div class="bar dn-bar"><i style="width:${ahora}%"></i></div>`
        : `<div class="bar dn-bar ${d.despues < WORN() ? 'red' : d.despues < 70 ? 'amber' : ''}">${d.antes !== null ? `<s style="width:${d.antes}%"></s>` : ''}<i style="width:${d.despues}%"></i></div>`;
      const btn = rc <= 0 ? `<span class="dn-ok">${I('check', 'sm')}${T('danos.reparado')}</span>`
        : `<button class="btn sm green dn-btn" data-act="repair-res" data-id="${e.id}" ${falta > 0 ? 'disabled' : ''}>${I('wrench', 'sm')}${T('danos.reparar', { m: M(rc) })}</button>${falta > 0 ? `<div class="dn-falta">${T('danos.falta', { m: M(falta) })}</div>` : ''}`;
      return `<div class="dn-it ${rc <= 0 ? 'ok' : ''}">${itemArt(e.type, 44, 'mini')}
        <div class="grow" style="min-width:0"><b class="dn-nm">${esc(nmE(e))}</b><div class="dn-causas">${causa}</div>
          <div class="dn-cond"><span class="num">${rep ? `<span class="muted">${d.despues}%</span> → <b class="up">${ahora}%</b>` : `${d.antes !== null ? `<span class="muted">${d.antes}%</span> → ` : ''}<b class="${d.despues < WORN() ? 'neg' : ''}">${d.despues}%</b>`}</span></div>${bar}${d.despues < WORN() && rc > 0 ? `<span class="dn-riesgo">${I('bolt', 'sm')}${T('danos.riesgo')}</span>` : ''}</div>
        <div class="dn-acc">${btn}</div></div>`;
    }).join('');
    const todo = pend.length > 1 ? `<button class="btn dn-todo" data-act="repair-all-res" ${S.money < total ? 'disabled' : ''}>${I('wrench', 'sm')}${T('danos.reparar_todo', { m: M(total) })}</button>${S.money < total ? `<div class="dn-falta" style="text-align:center">${T('danos.falta', { m: M(total - S.money) })}</div>` : ''}` : '';
    return `<div class="danos" id="resDanos" role="status"><div class="dn-hd">${I('wrench', 'sm')}<b>${T('danos.titulo')}</b></div>
      <div class="small muted" style="margin:2px 0 6px">${T('danos.sub')}</div>${filas}${todo}</div>`;
  }
  const pintarDanosRes = () => { const n = $('resDanos'); if (n) n.outerHTML = danosResHtml(); };
  function repararVarios(ids) {
    let n = 0;
    ids.forEach((id) => { const e = S.equip.find((x) => x.id === id); if (e && costoRep(e) > 0 && S.money >= costoRep(e) && G.repair(S, id).ok) n++; });
    if (n) { snd.play('buy'); toast(T('danos.reparados', { n })); } else snd.play('error');
    save(); render();
    return n;
  }
  // Inicio: franja compacta que lleva a la Bodega
  function stripDanos() {
    const xs = equiposEnRiesgo();
    if (!xs.length || S.gameOver) return '';
    const tot = xs.reduce((a, e) => a + costoRep(e), 0);
    return `<button class="redstrip amberstrip dnstrip" data-act="ir-danos">${I('wrench', 'sm')}<span class="grow">${T('danos.inicio', { n: xs.length })} · ${T('danos.reparar', { m: `<b class="num">${M(tot)}</b>` })}</span><span class="dn-fl" aria-hidden="true">&#8250;</span></button>`;
  }
  // Bodega: un botón para reparar todo lo que tiene desgaste, con el costo total a la vista
  const porReparar = () => (S && Array.isArray(S.equip) ? S.equip.filter((e) => reparable(e) && e.condition < 100 && costoRep(e) > 0) : []);
  function repararTodoBodega() {
    const xs = porReparar();
    if (!xs.length || S.gameOver) return '';
    const tot = xs.reduce((a, e) => a + costoRep(e), 0), falta = tot - S.money;
    return `<div class="card rep-todo" id="repTodo"><div class="row between" style="gap:8px;align-items:center">
      <div class="grow" style="min-width:0"><b>${I('wrench', 'sm')} ${T('bodega.rep_todo_t', { n: xs.length })}</b>
        <div class="small muted">${T('bodega.rep_todo_det', { m: M(tot) })}</div>${falta > 0 ? `<div class="small neg">${T('danos.falta', { m: M(falta) })}</div>` : ''}</div>
      <button class="btn sm green" data-act="repair-all-bodega" ${falta > 0 ? 'disabled' : ''} style="width:auto">${T('danos.reparar_todo', { m: M(tot) })}</button></div></div>`;
  }
  // Preparación: aviso en el equipo elegido que puede fallar (se ve solo si está marcado)
  function prepDano(e) {
    if (!enRiesgo(e)) return '';
    const rc = costoRep(e);
    return `<div class="dn-prep">${I('bolt', 'sm')}<span>${T('danos.riesgo')}</span>${S.money >= rc
      ? `<button type="button" class="dn-mini" data-act="repair-prep" data-id="${e.id}">${T('danos.reparar', { m: M(rc) })}</button>`
      : `<span class="muted">· ${T('danos.reparar', { m: M(rc) })}</span>`}</div>`;
  }

  // Tarjeta de un equipo tuyo (Bodega → Mis equipos)
  function miEquipoCard(e) {
    const it = G.CATALOG[e.type] || { name: e.type, desc: '' };
    const r = rar(e.type);
    let rc = 0;
    try { rc = G.repairCost(e); } catch (err) { rc = 0; }
    if (it.alquiler) {
      return `<div class="card gear rf r-${r.key} rented" data-eq="${e.id}">
      <div class="row between">${rtag(e.type)}${infoBtn(e.type)}</div>
      <div class="art">${itemArt(e.type, 110)}<span class="rent rentov">${I('clock', 'sm')}${T('bodega.alquiler')}</span></div>
      <div class="nm">${esc(nmE(e))}</div>${usoHtml(e.type)}
      <div class="small" style="color:var(--amber);margin-top:4px">${T('bodega.reservado')}</div>
      <div class="grow2"></div>
      <button class="btn sm" data-act="sell" data-id="${e.id}">${T('bodega.cancelar_alquiler', { m: M(G.sellPrice(e)) })}</button></div>`;
    }
    const delSrv = !!(Pm && Pm.exclusivoDelServidor && Pm.exclusivoDelServidor(e));
    const rgo = enRiesgo(e);
    return `<div class="card gear rf r-${r.key} ${it.exclusivo ? 'exq-mia' : ''} ${rgo ? 'worn' + (e.condition < 25 ? ' dn-rojo' : '') : ''}" data-eq="${e.id}">
      <div class="row between">${rtag(e.type)}<span class="row" style="gap:0">${e.serie ? `<span class="num small muted">#${String(e.serie).padStart(4, '0')}</span>` : ''}${infoBtn(e.type)}</span></div>
      <div class="art">${itemArt(e.type, 110)}${rgo ? `<span class="dn-chip">${I('wrench', 'sm')}${T('danos.chip')}</span>` : ''}</div>
      <div class="nm">${esc(nmE(e))}</div>${usoHtml(e.type)}
      <div class="grow2"></div>
      <div class="cond"><span>${T('bodega.estado')}</span><b class="num ${e.condition < 40 ? 'neg' : ''}">${e.condition}%</b></div>${condBar(e.condition)}
      <div class="row2">
        <button class="btn sm ${rgo ? 'dn-rep' : ''}" data-act="repair" data-id="${e.id}" ${rc <= 0 ? 'disabled' : ''}>${I('wrench', 'sm')}${rc > 0 ? M(rc) : T('bodega.nuevo')}</button>
        ${it.premium || delSrv ? `<button class="btn sm" disabled>${delSrv ? T('bodega.ex_mercado') : T('bodega.no_se_vende')}</button>` : `<button class="btn sm" data-act="sell" data-id="${e.id}">${T('bodega.vender', { m: M(G.sellPrice(e)) })}</button>`}</div></div>`;
  }
  // Tienda de equipos: lo que se ve con la categoría, la búsqueda y el orden elegidos
  function shopHtml(cats, llena, maxEq) {
    const q = shopBusca.trim().toLowerCase();
    const ordenar = (xs) => (sub.shopOrden === 'precio' ? xs.slice().sort((a, b) => (a.locked - b.locked) || a.price - b.price)
      : sub.shopOrden === 'calidad' ? xs.slice().sort((a, b) => (a.locked - b.locked) || (b.q || 0) - (a.q || 0) || a.price - b.price) : xs);
    if (q) {
      const norm = (t) => String(t || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
      const qq = norm(q);
      const vistos = new Set();
      const xs = [];
      cats.forEach((c) => c.items.forEach((it) => { if (!vistos.has(it.key) && (norm(TL(it.name)).includes(qq) || norm(usoDe(it.key)).includes(qq))) { vistos.add(it.key); xs.push(it); } }));
      const html = ordenar(xs).map((it) => shopCard(it, llena, maxEq)).join('');
      return `<div class="cathead"><b>${esc(T('nav2.resultados', { n: xs.length }))}</b><button type="button" class="btn sm" data-act="shop-borrar">${I('close', 'sm')}${T('nav2.borrar')}</button></div>
        ${html ? `<div class="ggrid">${html}</div>` : emptyState('box', T('nav2.sin_result_t'), T('nav2.sin_result'))}`;
    }
    let cur = cats.find((c) => c.key === catSel);
    if (!cur) { cur = cats[0]; catSel = cur ? cur.key : ''; }
    if (!cur) return '';
    const nota = cur.key === 'service' ? `<p class="small muted" style="margin-top:-2px">${T('bodega.alquiler_det')}</p>` : '';
    return `<div class="cathead"><b>${esc(TL(cur.nombre || cur.name || ''))}</b><span class="small muted">${T('bodega.n_equipos', { n: cur.items.length })}</span></div>${nota}
      <div class="ggrid">${exclusivosDe(cur.key, cur.items).map((x) => exCard(x, llena, maxEq)).join('')}${ordenar(cur.items.filter((it) => !it.exclusivo)).map((it) => shopCard(it, llena, maxEq)).join('')}</div>`;
  }
  function renderBodega() {
    const maxEq = maxEquip();
    const llena = enBodega() >= maxEq;
    const cats = categorias();
    const riesgo = equiposEnRiesgo().length;
    const stock = Object.keys(G.CONSUMABLES).reduce((a, k) => a + (S.stock[k] || 0), 0);
    const items = [
      { k: 'equipos', t: T('nav2.b_equipos'), ic: I('box', 'sm'), n: riesgo || S.equip.length || 0, tono: riesgo ? 'amb' : '', extra: riesgo ? `aria-description="${esc(T('danos.badge', { n: riesgo }))}"` : '' },
      { k: 'tienda', t: T('nav2.b_tienda'), ic: I('cart', 'sm') },
      { k: 'repuestos', t: T('nav2.b_repuestos'), ic: I('cable', 'sm'), n: stock || 0 },
    ];
    const s = sub.bodega;
    const capPct = Math.min(100, Math.round(enBodega() / Math.max(1, maxEq) * 100));
    const capacidad = `<div class="bd-cap ${llena ? 'llena' : ''}"><span class="small">${I('home', 'sm')} ${T('nav2.capacidad', { n: enBodega(), max: maxEq })}${llena ? ` · <span class="neg">${T('bodega.llena_local', { lugar: esc(venueName()), n: enBodega(), max: maxEq })}</span>` : ''}</span>
      <div class="bar ${llena ? 'red' : capPct > 85 ? 'amber' : ''}"><i style="width:${capPct}%"></i></div></div>`;
    let cuerpo = '';
    if (s === 'equipos') {
      // Equipos ordenados por rareza (lo más valioso primero) y luego por estado
      const RORD = { vip: 0, exclusivo: 1, elite: 2, pro: 3, comun: 4 };
      // ...salvo lo que necesita reparación, que va primero (lo más gastado arriba)
      const sorted = S.equip.slice().sort((a, b) => (enRiesgo(b) - enRiesgo(a)) || (enRiesgo(a) && enRiesgo(b) ? a.condition - b.condition : 0) || (RORD[rar(a.type).key] - RORD[rar(b.type).key]) || (a.type < b.type ? -1 : a.type > b.type ? 1 : 0) || (a.id - b.id));
      // Filtros: todos, por reparar y las categorías que tienes
      const catDe = (e) => (G.CATALOG[e.type] || {}).cat || 'otro';
      const nRep = porReparar().length;
      const fs = [{ k: 'todo', t: T('nav2.todos'), n: S.equip.length }];
      if (nRep) fs.push({ k: 'reparar', t: T('nav2.f_reparar'), ic: I('wrench', 'sm'), n: nRep });
      cats.forEach((c) => { const n = S.equip.filter((e) => catDe(e) === c.key).length; if (n) fs.push({ k: c.key, t: TL(c.nombre || c.name || c.key), ic: I(c.icon || 'box', 'sm'), n }); });
      let f = sub.eqFiltro;
      if (!fs.some((x) => x.k === f)) f = 'todo';
      const repIds = new Set(porReparar().map((e) => e.id));
      const vista = sorted.filter((e) => f === 'todo' || (f === 'reparar' ? repIds.has(e.id) : catDe(e) === f));
      const mine = vista.map(miEquipoCard).join('');
      cuerpo = `<div class="sectitle" id="tusEquipos">${T('bodega.tus_equipos', { n: S.equip.length })}</div>
        ${capacidad}${repararTodoBodega()}
        ${S.equip.length > 3 && fs.length > 2 ? chipsFiltro('eqFiltro', fs, f) : ''}
        ${mine ? `<div class="ggrid">${mine}</div>` : S.equip.length ? emptyState('box', T('nav2.f_vacio_t'), T('nav2.f_vacio')) : emptyState('box', T('bodega.vacia_t'), T('bodega.vacia'))}
        <p class="small muted">${T('bodega.desgaste')}</p>`;
    } else if (s === 'tienda') {
      const chips = cats.length > 1 ? `<div class="catrow" role="tablist" aria-label="${esc(T('bodega.categorias'))}">${cats.map((c) =>
        `<button class="catchip ${c.key === catSel && !shopBusca ? 'on' : ''}" role="tab" aria-selected="${c.key === catSel && !shopBusca}" data-act="cat" data-k="${esc(c.key)}">${I(c.icon || 'box', 'sm')}<span>${esc(TL(c.nombre || c.name || c.key))}</span><b>${N(c.items.length)}</b></button>`).join('')}</div>` : '';
      const orden = `<select id="shopOrden" class="shop-orden" aria-label="${esc(T('nav2.orden'))}">${[['rec', 'nav2.o_rec'], ['precio', 'nav2.o_precio'], ['calidad', 'nav2.o_calidad']]
        .map(([k, t]) => `<option value="${k}" ${sub.shopOrden === k ? 'selected' : ''}>${esc(T(t))}</option>`).join('')}</select>`;
      cuerpo = `<div id="tiendaEq" class="shop-top">
          <div class="shop-fila"><label class="shop-busca">${ICO_BUSCA}<span class="sr">${T('nav2.buscar_eq')}</span><input type="search" id="shopBusca" enterkeyhint="search" autocomplete="off" placeholder="${esc(T('nav2.buscar_ph'))}" value="${esc(shopBusca)}" aria-label="${esc(T('nav2.buscar_eq'))}"></label>${orden}</div>
          ${chips}</div>
        ${llena ? capacidad : ''}
        <div id="shopGrid">${shopHtml(cats, llena, maxEq)}</div>`;
    } else {
      const cons = Object.keys(G.CONSUMABLES).map((k) => {
        const it = G.CONSUMABLES[k];
        return `<div class="card gear cons" data-cons="${esc(k)}"><div class="art">${itemArt(k, 64, 'mini')}<span class="owned">×${N(S.stock[k] || 0)}</span></div>
          <div class="nm">${esc(TL(it.name))}</div><div class="ds">${esc(TL(it.desc))}</div><div class="grow2"></div>
          <button class="btn sm" data-act="buy-cons" data-k="${k}">+1 ${M(it.price)}</button></div>`;
      }).join('');
      cuerpo = `<div class="sectitle">${T('bodega.repuestos')}</div><p class="small muted" style="margin-top:-4px">${T('bodega.repuestos_det')}</p><div class="ggrid">${cons}</div>`;
    }
    $('tab-bodega').innerHTML = `${subnav('bodega', items, s)}<div class="subpanel" data-sub="${s}">${cuerpo}</div><div style="height:20px"></div>`;
    // La categoría elegida queda visible en la fila de categorías
    const on = document.querySelector('#tab-bodega .catrow .catchip.on');
    if (on && on.parentElement) { try { const row = on.parentElement; row.scrollLeft = Math.max(0, on.offsetLeft - row.clientWidth / 2 + on.clientWidth / 2); } catch (e) { /* nada */ } }
  }

  /* ---------- Tienda (dinero real y créditos) ---------- */
  const precio = (n) => (I18 ? I18.money(n, { dec: 2 }) : '$' + Number(n).toFixed(2).replace('.', ','));
  function fechaCorta(iso) {
    if (I18) return I18.fecha(iso, { day: 'numeric', month: 'long' });
    try { return new Date(iso).toLocaleDateString('es-EC', { day: 'numeric', month: 'long' }); } catch (e) { return ''; }
  }
  let vistaTienda = 'tienda';
  /* Tienda v2 (server/MONETIZACION.md): Pase de Temporada, VIP, Personal estrella y Pase de Copa, packs de obra, créditos.
     Reglas: todo muestra su contenido (nada al azar), siempre el precio real que se cobra (Google Play en la app, Pago Plux
     en la web) y nada de cuentas regresivas inventadas: solo fechas reales que manda el servidor. */
  // Packs de obra: contenido FIJO, igual a SedeOficial::PACKS (el precio lo manda el servidor o Google Play)
  const PACKS_OBRA = {
    pack_obra_s: { letra: 'S', min: 600, mat: { cables: 12, placas: 12, paneles: 12, credenciales: 12, planos: 12, chips: 1 } },
    pack_obra_m: { letra: 'M', min: 1800, mat: { cables: 32, placas: 32, paneles: 32, credenciales: 32, planos: 32, chips: 3 } },
    pack_obra_l: { letra: 'L', min: 4800, mat: { cables: 70, placas: 70, paneles: 70, credenciales: 70, planos: 70, chips: 8 } },
  };
  const MATS_OBRA = ['cables', 'placas', 'paneles', 'credenciales', 'planos', 'chips'];
  // Productos con pantalla propia que Google Play también vende (sus precios se piden aunque no salgan en /api/estado)
  const PLAY_EXTRA = ['pase_premium', 'pase_premium_plus', 'pack_obra_s', 'pack_obra_m', 'pack_obra_l', 'pase_copa'];
  const playPedidos = new Set();
  const ICO_PASE = svgIco('<path d="M4 7.5A1.5 1.5 0 0 1 5.5 6h13A1.5 1.5 0 0 1 20 7.5V10a2 2 0 0 0 0 4v2.5a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 16.5V14a2 2 0 0 0 0-4z"/><path d="M14.5 6.5v11" stroke-dasharray="1.6 2.2"/><path d="M8.5 10.2l.9 1.8 2 .3-1.4 1.4.3 2-1.8-.9-1.8.9.3-2-1.4-1.4 2-.3z"/>');
  const ICO_OBRA = svgIco('<path d="M3.5 17a8.5 8.5 0 0 1 17 0"/><path d="M2.5 17h19v2.5h-19z"/><path d="M10 8.7V5.5h4v3.2"/><path d="M8 12v5M16 12v5"/>');
  const tipoProd = (p) => p.tipo || (/^creditos_/.test(p.id) ? 'creditos' : p.id === 'vip30' ? 'vip' : p.id === 'tarjeta_mensual' ? 'tarjeta'
    : /^pack_obra_/.test(p.id) ? 'pack_obra' : /^pase_premium/.test(p.id) ? 'pase' : ['inicio', 'bienvenida', 'pase_copa'].includes(p.id) ? p.id : 'otro');
  const prodPorId = (id) => { try { return ((Api.estado && Api.estado.tienda && Api.estado.tienda.productos) || []).find((p) => p.id === id) || null; } catch (e) { return null; } };
  // PayPal (server/src/PayPal.php, docs/PAYPAL.md): SOLO en la web, nunca en la app de Google Play (enApp) ni en la versión
  // de un solo archivo (dist/, sin servidor: no llega "paypal" en /api/estado). Desde paypal.minimo (la comisión se come las ventas chicas).
  const pluxDisp = () => !!(Api.estado && Api.estado.plux && Api.estado.plux.disponible);
  const paypalDisp = () => !enApp() && !!(Api.disponible && Api.estado && Api.estado.paypal && Api.estado.paypal.disponible);
  function paypalPara(id, usd) {
    if (!paypalDisp()) return false;
    let v = usd !== undefined && usd !== null && usd !== '' && isFinite(Number(usd)) ? Number(usd) : null;
    if (v === null) { const p = prodPorId(id); v = p && isFinite(Number(p.precio)) ? Number(p.precio) : null; }
    return v !== null && v + 0.001 >= (Number(Api.estado.paypal.minimo) || 0);
  }
  const puedePagarAhora = () => (enApp() ? playOk : pluxDisp() || paypalDisp());
  // Precio REAL de un producto en este canal: en la app solo el de Google Play (si no lo tiene: null, no se vende aquí)
  function precioReal(id, usd) {
    if (enApp()) return playOk && preciosPlay[id] && preciosPlay[id].precio ? String(preciosPlay[id].precio) : null;
    if (usd !== undefined && usd !== null && usd !== '' && isFinite(Number(usd))) return precio(Number(usd));
    const p = prodPorId(id);
    return p && isFinite(Number(p.precio)) ? precio(Number(p.precio)) : null;
  }
  // Precios de Google Play que todavía no se pidieron (ofertas VIP que llegan después)
  function pedirPreciosPlay(ids) {
    if (!enApp() || !playOk || !GP) return;
    const faltan = ids.filter((id) => id && !preciosPlay[id] && !playPedidos.has(id));
    if (!faltan.length) return;
    faltan.forEach((id) => playPedidos.add(id));
    Promise.resolve(GP.productos(faltan)).then((l) => { (l || []).forEach((p) => { preciosPlay[p.id] = p; }); if (tab === 'tienda') render(); }).catch(() => { /* sin precio: no se muestra */ });
  }
  // Pide los datos de un módulo (pase, estrellas) como mucho una vez por minuto y vuelve a pintar la tienda
  const pedidosModulo = {};
  function pedirDatosModulo(k, fn) {
    if (Date.now() - (pedidosModulo[k] || 0) < 60000) return;
    pedidosModulo[k] = Date.now();
    setTimeout(() => { let pr; try { pr = fn(); } catch (e) { return; } Promise.resolve(pr).then(() => { if (tab === 'tienda') render(); }).catch(() => { /* sin datos: la sección queda corta */ }); }, 0);
  }
  const seguro = (fn, def) => { try { const v = fn(); return v === undefined || v === null ? def : v; } catch (e) { return def; } };
  const enRegistro = (id) => modulosInicio().some((m) => m.id === id && typeof m.clic === 'function');
  const incluye = (lista) => (lista.length ? `<ul class="tv-inc" aria-label="${esc(T('tienda.incluye'))}">${lista.map((x) =>
    `<li${x.cls ? ` class="${x.cls}"` : ''}>${I(x.ico || 'check', 'sm')}<span>${x.html}</span></li>`).join('')}</ul>` : '');
  function botonCompra(id, o) {
    o = o || {};
    const valor = precioReal(id, o.usd);
    if (!valor) return '';
    const hecho = !!o.hecho;
    // En la web, con PayPal: dos botones (tarjeta y PayPal). En la app o sin PayPal: el botón de siempre.
    if (!hecho && paypalPara(id, o.usd)) {
      return `<div class="tv-foot tv-foot2"><span class="price" data-precio="${esc(id)}">${esc(valor)}</span><div class="tv-pagos">
        <button class="btn sm main" data-act="comprar" data-k="${esc(id)}" data-metodo="tarjeta" ${pluxDisp() ? '' : 'disabled'}>${I('card', 'sm')}${T('tienda.pagar_tarjeta')}</button>
        <button class="btn sm paypal" data-act="comprar" data-k="${esc(id)}" data-metodo="paypal">${T('tienda.pagar_paypal')}</button></div></div>`;
    }
    return `<div class="tv-foot"><span class="price" data-precio="${esc(id)}">${esc(valor)}</span>
      <button class="btn sm main" data-act="comprar" data-k="${esc(id)}" ${hecho || !puedePagarAhora() ? 'disabled' : ''}>${hecho ? T('tienda.ya_tienes') : T('tienda.comprar')}</button></div>`;
  }
  const lineaBono = (p) => (p.oferta && Number(p.oferta.bono_pct) > 0 ? T('tienda.bono_hasta', { p: N(Number(p.oferta.bono_pct)), fecha: esc(fechaCorta(p.oferta.fin)) }) : '');
  function cardProd(p, o) {
    o = o || {};
    const lis = (o.lis || []).slice();
    if (!o.lis && p.detalle) lis.push({ html: esc(TL(p.detalle)) });
    const bono = lineaBono(p);
    if (bono) lis.push({ html: bono, cls: 'amber', ico: 'gift' });
    return `<div class="card tv-prod ${o.cls || ''}" data-prod="${esc(p.id)}">${o.ribbon ? `<span class="ribbon">${esc(o.ribbon)}</span>` : ''}
      <div class="tv-head">${o.art || itemArt(p.id, 56)}<div class="grow"><h3>${esc(o.nombre || TL(p.nombre))}</h3>${o.sub ? `<div class="small muted">${o.sub}</div>` : ''}</div></div>
      ${incluye(lis)}${o.extra || ''}${botonCompra(p.id, { usd: p.precio, hecho: o.hecho })}</div>`;
  }
  function cardCreditos(p) {
    const bono = lineaBono(p);
    return `<div class="card tv-cred" data-prod="${esc(p.id)}">${itemArt(p.id, 56)}
      <div class="tv-cn num">${N(Number(p.creditos) || 0)}</div><div class="small muted">${T('tienda.creditos_lbl')}</div>
      ${p.detalle ? `<div class="tv-cd small muted">${esc(TL(p.detalle))}</div>` : ''}${bono ? `<div class="tv-bono">${bono}</div>` : ''}
      <div class="grow2"></div>${botonCompra(p.id, { usd: p.precio })}</div>`;
  }
  // Nombre de cada cosa que trae un pack u oferta (las entregas del servidor)
  function nombreEntrega(e) {
    const n = Number(e && e.cantidad) || 1;
    try {
      switch (e.tipo) {
        case 'dinero': return T('tienda.ent_dinero', { m: M(n) });
        case 'creditos': return T('tienda.ent_creditos', { n });
        case 'reparar_todo': return T('tienda.ent_reparar');
        case 'materiales': if (I18 && I18.T.has('tienda.mat.' + e.item)) return T('tienda.ent_mat', { n: N(n), mat: T('tienda.mat.' + e.item) }); break;
        case 'acelerador': return T('tienda.obra_acel', { h: N(Math.round(n / 6) / 10) });
        case 'consumible': return `${N(n)} × ${TL((G.CONSUMABLES[e.item] || {}).name || e.item)}`;
        case 'item': case 'equipo': return (n > 1 ? N(n) + ' × ' : '') + itemName(e.item);
        default: break;
      }
    } catch (err) { /* abajo */ }
    return e && e.nombre ? TL(e.nombre) : String((e && (e.item || e.tipo)) || '');
  }
  const seccion = (id, ico, titulo, html) => (html ? `<div class="tv-sec" id="${id}" role="region" aria-label="${esc(titulo)}"><div class="sectitle">${ico}<span>${titulo}</span></div>${html}</div>` : '');

  // Pase de Temporada (js/pase.js): la ficha del módulo y los dos productos con lo que traen
  function seccionPase(log) {
    const P = window.Pase;
    if (!P) return '';
    let ficha = '';
    if (log && typeof P.fichaTienda === 'function') { try { ficha = P.fichaTienda(ctxInicio()) || ''; } catch (e) { console.error('[tienda pase]', e); } }
    const abrir = !log ? '' : enRegistro('pase') ? 'data-ext="pase" data-acc="abrir"' : typeof P.abrir === 'function' ? 'data-act="tienda-pase"' : '';
    if (!ficha && abrir) {
      ficha = `<div class="card tv-prod tv-hero"><div class="tv-head"><div class="tv-badge">${ICO_PASE}</div><div class="grow"><h3>${T('tienda.sec_pase')}</h3>
        <div class="small muted">${T('tienda.pase_det')}</div></div></div><button class="btn" ${abrir}>${T('tienda.ver_pase')}</button></div>`;
    }
    const pd = seguro(() => P.datos || (P._st && P._st.datos), null);
    // Los precios del pase salen de /api/pase (el servidor no los pone en la lista general): se piden una vez si faltan
    if (log && !pd) pedirDatosModulo('pase', () => P.recargar(ctxInicio()));
    const prodsPd = (pd && pd.productos) || {};
    const ya = !!(pd && pd.premium);
    const niveles = Number(pd && pd.niveles) || 40, tope = Number(pd && pd.creditos_tope) || 420;
    const plusN = Number(prodsPd.pase_premium_plus && prodsPd.pase_premium_plus.niveles) || 10;
    const items = [
      { id: 'pase_premium', nombre: T('tienda.pase_premium'), lis: [T('tienda.pase_inc_niveles', { n: niveles }), T('tienda.pase_inc_creditos', { n: tope }), T('tienda.pase_inc_cosmeticos'), T('tienda.pase_inc_tarde')] },
      { id: 'pase_premium_plus', nombre: T('tienda.pase_plus'), lis: [T('tienda.pase_inc_todo'), T('tienda.pase_inc_saltos', { n: plusN })] },
    ].map((x) => {
      const p = prodPorId(x.id) || (prodsPd[x.id] ? { id: x.id, precio: prodsPd[x.id].precio } : null);
      if (!p || prodsPd[x.id] && prodsPd[x.id].activo === false) return '';
      if (!precioReal(x.id, p.precio)) return '';
      return cardProd({ id: x.id, precio: p.precio }, { nombre: x.nombre, art: `<div class="tv-badge ${x.id === 'pase_premium_plus' ? 't-plus' : ''}">${ICO_PASE}</div>`,
        lis: x.lis.map((t) => ({ html: t })), hecho: ya, cls: 'tv-pase' });
    }).join('');
    if (!ficha && !items) return '';
    return seccion('tv-pase', ICO_PASE, T('tienda.sec_pase'), ficha + items + (items ? `<p class="small muted tv-nota">${T('tienda.no_renueva')}</p>` : ''));
  }

  // VIP: tu nivel y avance (js/vip.js), las ofertas para ti, el Pase VIP de 30 días y la tarjeta mensual
  let vipPedidoEn = 0;
  function tarjetaVipNivel(V) {
    const E = Api.estado || {};
    const d = seguro(() => V.datos, null);
    if (!d && typeof V.recargar === 'function' && Date.now() - vipPedidoEn > 60000) {
      vipPedidoEn = Date.now();
      setTimeout(() => { Promise.resolve(V.recargar()).then(() => { if (tab === 'tienda') render(); }).catch(() => { /* sin datos: queda el nivel de /api/estado */ }); }, 0);
    }
    const vt = (k, p) => seguro(() => V.T(k, p), '');
    const n = Math.max(0, Math.min(10, Math.floor(Number(d ? d.nivel : E.vip_nivel) || 0)));
    const col = seguro(() => V.color(n), '#ffd34d');
    const pr = (d && d.progreso) || {};
    const max = n >= 10 || (!!d && n > 0 && (pr.siguiente === null || pr.siguiente === undefined));
    const pct = max ? 100 : Math.max(0, Math.min(100, Number(pr.pct) || 0));
    const nombre = n ? (vt('vip_n', { n }) || T('tienda.vip_n', { n })) + (vt('insignia.' + n) ? ' · ' + vt('insignia.' + n) : '') : (vt('sin_nivel') || T('tienda.vip_sin'));
    const det = !n ? vt('sin_nivel_txt') : max ? vt('maximo') : d && pr.faltan !== undefined ? vt('faltan', { n: N(Number(pr.faltan) || 0), s: pr.siguiente }) : '';
    const abrir = enRegistro('vip') ? 'data-ext="vip" data-acc="abrir"' : typeof V.abrir === 'function' ? 'data-act="tienda-vip"' : '';
    return `<div class="card tv-vipcard" data-vip-nivel="${n}" style="--vc:${esc(col)}">
      <div class="tv-head"><div class="tv-medal">${I('crown')}${n ? `<b class="num">${n}</b>` : ''}</div>
        <div class="grow"><div class="tv-lbl">${esc(vt('tu_vip') || T('tienda.sec_vip'))}</div><h3>${esc(nombre)}</h3></div>
        ${abrir ? `<button class="btn sm" ${abrir}>${esc(vt('ver') || T('tienda.ver'))}</button>` : ''}</div>
      ${n ? `<div class="tv-bar" role="progressbar" aria-label="${esc(T('tienda.vip_progreso'))}" aria-valuenow="${pct}" aria-valuemin="0" aria-valuemax="100"><i style="width:${Math.max(3, pct)}%"></i></div>` : ''}
      ${det ? `<p class="small muted tv-nota">${esc(det)}</p>` : ''}
      ${vt('modal.puntos') ? `<p class="small muted tv-nota">${esc(vt('modal.puntos'))}</p>` : ''}</div>`;
  }
  function cardOfertaVip(o) {
    const lis = [];
    if (Number(o.creditos) > 0) lis.push({ html: esc(T('tienda.ent_creditos', { n: Number(o.creditos) })) });
    (Array.isArray(o.entregas) ? o.entregas : []).forEach((e) => lis.push({ html: esc(nombreEntrega(e)) }));
    if (!lis.length && o.detalle) lis.push({ html: esc(TL(o.detalle)) });
    const meta = [o.vence ? T('tienda.disponible_hasta', { fecha: esc(fechaCorta(o.vence)) }) : '',
      o.quedan !== undefined && o.quedan !== null ? T('tienda.quedan', { n: Number(o.quedan) || 0 }) : ''].filter(Boolean).join(' · ');
    return `<div class="card tv-prod tv-of" data-prod="${esc(o.producto)}"><span class="ribbon">${T('tienda.oferta_vip')}</span>
      <div class="tv-head">${itemArt(o.producto, 52)}<div class="grow"><h3>${esc(TL(o.nombre || ''))}</h3>${meta ? `<div class="small muted">${meta}</div>` : ''}</div></div>
      ${incluye(lis)}${botonCompra(o.producto, { usd: o.precio })}</div>`;
  }
  /* Pase VIP (30 días): lo que da según el nivel VIP (Premium.PASE_VIP, misma tabla que el servidor) */
  const paseDe = (n) => seguro(() => Pm.pase(n), null);
  function bonoTxtDe(b) {
    if (!b) return '';
    const p = [M(b.dinero), T('tienda.pv_creditos', { n: b.creditos })];
    if (b.cable) p.push(T('tienda.pv_cables', { n: b.cable }));
    if (b.battery) p.push(T('tienda.pv_baterias', { n: b.battery }));
    if (b.reparar) p.push(T('tienda.pv_reparar'));
    return p.join(' + ');
  }
  function bonoVipTxt() {
    const pa = seguro(() => Pm.paseActual(), null) || paseDe(Number((Api.estado || {}).vip_nivel) || 1);
    return pa ? T('tienda.vip_bono_n', { lista: bonoTxtDe(pa.bono) }) : T('tienda.vip_bono', { m: M(150), n: 10 });
  }
  // Tabla "Con el Pase VIP: …" por nivel (en la tarjeta del Pase VIP de la Tienda)
  function tablaPaseVip() {
    const filas = seguro(() => Pm.PASE_VIP, null);
    if (!Array.isArray(filas) || !filas.length) return '';
    const E = Api.estado || {};
    const mio = E.logueado ? Math.max(1, Number(E.vip_nivel) || 0) : 0;
    const rows = filas.map((f, i) => {
      const hasta = filas[i + 1] ? filas[i + 1].desde - 1 : 10;
      const rango = hasta > f.desde ? T('tienda.pv_rango', { a: f.desde, b: hasta }) : T('tienda.vip_n', { n: f.desde });
      const yo = mio >= f.desde && mio <= hasta;
      return `<li class="pv-fila${yo ? ' yo' : ''}" data-desde="${f.desde}"><b>${esc(rango)}${yo ? ` · ${esc(T('tienda.pv_tu_nivel'))}` : ''}</b>
        <span>${esc(T('tienda.pv_turnos', { n: f.turnos }))} · ${esc(T('tienda.pv_reparar_pct', { n: f.descuento }))} · ${esc(T('tienda.pv_obra', { n: f.obra }))} · ${esc(T('tienda.pv_bono', { lista: bonoTxtDe(f.bono) }))}</span></li>`;
    }).join('');
    return `<div class="pv-tabla"><p class="small"><b>${I('crown', 'sm')} ${esc(T('tienda.pv_titulo'))}</b></p><ul class="pv-lista">${rows}</ul>
      <p class="small muted tv-nota">${esc(T('tienda.pv_siempre'))}</p></div>`;
  }
  function seccionVip(log, lista) {
    const V = window.Vip;
    const prods = lista.filter((p) => ['vip', 'tarjeta'].includes(tipoProd(p)));
    const nivel = log && V ? tarjetaVipNivel(V) : '';
    let ofertas = [];
    if (log && V) {
      ofertas = seguro(() => (Array.isArray(V.datos.ofertas) ? V.datos.ofertas : []), []).filter((o) => o && o.producto && o.quedan !== 0);
      pedirPreciosPlay(ofertas.map((o) => o.producto));
      ofertas = ofertas.filter((o) => precioReal(o.producto, o.precio));
    }
    const aparte = V ? seguro(() => V.T('modal.pase'), '') : '';
    const html = nivel + ofertas.map(cardOfertaVip).join('') + prods.map((p) => cardProd(p, {
      cls: p.id === 'vip30' ? 'rf r-vip' : '', ribbon: p.id === 'vip30' ? 'VIP' : '', sub: p.id === 'vip30' && aparte ? esc(aparte) : '',
      extra: p.id === 'vip30' ? tablaPaseVip() : '' })).join('');
    return seccion('tv-vip', I('crown', 'sm'), T('tienda.sec_vip'), html);
  }

  // Personal estrella y Pase de Copa (js/estrellas.js): se contratan y se compran en su pantalla (depende de la copa)
  function abrirEstrellas() {
    const ES = window.Estrellas;
    try { if (ES && typeof ES.abrir === 'function') { ES.abrir(ctxEstrellas()); return; } } catch (e) { console.error('[tienda estrellas]', e); }
    if (hayEstrellas() && window.EnVivoAbrirOnline) window.EnVivoAbrirOnline('estrellas');
    else toast(T('online.no_disponible'));
  }
  function seccionEstrellas(log) {
    const ES = window.Estrellas;
    if (!ES || !log || !(typeof ES.abrir === 'function' || hayEstrellas())) return '';
    const d = seguro(() => ES.datos || (ES._st && ES._st.datos), null);
    if (!d) pedirDatosModulo('estrellas', () => ES.recargar());
    const pc = (d && d.pase_copa) || {};
    const prod = prodPorId('pase_copa');
    const usd = prod ? prod.precio : pc.precio_usd;
    const valor = usd !== undefined && usd !== null ? precioReal('pase_copa', usd) : enApp() ? precioReal('pase_copa') : null;
    const extra = Number(pc.extra) || 5;
    const cred = Number(pc.precio_creditos) > 0 ? T('tienda.pase_copa_cred_n', { n: N(Number(pc.precio_creditos)) }) : T('tienda.pase_copa_cred');
    return seccion('tv-copa', I('star', 'sm'), T('tienda.sec_competencia'), `<div class="card tv-comp">
      <div class="tv-row"><div class="tv-badge t-amber">${I('star')}</div>
        <div class="grow"><h3>${T('tienda.estrella_t')}</h3><p class="small muted">${T('tienda.estrella_det')}</p></div></div>
      <div class="tv-row"><div class="tv-badge t-red">${I('crown')}</div>
        <div class="grow"><h3>${T('tienda.pase_copa_t')}</h3><p class="small muted">${T('tienda.pase_copa_det', { n: extra })}</p>
          <p class="small tv-precios">${valor ? `<span class="price sm" data-precio="pase_copa">${esc(valor)}</span><span class="muted"> · </span>` : ''}<span class="cr">${I('gem', 'sm')} ${cred}</span></p>
          ${valor && pc.puede_comprar !== false && !pc.activo ? `<button class="btn sm main tv-copa-btn" data-act="comprar" data-k="pase_copa" ${puedePagarAhora() ? '' : 'disabled'}>${T('tienda.comprar')} · ${esc(valor)}</button>` : ''}</div></div>
      <p class="small muted tv-nota">${T('tienda.techo')}</p>
      <button class="btn" data-act="tienda-estrellas">${I('star', 'sm')} ${T('tienda.ver_estrellas')}</button></div>`);
  }

  function seccionObra(lista) {
    const packs = lista.filter((p) => tipoProd(p) === 'pack_obra').sort((a, b) => (Number(a.precio) || 0) - (Number(b.precio) || 0));
    const html = packs.map((p) => {
      const k = PACKS_OBRA[p.id];
      if (!k) return cardProd(p, { art: `<div class="tv-badge">${ICO_OBRA}</div>` });
      const mats = `<div class="tv-mats">${MATS_OBRA.filter((m) => k.mat[m]).map((m) => `<span class="tv-mat${m === 'chips' ? ' rare' : ''}"><b class="num">${N(k.mat[m])}</b><span>${esc(T('tienda.mat.' + m))}</span></span>`).join('')}</div>`;
      return `<div class="card tv-prod tv-obra" data-prod="${esc(p.id)}"><div class="tv-head"><div class="tv-badge">${ICO_OBRA}<b>${k.letra}</b></div>
        <div class="grow"><h3>${T('tienda.obra_nombre', { t: k.letra })}</h3><div class="small muted">${T('tienda.obra_fijo')}</div></div></div>
        ${incluye([{ html: esc(T('tienda.obra_acel', { h: N(Math.round(k.min / 6) / 10) })), ico: 'bolt' }])}${mats}${botonCompra(p.id, { usd: p.precio })}</div>`;
    }).join('');
    return seccion('tv-obra', ICO_OBRA, T('tienda.sec_obra'), html ? html + `<p class="small muted tv-nota">${T('tienda.obra_det')}</p>` : '');
  }

  // Impulsos (js/impulsos.js, server/INTEGRAR_MONETIZACION2.md): equipo de obra extra, Fondo de crecimiento y Tarjeta semanal
  function seccionImpulsos(log, lista) {
    const IM = window.Impulsos;
    if (!IM || typeof IM.seccionTienda !== 'function') return [];
    const x = seguro(() => IM.seccionTienda(ctxModulo(), { log, lista }), null);
    return x && x.html ? [{ id: x.id, ico: x.ico, t: x.t, html: seccion(x.id, x.ico, x.t, x.html) }] : [];
  }

  function renderTienda() {
    const el = $('tab-tienda');
    if (Api.disponible === null) { el.innerHTML = `<div class="sectitle">${T('nav.tienda')}</div><div class="card muted">${T('tienda.conectando')}</div>`; return; }
    const app = enApp();   // dentro de la app de Google Play: nada de Plux ni de la tienda web
    if (!Api.disponible || !Api.estado) {
      const vitrina = Object.keys(G.CATALOG).filter((k) => G.CATALOG[k].premium).slice(0, 4).map((k) => {
        const r = rar(k);
        return `<div class="card gear rf r-${r.key}"><div class="row between">${rtag(k)}${infoBtn(k)}</div><div class="art">${itemArt(k, 110)}</div><div class="nm">${esc(TL(G.CATALOG[k].name))}</div>${usoHtml(k)}</div>`;
      }).join('');
      const aviso = app
        ? `<h3>${T('tienda.sin_conexion_t')}</h3><p class="small muted" style="margin:4px 0 0">${T('tienda.sin_conexion')}</p>`
        : `<h3>${T('tienda.offline_t', { sitio: 'juego.tukanec.com' })}</h3><p class="small muted" style="margin:4px 0 0">${T('tienda.offline', { sitio: '<b>juego.tukanec.com</b>' })}</p>`;
      el.innerHTML = `<div class="sectitle">${T('nav.tienda')}</div><div class="card rf r-exclusivo">
        <div class="prodrow">${itemArt('creditos_700', 72)}<div class="grow">${aviso}</div></div></div>
        ${vitrina ? `<div class="sectitle">${T('tienda.exclusivos_eq')}</div><div class="ggrid">${vitrina}</div>` : ''}`;
      return;
    }
    const E = Api.estado;
    const log = !!E.logueado;
    let cuenta;
    if (!log) {
      cuenta = `<div class="card">${tile('user', 'blue')}
        <h3 style="margin-top:10px">${T('cuenta.crea_gratis')}</h3>
        <p class="small muted">${T('cuenta.beneficios')}</p>
        <button class="btn main" data-act="cuenta" data-modo="registro">${I('user')}${T('cuenta.crear')}</button>
        <button class="btn" data-act="cuenta" data-modo="entrar">${T('cuenta.ya_tengo_entrar')}</button></div>`;
    } else {
      const vip = E.vip_activo
        ? `<p class="small" style="color:var(--amber)">${I('crown', 'sm')} ${T('tienda.vip_hasta', { fecha: esc(fechaCorta(E.vip_hasta)) })}</p>
           ${E.vip_bono_hoy ? `<p class="small muted">${T('tienda.vip_bono_ya')}</p>` : `<button class="btn" data-act="vip-bono" style="border-color:var(--amber)">${I('gift')}${bonoVipTxt()}</button>`}`
        : '';
      cuenta = `<div class="card">
        <div class="row between"><div class="wallet">${I('gem')}<div><div class="big">${N(E.creditos)}</div><div class="small muted">${T('tienda.creditos_lbl')}</div></div></div>
          <div class="small muted" style="text-align:end;min-width:0;overflow-wrap:anywhere">${esc(E.jugador.nombre)}<br>${esc(E.jugador.email)}</div></div>
        ${vip}
        <p class="small muted">${I('cloud', 'sm')} ${nubeEstado === 'error' ? T('tienda.nube_error') : T('tienda.nube_ok')}</p>
        ${discordBtn('sm')}${unirseDiscordBtn('sm')}
        ${window.Visitas ? window.Visitas.ajusteCuenta() : ''}
        ${window.Buzon && window.Buzon.botonCanjear ? window.Buzon.botonCanjear() : ''}
        <button class="btn sm" data-act="salir">${T('cuenta.salir')}</button>${window.Cuenta ? window.Cuenta.botones() : ''}</div>`;
    }
    const conPaypal = paypalDisp();
    const prueba = (!app && E.plux && E.plux.ambiente === 'sandbox' ? `<p class="small" style="color:var(--amber)">${T('tienda.sandbox')}</p>` : '')
      + (conPaypal && E.paypal.ambiente === 'sandbox' ? `<p class="small" style="color:var(--amber)">${T('tienda.paypal_sandbox')}</p>` : '');
    // En la app: solo lo que Google Play tiene activo, con su precio; nunca la transferencia de cuenta
    const lista = ((E.tienda && E.tienda.productos) || []).filter((p) => p && p.id && p.id !== 'transferencia_cuenta' && (!app || (playOk && preciosPlay[p.id])));
    const sinPago = app
      ? (playOk ? '' : `<div class="card small muted">${T('tienda.play_no_disp')}</div>`)
      : (pluxDisp() || conPaypal ? '' : `<div class="card small muted">${T('tienda.pago_inactivo')}</div>`);
    // Para empezar: ofertas de una sola vez (bienvenida y paquete de inicio)
    const empezar = lista.filter((p) => ['inicio', 'bienvenida'].includes(tipoProd(p))).map((p) => cardProd(p, {
      cls: 'dest', ribbon: T('tienda.oferta_unica'), hecho: (p.id === 'inicio' && !!E.inicio_comprado) || (p.id === 'bienvenida' && !!E.bienvenida_comprada) })).join('');
    const creditos = lista.filter((p) => tipoProd(p) === 'creditos').sort((a, b) => (Number(a.precio) || 0) - (Number(b.precio) || 0));
    const otros = lista.filter((p) => tipoProd(p) === 'otro');
    const secs = [
      { id: 'tv-empezar', ico: I('gift', 'sm'), t: T('tienda.sec_empezar'), html: seccion('tv-empezar', I('gift', 'sm'), T('tienda.sec_empezar'), empezar) },
      { id: 'tv-pase', ico: ICO_PASE, t: T('tienda.nav_pase'), html: seccionPase(log) },
      { id: 'tv-vip', ico: I('crown', 'sm'), t: T('tienda.sec_vip'), html: seccionVip(log, lista) },
      { id: 'tv-copa', ico: I('star', 'sm'), t: T('tienda.nav_copa'), html: seccionEstrellas(log) },
      { id: 'tv-obra', ico: ICO_OBRA, t: T('tienda.nav_obra'), html: seccionObra(lista) },
      ...seccionImpulsos(log, lista),
      { id: 'tv-creditos', ico: I('gem', 'sm'), t: T('tienda.sec_creditos'), html: seccion('tv-creditos', I('gem', 'sm'), T('tienda.sec_creditos'),
        (creditos.length ? `<div class="tv-cgrid">${creditos.map(cardCreditos).join('')}</div>` : '') + otros.map((p) => cardProd(p)).join('')) },
    ].filter((x) => x.html);
    const premium = ((E.tienda && E.tienda.premium) || []).map((p) => {
      const alcanza = log && E.creditos >= p.creditos;
      const esEquipo = !!G.CATALOG[p.id];
      const rk = p.vip ? 'vip' : esEquipo ? rar(p.id).key : 'comun';
      const rl = p.vip ? { label: 'VIP', color: '#ffd34d' } : rar(p.id);
      const exIt = esEquipo && G.CATALOG[p.id].exclusivo ? G.CATALOG[p.id] : null;
      if (exIt) return `<div class="card gear rf r-exclusivo exq-mia" data-ex="${esc(p.id)}">
        <div class="row between"><span class="exb" title="${esc(T('bodega.ex_badge'))}">${I('gem', 'sm')}${T('rareza.exclusivo')}</span></div>
        <div class="art">${itemArt(p.id, 110)}</div>
        <div class="nm">${esc(TL(p.nombre))}</div><div class="qrow">${T('bodega.calidad')} ${qPips(exIt.q)}</div>${exPerks(exIt)}<div class="grow2"></div>
        <div class="cr" style="margin-top:8px">${I('gem', 'sm')} ${N(p.creditos)}</div>
        <button class="btn sm ${alcanza ? 'green' : ''}" data-act="canjear" data-k="${esc(p.id)}" ${log ? '' : 'disabled'}>${alcanza ? T('tienda.canjear') : log ? T('tienda.faltan') : T('tienda.entra_canjear')}</button></div>`;
      return `<div class="card gear rf r-${rk}">
        <div class="row between">${esEquipo || p.vip ? `<span class="rtag" style="--rc:${rl.color}">${esc(p.vip ? 'VIP' : rlabel(rl))}</span>` : `<span class="rtag">${T('tienda.ayuda')}</span>`}</div>
        <div class="art">${itemArt(p.id, 110)}</div>
        <div class="nm">${esc(TL(p.nombre))}</div><div class="ds">${esc(TL(p.detalle || ''))}</div><div class="grow2"></div>
        <div class="cr" style="margin-top:8px">${I('gem', 'sm')} ${N(p.creditos)}</div>
        <button class="btn sm ${alcanza ? 'green' : ''}" data-act="canjear" data-k="${esc(p.id)}" ${log ? '' : 'disabled'}>${alcanza ? T('tienda.canjear') : log ? T('tienda.faltan') : T('tienda.entra_canjear')}</button></div>`;
    }).join('');
    secs.push({ id: 'tv-exclusivos', ico: I('sparkle', 'sm'), t: T('tienda.nav_exclusivos'),
      html: seccion('tv-exclusivos', I('sparkle', 'sm'), T('tienda.exclusivos'), premium ? `<div class="ggrid">${premium}</div>` : emptyState('gem', T('tienda.pronto_t'), T('tienda.pronto'))) });
    // Sub-pestañas: cada sección de la tienda va en su grupo (Ofertas, Créditos, VIP, Pase y, con cuenta, Mercado)
    const grupos = { ofertas: [], creditos: [], vip: [], pase: [] };
    secs.forEach((x) => { (grupos[GRUPO_TIENDA[x.id] || 'ofertas']).push(x); });
    const conMerc = !!(log && window.Mercado);
    const items = [
      { k: 'ofertas', t: T('nav2.t_ofertas'), ic: I('gift', 'sm') },
      { k: 'creditos', t: T('nav2.t_creditos'), ic: I('gem', 'sm'), n: log ? N(E.creditos || 0) : '' },
      { k: 'vip', t: T('nav2.t_vip'), ic: I('crown', 'sm'), n: E.vip_activo ? '✓' : '' },
      { k: 'pase', t: T('nav2.t_pase'), ic: ICO_PASE },
    ].filter((x) => x.k === 'creditos' || grupos[x.k].length);
    // El Mercado sigue con data-act="vista-tienda" (js/cuenta.js pide aceptar los términos antes de abrirlo)
    if (conMerc) items.push({ k: 'mercado', t: T('nav2.t_mercado'), ic: I('cart', 'sm'), act: 'vista-tienda' });
    let st = vistaTienda === 'mercado' && conMerc ? 'mercado' : sub.tienda;
    if (!items.some((x) => x.k === st)) st = items[0].k;
    vistaTienda = st === 'mercado' ? 'mercado' : 'tienda';
    const nav = subnav('tienda', items, st);
    if (st === 'mercado') {
      el.innerHTML = `${nav}<div class="subpanel" data-sub="mercado"><div id="merc-cont"></div></div>`;
      window.Mercado.render($('merc-cont'), ctxMercado());
      return;
    }
    // Sin cuenta: franja para crearla (la tarjeta completa va en Créditos)
    const tira = !log && st !== 'creditos' ? `<div class="redstrip amberstrip cta-cuenta">${I('user', 'sm')}<span class="grow">${T('nav2.cuenta_strip')}</span></div>
      <div class="cta-btns"><button class="btn main" data-act="cuenta" data-modo="registro">${I('user', 'sm')}${T('cuenta.crear')}</button><button class="btn" data-act="cuenta" data-modo="entrar">${T('cuenta.ya_tengo_entrar')}</button></div>` : '';
    const cuerpo = (st === 'creditos' ? `<div class="sectitle">${T('tienda.tu_cuenta')}</div>${cuenta}` : '') + grupos[st].map((x) => x.html).join('');
    el.innerHTML = `${nav}<div class="subpanel" data-sub="${st}">${tira}${prueba}
      ${sinPago}
      ${cuerpo || emptyState('gem', T('tienda.pronto_t'), T('tienda.pronto'))}
      <div class="tv-trust">${I('check')}<span>${T('tienda.sin_azar')}</span></div>
      ${app && !playOk ? '' : `<p class="small muted">${app ? T('tienda.play_precios') : conPaypal ? T('tienda.precios_paypal', { p: esc(precio(Number(E.paypal.minimo) || 0)) }) : T('tienda.precios')}</p>`}
      <p class="small muted">${T('tienda.aviso')}</p>
      ${soporteBtn()}
      <div class="legal"><a href="/terminos.html">${T('tienda.terminos')}</a><a href="/privacidad.html">${T('tienda.privacidad')}</a></div></div>`;
  }
  // Cada sección de la tienda en su sub-pestaña (lo que no está aquí va en Ofertas: packs, impulsos...)
  const GRUPO_TIENDA = { 'tv-empezar': 'ofertas', 'tv-obra': 'ofertas', 'tv-creditos': 'creditos', 'tv-exclusivos': 'creditos', 'tv-vip': 'vip', 'tv-pase': 'pase', 'tv-copa': 'pase' };
  function irSeccionTienda(id) {
    // La sección vive en una sub-pestaña: primero se abre esa (si no es la que se ve)
    const g = id ? (GRUPO_TIENDA[id] || 'ofertas') : null;
    if (g && (tab !== 'tienda' || sub.tienda !== g || vistaTienda === 'mercado' || !document.getElementById(id))) { setSub('tienda', g); vistaTienda = 'tienda'; tab = 'tienda'; render(); window.scrollTo(0, 0); }
    const s = id && document.getElementById(id);
    if (!s) return;
    try { s.scrollIntoView({ behavior: reduceMotion() ? 'auto' : 'smooth', block: 'start' }); } catch (e) { s.scrollIntoView(); }
  }

  function ctxMercado() {
    return { Api, G, Pm, A, T, TL, I18N: I18, estado: () => S, toast, ask, openModal, closeModal, snd,
      sincronizar: () => { aplicarEntregas(); save(); } };
  }
  function ctxChat() {
    return { Api, A, T, TL, I18N: I18, toast, ask, snd,
      pagarAsociacion: (m) => { if (S.money < m) { toast(T('chat.asoc_falta_dinero', { m: M(m) })); return false; } S.money -= m; save(); render(); return true; },
      // Donaciones a la Investigación de la asociación (js/ayuda_asoc.js): el servidor acepta y después se descuenta
      dinero: () => S.money, gastarDinero: (m) => { S.money = Math.max(0, S.money - m); save(); render(); } };
  }

  function abrirCuenta(modo, nota) {
    const reg = modo === 'registro';
    openModal(`<div class="row between"><h2>${reg ? T('cuenta.crear') : T('cuenta.entrar')}</h2><button class="btn sm" data-act="close" aria-label="${esc(T('comun.cerrar'))}">${I('close', 'sm')}</button></div>
      ${nota ? `<p class="small" style="color:var(--amber)">${esc(nota)}</p>` : ''}
      <form id="formCuenta" data-modo="${modo}">
        ${reg ? `<label class="field">${T('cuenta.nombre')}<input id="cu-nombre" autocomplete="name" maxlength="60" required></label>` : ''}
        <label class="field">${T('cuenta.correo')}<input id="cu-email" type="email" autocomplete="email" maxlength="120" required></label>
        <label class="field">${reg ? T('cuenta.clave_min', { n: 8 }) : T('cuenta.clave')}<input id="cu-clave" type="password" autocomplete="${reg ? 'new-password' : 'current-password'}" minlength="${reg ? 8 : 1}" required></label>
        ${reg && window.Cuenta ? window.Cuenta.camposRegistro() : ''}
        <p class="small neg" id="cu-error" aria-live="polite"></p>
        <button class="btn main" type="submit" id="cu-btn">${reg ? T('cuenta.crear_mia') : T('cuenta.entrar')}</button>
      </form>
      <button class="btn" data-act="cuenta" data-modo="${reg ? 'entrar' : 'registro'}">${reg ? T('cuenta.ya_tengo') : T('cuenta.no_tengo')}</button>
      ${window.Recuperar ? window.Recuperar.enlace() : `<p class="small muted">${T('cuenta.olvido')}</p>`}`);
  }

  async function enviarCuenta(form) {
    const reg = form.dataset.modo === 'registro';
    const email = $('cu-email').value.trim(), clave = $('cu-clave').value;
    const falta = reg && window.Cuenta ? window.Cuenta.faltaRegistro() : '';   // casillas de términos y edad (js/cuenta.js)
    if (falta) { $('cu-error').textContent = falta; snd.play('error'); return; }
    const btn = $('cu-btn'); btn.disabled = true; $('cu-error').textContent = '';
    try {
      if (reg) await Api.registro(email, $('cu-nombre').value.trim(), clave, window.Cuenta ? window.Cuenta.datosRegistro() : undefined);
      else await Api.entrar(email, clave);
      if (reg) AN('cuenta_creada');
      closeModal();
      invalidarOnline(); vistaOnline = 'hub';
      snd.play('hire');
      toast(reg ? T('cuenta.creada') : T('cuenta.hola', { nombre: Api.estado.jugador.nombre }));
      await alConectar(true);
      if (window.Chat) window.Chat.iniciar(ctxChat());
      restaurarPlay();
    } catch (e) {
      $('cu-error').textContent = TL(e.message); btn.disabled = false; snd.play('error');
    }
  }

  // Después de iniciar sesión o al abrir el juego con sesión: entregas, VIP y partida en la nube
  async function alConectar(recienEntro) {
    const E = Api.estado;
    if (!E) { render(); return; }
    if (Pm) syncVip();
    if (E.logueado) {
      if (recienEntro) { nubeLista = null; nubeBloqueo = false; }   // otra cuenta (o la misma otra vez): revisar desde cero
      await revisarNube('carga');
    }
    aplicarEntregas();
    render();
  }

  // El Pase VIP lo decide el servidor: cada vez que llega /api/estado (al abrir, después de una compra o un canje) se
  // copia, así un Pase VIP comprado sin recargar la página (Google Play) activa enseguida los equipos VIP
  function syncVip() {
    if (!Pm || !Pm.setVip || !Api.estado) return;
    const E = Api.estado;
    const hasta = E.vip_hasta ? Date.parse(E.vip_hasta) : NaN;
    // El nivel VIP (1–10) decide cuánto da el Pase (Premium.PASE_VIP): el de /api/vip si ya llegó, si no el de /api/estado
    const nv = seguro(() => (window.Vip && window.Vip.datos && window.Vip.datos.nivel != null ? window.Vip.datos.nivel : E.vip_nivel), E.vip_nivel);
    Pm.setVip(!!E.logueado && !!E.vip_activo && (isNaN(hasta) || hasta > Date.now()), Number(nv) || 0);
  }
  function aplicarEntregas() {
    syncVip();
    if (!Pm || !Api.estado || !Api.estado.logueado) return;
    const hechos = Pm.aplicarEntregas(S, Api.estado.entregas);
    if (Array.isArray(Api.estado.inventario) && Pm.sincronizarInventario) {
      const inv = Pm.sincronizarInventario(S, Api.estado.inventario);
      inv.agregados.forEach((t) => hechos.push(T('tienda.llego', { item: TL(t) })));
      if (inv.quitados.length) save();
    }
    if (hechos.length) { save(); toast(TL(hechos[0]) + (hechos.length > 1 ? ' ' + T('comun.mas', { n: hechos.length - 1 }) : '')); snd.play('chapter'); }
  }

  const resumen = (x) => `${T('comun.dia_n', { n: x.day })} · ${G.CHAPTERS[x.chapter] ? esc(TL(G.CHAPTERS[x.chapter].title).split('·')[0].trim()) : T('historia.completa')} · ${M(x.money)} · ${T('inicio.eventos', { n: x.stats.events })}`;
  // La partida de la nube y la de aquí avanzaron las dos: el jugador elige (la otra se reemplaza; nunca sin preguntar)
  function nubeElegir(nube, datos, rev) {
    clearTimeout(nubeT);
    cloudPendiente = true;
    return new Promise((listo) => {
      eleccion = (cual) => {
        cloudPendiente = false;
        closeModal();
        if (cual === 'nube') { listo(nubeUsar(nube, datos, rev, nubeLista === nubeCuenta())); return; }
        // La de aquí: se sube encima de esa versión de la nube y esta pestaña toma la partida
        nubeBloqueo = false;
        nubeMarcar(rev, nubeClave(nube));
        nubeLista = nubeCuenta(); nubePendiente = true;
        save(); render(); listo(subirNube(true));
      };
      openModal(`<h2>${T('nube.titulo')}</h2>
        <p class="small muted">${T('nube.texto')}</p>
        <button class="btn" data-act="partida" data-k="nube">${I('cloud')}${T('nube.nube')}<br><span class="small muted">${resumen(nube)}</span></button>
        <button class="btn" data-act="partida" data-k="local">${I('social')}${T('nube.local')}<br><span class="small muted">${resumen(S)}</span></button>
        <p class="small muted">${T('nube.reemplaza')}</p>`);
    });
  }
  let eleccion = null;

  // Se llama directo desde el clic: en la app, GooglePlay.comprar() va primero (sin nada esperado antes),
  // porque Chrome exige un toque reciente para abrir la ventana de pago. La nube se guarda después.
  function comprar(id, metodo) {
    if (enApp()) { AN('compra_iniciada', { producto: id, canal: 'google_play' }); comprarPlay(id); return; }   // en la app: solo Google Play
    // Botón sin método (pase, VIP, Copa...) y el producto se puede pagar con PayPal: se pregunta cómo pagar
    if (metodo !== 'tarjeta' && metodo !== 'paypal' && paypalPara(id)) { elegirPago(id); return; }
    if (metodo === 'paypal' && !paypalPara(id)) metodo = 'tarjeta';
    closeModal();
    AN('compra_iniciada', { producto: id, canal: metodo === 'paypal' ? 'web_paypal' : 'web_plux' });
    comprarWeb(id, metodo === 'paypal' ? 'paypal' : undefined);
  }
  // ¿Cómo quieres pagar? (tarjeta con Pago Plux o PayPal). Solo en la web.
  function elegirPago(id) {
    if (!Api.logueado()) { abrirCuenta('registro', T('cuenta.para_comprar')); return; }
    const p = prodPorId(id);
    const valor = precioReal(id);
    openModal(`<div class="row between"><h2>${T('tienda.como_pagar')}</h2><button class="btn sm" data-act="close" aria-label="${esc(T('comun.cerrar'))}">${I('close', 'sm')}</button></div>
      ${p || valor ? `<p class="small muted">${p ? esc(TL(p.nombre)) : ''}${p && valor ? ' · ' : ''}${valor ? `<b>${esc(valor)}</b>` : ''}</p>` : ''}
      <div class="tv-pagos tv-pagos-modal">
        <button class="btn main" data-act="comprar" data-k="${esc(id)}" data-metodo="tarjeta" ${pluxDisp() ? '' : 'disabled'}>${I('card', 'sm')}${T('tienda.pagar_tarjeta')}</button>
        <button class="btn paypal" data-act="comprar" data-k="${esc(id)}" data-metodo="paypal">${T('tienda.pagar_paypal')}</button></div>`);
  }
  // Después de una compra: el pase (premium), el nivel VIP y el Pase de Copa se ven al momento (INTEGRAR_PASE.md §7)
  function trasCompra() {
    try { if (window.Pase && window.Pase.recargar) window.Pase.recargar(ctxInicio()); } catch (e) { /* sin pase */ }
    try { if (window.Vip && window.Vip.invalidar) { window.Vip.invalidar(); if (window.Vip.recargar) Promise.resolve(window.Vip.recargar()).then(() => { if (tab === 'tienda') render(); }).catch(() => {}); } } catch (e) { /* sin VIP */ }
    try { if (window.Estrellas && window.Estrellas.invalidar) window.Estrellas.invalidar(); } catch (e) { /* sin estrellas */ }
    try { if (window.Impulsos && window.Impulsos.invalidar) { window.Impulsos.invalidar(); window.Impulsos.recargar(ctxModulo(), true); } } catch (e) { /* sin impulsos */ }
  }
  function comprarPlay(id) {
    if (!GP || !playOk) { toast(T('tienda.play_no_disp')); snd.play('error'); return; }
    if (!Api.logueado()) { abrirCuenta('registro', T('cuenta.para_comprar')); return; }
    let pr;
    try { pr = GP.comprar(id); } catch (e) { pr = Promise.resolve({ ok: false, estado: 'error' }); }
    save();
    Promise.resolve(pr).then(async (r) => {
      r = r || { ok: false, estado: 'error' };
      if (r.ok) {
        snd.play('buy');
        AN('compra_aprobada', { producto: id, canal: 'google_play' });
        try { await Api.refrescar(); } catch (e) { /* se verá al volver */ }
        aplicarEntregas(); save(); render(); trasCompra();
        toast(r.estado === 'ya_entregado' ? T('tienda.gp_ya') : T('tienda.gp_ok'));
        subirNube();
        return;
      }
      if (r.estado === 'cancelado') return;
      if (r.estado === 'sesion_requerida') { abrirCuenta('registro', T('cuenta.para_comprar')); return; }
      if (r.estado === 'pendiente') { toast(T('tienda.gp_pendiente')); return; }
      const porCodigo = r.codigo && I18 && I18.T.has('error.' + r.codigo) ? T('error.' + r.codigo) : null;
      toast(porCodigo || (r.estado === 'ocupado' ? T('tienda.gp_ocupado') : r.estado === 'no_disponible' ? T('tienda.play_no_disp') : T('tienda.gp_error')));
      snd.play('error');
    }).catch(() => { toast(T('tienda.gp_error')); snd.play('error'); });
  }
  // Precios de Google Play y compras que quedaron sin confirmar (al abrir el juego y al entrar a la cuenta)
  async function iniciarPlay() {
    GP = GP || window.GooglePlay || null;
    if (!GP || !Api.disponible || !Api.estado) return;
    try { playOk = !!(await GP.disponible()); } catch (e) { playOk = false; }
    if (playOk) {
      const ids = [...new Set(((Api.estado.tienda && Api.estado.tienda.productos) || []).map((p) => p.id).concat(PLAY_EXTRA))];
      ids.forEach((id) => playPedidos.add(id));
      try { (await GP.productos(ids)).forEach((p) => { preciosPlay[p.id] = p; }); } catch (e) { /* sin precios */ }
    }
    await restaurarPlay();
    if (tab === 'tienda') render();
  }
  async function restaurarPlay() {
    if (!GP || !Api.disponible || !Api.logueado()) return;
    try {
      const r = await GP.restaurar();
      if (r && r.entregadas && r.entregadas.length) {
        await Api.refrescar(); aplicarEntregas(); save(); render(); toast(T('tienda.play_llego')); snd.play('chapter');
      }
    } catch (e) { /* se reintenta la próxima vez */ }
  }

  async function comprarWeb(id, metodo) {
    if (!Api.logueado()) { abrirCuenta('registro', T('cuenta.para_comprar')); return; }
    try {
      save(); await subirNube();
      const r = await Api.orden(id, metodo);
      snd.play('tap');
      location.href = r.url;
    } catch (e) { toast(TL(e.message)); snd.play('error'); }
  }

  function canjear(id) {
    const p = Api.estado.tienda.premium.find((x) => x.id === id);
    if (!p) return;
    if (Api.estado.creditos < p.creditos) {
      toast(T('tienda.faltan_n', { n: p.creditos - Api.estado.creditos })); snd.play('error'); return;
    }
    ask(T('tienda.canjear_q', { item: `<b>${esc(TL(p.nombre))}</b>`, n: p.creditos }), T('tienda.canjear_si'), async () => {
      try {
        await Api.gastar(id);
        snd.play('buy');
        await Api.refrescar();
        aplicarEntregas();
        render();
        // Equipo que necesita más cosas: lo que falta para que funcione
        const en = p.entrega || {};
        if (en.tipo === 'item' && G.CATALOG[en.item]) ofrecerCombo(en.item, 'despues');
      } catch (e) { toast(TL(e.message)); snd.play('error'); }
    });
  }

  async function bonoVip() {
    try {
      const r = await Api.bonoVip();
      Api.estado.creditos = r.creditos; Api.estado.vip_bono_hoy = true;
      if (Array.isArray(r.entregas) && r.entregas.length) r.entregas.forEach((en) => Api.estado.entregas.push(en));
      else if (r.entrega) Api.estado.entregas.push(r.entrega);
      aplicarEntregas(); render();
    } catch (e) { toast(TL(e.message)); snd.play('error'); }
  }

  function renderRegistro() {
    $('tab-registro').innerHTML = `<button class="btn sm" data-act="tab" data-tab="inicio" style="margin-top:4px">← ${T('nav.inicio')}</button>
      <div class="sectitle">${T('registro.titulo')}</div>
      <div class="card log">${S.log.map((l) => `<p><span>${T('comun.dia_n', { n: l.day })}</span>${esc(gtx(l, l.text))}</p>`).join('')}</div>`;
  }

  /* ---------- Comprar un equipo (y el lente que necesita) ---------- */
  function comprarEquipo(k) {
    const r = act(G.buy(S, k), 'buy');
    if (r && r.chapterDone && !Array.isArray(S.capCompletados)) showChapterDone(r.chapterDone); else continuar();
  }
  /* ---------- Combos: lo que un equipo necesita para funcionar (G.dependencias) ----------
     Al comprar con dinero del juego o canjear con créditos algo que no rinde solo (cámara sin lente, lente box sin cámara
     de sistema, adaptador ni soporte, dron sin piloto...), se ofrece comprarlo todo junto. Los créditos SIEMPRE los
     descuenta el servidor (/api/gastar, uno por equipo); el dinero del juego, G.buy. Nada mezcla las dos monedas en un
     solo botón: se canjea lo que va con créditos y después se ofrece lo que falta con dinero. */
  // Lo que falta, también lo que necesitan las cosas que se comprarían (la cámara de sistema de un lente box pide su
  // lente B4 y su fibra): se simula la compra y se repite (hasta 3 niveles). Sin repetidos.
  /* Combo con créditos (js/datos.js COMBO_CREDITOS): si el equipo se canjeó con créditos (o se está por canjear), lo que le
     falta también se consigue con créditos aunque con dinero pida más fama. Raíces: los equipos de crédito de tu bodega del
     servidor (srvId) y el que se está canjeando. El servidor revisa lo mismo (CatalogoJuego::COMBOS). */
  const esDeCredito = (k) => { const x = G.CATALOG[k]; return !!x && !!(x.premium || x.exclusivo) && Number(x.creditos) > 0; };
  function raicesCredito(extra) {
    const r = new Set();
    if (extra && esDeCredito(extra)) r.add(extra);
    (S.equip || []).forEach((e) => { if (e.srvId !== undefined && esDeCredito(e.type)) r.add(e.type); });
    return [...r];
  }
  function permiteCredito(clave, campo, raiz) {
    if (!Api.logueado() || !G.comboDe) return false;
    return raicesCredito(raiz).some((k) => { try { return G.comboDe(k)[campo].includes(clave); } catch (e) { return false; } });
  }
  function deps(k, extra) {
    if (!G.dependencias || !G.CATALOG[k]) return [];
    try {
      const sim = { rep: S.rep, staff: S.staff, equip: S.equip.slice() };
      if (extra) sim.equip.push({ id: -1, type: k, condition: 100 });
      const out = [], visto = new Set();
      let cola = [k];
      for (let n = 0; n < 3 && cola.length; n++) {
        const sig = [];
        cola.forEach((t) => G.dependencias(sim, t, 0).forEach((d) => {
          const id = d.req + ':' + (d.rol || '');
          if (visto.has(id)) return;
          visto.add(id); out.push(d);
          // Se sigue la cadena con lo que se puede conseguir: con dinero (ya desbloqueado) o con créditos (combo)
          if (d.tipo === 'equipo' && d.key && (!d.bloqueado || permiteCredito(d.key, 'equipos', k))) { sim.equip.push({ id: -2 - out.length, type: d.key, condition: 100 }); sig.push(d.key); }
        }));
        cola = sig;
      }
      return out;
    } catch (e) { return []; }
  }
  // El producto de la tienda premium (servidor) que entrega ese equipo, si se puede canjear ahora (fama, Pase VIP)
  function premiumDe(key) {
    const srv = premiumServidor();
    const p = srv ? srv.find((x) => x && x.entrega && x.entrega.tipo === 'item' && x.entrega.item === key) : null;
    if (!p) return null;
    const it = G.CATALOG[key] || {};
    const sinVip = !!p.vip && !(Api.estado && Api.estado.vip_activo);
    return { id: p.id, key, creditos: Number(p.creditos) || 0, ok: Api.logueado() && !sinVip && S.rep >= (Number(it.minRepCreditos) || 0) };
  }
  // Cada cosa que falta, resuelta: con dinero (key comprable), con créditos (premium canjeable) o personal
  // raiz: el equipo de crédito que se está canjeando (o cuyo combo se completa); con él, cada pieza que falta y no tiene
  // Edición Exclusiva se ofrece también con créditos ("juego:<clave>"), aunque con dinero pida más fama; y el personal que
  // con tu fama todavía no aparece ("personal:<rol>"). Así el combo entero se consigue con 💎 en un solo botón.
  function resolverFaltas(lista, raiz) {
    const CC = G.COMBO_CREDITOS || { personal: 150 };
    return lista.map((d) => {
      if (d.tipo === 'personal') {
        const rf = (G.ROLES[d.rol] && G.ROLES[d.rol].fama) || 0;
        const cred = rf > S.rep && permiteCredito(d.rol, 'roles', raiz) ? { id: 'personal:' + d.rol, key: null, rol: d.rol, creditos: CC.personal, personal: true, fama: rf } : null;
        return Object.assign({ nombre: roleName(d.rol), cred }, d);
      }
      let cred = (d.creditos || []).map(premiumDe).filter((p) => p && p.ok).sort((a, b) => a.creditos - b.creditos)[0] || null;
      const dinero = d.key && !d.bloqueado ? d.key : null;
      if (!cred && d.key && permiteCredito(d.key, 'equipos', raiz) && G.creditosJuego(d.key) > 0) {
        cred = { id: 'juego:' + d.key, key: d.key, creditos: G.creditosJuego(d.key), juego: true, ok: true };
      }
      return Object.assign({ nombre: itemName(d.key || (cred ? cred.key : d.req)), dinero, cred }, d);
    });
  }
  const totalCred = (fs) => fs.reduce((a, f) => a + (f.cred ? f.cred.creditos : 0), 0);
  const btnCanjearFalta = (fs, item, cls) => {
    const cs = fs.filter((f) => f.cred);
    if (!cs.length) return '';
    const n = cs.reduce((a, f) => a + f.cred.creditos, 0), saldo = (Api.estado && Api.estado.creditos) || 0;
    return `<button class="${cls || 'btn main'}" data-act="combo-canjear" data-k="" data-l="${esc(cs.map((f) => f.cred.id).join(','))}" data-item="${esc(item)}" ${saldo < n ? 'disabled' : ''}>${I('gem', 'sm')}${T('combo.canjear_combo', { n: N(n) })}</button>`
      + (saldo < n ? `<p class="small" style="color:var(--amber)">${T('combo.faltan_creditos', { n: N(n - saldo) })}</p>` : '');
  };
  const totalDinero = (fs) => fs.reduce((a, f) => a + (f.dinero ? G.CATALOG[f.dinero].price : 0), 0);
  function lineasFalta(fs) {
    return `<ul class="combo-l">${fs.map((f) => {
      let det;
      if (f.tipo === 'personal') det = f.cred ? T('combo.personal_cred', { n: N(f.cred.creditos), f: f.cred.fama }) : T('combo.personal');
      else {
        const partes = [];
        if (f.dinero) partes.push(T('combo.precio', { m: M(G.CATALOG[f.dinero].price) }));
        else if (f.key) partes.push(T('combo.fama', { n: f.minRep }));
        if (f.cred && f.cred.juego) partes.push(T('combo.o_creditos_juego', { n: N(f.cred.creditos) }));
        else if (f.cred) partes.push(partes.length ? T('combo.o_creditos', { n: N(f.cred.creditos) }) : T('combo.solo_creditos', { n: N(f.cred.creditos) }));
        det = partes.join(' ');
      }
      const ico = f.tipo === 'personal' ? I(roleIcon(f.rol), 'sm') : itemArt(f.dinero || (f.cred && f.cred.key) || f.key || 'cam_basic', 34, 'mini');
      return `<li>${ico}<div class="grow"><b>${esc(f.nombre)}</b><div class="small muted">${esc(det)}</div></div></li>`;
    }).join('')}</ul>`;
  }
  const btnPersonal = (fs) => fs.filter((f) => f.tipo === 'personal').slice(0, 2)
    .map((f) => `<button class="btn" data-act="ir-personal" data-k="${esc(f.rol)}">${I(roleIcon(f.rol), 'sm')}${T('combo.contratar', { rol: esc(f.nombre) })}</button>`).join('');
  const btnVer = (fs) => { const f = fs.find((x) => x.tipo === 'equipo' && (x.key || x.cred)); const k = f ? (f.key || f.cred.key) : null;
    return k ? `<button class="btn" data-act="ir-bodega" data-k="${esc(G.CATALOG[k].cat)}" data-item="${esc(k)}">${I('box', 'sm')}${T('combo.ver', { item: esc(itemName(k)) })}</button>` : ''; };
  /* modo: 'dinero' (antes de comprar con dinero), 'creditos' (antes de canjear; pid = producto premium),
     'despues' (ya es tuyo: lo que todavía falta) */
  function ofrecerCombo(k, modo, pid) {
    const it = G.CATALOG[k];
    if (!it) return false;
    const fs = resolverFaltas(deps(k, modo === 'despues' ? 0 : 1), modo === 'dinero' ? null : k);
    if (!fs.length) return false;
    // Comprando con dinero del juego no se ofrecen piezas con créditos (eso es del combo de un equipo de crédito)
    if (modo === 'dinero') fs.forEach((f) => { if (f.cred && (f.cred.juego || f.cred.personal)) f.cred = null; });
    const soloLente = fs.every((f) => /^lente_/.test(f.req));
    const titulo = modo === 'despues' ? T('combo.t_despues') : soloLente && it.cat === 'cam' ? T('bodega.lente_t') : T('combo.t');
    const plata = fs.filter((f) => f.dinero).map((f) => f.dinero);
    const conPlata = totalDinero(fs);
    let btns = '';
    if (modo === 'dinero') {
      const total = it.price + conPlata;
      if (plata.length) btns += `<button class="btn main" data-act="buy-kit" data-k="${esc(k)}" data-l="${esc(plata.join(','))}" ${S.money < total ? 'disabled' : ''}>${soloLente && plata.length === 1 ? T('bodega.lente_si', { m: M(total) }) : T('combo.todo', { m: M(total) })}</button>`;
      btns += `<button class="btn" data-act="buy" data-k="${esc(k)}" data-solo="1">${soloLente && it.cat === 'cam' ? T('bodega.lente_solo', { m: M(it.price) }) : T(plata.length ? 'combo.solo' : 'combo.comprar', { item: esc(itemName(k)), m: M(it.price) })}</button>`;
    } else if (modo === 'creditos') {
      const p = premiumServidor() ? premiumServidor().find((x) => x.id === pid) : null;
      const base = p ? Number(p.creditos) || 0 : 0;
      const creds = fs.filter((f) => f.cred).map((f) => f.cred);
      const total = base + creds.reduce((a, c) => a + c.creditos, 0);
      const saldo = (Api.estado && Api.estado.creditos) || 0;
      if (creds.length) btns += `<button class="btn main" data-act="combo-canjear" data-k="${esc(pid)}" data-l="${esc(creds.map((c) => c.id).join(','))}" data-item="${esc(k)}" ${saldo < total ? 'disabled' : ''}>${T('combo.canjear_todo', { n: N(total) })}</button>`
        + (saldo < total ? `<p class="small" style="color:var(--amber)">${T('combo.faltan_creditos', { n: N(total - saldo) })}</p>` : '');
      btns += `<button class="btn ${creds.length ? '' : 'main'}" data-act="combo-canjear" data-k="${esc(pid)}" data-l="" data-item="${esc(k)}" ${saldo < base ? 'disabled' : ''}>${T(creds.length ? 'combo.canjear_solo' : 'combo.canjear', { item: esc(itemName(k)), n: N(base) })}</button>`;
      if (plata.length) btns += `<p class="small muted">${T('combo.resto_dinero')}</p>`;
    } else {
      if (plata.length) btns += `<button class="btn main" data-act="buy-kit" data-k="" data-l="${esc(plata.join(','))}" ${S.money < conPlata ? 'disabled' : ''}>${T('combo.comprar_falta', { m: M(conPlata) })}</button>`;
      // Lo que no se consigue con dinero (fama) pero sí con créditos: todo junto en un botón
      btns += btnCanjearFalta(fs, k, plata.length ? 'btn' : 'btn main');
    }
    btns += btnPersonal(fs);
    if (!plata.length && modo !== 'creditos') btns += btnVer(fs);
    openModal(`<h2>${titulo}</h2><p>${T('combo.intro', { item: `<b>${esc(itemName(k))}</b>` })}</p>${lineasFalta(fs)}
      ${btns}<button class="btn" data-act="close">${modo === 'despues' ? T('combo.ahora_no') : T('comun.cancelar')}</button>`);
    return true;
  }
  // Compra con dinero del juego una lista de equipos (combo). Devuelve los ids nuevos de la bodega.
  function comprarLista(keys) {
    const nuevos = [];
    let ultimo = null, cd = null;
    for (const k of keys) {
      const antes = new Set(S.equip.map((e) => e.id));
      const r = G.buy(S, k);
      ultimo = r;
      if (!r || !r.ok) break;
      if (r.chapterDone) cd = r.chapterDone;
      S.equip.forEach((e) => { if (!antes.has(e.id)) nuevos.push(e.id); });
    }
    return { nuevos, ultimo, chapterDone: cd };
  }
  // Canjea con créditos (servidor) el producto y, si se pide, los que completan el combo; luego ofrece lo que falta
  async function canjearCombo(pid, extras, item) {
    const ids = [pid].concat((extras || [])).filter(Boolean);
    if (!ids.length) return;
    const enPrep = prep ? prep.id : null;   // desde la preparación: se vuelve a ella con lo nuevo
    closeModal();
    let hechos = 0;
    for (const id of ids) {
      try { await Api.gastar(id); hechos++; } catch (e) { toast(TL(e.message)); snd.play('error'); break; }
    }
    if (!hechos) return;
    snd.play('buy');
    try { await Api.refrescar(); } catch (e) { /* queda lo que ya había */ }
    aplicarEntregas();
    render();
    if (enPrep !== null && S.contracts.some((c) => c.id === enPrep)) { openPrep(enPrep); return; }
    if (item && hechos === ids.length) ofrecerCombo(item, 'despues');
  }

  /* ---------- Preparar evento ---------- */
  function openPrep(contractId) {
    const c = S.contracts.find((x) => x.id === contractId);
    if (!c) return;
    const sug = G.suggestLoadout(S, contractId);
    // Volver a la misma preparación (tras un canje o una compra) deja el paso en el que estaba
    const antes = prep && prep.id === contractId ? { paso: prep.paso, cat: prep.cat, col: prep.col } : {};
    prep = { id: contractId, staff: new Set(sug.staffIds), equip: new Set(sug.equipIds), paso: antes.paso, cat: antes.cat,
      // col: plan de cámaras a mano ([{ p, e, o }]) o null = automático; selCam / selPos: lo que está tocado en el plano
      col: antes.col || null, selCam: null, selPos: null };
    renderPrep();
  }

  /* ---------- Plan de cámaras a mano (js/plan_evento.js lo dibuja; aquí se mueven las cámaras) ----------
     Tocar una cámara y luego una posición (o arrastrarla con el mouse) la pone ahí; si había otra, cambian de lugar.
     El automático es el punto de partida: el primer cambio copia su plan. La lógica valida todo (Game.validarColocacion). */
  const crudoQ = (cq) => cq.parts.reduce((a, p) => a + p[1], 0);
  const camTutorial = () => !S.stats || S.stats.events < 1;
  function autoCol(c) {
    try { return G.cameraPlan(S, c, [...prep.equip], [...prep.staff]).colocacion.map((x) => Object.assign({}, x)); } catch (e) { return []; }
  }
  // La colocación sin lo que ya no se lleva (cámaras desmarcadas, cámaras que dejaron de funcionar, personas que no van)
  function colPrep(c) {
    if (!prep || !Array.isArray(prep.col) || !G.cameraPlan) return null;
    let listas;
    try { listas = new Set(G.cameraPlan(S, c, [...prep.equip], [...prep.staff]).camaras.map((x) => x.equipId)); } catch (e) { return null; }
    prep.col = prep.col.filter((x) => listas.has(x.e)).map((x) => (x.o > 0 && !prep.staff.has(x.o) ? { p: x.p, e: x.e } : x));
    return prep.col;
  }
  const colValida = (c, col) => (G.validarColocacion ? G.validarColocacion(S, c, [...prep.equip], [...prep.staff], col) : { ok: true });
  // La colocación con la cámara e en la posición k (si había otra, cambian de lugar); null si no se puede
  function colCon(c, e, k) {
    const col = (Array.isArray(prep.col) ? prep.col : autoCol(c)).map((x) => Object.assign({}, x));
    const yo = col.find((x) => x.e === e), ocupa = col.find((x) => x.p === k);
    if (yo && yo.p === k) return col;
    if (yo) { if (ocupa) ocupa.p = yo.p; yo.p = k; } else { if (ocupa) col.splice(col.indexOf(ocupa), 1); col.push({ p: k, e }); }
    return col;
  }
  function camAplicar(c, col) {
    const v = colValida(c, col);
    if (!v.ok) { toast(TL(v.msg)); snd.play('error'); return false; }
    prep.col = col;
    return true;
  }
  // Cuánto cambia la calidad si la cámara elegida va a cada posición ({ clave: { dq, ok } })
  function camPreview(c, staff, equip, actual) {
    if (!prep || prep.selCam == null || !G.cameraPlan) return null;
    const out = {};
    let pos = [];
    try { pos = G.cameraPlan(S, c, [...prep.equip], [...prep.staff], prep.col).positions; } catch (e) { return null; }
    pos.forEach((p) => {
      const col = colCon(c, prep.selCam, p.key);
      if (!colValida(c, col).ok) { out[p.key] = { ok: false }; return; }
      let q;
      try { q = crudoQ(G.computeQuality(S, c, staff, equip, col)); } catch (e) { return; }
      out[p.key] = { ok: true, dq: Math.round(q - actual) };
    });
    return out;
  }
  function camOperadores() {
    const o = {};
    ['camarografo', 'operador_ptz'].forEach((rol) => {
      o[rol] = S.staff.filter((p) => prep.staff.has(p.id) && normRole(p.role) === rol)
        .map((p) => ({ id: p.id, name: nmP(p), skill: p.skill }));
    });
    return o;
  }
  function camAccion(el) {
    if (!prep) return;
    const c = S.contracts.find((x) => x.id === prep.id);
    if (!c) return;
    colPrep(c);
    const a = el.dataset.peAct, k = el.dataset.k || null, id = el.dataset.id != null ? Number(el.dataset.id) : null;
    let foco = null;
    if (a === 'modo') {
      prep.col = k === 'manual' ? autoCol(c) : null;
      prep.selCam = null; prep.selPos = null;
      foco = `[data-pe-act="modo"][data-k="${k}"]`;
    } else if (a === 'cam') {
      const ocupada = prep.selPos && (Array.isArray(prep.col) ? prep.col : autoCol(c)).some((x) => x.p === prep.selPos);
      if (prep.selPos && prep.selCam == null && !ocupada) {
        // Posición vacía elegida primero: la cámara va ahí
        if (camAplicar(c, colCon(c, id, prep.selPos))) snd.play('tap');
      } else {
        prep.selCam = prep.selCam === id ? null : id;
        prep.selPos = null;
        snd.play('tap');
      }
      foco = `[data-pe-act="cam"][data-id="${id}"]`;
    } else if (a === 'pos') {
      if (prep.selCam != null) {
        if (camAplicar(c, colCon(c, prep.selCam, k))) { prep.selCam = null; prep.selPos = k; snd.play('tap'); }
      } else { prep.selPos = prep.selPos === k ? null : k; snd.play('tap'); }
      foco = `[data-pe-act="pos"][data-k="${k}"]`;
    } else if (a === 'quitar') {
      prep.col = (Array.isArray(prep.col) ? prep.col : autoCol(c)).filter((x) => x.p !== k).map((x) => Object.assign({}, x));
      snd.play('tap');
      foco = `[data-pe-act="pos"][data-k="${k}"]`;
    } else if (a === 'op') {
      const col = (Array.isArray(prep.col) ? prep.col : autoCol(c)).map((x) => Object.assign({}, x));
      const yo = col.find((x) => x.p === k);
      if (!yo) return;
      const antes = yo.o;
      if (id > 0) {
        // Un camarógrafo maneja una sola cámara: si ya tenía otra, cambian de operador
        const otro = col.find((x) => x !== yo && x.o === id);
        const pers = S.staff.find((p) => p.id === id);
        if (otro && pers && normRole(pers.role) === 'camarografo') otro.o = antes;
      }
      yo.o = id > 0 ? id : 0;
      if (camAplicar(c, col)) snd.play('tap');
      foco = `[data-pe-act="op"][data-k="${k}"][data-id="${id}"]`;
    } else if (a === 'cerrar') {
      prep.selPos = null; prep.selCam = null;
    }
    renderPrep(true);
    if (foco) { const n = document.querySelector('#prepCalcC ' + foco); if (n && n.focus) { try { n.focus({ preventScroll: true }); } catch (e) { n.focus(); } } }
  }
  // Tocar (o Enter / Espacio) en el plano de cámaras de la preparación
  document.addEventListener('click', (e) => {
    const el = e.target && e.target.closest ? e.target.closest('#prepCalcC [data-pe-act]') : null;
    if (!el || !prep) return;
    if (camArrastre.hecho) { camArrastre.hecho = false; return; }
    e.preventDefault();
    camAccion(el);
  });
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    const el = e.target && e.target.closest ? e.target.closest('#prepCalcC g[data-pe-act]') : null;
    if (!el || !prep) return;
    e.preventDefault();
    camAccion(el);
  });
  // Con mouse: arrastrar una cámara hasta su posición (en el celular se toca la cámara y luego la posición)
  const camArrastre = { id: null, x: 0, y: 0, fantasma: null, hecho: false };
  document.addEventListener('pointerdown', (e) => {
    const el = e.pointerType === 'mouse' && e.button === 0 && e.target.closest ? e.target.closest('#prepCalcC .pe-cc[data-pe-act="cam"]') : null;
    if (!el || !prep) return;
    Object.assign(camArrastre, { id: Number(el.dataset.id), x: e.clientX, y: e.clientY, fantasma: null, nombre: (el.querySelector('b') || {}).textContent || '' });
  });
  document.addEventListener('pointermove', (e) => {
    const d = camArrastre;
    if (d.id == null) return;
    if (!d.fantasma && Math.hypot(e.clientX - d.x, e.clientY - d.y) < 8) return;
    if (!d.fantasma) { d.fantasma = document.createElement('div'); d.fantasma.className = 'pe-drag'; d.fantasma.textContent = d.nombre; document.body.appendChild(d.fantasma); }
    d.fantasma.style.left = e.clientX + 'px'; d.fantasma.style.top = e.clientY + 'px';
  });
  document.addEventListener('pointerup', (e) => {
    const d = camArrastre;
    if (d.id == null) return;
    const id = d.id, arrastro = !!d.fantasma;
    if (d.fantasma) d.fantasma.remove();
    d.id = null; d.fantasma = null;
    if (!arrastro || !prep) return;
    d.hecho = true;   // el click que viene después del arrastre no cuenta como toque
    setTimeout(() => { d.hecho = false; }, 0);
    const t = document.elementFromPoint(e.clientX, e.clientY);
    const pos = t && t.closest ? t.closest('#prepCalcC [data-pe-act="pos"]') : null;
    if (!pos) return;
    prep.selCam = id; prep.selPos = null;
    camAccion(pos);
  });

  // Rango de calidad esperado (la lógica lo da en computeQuality().rango)
  function rangoDe(q) {
    const r = q && q.rango;
    if (r && typeof r.min === 'number' && typeof r.max === 'number') {
      const min = Math.min(r.min, r.max), max = Math.max(r.min, r.max);
      const esperado = Math.max(min, Math.min(max, typeof r.esperado === 'number' ? r.esperado : Math.round((min + max) / 2)));
      // La lógica da el peor y el mejor caso (min/max) y lo esperado. Lo que se muestra es la franja probable:
      // de la mitad entre el peor caso y lo esperado hasta la mitad entre lo esperado y el mejor caso.
      const lo = Math.round((min + esperado) / 2), hi = Math.round((esperado + max) / 2);
      return { min: lo, max: Math.max(lo, hi), peor: min, mejor: max, esperado, imprevistos: r.imprevistos };
    }
    return null;
  }
  const estrellasDe = (v) => (v >= 85 ? 5 : v >= 70 ? 4 : v >= 55 ? 3 : v >= 40 ? 2 : 1);
  // Barra con la franja min–max y una marca en lo esperado
  function barraRango(rg, cls, mega) {
    const c = (v) => Math.max(0, Math.min(100, v));
    const tone = rg.esperado < 40 ? 'red' : rg.esperado < 55 ? 'amber' : '';
    return `<div class="rbar ${tone} ${cls || ''}" aria-hidden="true">${typeof rg.peor === 'number' ? `<em style="left:${c(rg.peor)}%;width:${Math.max(2, c(rg.mejor) - c(rg.peor))}%"></em>` : ''}<i style="left:${c(rg.min)}%;width:${Math.max(2, c(rg.max) - c(rg.min))}%"></i><s style="left:${c(rg.esperado)}%"></s>${typeof mega === 'number' ? `<u style="left:${c(mega)}%"></u>` : ''}</div>`;
  }
  // Duelo con MegaVisión con la incertidumbre de los imprevistos
  function duelRango(rg, mega) {
    const mejor = typeof rg.mejor === 'number' ? rg.mejor : rg.max;
    const k = rg.min > mega ? 'ventaja' : mejor <= mega ? 'desventaja' : rg.max <= mega ? 'dificil' : rg.esperado > mega ? 'parejo_arriba' : 'parejo_abajo';
    const cls = k === 'ventaja' ? 'up' : k === 'desventaja' || k === 'dificil' ? 'down' : '';
    const c = (v) => Math.max(0, Math.min(100, v));
    return `<div class="duel ${k === 'ventaja' ? 'won' : ''}">
      <div class="row between small"><span>${I('rival', 'sm')} ${T('duelo.titulo')}</span><b class="${cls}" style="${cls ? '' : 'color:var(--amber)'}">${T('prep.duelo_' + k)}</b></div>
      <div class="lbl"><span>${T('duelo.tu_calidad')}</span><b class="num">${rg.min}–${rg.max}</b></div>
      ${barraRango(rg, 'you', mega)}
      <div class="lbl"><span>${T('duelo.mega_promete')}</span><b class="num">${mega}</b></div><div class="bar mega"><i style="width:${c(mega)}%"></i></div>
      <div class="small muted" style="margin-top:4px">${T('prep.duelo_det_' + k)}</div></div>`;
  }
  // Cámaras que no se pueden usar (sin lente, sin fibra, sin Pase VIP...) con su motivo y cómo arreglarlo. Salen las
  // elegidas y también las tuyas que no se eligieron porque no funcionarían (así una cámara VIP o una sin lente no
  // "desaparece"). Debajo, los otros equipos elegidos a los que les falta algo (lente box sin cámara de sistema...).
  function arreglo(tipo, equipId) {
    const fs = resolverFaltas(deps(tipo, 0), tipo);
    if (!fs.length) return '';
    const plata = fs.filter((f) => f.dinero);
    const m = totalDinero(fs);
    const bloq = fs.filter((f) => f.tipo === 'equipo' && !f.dinero && f.key);
    let h = `<div class="small camav-t">${T('prep.falta_motivo', { que: fs.map((f) => esc(f.nombre)).join(', ') })}</div>`;
    // Nunca un callejón sin salida: si con dinero pide más fama pero se consigue con créditos, se dice el precio en 💎
    bloq.forEach((f) => { h += `<div class="small camav-t">${f.cred ? T('prep.falta_fama_cred', { item: esc(itemName(f.key)), n: f.minRep, c: N(f.cred.creditos) }) : T('prep.falta_fama', { item: esc(itemName(f.key)), n: f.minRep })}</div>`; });
    const bs = [];
    if (plata.length) bs.push(`<button class="btn sm camav-b green" data-act="buy-falta" data-k="${esc(tipo)}" data-id="${equipId || ''}" ${S.money < m ? 'disabled' : ''}>${I('cart', 'sm')}${T('prep.falta_comprar', { m: M(m) })}</button>`);
    const cc = btnCanjearFalta(fs, tipo, 'btn sm camav-b gold');
    if (cc) bs.push(cc);
    fs.filter((f) => f.tipo === 'personal').slice(0, 1).forEach((f) => bs.push(`<button class="btn sm camav-b" data-act="ir-personal" data-k="${esc(f.rol)}">${I(roleIcon(f.rol), 'sm')}${T('combo.contratar', { rol: esc(f.nombre) })}</button>`));
    if (!plata.length) { const v = btnVer(fs); if (v) bs.push(v.replace('class="btn"', 'class="btn sm camav-b"')); }
    return h + (bs.length ? `<div class="bq-acc">${bs.join('')}</div>` : '');
  }
  function bloqueadosHtml(camP, c, equip) {
    const bl = (camP && Array.isArray(camP.bloqueados)) ? camP.bloqueados.slice() : [];
    // Tus cámaras que no se eligieron porque no funcionarían con nada de lo que tienes
    if (c && G.cameraPlan) {
      try {
        const sel = new Set((equip || []).map((e) => e.id));
        const todo = G.cameraPlan(S, c, S.equip.map((e) => e.id), prep ? [...prep.staff] : undefined);
        (todo.bloqueados || []).forEach((b) => { if (!sel.has(b.equipId) && !bl.some((x) => x.equipId === b.equipId || (x.tipo === b.tipo && x.motivo === b.motivo))) bl.push(b); });
      } catch (err) { /* sin plan */ }
    }
    // Otros equipos elegidos a los que les falta algo para funcionar (no cámaras)
    const otros = [];
    (equip || []).forEach((e) => { if (!isCam(e) && !otros.some((x) => x.type === e.type) && deps(e.type, 0).length) otros.push(e); });
    if (!bl.length && !otros.length) return '';
    const fila = (tipo, e, texto, corto, extra) => `<div class="bq">${itemArt(tipo, 40, 'mini')}<div class="grow"><b>${esc(e ? nmE(e) : TL((G.CATALOG[tipo] || {}).name || tipo))}</b>${texto ? `<div class="small muted">${esc(TL(texto))}</div>` : ''}${extra}</div><span class="bqr">${I('lock', 'sm')}${esc(corto)}</span></div>`;
    const camHtml = bl.map((b) => {
      const corto = b.motivo && I18 && I18.T.has('prep.bloq.' + b.motivo) ? T('prep.bloq.' + b.motivo) : (b.motivo || '').replace(/_/g, ' ');
      const e = S.equip.find((x) => x.id === b.equipId);
      const extra = arreglo(b.tipo, b.equipId);
      return fila(b.tipo, e, b.texto || '', corto, extra);
    }).join('');
    const otrosHtml = otros.map((e) => fila(e.type, e, '', T('prep.bloq.falta'), arreglo(e.type, e.id))).join('');
    return `${bl.length ? `<div class="bloq"><div class="pe-hd"><span class="pe-ttl">${T('prep.bloqueados')}</span><span class="pe-sub">${T('prep.bloqueados_n', { n: bl.length })}</span></div>${camHtml}</div>` : ''}
      ${otros.length ? `<div class="bloq bloq-otros"><div class="pe-hd"><span class="pe-ttl">${T('prep.falta_t')}</span><span class="pe-sub">${T('prep.falta_n', { n: otros.length })}</span></div>${otrosHtml}</div>` : ''}`;
  }
  // "Comprar lo que falta" desde la preparación: compra con dinero lo que le falta a ese equipo, lo marca junto con lo
  // nuevo y rehace el plan (la preparación sigue abierta)
  function comprarFalta(tipo, equipId) {
    if (!prep) return;
    const fs = resolverFaltas(deps(tipo, 0)).filter((f) => f.dinero);
    if (!fs.length) return;
    const r = comprarLista(fs.map((f) => f.dinero));
    if (r.ultimo && !r.ultimo.ok) { toast(TL(r.ultimo.msg)); snd.play('error'); }
    if (r.nuevos.length) {
      r.nuevos.forEach((id) => prep.equip.add(id));
      if (equipId) prep.equip.add(equipId);
      toast(T('prep.falta_compro', { que: fs.slice(0, r.nuevos.length).map((f) => itemName(f.dinero)).join(', ') }));
      snd.play('buy');
    }
    save();
    renderPrep();
  }
  // Avisos de las cámaras: las que elegiste y no se usan (y por qué) y, si una posición obligatoria queda vacía o mal
  // cubierta, qué cámara ya puedes comprar para ella en la Bodega
  function camAvisosHtml(c, camP, equip) {
    if (!camP || !Array.isArray(camP.positions)) return '';
    const usados = new Set(camP.usados || []);
    const bloq = new Set((camP.bloqueados || []).map((b) => b.equipId));
    const out = [];
    const sobran = equip.filter((e) => isCam(e) && !usados.has(e.id) && !bloq.has(e.id));
    if (sobran.length) out.push(`<div class="small camav-t">${I('tip', 'sm')} ${T('prep.cam_no_usada', { cams: sobran.map((e) => esc(nmE(e))).join(', ') })}</div>`);
    if (G.camaraParaPerfil) {
      const flojas = camP.positions.filter((p) => !p.opcional && (!p.asignado || p.fit < 0.75));
      for (const p of flojas) {
        const sug = G.camaraParaPerfil(S, p.perfil, p.asignado ? p.fit : 0);
        if (!sug || sug.fit < 0.8) continue;
        out.push(`<div class="small camav-t">${I('role_camarografo', 'sm')} ${T(p.asignado ? 'prep.cam_sugerida' : 'prep.cam_sugerida_vacia', { pos: esc(TL(p.nombre)), ideal: esc(TL(p.ideal || '')), item: `<b>${esc(itemName(sug.key))}</b>`, m: M(sug.precio) })}</div>
          <button class="btn sm camav-b" data-act="ir-bodega" data-k="cam">${I('box', 'sm')}${T('prep.ir_bodega')}</button>`);
        break;
      }
    }
    return out.length ? `<div class="camav">${out.join('')}</div>` : '';
  }
  function renderPrep(soloCalculo) {
    const c = S.contracts.find((x) => x.id === prep.id);
    if (!c) { closeModal(); return; }
    const staff = S.staff.filter((p) => prep.staff.has(p.id));
    const equip = S.equip.filter((e) => prep.equip.has(e.id));
    const col = colPrep(c);
    const q = G.computeQuality(S, c, staff, equip, col);
    // Tu plan de cámaras contra el automático (en puntos de calidad, sin el tope de 100)
    let camDelta = null;
    if (col) { try { camDelta = Math.round(crudoQ(q) - crudoQ(G.computeQuality(S, c, staff, equip))); } catch (e) { camDelta = null; } }
    const rg = rangoDe(q);
    const wages = staff.reduce((a, p) => a + wageFor(p, c.diff), 0);
    const est = estrellasDe(rg ? rg.esperado : q.q);
    // Consejo: solo lo que se arregla con equipo o personal
    const NO_FIX = /^(dificultad|lo que esperan|base\b|experiencia)|cansad|cansancio|desmotivad|[aá]nimo|apoyo|suerte/i;
    const STAFF_FIX = /sin director|sin sonidista|sin t[eé]cnico|sin operador|camar[oó]graf|director|sonidista|t[eé]cnico|falta|personal/i;
    // Con clave (p[2]) se sabe qué es cada parte; si no, se adivina por el texto
    const K_NO_FIX = /^parte\.(base|experiencia|cansado|animo|dificultad|fama|sensible|suerte|apoyo)/;
    const K_STAFF = /^parte\.(falta_rol|justo_rol|switcher_sin_director|consola_sin_sonidista|equipo_sin_tecnico|repeticiones_sin_operador|graficos_sin_operador|sin_operador|sin_shader)$/;
    const noFix = (p) => (p[2] ? K_NO_FIX.test(p[2]) : NO_FIX.test(p[0]));
    const esPersonal = (p) => (p[2] ? K_STAFF.test(p[2]) : STAFF_FIX.test(p[0]) && !/^Sin (switcher|consola|equipo)/i.test(p[0]));
    const worst = q.parts.filter((p) => p[1] < 0 && !noFix(p)).sort((a, b) => a[1] - b[1])[0];
    // Contrato internacional: requisitos con lo que llevas ahora, días y gastos de viaje
    let reqs = [];
    if (c.internacional && G.requisitosInternacional) { try { reqs = G.requisitosInternacional(S, c, [...prep.staff], [...prep.equip]); } catch (e) { reqs = []; } }
    const faltaReq = reqs.find((r) => r.obligatorio && !r.ok);
    const sinViaje = c.internacional && S.money < (c.travelCost || 0);
    // Sin nadie o sin cámara no se puede salir al aire: en vez del consejo, se dice qué falta
    const listo = staff.length > 0 && equip.some(isCam);
    const puede = listo && !faltaReq && !sinViaje;
    const tip = !listo ? `<p class="small hint" id="goHint">${I('tip', 'sm')} ${T('prep.falta_gente')}</p>`
      : faltaReq ? `<p class="small hint" id="goHint">${I('lock', 'sm')} ${T('prep.falta_req', { req: esc(TL(faltaReq.texto)) })}</p>`
      : sinViaje ? `<p class="small hint" id="goHint">${I('money', 'sm')} ${T('prep.falta_viaje', { m: M(c.travelCost) })}</p>`
      : worst ? `<p class="small" style="color:var(--amber);margin:6px 0 0">${I('tip', 'sm')} ${T('prep.resta', { que: esc(TL(worst[0])), n: worst[1] })} ${esPersonal(worst) ? T('prep.contrata') : T('prep.compralo')}</p>` : '';
    // Plan del evento (js/plan_evento.js): plantilla por rol con semáforo y plano de cámaras
    let crew = null, camP = null;
    try { crew = G.crewPlan ? G.crewPlan(S, c, [...prep.staff], [...prep.equip]) : null; } catch (e) { crew = null; }
    try { camP = q.cameraPlan || (G.cameraPlan ? G.cameraPlan(S, c, [...prep.equip], [...prep.staff]) : null); } catch (e) { camP = null; }
    if (!camP && PE && !G.cameraPlan) {
      const camsSel = equip.filter(isCam);
      const pos = PE.posiciones(c.type);
      if (pos.length) camP = { positions: pos.map((p, i) => Object.assign({}, p, { asignado: camsSel[i] ? camsSel[i].id : null })) };
    }
    const reqVista = reqs.map((r) => ({ texto: TL(r.texto), ok: r.ok, detalle: r.ok ? '' : r.obligatorio ? T('prep.obligatorio') : T('prep.req_resta') }));
    const intlHtml = PE && c.internacional ? PE.internacional(Object.assign({}, c, { requisitos: reqVista })) : PE ? PE.internacional(c) : '';
    const tHoy = turnoHoy();
    const avisoDia = !tHoy ? '' : esJornada(c) ? `<p class="small" style="color:var(--amber);margin:6px 0 0">${I('calendar', 'sm')} ${T('prep.jornada')}</p>`
      : tHoy.libres === 1 ? `<p class="small muted" style="margin:6px 0 0">${I('calendar', 'sm')} ${T('prep.ultimo_turno')}</p>` : '';
    const sinOp = camP && camP.sinOperador ? `<p class="small" style="color:var(--amber);margin:6px 0 0">${I('role_camarografo', 'sm')} ${T('prep.sin_operador', { n: camP.sinOperador })}</p>` : '';
    const avisos = camAvisosHtml(c, camP, equip);
    const bloqHtml = bloqueadosHtml(camP, c, equip);
    const camOpts = { nombreEquipo: eqName };
    if (camP && Array.isArray(camP.camaras) && G.validarColocacion) {
      Object.assign(camOpts, { editable: true, tutorial: camTutorial(), modo: col ? 'manual' : 'auto', delta: camDelta, selCam: prep.selCam, selPos: prep.selPos,
        preview: camPreview(c, staff, equip, crudoQ(q)), arte: (t) => itemArt(t, 34, 'mini'), operadores: camOperadores() });
    }
    // Plano de cámaras (js/plan_evento.js): se usa tal cual, como un componente dentro del paso "Cámaras"
    const camHtml = PE && (camP || PE.posiciones(c.type).length) ? PE.camaras(camP, c.type, camOpts) : '';
    const crewHtml = PE && crew ? PE.personal(crew) : '';
    const calidadTxt = rg ? T('prep.calidad_rango', { min: `<b class="num">${rg.min}</b>`, max: `<b class="num">${rg.max}</b>` }) : `${T('prep.calidad_esperada')} <b class="num">${q.q}</b>/100`;
    const mega = c.rival && typeof c.rivalQuality === 'number' ? c.rivalQuality : undefined;
    const barra = rg ? barraRango(rg, '', mega) : `<div class="bar ${q.q < 40 ? 'red' : q.q < 55 ? 'amber' : ''}"><i style="width:${q.q}%"></i></div>`;
    /* Pasos (Personal → Equipos → Cámaras → Resumen): se ve uno a la vez; la barra de abajo (calidad y "¡Salir al aire!")
       queda fija en todos. Partes que cambian con lo que eliges: #prepPasos (estado de cada paso), #prepCalcC (lo del paso
       que depende de la selección), #prepTabla (Resumen) y #prepPie (la barra fija). */
    const PASOS = ['personal', 'equipos', 'camaras', 'resumen'];
    if (!PASOS.includes(prep.paso)) prep.paso = 'personal';
    const paso = prep.paso;
    const pos0 = camP && Array.isArray(camP.positions) ? camP.positions.filter((p) => !p.opcional) : [];
    const cubiertas = pos0.filter((p) => p.asignado).length;
    const estPaso = {
      personal: !staff.length || (crew && crew.falta) ? 'mal' : crew && crew.justo ? 'ojo' : 'ok',
      equipos: !equip.some(isCam) ? 'mal' : equip.some(enRiesgo) || (camP && camP.bloqueados && camP.bloqueados.length) ? 'ojo' : 'ok',
      camaras: pos0.length && cubiertas < pos0.length ? (cubiertas ? 'ojo' : 'mal') : sinOp ? 'ojo' : 'ok',
      resumen: puede ? 'ok' : 'mal',
    };
    const nPaso = { personal: staff.length, equipos: equip.length, camaras: pos0.length ? `${cubiertas}/${pos0.length}` : '', resumen: '' };
    const icPaso = { personal: I('people', 'sm'), equipos: I('box', 'sm'), camaras: I('role_camarografo', 'sm'), resumen: I('star', 'sm') };
    const pasosHtml = PASOS.map((k, i) => `<button type="button" class="pp-k ${k === paso ? 'on' : ''} e-${estPaso[k]}" role="tab" aria-selected="${k === paso}" data-act="prep-paso" data-k="${k}" aria-label="${esc(T('nav2.paso_n', { n: i + 1, t: PASOS.length }) + ': ' + T('nav2.paso_' + k))}">
        <span class="pp-num">${estPaso[k] === 'ok' && k !== paso ? I('check', 'sm') : N(i + 1)}</span><span class="pp-t">${T('nav2.paso_' + k)}</span>${nPaso[k] !== '' ? `<b class="pp-n num">${typeof nPaso[k] === 'number' ? N(nPaso[k]) : nPaso[k]}</b>` : ''}</button>`).join('');
    const resumenSel = `<div class="pp-res small"><span>${T('nav2.llevas', { p: `<b class="num">${N(staff.length)}</b>`, e: `<b class="num">${N(equip.length)}</b>` })}</span>${pos0.length ? `<span>${T('nav2.posiciones', { n: `<b class="num">${N(cubiertas)}</b>`, t: N(pos0.length) })}</span>` : ''}</div>`;
    const calcDe = {
      personal: `${crewHtml ? `<div class="planev">${crewHtml}</div>` : ''}${c.internacional ? ayudaIntlHtml(c, prep.staff) : ''}`,
      equipos: bloqHtml,
      mov: window.Movilizacion ? window.Movilizacion.seccionPrep(ctxInicio(), c, [...prep.staff], [...prep.equip]) : '',
      // Lo que no se puede usar (y cómo arreglarlo) va en "Equipos"; aquí el plano, los avisos de cámaras y operadores
      camaras: `${camHtml || avisos || sinOp ? `<div class="planev">${camHtml}${avisos}${sinOp}</div>` : ''}`,
      resumen: `${resumenSel}${intlHtml}
        <div class="pronostico">${c.rival && typeof c.rivalQuality === 'number' ? (rg ? duelRango(rg, c.rivalQuality) : duelBars(q.q, c.rivalQuality)) : ''}
          ${puede ? tip : ''}
          <div class="small muted" style="margin-top:6px">${T('prep.sueldos')} <b class="num">${M(wages)}</b>${c.internacional && c.travelCost ? ` · ${T('prep.viaje', { m: `<b class="num">${M(c.travelCost)}</b>` })}` : ''}${window.Movilizacion ? window.Movilizacion.resumenPrep(S, c, [...prep.staff], [...prep.equip]) : ''} · ${rg ? T('prep.rango_det') : T('prep.imprevistos')}</div>${avisoDia}</div>`,
    };
    const tablaHtml = `${q.parts.map((p) => `<tr><td>${esc(TL(p[0]))}</td><td class="${p[1] < 0 ? 'down' : ''}">${p[1] > 0 ? '+' : ''}${p[1]}</td></tr>`).join('')}
          ${rg ? `<tr><td>${T('prep.imprevistos_esperados', { n: rg.imprevistos != null ? N(rg.imprevistos) : '?' })}</td><td class="down">${rg.esperado - q.q}</td></tr>
            <tr><td>${T('prep.peor_mejor')}</td><td>${rg.peor}–${rg.mejor}</td></tr>` : ''}`;
    const sig = PASOS[PASOS.indexOf(paso) + 1];
    const pieHtml = `<div class="row between pp-q"><span>${calidadTxt}</span><span>${starsTxt(est)}</span></div>
        ${barra}
        ${puede ? '' : tip}
        <div class="pp-acc">${sig ? `<button type="button" class="btn pp-sig" data-act="prep-paso" data-k="${sig}">${T('nav2.siguiente', { paso: T('nav2.paso_' + sig) })}</button>` : ''}
        <button class="btn main pp-aire" data-act="go-live" ${puede ? '' : 'disabled aria-describedby="goHint"'}>${I('rec', 'sm')} ${T('prep.al_aire')}</button></div>`;
    const CALC_ID = { personal: 'prepCalcP', equipos: 'prepCalcE', mov: 'prepCalcM', camaras: 'prepCalcC', resumen: 'prepCalcR' };
    if (soloCalculo && $('prepPie') && $('prepPasos') && $('prepCalcP')) {
      // Al marcar o desmarcar (o al cambiar de paso): solo se rehace lo que depende de la selección (no toda la ventana)
      $('prepPasos').innerHTML = pasosHtml;
      Object.keys(CALC_ID).forEach((k) => { const n = $(CALC_ID[k]); if (n) n.innerHTML = calcDe[k]; });
      if ($('prepTabla')) $('prepTabla').innerHTML = tablaHtml;
      $('prepPie').innerHTML = pieHtml;
      document.querySelectorAll('#modal .prep-paso').forEach((x) => { x.hidden = x.dataset.paso !== paso; });
      return;
    }
    // Todos los pasos quedan en la ventana (las casillas siempre están); solo se ve el elegido
    const staffList = S.staff.map((p) => { const w = wageFor(p, c.diff); return `<label class="pick ${prep.staff.has(p.id) ? 'sel' : ''}">
        <input type="checkbox" id="st-${p.id}" data-act="tog-staff" data-id="${p.id}" ${prep.staff.has(p.id) ? 'checked' : ''}>
        ${avatarOf(p, 44)}
        <div class="grow" style="min-width:0"><b>${esc(nmP(p))}</b><div class="small muted pkrol">${I(roleIcon(p.role), 'sm')}<span>${esc(roleName(normRole(p.role)))}</span>${tierBadge(p)}</div></div>
        <span class="num small" style="text-align:end">${M(w)}${w > p.wage ? `<br><span class="muted" style="font-size:10.5px">+${Math.round((w / p.wage - 1) * 100)}%</span>` : ''}</span></label>`; }).join('');
    // Equipos: filtro por categoría (solo pantalla: las casillas de las otras categorías siguen en la ventana)
    const catDe = (e) => (G.CATALOG[e.type] || {}).cat || 'otro';
    const cats = categorias().filter((k) => S.equip.some((e) => catDe(e) === k.key));
    const f = prep.cat && cats.some((k) => k.key === prep.cat) ? prep.cat : 'todo';
    const chips = cats.length > 1 ? `<div class="catrow fchips" role="group" aria-label="${esc(T('nav2.cats_eq'))}">${[{ key: 'todo', nombre: T('nav2.todos'), icon: '' }].concat(cats).map((k) => {
      const n = k.key === 'todo' ? S.equip.length : S.equip.filter((e) => catDe(e) === k.key).length;
      return `<button type="button" class="catchip ${k.key === f ? 'on' : ''}" aria-pressed="${k.key === f}" data-act="prep-cat" data-k="${esc(k.key)}">${k.icon ? I(k.icon, 'sm') : ''}<span>${esc(k.key === 'todo' ? k.nombre : TL(k.nombre || k.name || k.key))}</span><b>${N(n)}</b></button>`; }).join('')}</div>` : '';
    const equipList = S.equip.map((e) => {
      const it = G.CATALOG[e.type] || { name: e.type };
      return `<label class="pick ${prep.equip.has(e.id) ? 'sel' : ''}" data-cat="${esc(catDe(e))}" ${f !== 'todo' && catDe(e) !== f ? 'hidden' : ''}>
        <input type="checkbox" id="eq-${e.id}" data-act="tog-equip" data-id="${e.id}" ${prep.equip.has(e.id) ? 'checked' : ''}>
        ${itemArt(e.type, 44, 'mini')}
        <div class="grow" style="min-width:0"><b>${esc(nmE(e))}</b> ${rtag(e.type)}${it.alquiler ? ` <span class="rent">${T('bodega.alquiler')}</span>` : ''}${infoBtn(e.type)}${usoHtml(e.type, 'pkuso')}${it.alquiler ? '' : condBar(e.condition) + prepDano(e)}</div>
        <span class="num small ${e.condition < 40 ? 'neg' : 'muted'}">${it.alquiler ? '' : e.condition + '%'}</span></label>`;
    }).join('');
    const auto = `<button class="btn sm pp-auto" data-act="auto">${I('sparkle', 'sm')}${T('prep.auto')}</button>`;
    const panel = (k, html) => `<div class="prep-paso" data-paso="${k}" ${k === paso ? '' : 'hidden'}>${html}</div>`;
    const pos = $('modal').scrollTop;
    const mismo = !!$('prepPasos');
    openModal(`<div class="prep-top">
      <div class="row between"><div class="row" style="min-width:0">${tile(c.type, TILE_COLOR[c.type] || (c.internacional ? 'blue' : ''))}<div class="grow"><h2>${esc(eventName(c.type))}</h2>
        <div class="small muted pp-cli">${esc(TL(c.client))} · ${T('prep.paga', { m: `<span class="pay" style="font-size:15px">${M(c.pay)}</span>` })}</div></div></div><button class="btn sm" data-act="close" aria-label="${esc(T('comun.cerrar'))}">${I('close', 'sm')}</button></div>
      <div class="pp-pasos" id="prepPasos" role="tablist" aria-label="${esc(T('nav2.secciones'))}">${pasosHtml}</div></div>
      ${panel('personal', `<div class="pp-req">${reqTags(c)}</div>${auto}<div id="prepCalcP">${calcDe.personal}</div><div class="sectitle">${T('prep.quien')}</div>${staffList}`)}
      ${panel('equipos', `${auto}<div id="prepCalcE">${calcDe.equipos}</div><div class="sectitle">${T('prep.que_equipos')}</div>${chips}${equipList}
        <p class="small muted">${T('prep.repuestos', { cables: T('prep.cables', { n: S.stock.cable || 0 }), baterias: T('prep.baterias', { n: S.stock.battery || 0 }) })}</p><div id="prepCalcM">${calcDe.mov}</div>`)}
      ${panel('camaras', `<div id="prepCalcC">${calcDe.camaras}</div>`)}
      ${panel('resumen', `<div id="prepCalcR">${calcDe.resumen}</div><div class="sectitle">${T('nav2.calidad')}</div><table id="prepTabla" class="pp-tabla">${tablaHtml}</table>`)}
      <div class="preview prep-pie" id="prepPie">${pieHtml}</div>`);
    $('modal').scrollTop = mismo ? pos : 0;
  }
  // "Elegir lo mejor": se marcan las casillas y se rehace solo el cálculo
  function marcarSeleccion() {
    document.querySelectorAll('#modal input[data-act="tog-staff"], #modal input[data-act="tog-equip"]').forEach((x) => {
      const set = x.dataset.act === 'tog-staff' ? prep.staff : prep.equip;
      x.checked = set.has(Number(x.dataset.id));
      const l = x.closest('.pick'); if (l) l.classList.toggle('sel', x.checked);
    });
  }

  /* ---------- Evento en vivo ---------- */
  // Sirve para la partida (S) y para los eventos en línea de la liga y el festival (VI: un estado aparte)
  function liveCams() {
    const s = evS(), ev = s.currentEvent;
    return ev ? s.equip.filter((e) => ev.equipIds.includes(e.id) && G.CATALOG[e.type] && G.CATALOG[e.type].cat === 'cam').length : 1;
  }
  function liveGear() {
    const s = evS(), ev = s.currentEvent;
    return ev ? s.equip.filter((e) => ev.equipIds.includes(e.id)).map((e) => e.type) : [];
  }
  function liveScene(type, key) {
    const ev = evS().currentEvent;
    const c = ev ? ev.contract : null;
    return A.scene(type, key, liveCams(), false, liveGear(), { client: c ? c.client : '', seed: c ? c.id : 0 });
  }
  // Franja animada de arriba (js/escena.js, opcional): el lugar, el público, los camarógrafos y el monitor de programa
  const escena = (c, e) => { try { return window.Escena ? window.Escena.html(c, e) : ''; } catch (err) { return ''; } };
  function incKey() {
    const ev = evS().currentEvent;
    return ev && ev.incidents[ev.step] ? ev.incidents[ev.step].key : null;
  }
  const viTag = () => (VI ? `<span class="tag ${VI.modo === 'festival' || VI.modo === 'copa' ? 'amber' : ''}" style="margin:0">${I(VI.modo === 'festival' ? 'festival' : VI.modo === 'copa' ? 'crown' : 'shield')}${VI.modo === 'copa' ? (window.Copas ? window.Copas.T('titulo') : 'Copa de Servidores') : T(VI.modo === 'festival' ? 'online.festival' : 'online.liga')}</span>` : '');

  function showIncident() {
    const s = evS();
    const inc = G.currentIncident(s);
    if (!inc) { finish(); return; }
    const c = s.currentEvent.contract;
    const key = incKey();
    const bueno = key === 'epico' || inc.positive === true || inc.bueno === true;   // un momento bueno, no un problema
    snd.play('incident');
    setTimeout(() => snd.play(key), 250);
    if (!esFuneral(c.type)) {
      if (!bueno && INC_GRAVE.test(key || '')) mus.go('tension');
      else mus.stinger();
    }
    // Si el imprevisto es de un puesto que llevaste incompleto, se avisa (pega más fuerte)
    const rolInc = inc.rol && (inc.estadoRol === 'falta' || inc.estadoRol === 'justo')
      ? `<div class="rolwarn ${inc.estadoRol}">${I(roleIcon(inc.rol), 'sm')}<span>${T(inc.estadoRol === 'falta' ? 'vivo.rol_falta' : 'vivo.rol_justo', { rol: esc(roleName(normRole(inc.rol))) })}</span></div>` : '';
    openModal(`
      ${escena(c, { fase: bueno ? 'momento' : 'imprevisto', clave: key, nombre: eventName(c.type) })}
      ${liveScene(c.type, key)}
      <div class="row between" style="margin-top:10px"><span class="row" style="gap:6px"><span class="live"><i></i>${T('vivo.en_vivo')}</span>${viTag()}</span><span class="small muted">${bueno ? T('vivo.momento', { i: inc.n, total: inc.total }) : T('vivo.imprevisto', { i: inc.n, total: inc.total })}</span></div>
      <div class="small muted" style="margin-top:8px">${esc(eventName(c.type))} · ${esc(TL(c.client))}</div>
      <div class="incident">${esc(noEmoji(gtx(inc, inc.text)))}</div>
      ${rolInc}
      ${inc.choices.map((ch) => `<button class="btn choice" data-act="choose" data-i="${ch.i}" ${ch.ok ? '' : 'disabled'}>
        ${esc(gtx(ch, ch.label))}${ch.ok ? '' : `<small>${T('vivo.no_disponible', { why: esc(ch.whyK ? gtx({ k: ch.whyK, p: ch.whyP }, ch.why) : TL(ch.why)) })}</small>`}</button>`).join('')}
      ${VI ? `<button class="btn sm vi-salir" data-act="vi-salir">${T('online.dejar')}</button>` : ''}`);
  }

  function choose(i) {
    const key = incKey();
    let r;
    if (VI) {
      r = window.EnVivoVivo.elegir(VI.v, i);
      if (r && r.ok) VI.incidentes.push({ clave: key, q: r.q });
    } else { const c0 = condsEvento(); r = G.resolveIncident(S, i); if (r && r.ok) danosImprevisto(c0, key); }
    if (!r || !r.ok) { toast(TL((r && r.msg) || '')); snd.play('error'); return; }
    if (!VI) save();
    snd.play(r.q >= 0 ? 'good' : 'bad');
    const cls = r.q > 0 ? 'up' : r.q < 0 ? 'down' : '';
    const s = evS();
    const more = G.currentIncident(s);
    const c = s.currentEvent.contract;
    if (r.q >= 0 && mus.actual() === 'tension' && !esFuneral(c.type)) mus.go(temaDeEvento(c.type));
    openModal(`
      ${escena(c, { fase: r.q > 0 ? 'bien' : r.q < 0 ? 'mal' : '', clave: key, nombre: eventName(c.type) })}
      ${liveScene(c.type, r.q > 4 ? 'epico' : key === 'luz' && r.q < -10 ? 'luz' : null)}
      <div class="row" style="margin-top:10px;gap:6px"><span class="live"><i></i>${T('vivo.en_vivo')}</span>${viTag()}</div>
      <div class="incident">${esc(gtx(r, r.msg))}</div>
      <p>${T('vivo.calidad')} <span class="delta ${cls}">${r.q > 0 ? '+' : ''}${r.q}</span></p>
      <button class="btn main" data-act="${more ? 'next-inc' : 'finish'}">${more ? T('comun.continuar') : T('vivo.terminar')}</button>`);
  }

  function finish() {
    if (VI) { terminarIntento(); return; }
    const dia = S.day;
    const caja0 = dia0 && dia0.day === dia && typeof dia0.money === 'number' ? dia0.money : null;
    const ty = S.currentEvent && S.currentEvent.contract ? S.currentEvent.contract.type : '';
    const evEq = S.currentEvent ? { ids: S.currentEvent.equipIds.slice(), cid: S.currentEvent.contract.id } : null;
    const f = G.finishEvent(S);
    save();
    snd.amb(null);
    if (!f.ok) { toast(TL(f.msg)); closeModal(); render(); return; }
    const r = f.result;
    if (r.dia && r.dia.cerrado) diaCerrado = true;
    AN('evento_terminado', { tipo: ty, estrellas: r.stars, capitulo: S.chapter, dia: S.day });
    const caja = caja0 === null ? null : S.money - caja0;   // cuánto cambió la caja desde que empezó el día
    // Si se recarga en esta pantalla, el resultado se vuelve a mostrar (QA-09)
    try { resDanos = evEq ? danosFin(evEq.ids, evEq.cid) : null; } catch (e) { resDanos = null; }
    lsSet(RES_KEY, { r, ev: S.stats.events, caja, ty, danos: resDanos });
    showResult(r, caja, true, ty);
    cabecera();   // la fama y el dinero de arriba ya son los del resultado (antes cambiaban recién al cerrarlo)
  }

  /* ---------- Avisos del día (renuncias, pagos, la rival, cancelaciones…) ---------- */
  const AV_ICON = { pago: ['money', 'g'], fama: ['trend_down', 'a'], vencidas: ['clock', 'm'], cancelacion: ['x_circle', 'r'], internacional: ['globe', 'b'],
    rival: ['rival', 'r'], animo: ['sad', 'a'], renuncia: ['user_x', 'r'], sueldo: ['money', 'a'], quiebra: ['bolt', 'r'], quiebra_aviso: ['bolt', 'r'], capitulo: ['star', 'a'] };
  const avisosPend = () => (S && Array.isArray(S.avisos) ? S.avisos.filter((a) => a && a.tipo !== 'capitulo') : []);
  function tomarAvisos() { try { if (G.takeAvisos) G.takeAvisos(S); else S.avisos = []; } catch (e) { S.avisos = []; } save(); }
  // Una tarjeta por día con sus avisos
  function avisosHtml(lista) {
    const dias = [];
    lista.forEach((a) => { let d = dias.find((x) => x.day === a.day); if (!d) { d = { day: a.day, items: [] }; dias.push(d); } d.items.push(a); });
    return dias.map((d) => `<div class="daycard">${dias.length > 1 ? `<div class="dh">${T('comun.dia_n', { n: d.day })}</div>` : ''}
      ${d.items.map((a) => { const ic = AV_ICON[a.tipo] || ['tip', 'm']; return `<div class="av av-${ic[1]}"><span class="avi">${I(ic[0], 'sm')}</span><span class="t">${esc(noEmoji(gtx(a, a.text)))}</span></div>`; }).join('')}</div>`).join('');
  }
  // Resumen del día que se cerró en esta sesión (G.takeResumenDia). Uno que quedó en la partida de antes no se muestra.
  const resDiaPend = () => !!(diaCerrado && S && S.resumenDia && typeof S.resumenDia === 'object');
  function tomarResDia() {
    const ok = resDiaPend();
    diaCerrado = false;
    let R = null;
    try { R = G.takeResumenDia ? G.takeResumenDia(S) : null; } catch (e) { R = null; }
    if (S && S.resumenDia) S.resumenDia = null;
    return ok ? R : null;
  }
  // El bloque del día cerrado: eventos, lo que dejaron, los gastos fijos y el resultado del día (corto)
  function resDiaHtml(R) {
    const sgn = (v) => (v >= 0 ? '+' : '-') + M(Math.abs(v));
    const dias = R.dias || 1;
    const lista = (Array.isArray(R.lista) ? R.lista : []).map((x) => `<div class="row between small"><span>${esc((G.EVENT_TYPES[x.t] || {}).icon || '')} ${esc(eventName(x.t))} <span style="color:var(--amber)">${'★'.repeat(Math.max(0, Math.min(5, x.e || 0)))}</span></span><span class="num ${x.g >= 0 ? 'up' : 'down'}">${sgn(x.g)}</span></div>`).join('');
    const consejo = R.eventos === 0 ? `<p class="small muted" style="margin:6px 0 0">${T('dia.descanso')}</p>`
      : R.resultado >= 0 ? `<p class="small up" style="margin:6px 0 0">${T('dia.bien')}</p>`
      : R.eventos < 3 && dias === 1 ? `<p class="small muted" style="margin:6px 0 0">${T('dia.consejo_otro', { n: R.eventos + 1, m: M(Math.round(R.gastos / (R.eventos + 1))) })}</p>` : '';
    return `<div class="resdia" id="resDia">
      ${R.eventos ? `<div class="small muted" style="margin:4px 0 2px">${T('dia.lista')} · ${T('dia.eventos_hoy', { n: R.eventos })}</div>${lista}` : ''}
      <table style="margin-top:8px">
        ${R.eventos ? `<tr><td>${T('dia.ganancia_eventos')}</td><td class="${R.ganancia >= 0 ? 'up' : 'down'}">${sgn(R.ganancia)}</td></tr>` : ''}
        <tr><td>${dias > 1 ? T('dia.fijos_viaje', { n: dias }) : T('dia.fijos')}${AY('gastos')}</td><td class="down">-${M(R.gastos)}</td></tr>
        <tr><td><b>${T('dia.resultado')}</b></td><td class="${R.resultado >= 0 ? 'up' : 'down'}"><b>${sgn(R.resultado)}</b></td></tr>
      </table>${consejo}</div>`;
  }
  function showResumenDia() {
    const R = tomarResDia();
    const lista = avisosPend();
    if (!R && !lista.length) { tomarAvisos(); continuar(); return; }
    // Al abrir el juego (no pasó ningún día) solo llegaron avisos de la temporada: un aviso corto en vez de la ventana
    // "Resumen del día" (la oferta ya está en Clientes y la temporada tiene su tarjeta en Inicio)
    if (!R && !diaAntes && lista.every((a) => a.tipo === 'temporada')) { toast(noEmoji(gtx(lista[0], lista[0].text))); tomarAvisos(); continuar(); return; }
    // Día sin eventos y sin avisos: basta un aviso corto (sin ventana que cerrar)
    if (R && !R.eventos && !lista.length) { diaAntes = null; toast(T('dia.cerrado_toast', { n: S.day, m: M(R.gastos) })); continuar(); return; }
    const dia = R ? R.dia : lista[lista.length - 1].day;
    const malo = lista.some((a) => /renuncia|rival|cancelacion|quiebra/.test(a.tipo)) || (R && R.eventos && R.resultado < 0);
    snd.play(malo ? 'bad' : 'good');
    const caja = !R && diaAntes && typeof diaAntes.money === 'number' ? S.money - diaAntes.money : null;
    diaAntes = null;
    openModal(`<div class="story-tag">${T('dia.resumen')}</div><h2>${T('comun.dia_n', { n: dia })}</h2>
      ${R ? resDiaHtml(R) : ''}
      ${caja !== null ? `<div class="row between small" style="margin:2px 0 0"><span class="muted">${T('dia.caja')}</span><b class="num ${caja >= 0 ? 'up' : 'down'}">${caja >= 0 ? '+' : '-'}${M(Math.abs(caja))}</b></div>
        <div class="small muted" style="margin-bottom:8px">${T('dia.gastos', { m: M(G.dailyCost ? G.dailyCost(S) : 0) })}</div>` : ''}
      ${lista.length ? `${R ? `<div class="sectitle">${T('dia.mientras')}</div>` : ''}${avisosHtml(lista)}` : ''}
      <button class="btn main" data-act="close-dia">${T('comun.continuar')}</button>`);
  }
  // Qué ventana toca después: el evento en curso, el resumen del día, los capítulos completados y la intro del capítulo
  const capPend = () => (S && Array.isArray(S.capCompletados) ? S.capCompletados : []);
  function continuar() {
    if (VI || !S) return;
    if ($('overlay').classList.contains('on')) return;
    if (S.currentEvent) { showIncident(); return; }
    // Partida nueva: primero la intro del capítulo 1 y después el resumen del día (p. ej. "empezó la temporada")
    if (!capPend().length && !S.chapterSeen && !(S.stats && S.stats.events) && showChapterIntro()) return;
    if (avisosPend().length || resDiaPend()) { showResumenDia(); return; }
    if (capPend().length) { showChapterDone(capPend()[0], true); return; }
    if (showChapterIntro()) return;
    if (S.gameOver) showGameOver();
  }

  // Líneas que agregan las extensiones al resultado (result.extras = [{ icon, k, p }])
  function extrasRes(r) {
    if (!r || !Array.isArray(r.extras) || !r.extras.length) return '';
    return r.extras.map((x) => `<div class="paylater ext">${I((x && x.icon) || 'star', 'sm')} ${esc(gtx(x, x && x.text))}</div>`).join('');
  }
  // Fama del resultado: lo que sumó o restó el evento y con cuánta quedas de verdad ("+10 → ahora 23"), la misma de arriba
  function famaTxt(r) {
    const d = (r.repDelta >= 0 ? '+' : '') + r.repDelta;
    return typeof r.fama === 'number' && isFinite(r.fama) ? T('res.fama_ahora', { delta: d, n: `<b class="num">${Math.floor(r.fama)}</b>` }) : d;
  }
  function showResult(r, caja, fresh, ty0) {
    // Con la lógica nueva los capítulos esperan en S.capCompletados; con una vieja, en r.chapterDone
    afterResult = !Array.isArray(S.capCompletados) && r.chapterDone ? r.chapterDone : null;
    if (fresh) snd.play('stars', r.stars);
    const ty = r.type || r.contractType || ty0 || '';
    if (esFuneral(ty)) mus.go('funeral');
    else if (r.stars >= 4) { mus.go('menu'); mus.go('victoria'); }
    else mus.go('menu');
    const duel = r.duel && typeof r.rivalQuality === 'number'
      ? `<div class="duel ${r.duel === 'won' ? 'won' : ''}" style="margin-top:10px">
          <div class="row between"><span class="res ${r.duel === 'won' ? 'up' : 'down'}">${I('rival', 'sm')} ${r.duel === 'won' ? T('res.duelo_ganado') : T('res.duelo_perdido')}</span><span class="small muted">${r.duel === 'won' ? T('res.fama_extra') : T('res.perdiste_fama')}</span></div>
          <div class="lbl"><span>${T('duelo.tu_calidad')}</span><b class="num">${r.quality}</b></div><div class="bar you"><i style="width:${r.quality}%"></i></div>
          <div class="lbl"><span>MegaVisión</span><b class="num">${r.rivalQuality}</b></div><div class="bar mega"><i style="width:${r.rivalQuality}%"></i></div></div>`
      : r.duel === 'won' ? `<p class="small up">${I('rival', 'sm')} ${T('res.ganaste_duelo')}</p>` : r.duel === 'lost' ? `<p class="small down">${I('rival', 'sm')} ${T('res.perdiste_duelo')}</p>` : '';
    const later = r.payLater > 0 ? `<div class="paylater">${I('clock', 'sm')} ${T('res.pago_luego', { ahora: M(r.payNow), luego: M(r.payLater), n: r.payLaterDays })}</div>` : '';
    // Contrato internacional: viaje y riesgo de fama
    const intl = r.internacional ? `<div class="paylater intl ${r.intlFail ? 'mal' : ''}">${I(r.intlFail ? 'bolt' : 'globe', 'sm')} ${r.intlFail ? T('res.intl_mal') : T('res.intl_ok')}${r.travelDays ? ` · ${T('res.viaje_dias', { n: r.travelDays })}` : ''}</div>` : '';
    // Lo que dejó el evento: pago - sueldos - viaje - gastos fijos del día (QA4). Lo que cambió la caja desde la mañana
    // (incluye compras, cobros que llegaron y la parte que se paga después) va aparte, solo si es distinto.
    const gastoDia = G.dailyCost && typeof r.dailyCost === 'number' ? r.dailyCost : null;
    // Varios eventos por día (r.dia): lo grande es lo que dejó el evento; los gastos fijos del día van aparte, con la parte
    // que le toca a este evento (repartidos entre los eventos de hoy). Con una lógica vieja: como antes (todo el día en el evento).
    const dd = r.dia && typeof r.dia.parte === 'number' ? r.dia : null;
    // De qué son los gastos del día: local, personal y seguro de equipos (solo si cuadra con lo cobrado)
    const gastoDesg = (() => {
      try {
        const meta = dd ? ((dd.dias || 1) > 1 ? null : dd.gastos) : gastoDia;
        const b = meta !== null && G.dailyCostBreakdown ? G.dailyCostBreakdown(S) : null;
        if (!b || b.total !== meta) return '';
        const pers = (b.staff || 0) + (b.payroll || 0);
        return [T('inicio.local', { m: M(b.rent) }), pers ? T('inicio.c_personal', { m: M(pers) }) : '', b.equip ? T('inicio.c_seguro', { m: M(b.equip) }) : '', b.fijoExt && window.Decoracion ? window.Decoracion.t('c_decor', { m: M(b.fijoExt) }) : '', b.vehiculos && window.Movilizacion ? window.Movilizacion.t('gasto', { m: M(b.vehiculos) }) : ''].filter(Boolean).join(' · ');
      } catch (e) { return ''; }
    })();
    const neto = dd ? r.net : r.net - (gastoDia || 0);
    const sgn = (v) => (v > 0 ? '+' : '') + M(v);
    const quebro = !!S.gameOver;
    const bk = quebro ? null : bkInfo();
    const tono = neto >= 0 && !quebro ? 'up' : 'down';
    const filaCaja = typeof caja === 'number' && caja !== neto
      ? `<tr class="caja"><td>${T('res.caja_hoy')}</td><td class="${caja >= 0 ? 'up' : 'down'}">${sgn(caja)}</td></tr>` : '';
    const alerta = quebro ? `<div class="redstrip" role="alert" style="margin-top:10px">${I('bolt', 'sm')}<span>${T('res.quebraste')}</span></div>`
      : bk && bk.enPeligro ? `<div class="redstrip" role="alert" style="margin-top:10px">${I('bolt', 'sm')}<span>${T('res.peligro', { m: `<b class="num">${M(bankruptAt())}</b>`, n: bk.graceLeft })}</span></div>` : '';
    const riesgo = PE ? PE.resumenRiesgo(r.crewPlan || (r.crew && r.crew.plan), { camaras: r.cameraPlan, tipo: ty, nombreEquipo: eqName }) : '';
    // Lo que pasó mientras tanto (si el evento cerró el día): pagos, renuncias, la rival…
    const mientras = fresh || avisosPend().length ? avisosPend() : [];
    openModal(`
      <div class="result-head"><div class="story-tag">${r.stars >= 4 ? T('res.impecable') : r.stars === 3 ? T('res.buen_trabajo') : T('res.terminada')}</div>
      <h2>${esc(noEmoji(TL(r.title)))}</h2></div>
      ${starsBig(r.stars)}
      <div class="bigmoney ${tono} num" id="resNet">${fresh ? (neto >= 0 ? '+' : '-') + M(0) : (neto >= 0 ? '+' : '-') + M(Math.abs(neto))}</div>
      <div class="small muted" style="text-align:center">${gastoDia !== null && !dd ? T('res.neto_evento') : T('res.ganancia_evento')}</div>
      ${alerta}
      <div class="row between" style="margin-top:12px"><span>${T('res.calidad_final')}${AY('calidad')}</span><b class="num">${r.quality}/100</b></div>
      <div class="bar ${r.quality < 40 ? 'red' : r.quality < 55 ? 'amber' : ''}"><i style="width:${r.quality}%"></i></div>
      ${duel}
      ${intl}
      ${extrasRes(r)}
      ${danosResHtml()}
      ${riesgo}
      <table style="margin-top:12px">
        <tr><td>${T('res.pago_cliente')}</td><td class="up">+${M(r.pay)}</td></tr>
        <tr><td>${T('res.sueldos')}</td><td class="down">-${M(r.wages)}</td></tr>
        ${r.travelCost ? `<tr><td>${T('res.viaje')}</td><td class="down">-${M(r.travelCost)}</td></tr>` : ''}
        ${window.Movilizacion ? window.Movilizacion.filaResultado(r, M) : ''}
        ${gastoDia !== null && !dd ? `<tr><td>${T('res.gastos_dia')}${AY('gastos')}${gastoDesg ? `<div class="small muted" style="font-size:11.5px">${gastoDesg}</div>` : ''}</td><td class="down">-${M(gastoDia)}</td></tr>` : ''}
        <tr><td><b>${T('res.ganancia')}</b>${AY('ganancia')}</td><td class="${tono}"><b>${M(neto)}</b></td></tr>
        ${filaCaja}
        <tr id="resFama"><td>${T('head.fama')}${AY('fama')}</td><td class="${r.repDelta >= 0 ? 'up' : 'down'}">${famaTxt(r)}</td></tr>
      </table>
      ${dd ? fijosRes(r, dd, gastoDesg, sgn) : ''}
      ${later}
      ${(r.ups || []).length ? `<p class="small">${I('trend', 'sm')} ${r.ups.map((u) => esc(typeof u === 'string' ? TL(u) : gtx(u, u.text))).join(' · ')}</p>` : ''}
      ${mientras.length ? `<div class="sectitle">${T('dia.mientras')}</div>${avisosHtml(mientras)}` : ''}
      <details><summary>${T('res.ver_detalle')}</summary>
        <p class="small"><b>${T('res.calidad_inicial', { n: r.base })}</b></p>
        ${(r.incidents || []).map((i) => { const x = i.result || {}; return `<p class="small">${esc(noEmoji(gtx(i, i.text)))}<br><span class="muted">→ ${esc(gtx(x, x.msg || ''))} (${x.q > 0 ? '+' : ''}${x.q || 0})</span></p>`; }).join('')}
      </details>
      <p class="small muted">${T(dd ? 'res.desgaste_ev' : 'res.desgaste')}</p>
      ${window.Compartir ? window.Compartir.resultado(r, fresh, ctxInicio()) : ''}
      <button class="btn main" data-act="after-result">${T('comun.continuar')}</button>`);
    if (!fresh) return;
    countUp($('resNet'), neto, 1000);
    if (quebro) return;
    if (r.stars >= 4) confetti(r.stars === 5 ? 28 : 20);
    else if (r.stars === 3) confetti(10);
  }

  /* Gastos fijos del día en el resultado (varios eventos por día): cuánto son, cuándo se cobran y la parte de este evento.
     Antes del cierre: "se cobran al cerrar el día; repartidos entre los N eventos de hoy, a este le tocan $Y" y cuánto
     bajaría con un evento más. Si el evento cerró el día: lo que se cobró (con los días de viaje de un internacional). */
  function fijosRes(r, d, desg, sgn) {
    const resto = r.net - d.parte;
    const dias = d.dias || 1;
    const linea = !d.cerrado ? T('res.fijos_luego', { n: d.n, m: M(d.parte) })
      : dias > 1 ? T('res.fijos_cobrados_viaje', { d: dias, m: M(d.gastos) }) : T('res.fijos_cobrados', { n: d.n, m: M(d.parte) });
    return `<div class="paylater fijos-dia" id="resFijos">${I('home', 'sm')} <div class="grow">
      <b>${dias > 1 ? T('dia.fijos_viaje', { n: dias }) + ': ' + M(d.gastos) : T('res.fijos', { m: M(d.gastos) })}</b>${AY('gastos')}
      ${desg ? `<div class="small muted" style="font-size:11.5px">${desg}</div>` : ''}
      <div class="small" style="margin-top:3px">${linea}</div>
      ${!d.cerrado && typeof d.conOtro === 'number' && d.conOtro < d.parte ? `<div class="small up" id="resFijosOtro">${T('res.fijos_otro', { m: M(d.conOtro) })}</div>` : ''}
      <div class="row between small" style="margin-top:4px"><span class="muted">${T('res.con_parte')}</span><b class="num ${resto >= 0 ? 'up' : 'down'}">${sgn(resto)}</b></div>
    </div></div>`;
  }

  let capDeCola = false;   // el capítulo que se ve salió de S.capCompletados (se quita al cerrar)
  function showChapterDone(d, deCola) {
    capDeCola = !!deCola;
    const idx = typeof d.chapter === 'number' ? d.chapter : Math.max(0, G.CHAPTERS.findIndex((c) => c.title === d.title));
    const ch = G.CHAPTERS[idx] || {};
    AN('capitulo_completado', { capitulo: idx });
    // Título y texto en el idioma actual (si la lógica ya los traduce); si no, los que se guardaron
    const titulo = ch.title && typeof d.chapter === 'number' ? ch.title : d.title;
    const texto = ch.done && typeof d.chapter === 'number' ? ch.done : d.text;
    snd.play('chapter');
    mus.go('victoria');
    openModal(`<div class="story-tag">${T('historia.cap_completado')}</div><h2>${esc(TL(titulo))}</h2>
      ${speaker(charOf(idx), esc(TL(texto)))}
      <p>${T('historia.premio')} <span class="pay">${M(d.reward)}</span></p>
      <button class="btn main" data-act="close-story">${T('historia.vamos')}</button>`);
    if (!reduceMotion()) confetti(24);
  }

  /* ---------- Eventos en línea (liga y festival): se juegan en un estado aparte con la semilla del servidor ---------- */
  // Devuelve { decisiones, resultado: { quality, stars, duel, incidentes: [{ clave, q }] } } o null si lo deja para después.
  async function jugarIntento(intento, modo) {
    const V = window.EnVivoVivo;
    if (!V || !intento) { toast(T('online.sin_motor')); return null; }
    if (VI || (S && S.currentEvent)) { toast(T('online.ocupado')); return null; }
    try { await V.asegurar(); } catch (e) { toast(TL(e.message)); return null; }
    let v;
    try { v = V.crear(G, intento); } catch (e) { toast(TL(e.message)); snd.play('error'); return null; }
    return new Promise((resolver) => {
      VI = { v, resolver, incidentes: [], modo: modo || 'liga' };
      const ty = v.contrato.type;
      snd.play('live');
      mus.go(esFuneral(ty) ? 'funeral' : temaDeEvento(ty));
      showIncident();
    });
  }
  function terminarIntento() {
    const vi = VI;
    let out;
    try { out = window.EnVivoVivo.terminar(vi.v); } catch (e) { toast(TL(e.message)); return; }
    const r = vi.v.resultado || {};
    out.resultado.duel = r.duel || null;
    out.resultado.incidentes = vi.incidentes.slice();
    vi.salida = out;
    snd.play('stars', r.stars);
    mus.go(r.stars >= 4 ? 'victoria' : 'menu');
    openModal(`<div class="result-head"><div class="story-tag">${viTag()}</div><h2>${T('online.turno_listo')}</h2></div>
      ${starsBig(r.stars || 1)}
      <div class="row between" style="margin-top:12px"><span>${T('res.calidad_final')}${AY('calidad')}</span><b class="num">${r.quality}/100</b></div>
      <div class="bar ${r.quality < 40 ? 'red' : r.quality < 55 ? 'amber' : ''}"><i style="width:${r.quality}%"></i></div>
      <p class="small muted">${T('online.servidor_confirma')}</p>
      <button class="btn main" data-act="vi-enviar">${I('cloud', 'sm')} ${T('online.enviar')}</button>`);
    if (r.stars >= 4) confetti(20);
  }
  function cerrarIntento(conResultado) {
    const vi = VI;
    if (!vi) return;
    VI = null;
    closeModal(); mus.go('menu'); render();
    vi.resolver(conResultado ? vi.salida : null);
  }

  function showChapterIntro() {
    if (S.storyDone || S.chapterSeen === S.chapter) return false;
    const ch = G.CHAPTERS[S.chapter];
    S.chapterSeen = S.chapter;
    save();
    openModal(`<div class="story-tag">${T('historia.nuevo_cap')}</div><h2>${esc(TL(ch.title))}</h2>
      ${speaker(charOf(S.chapter), esc(TL(ch.intro)))}
      <p><b>${T('historia.objetivo')}</b> ${esc(TL(ch.goal))}</p>
      <button class="btn main" data-act="close">${T('historia.entendido')}</button>`);
    return true;
  }

  // Consejo de Don Ramiro según cómo quebraste (no el mismo para todos)
  function consejoQuiebra() {
    const ev = (S.stats && S.stats.events) || 0;
    const rs = Array.isArray(S.recentStars) ? S.recentStars : [];
    const prom = rs.length ? rs.reduce((a, b) => a + b, 0) / rs.length : 3;
    const lr = S.lastResult || {};
    const difUlt = (G.EVENT_TYPES[lr.type] || {}).diff || 0;
    let dc = 0;
    try { dc = G.dailyCost(S); } catch (e) { dc = 0; }
    if (ev < 15) return T('fin.tip.temprano');
    if (lr.stars && lr.stars <= 2 && difUlt >= 3) return T('fin.tip.grande');
    if (prom < 2.3) return T('fin.tip.calidad');
    if (dc >= 90) return T('fin.tip.gastos', { m: M(dc) });
    return T('fin.tip.temprano');
  }
  function showGameOver() {
    mus.go('tension');
    openModal(`<h2>${T('fin.titulo')}</h2>
      ${speaker('ramiro', T('fin.texto', { m: M(-bankruptAt()), dia: S.day, eventos: T('inicio.eventos', { n: S.stats.events }) }) + ' ' + consejoQuiebra())}
      <button class="btn main" data-act="restart">${T('fin.reiniciar')}</button>`);
  }

  /* ---------- En línea: Liga Semanal, Mega Festival, Duelo de Productoras y Desafío del Día ---------- */
  let vistaOnline = 'hub';
  let montado = null;   // módulo que está pintado en la pestaña (para no volver a pedirlo en cada render)
  const MODOS = [
    { k: 'liga', mod: 'Liga', icon: 'shield', tono: 'blue' },
    { k: 'festival', mod: 'Festival', icon: 'festival', tono: 'amber' },
    { k: 'duelos', mod: 'Duelos', icon: 'rival', tono: 'red' },
    { k: 'desafio', mod: 'Desafio', icon: 'target', tono: 'green' },
    { k: 'copa', mod: 'Copas', icon: 'crown', tono: 'red' },
  ];
  // Personal estrella y Pase de Copa (js/estrellas.js, server/INTEGRAR_ESTRELLAS.md): solo si el módulo se puede pintar
  const MODO_ESTRELLAS = { k: 'estrellas', mod: 'Estrellas', icon: 'star', tono: 'amber' };
  const hayEstrellas = () => { try { return !!(window.Estrellas && typeof window.Estrellas.render === 'function'); } catch (e) { return false; } };
  const modos = () => (hayEstrellas() ? MODOS.concat([MODO_ESTRELLAS]) : MODOS);
  const enLinea = () => Api.disponible === true && Api.logueado();
  function avisosOnline() {
    try {
      if (!enLinea()) return 0;
      const E = Api.estado || {};
      return (Number(E.duelos && E.duelos.defensas_nuevas) || 0) + (E.desafio && E.desafio.jugado_hoy === false && Number(E.desafio.restantes) > 0 ? 1 : 0);
    } catch (e) { return 0; }
  }
  function desmontarOnline() {
    try { if (montado === 'festival' && window.Festival && window.Festival.detener) window.Festival.detener(); } catch (e) { /* nada */ }
    try { if (montado === 'copa' && window.Copas && window.Copas.detener) window.Copas.detener(); } catch (e) { /* nada */ }
    try { if (montado === 'estrellas' && window.Estrellas && window.Estrellas.detener) window.Estrellas.detener(); } catch (e) { /* nada */ }
    montado = null;
  }
  function invalidarOnline() {
    ['Liga', 'Duelos', 'Desafio', 'Copas', 'Estrellas', 'Pase', 'Vip'].forEach((m) => { try { if (window[m] && window[m].invalidar) window[m].invalidar(); } catch (e) { /* nada */ } });
    desmontarOnline();
  }
  function estadoModo(k) {
    const E = (Api.estado || {});
    try {
      if (k === 'duelos' && E.duelos) return `${E.duelos.liga ? esc(TL(E.duelos.liga)) + ' · ' : ''}${T('online.duelos_hoy', { n: Number(E.duelos.restantes) || 0 })}`;
      if (k === 'desafio' && E.desafio) return E.desafio.jugado_hoy ? T('online.desafio_jugado') : esc(TL(E.desafio.nombre || ''));
    } catch (e) { /* nada */ }
    return '';
  }
  function hubOnline(activo) {
    return `<div class="onl-grid">${modos().map((m) => {
      const extra = activo ? estadoModo(m.k) : '';
      const E = Api.estado || {};
      const nuevo = activo && m.k === 'duelos' && E.duelos && E.duelos.defensas_nuevas;
      const hoy = activo && m.k === 'desafio' && E.desafio && E.desafio.jugado_hoy === false && Number(E.desafio.restantes) > 0;
      return `<button class="onl-tile t-${m.tono}" data-act="online" data-k="${m.k}" ${activo ? '' : 'disabled'}>
        <span class="oi">${I(m.icon)}</span>${nuevo ? `<span class="badge">${N(nuevo)}</span>` : hoy ? '<span class="badge">!</span>' : ''}
        <b>${T('online.' + m.k)}</b><span class="od">${T('online.' + m.k + '_det')}</span>${extra ? `<span class="oe">${extra}</span>` : ''}</button>`;
    }).join('')}</div>`;
  }
  function renderOnline() {
    const el = $('tab-online');
    if (!enLinea()) {
      desmontarOnline();
      const acceso = Api.disponible === null ? `<p class="small muted">${T('tienda.conectando')}</p>`
        : Api.disponible ? `<button class="btn main" data-act="cuenta" data-modo="registro">${I('user')}${T('cuenta.crear')}</button>
            <button class="btn" data-act="cuenta" data-modo="entrar">${T('cuenta.ya_tengo_entrar')}</button>`
          : `<p class="small muted" style="margin:6px 0 0">${T('online.sin_servidor', { sitio: '<b>juego.tukanec.com</b>' })}</p>`;
      el.innerHTML = `<div class="sectitle">${T('nav.online')}</div>
        <div class="card onl-hero"><div class="row" style="align-items:flex-start">${tile('online', 'blue')}<div class="grow"><h3>${T('online.entra')}</h3>
          <p class="small muted" style="margin:4px 0 0">${T('online.entra_det')}</p></div></div>${acceso}</div>
        <div class="sectitle">${T('online.modos')}</div>${hubOnline(false)}`;
      return;
    }
    if (vistaOnline === 'hub') {
      desmontarOnline();
      const E = Api.estado || {};
      el.innerHTML = `<div class="onl-hero onl-hero2"><div class="row">${tile('online', 'blue')}<div class="grow"><h3>${T('online.hola', { nombre: esc((E.jugador && E.jugador.nombre) || '') })}</h3>
          <p class="small muted" style="margin:2px 0 0">${T('online.hub_det')}</p></div></div></div>
        ${hubOnline(true)}
        <div class="sectitle">${T('discord.titulo')}</div>
        <div class="card"><p class="small muted" style="margin:0">${T('discord.det')}</p>${discordBtn()}</div>`;
      return;
    }
    const m = modos().find((x) => x.k === vistaOnline);
    if (!m) { vistaOnline = 'hub'; renderOnline(); return; }
    const cont = $('online-cont');
    if (montado === vistaOnline && cont && el.contains(cont)) return;   // ya está pintado: el módulo se actualiza solo
    desmontarOnline();
    // Arriba, fija: volver a los modos y saltar de un modo a otro sin regresar
    const modosBar = `<div class="subbar onl-bar"><div class="onl-bar-in"><button type="button" class="catchip onl-volver" data-act="online" data-k="hub" aria-label="${esc(T('nav.online'))}">${I('online', 'sm')}<span>${T('nav2.modos')}</span></button>
      <div class="catrow onl-modos" role="tablist" aria-label="${esc(T('online.modos'))}">${modos().map((x) => `<button type="button" class="catchip ${x.k === m.k ? 'on' : ''}" role="tab" aria-selected="${x.k === m.k}" data-act="online" data-k="${x.k}">${I(x.icon, 'sm')}<span>${T('online.' + x.k)}</span>${x.k === 'duelos' && Number(Api.estado && Api.estado.duelos && Api.estado.duelos.defensas_nuevas) ? `<b class="sn-n">${N(Api.estado.duelos.defensas_nuevas)}</b>` : ''}</button>`).join('')}</div></div></div>`;
    el.innerHTML = `${modosBar}<div class="onl-top"><b>${I(m.icon, 'sm')} ${T('online.' + m.k)}</b></div><div id="online-cont"></div>`;
    const on = el.querySelector('.onl-modos .catchip.on');
    if (on && on.parentElement) { try { on.parentElement.scrollLeft = Math.max(0, on.offsetLeft - 12); } catch (e) { /* nada */ } }
    const M = window[m.mod];
    if (!M || !M.render) { $('online-cont').innerHTML = emptyState(m.icon, T('online.no_disponible_t'), T('online.no_disponible')); return; }
    montado = vistaOnline;
    try { M.render($('online-cont'), ctxOnline(m.k)); } catch (e) { montado = null; $('online-cont').innerHTML = emptyState(m.icon, T('online.no_disponible_t'), esc(TL(e.message))); }
  }
  const sincronizarEntregas = () => { aplicarEntregas(); save(); if (tab !== 'online') render(); };
  function ctxOnline(k) {
    const base = { Api, G, A, T, TL, I18N: I18, estado: () => S, toast, ask, openModal, closeModal, snd, sincronizar: sincronizarEntregas };
    if (k === 'liga') {
      return { A, estado: () => S, guardar: save, toast, ask,
        jugarIntento: (it) => jugarIntento(it, 'liga'),
        abrirAsociaciones: () => { const b = $('chat-btn'); if (b) { b.hidden = false; b.click(); setTimeout(() => { const t = document.querySelector('[data-chat-tab="asociacion"]'); if (t) t.click(); }, 60); } else toast(T('online.no_disponible')); },
        alCanjear: () => { Api.refrescar().then(() => sincronizarEntregas()).catch(() => {}); } };
    }
    if (k === 'festival') {
      return { A, estado: () => S, vip: !!(Pm && Pm.vip), toast, snd: (n) => snd.play(n),
        jugarIntento: (seed, contrato, it) => jugarIntento(it || { seed, contrato }, 'festival') };
    }
    if (k === 'copa') {
      return { Api, A, G, estado: () => S, guardar: save, toast, ask, vip: !!(Pm && Pm.vip), snd: (n) => snd.play(n),
        jugarIntento: (it) => jugarIntento(it, 'copa'),
        sincronizar: () => { Api.refrescar().then(() => sincronizarEntregas()).catch(() => {}); } };
    }
    if (k === 'estrellas') return ctxEstrellas();
    return base;
  }
  window.EnVivoAbrirOnline = (k) => { if (VI) return; tab = 'online'; vistaOnline = k || 'hub'; desmontarOnline(); render(); window.scrollTo(0, 0); };

  /* ---------- Discord: código para /vincular (server/INTEGRAR_DISCORD.md) ---------- */
  let discordOff = false;   // el servidor dijo que el bot no está configurado
  const apiPost = (ruta, body) => apiReq('POST', ruta, body || {});
  // Petición al servidor con la cabecera X-Envivo y los errores traducidos (la usan Discord y los módulos: ctx.pedir)
  async function apiReq(method, ruta, body) {
    const m = String(method || 'GET').toUpperCase();
    const r = await fetch(ruta, { method: m, credentials: 'same-origin', cache: 'no-store',
      headers: { 'Content-Type': 'application/json', 'X-Envivo': '1', 'Accept-Language': (I18 && I18.idioma) || 'es' },
      body: m === 'GET' || m === 'HEAD' ? undefined : JSON.stringify(body || {}) });
    let j = null;
    try { j = await r.json(); } catch (e) { j = null; }
    if (!j || !r.ok || j.ok === false) {
      const err = new Error(j && j.codigo && I18 && I18.T.has('error.' + j.codigo) ? T('error.' + j.codigo) : (j && j.error ? TL(j.error) : T('err.no_completo')));
      err.status = r.status; err.codigo = j && j.codigo;
      throw err;
    }
    return j;
  }
  function discordBtn(cls) {
    if (!enLinea() || discordOff) return '';
    const v = !!(Api.estado && Api.estado.discord_vinculado);
    return `<button class="btn ${cls || ''} ${v ? '' : 'discord'}" data-act="discord">${I(v ? 'check' : 'link', 'sm')} ${v ? T('discord.vinculado') : T('discord.vincular')}</button>`;
  }
  // "Únete a nuestro Discord": invitación de DISCORD_INVITACION (/api/estado → discord_invitacion). Sin invitación, no sale.
  const invitacionDiscord = () => {
    const u = Api.estado && Api.estado.discord_invitacion;
    return typeof u === 'string' && /^https:\/\/(discord\.gg|discord\.com\/invite)\/[A-Za-z0-9-]{2,40}$/.test(u) ? u : '';
  };
  function unirseDiscordBtn(cls) {
    return invitacionDiscord() ? `<button class="btn ${cls || ''} discord" data-act="discord-unirse">${I('people', 'sm')} ${T('discord.unirse')}</button>` : '';
  }
  let discordT = null;
  async function abrirDiscord() {
    let r;
    try { r = await apiPost('/api/discord/codigo', {}); } catch (err) {
      if (err.codigo === 'discord_no_configurado' || err.status === 503 || err.status === 404) { discordOff = true; toast(T('discord.no_disponible')); render(); return; }
      toast(err.message); snd.play('error'); return;
    }
    const fin = Date.now() + (Number(r.segundos) || 600) * 1000;
    const inv = r.invitacion || (Api.estado && Api.estado.discord_invitacion);
    const vinc = !!(r.vinculado || (Api.estado && Api.estado.discord_vinculado));
    openModal(`<div class="row between"><h2>${T('discord.titulo')}</h2><button class="btn sm" data-act="close" aria-label="${esc(T('comun.cerrar'))}">${I('close', 'sm')}</button></div>
      <ol class="pasos small">
        <li>${inv ? T('discord.paso1_link', { link: `<a href="${esc(inv)}" target="_blank" rel="noopener">${T('discord.servidor')}</a>` }) : T('discord.paso1')}</li>
        <li>${T('discord.paso2')}</li></ol>
      <div class="dcode num">${esc(r.codigo)}</div>
      <p class="small muted" style="text-align:center"><code>${esc(r.comando || '/vincular codigo:' + r.codigo)}</code> · ${T('discord.vence')} <span id="dc-t">10:00</span></p>
      <p class="small muted">${T('discord.seguridad')}</p>
      <button class="btn main" data-act="discord-copiar" data-k="${esc(r.comando || '/vincular codigo:' + r.codigo)}">${T('discord.copiar')}</button>
      ${vinc ? `<button class="btn" data-act="discord-quitar">${T('discord.desvincular')}</button>` : ''}`);
    clearInterval(discordT);
    discordT = setInterval(() => {
      const el = $('dc-t');
      if (!el) { clearInterval(discordT); return; }
      const sec = Math.max(0, Math.round((fin - Date.now()) / 1000));
      el.textContent = sec > 0 ? `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}` : T('discord.vencido');
    }, 1000);
  }

  /* ---------- Clics ---------- */
  document.addEventListener('click', (e) => {
    if (!S) return;   // todavía cargando el idioma guardado
    snd.unlock();
    mus.init();
    const nav = e.target.closest('nav button');
    if (nav) {
      if (VI) return;   // jugando un turno en línea: primero se termina o se deja para después
      if (nav.dataset.tab === 'online' && tab === 'online' && vistaOnline !== 'hub') { vistaOnline = 'hub'; desmontarOnline(); }
      tab = nav.dataset.tab; snd.play('tap'); mus.go('menu'); render(); window.scrollTo(0, 0); return;
    }
    const bm = e.target.closest('#overlay [data-merc]');
    if (bm && window.Mercado && $('merc-cont')) { window.Mercado.clicVentana(ctxMercado(), $('merc-cont'), bm); return; }
    const xe = e.target.closest('[data-ext][data-acc]');
    if (xe && !xe.disabled) {
      const m = modulosInicio().find((x) => x.id === xe.dataset.ext);
      if (m && typeof m.clic === 'function') {
        snd.play('tap');
        try { m.clic(ctxInicio(), xe.dataset.acc, xe); } catch (err) { console.error('[inicio ' + m.id + ']', err); toast(T('err.no_completo')); }
        return;
      }
    }
    const el = e.target.closest('[data-act]');
    if (!el || el.disabled) return;
    const a = el.dataset.act;
    const id = el.dataset.id ? Number(el.dataset.id) : null;
    switch (a) {
      case 'mute': snd.toggle(); render(); break;
      case 'music': mus.toggle(); mus.init(); render(); break;
      case 'soporte': if (window.Soporte) Promise.resolve(window.Soporte.abrir(ctxSoporte())).catch(() => toast(T('err.no_completo'))); break;
      case 'vista-tienda': vistaTienda = el.dataset.k; if (vistaTienda === 'mercado') setSub('tienda', 'mercado'); else if (sub.tienda === 'mercado') setSub('tienda', 'ofertas'); if (window.Mercado) window.Mercado.invalidar(); snd.play('tap'); render(); window.scrollTo(0, 0); break;
      // Navegación v2: sub-pestañas, filtros y pasos de la preparación
      case 'sub': {
        const t = el.dataset.t, k = el.dataset.k;
        if (t === 'tienda') { vistaTienda = k === 'mercado' ? 'mercado' : 'tienda'; if (k === 'mercado' && window.Mercado) window.Mercado.invalidar(); }
        const cambio = sub[t] !== k;
        setSub(t, k); snd.play('tap'); render();
        if (cambio) { const sec = $('tab-' + tab); const p = sec && sec.querySelector('.subpanel'); if (p && !reduceMotion()) { p.classList.remove('sp-in'); void p.offsetWidth; p.classList.add('sp-in'); } window.scrollTo(0, 0); }
        break;
      }
      case 'filtro': setSub(el.dataset.f, el.dataset.k); snd.play('tap'); render(); break;
      case 'shop-borrar': shopBusca = ''; snd.play('tap'); render(); { const b = $('shopBusca'); if (b) try { b.focus(); } catch (err) { /* nada */ } } break;
      case 'prep-paso': if (prep && !S.currentEvent) { e.preventDefault(); prep.paso = el.dataset.k; snd.play('tap'); renderPrep(true); $('modal').scrollTop = 0; } break;
      case 'prep-cat': if (prep && !S.currentEvent) {
        e.preventDefault(); prep.cat = el.dataset.k; snd.play('tap');
        document.querySelectorAll('#modal [data-act="prep-cat"]').forEach((b) => { const on = b.dataset.k === prep.cat; b.classList.toggle('on', on); b.setAttribute('aria-pressed', on); });
        document.querySelectorAll('#modal label.pick[data-cat]').forEach((l) => { l.hidden = prep.cat !== 'todo' && l.dataset.cat !== prep.cat; });
      } break;
      case 'cuenta': abrirCuenta(el.dataset.modo); break;
      case 'cuenta-info': avisoCuenta(); break;
      case 'cuenta-borrar': if (window.Cuenta) window.Cuenta.abrirBorrar({ openModal, closeModal, toast, snd, alBorrar: () => { if (Pm) Pm.setVip(false); invalidarOnline(); vistaOnline = 'hub'; if (window.Chat) window.Chat.refrescar(); render(); } }); break;
      case 'nombre': abrirNombre(); break;
      case 'salir': Api.salir().then(() => { if (Pm) Pm.setVip(false); invalidarOnline(); vistaOnline = 'hub'; toast(T('cuenta.salio')); if (window.Chat) window.Chat.refrescar(); render(); }).catch((err) => toast(TL(err.message))); break;
      case 'idioma': abrirIdiomas(); break;
      case 'set-idioma': closeModal(); elegirIdioma(el.dataset.k); snd.play('tap'); break;
      case 'comprar': comprar(el.dataset.k, el.dataset.metodo); break;
      case 'tienda-ir': snd.play('tap'); irSeccionTienda(el.dataset.k); break;
      case 'tienda-estrellas': snd.play('tap'); abrirEstrellas(); break;
      case 'tienda-pase': snd.play('tap'); try { window.Pase.abrir(ctxInicio()); } catch (err) { console.error('[tienda pase]', err); toast(T('err.no_completo')); } break;
      case 'tienda-vip': snd.play('tap'); try { window.Vip.abrir(ctxInicio()); } catch (err) { console.error('[tienda vip]', err); toast(T('err.no_completo')); } break;
      case 'canjear': canjear(el.dataset.k); break;
      case 'ex-canjear': exCanjear(el.dataset.k); break;
      case 'vip-bono': bonoVip(); break;
      case 'partida': if (eleccion) { const f = eleccion; eleccion = null; f(el.dataset.k); } break;
      case 'install':
        try { window.PWA.install().then((r) => { if (r === 'accepted') toast(T('pwa.instalado')); render(); }); } catch (err) { toast(T('pwa.no_permite')); }
        break;
      case 'tab': if (el.dataset.sub && SUBS[el.dataset.tab] && SUBS[el.dataset.tab].includes(el.dataset.sub)) { setSub(el.dataset.tab, el.dataset.sub); if (el.dataset.tab === 'tienda') vistaTienda = 'tienda'; } tab = el.dataset.tab; snd.play('tap'); mus.go('menu'); render(); window.scrollTo(0, 0); break;
      case 'online': vistaOnline = el.dataset.k || 'hub'; snd.play('tap'); desmontarOnline(); render(); window.scrollTo(0, 0); break;
      case 'discord': abrirDiscord(); break;
      case 'discord-unirse': { const u = invitacionDiscord(); if (u) window.open(u, '_blank', 'noopener'); break; }
      case 'discord-copiar': {
        const txt = el.dataset.k || '';
        try { navigator.clipboard.writeText(txt).then(() => toast(T('discord.copiado'))).catch(() => toast(txt)); } catch (err) { toast(txt); }
        break;
      }
      case 'discord-quitar':
        apiPost('/api/discord/desvincular', {}).then(() => Api.refrescar()).then(() => { closeModal(); toast(T('discord.desvinculado')); render(); }).catch((err) => toast(err.message));
        break;
      case 'close': { const deprep = !!prep && !S.currentEvent; closeModal(); if (deprep) { prep = null; mus.go('menu'); } render(); break; }
      case 'confirm-yes': { const cb = confirmCb; confirmCb = null; closeModal(); if (cb) cb(); break; }
      case 'demo-no': confirmCb = null; closeModal(); render(); continuar(); break;
      case 'next-day': diaAntes = { money: S.money }; diaCerrado = true; aplicarFecha(); G.nextDay(S); save(); snd.play('day'); render(); if (!resDiaPend()) toast(T('comun.dia_n', { n: S.day })); continuar(); break;
      case 'close-dia': tomarAvisos(); closeModal(); render(); continuar(); break;
      case 'mkt': {
        const visita = el.dataset.k === 'visitar';
        if (visita) { diaAntes = { money: S.money }; diaCerrado = true; }
        act(G.marketing(S, el.dataset.k), 'logo');
        if (visita) continuar();
        break;
      }
      case 'hire': {
        const r = act(G.hire(S, id), 'hire');
        // QA: la ventana de "Capítulo completado" siempre aparece (también al contratar o comprar)
        if (r && r.chapterDone && !Array.isArray(S.capCompletados)) showChapterDone(r.chapterDone); else continuar();
        break;
      }
      case 'fire': { const p = S.staff.find((x) => x.id === id); if (p) ask(T('personal.despedir_q', { nombre: esc(nmP(p)) }), T('personal.despedir_si'), () => act(G.fire(S, id))); break; }
      case 'intl-llevar': case 'intl-curso': case 'intl-buscar': case 'intl-hire': case 'intl-curso-cred': case 'intl-personal-cred': {
        e.preventDefault();
        if ((a === 'intl-buscar' || a === 'intl-personal-cred') && !el.dataset.k) { const sel = $('rolBuscar'); rolBuscar = sel ? sel.value : rolBuscar; if (a === 'intl-personal-cred') el.dataset.k = rolBuscar || 'director'; }
        intlAccion(a, el, id);
        break;
      }
      case 'search-staff': { const sel = $('rolBuscar'); rolBuscar = sel ? sel.value : rolBuscar; act(G.searchStaff(S, rolBuscar || undefined)); break; }
      case 'cat': catSel = el.dataset.k; lsSet('envivo_cat', catSel); shopBusca = ''; if (tab === 'bodega') setSub('bodega', 'tienda'); snd.play('tap'); render(); break;
      case 'buy': {
        // Equipo que no rinde sin algo que todavía no tienes (cámara sin lente, lente box sin cámara de sistema...):
        // se avisa antes y se ofrece comprarlo todo junto (combo)
        const k = el.dataset.k;
        if (!el.dataset.solo && ofrecerCombo(k, 'dinero')) break;
        if (el.dataset.solo) closeModal();
        comprarEquipo(k);
        break;
      }
      case 'buy-kit': {
        // Combo con dinero del juego: data-k (el equipo, puede faltar) + data-l (lo que necesita, separado por comas)
        closeModal();
        const keys = [el.dataset.k].concat((el.dataset.l || '').split(',')).filter(Boolean);
        const r = comprarLista(keys);
        act(r.ultimo, 'buy');
        if (r.chapterDone && !Array.isArray(S.capCompletados)) showChapterDone(r.chapterDone); else continuar();
        break;
      }
      case 'combo-canjear': canjearCombo(el.dataset.k, (el.dataset.l || '').split(','), el.dataset.item || null); break;
      case 'buy-falta': e.preventDefault(); comprarFalta(el.dataset.k, id); break;
      case 'ir-pase-vip': {
        e.preventDefault();
        closeModal(); prep = null;
        snd.play('tap'); irA('tienda', 'vip');
        irSeccionTienda('tv-vip');
        break;
      }
      case 'ir-personal': {
        e.preventDefault();
        closeModal(); prep = null;
        rolBuscar = el.dataset.k || rolBuscar;
        snd.play('tap'); irA('personal', 'contratar');
        break;
      }
      case 'ir-bodega': {
        // Desde la preparación o un combo: a la categoría de la tienda donde está lo que falta (la oferta sigue en Clientes)
        e.preventDefault();
        closeModal(); prep = null;
        catSel = el.dataset.k || catSel; lsSet('envivo_cat', catSel); shopBusca = '';
        snd.play('tap'); irA('bodega', 'tienda');
        const item = el.dataset.item;
        const q = item && window.CSS && CSS.escape ? CSS.escape(item) : item;
        const bt = q ? document.querySelector(`#tab-bodega [data-act="buy"][data-k="${q}"]`) : null;
        const card = q ? (document.querySelector(`#tab-bodega [data-ex="${q}"]`) || (bt && bt.closest('.card'))) : null;
        if (card) resaltar(card);
        break;
      }
      case 'buy-cons': act(G.buyConsumable(S, el.dataset.k, 1), 'buy'); break;
      case 'repair': act(G.repair(S, id), 'buy'); break;
      // Equipos dañados (resultado del evento, Inicio y preparación)
      case 'repair-res': act(G.repair(S, id), 'buy'); pintarDanosRes(); break;
      case 'repair-all-bodega': repararVarios(porReparar().map((x) => x.id)); break;
      case 'repair-all-res': repararVarios((resDanos || []).map((d) => d.id)); pintarDanosRes(); break;
      case 'repair-prep': e.preventDefault(); act(G.repair(S, id), 'buy'); if (prep) renderPrep(); break;
      case 'ir-danos': {
        // A Mis equipos, con el filtro "Por reparar" (lo más gastado arriba)
        if (porReparar().length) setSub('eqFiltro', 'reparar');
        snd.play('tap'); irA('bodega', 'equipos');
        break;
      }
      case 'sell': { const it = S.equip.find((x) => x.id === id); if (it) ask(T('bodega.vender_q', { item: esc(itemName(it.type)), m: M(G.sellPrice(it)) }), T('bodega.vender_si'), () => act(G.sell(S, id), 'buy')); break; }
      case 'prep': { snd.play('tap'); const pc = S.contracts.find((x) => x.id === id); if (pc) mus.go(esFuneral(pc.type) ? 'funeral' : 'preparacion'); openPrep(id); break; }
      case 'auto': { const sg = G.suggestLoadout(S, prep.id); prep.staff = new Set(sg.staffIds); prep.equip = new Set(sg.equipIds); prep.col = null; prep.selCam = null; prep.selPos = null; snd.play('tap'); marcarSeleccion(); renderPrep(true); break; }
      case 'go-live': {
        const cGo = S.contracts.find((x) => x.id === prep.id);
        const colGo = cGo ? colPrep(cGo) : null;
        const r = colGo ? G.startEvent(S, prep.id, [...prep.staff], [...prep.equip], colGo) : G.startEvent(S, prep.id, [...prep.staff], [...prep.equip]);
        if (!r.ok) { toast(TL(r.msg)); snd.play('error'); break; }
        danosInicio();
        save(); render();
        snd.play('live');
        const ty = S.currentEvent.contract.type;
        AN('evento_iniciado', { tipo: ty, capitulo: S.chapter, dia: S.day });
        snd.amb(['barrial', 'ligapro', 'final', 'concierto', 'boxeo', 'lucha_libre', 'internacional_host', 'internacional_unilateral'].includes(ty) ? 'crowd' : 'room');
        mus.go(esFuneral(ty) ? 'funeral' : temaDeEvento(ty));
        if (ty === 'final' || ty === 'ligapro') setTimeout(() => mus.stinger(), 900);
        prep = null;
        if (window.Movilizacion && window.Movilizacion.animar) window.Movilizacion.animar(ctxInicio(), () => showIncident()); else showIncident();
        break;
      }
      case 'choose': choose(Number(el.dataset.i)); break;
      case 'next-inc': showIncident(); break;
      case 'finish': finish(); break;
      case 'vi-salir': cerrarIntento(false); break;
      case 'vi-enviar': cerrarIntento(true); break;
      case 'after-result':
        tomarAvisos();   // ya se vieron en el resultado
        if (afterResult) { const d = afterResult; afterResult = null; lsSet(RES_KEY, { chapter: d, ev: S.stats.events }); showChapterDone(d); }
        else { lsSet(RES_KEY, null); closeModal(); mus.go('menu'); render(); continuar(); }
        if (window.Compartir) window.Compartir.trasResultado(ctxInicio());   // calificar tras un 5⭐ (espera a que la pantalla esté libre)
        break;
      case 'close-story':
        if (capDeCola && Array.isArray(S.capCompletados) && S.capCompletados.length) { S.capCompletados.shift(); save(); }
        capDeCola = false;
        lsSet(RES_KEY, null); closeModal(); mus.go('menu'); render(); continuar(); break;
      case 'new-game': ask(T('inicio.nueva_q'), T('inicio.nueva_si'), () => { S = G.newGame(); aplicarFecha(); olvidarDia(); if (Pm && Api.estado) Pm.prepararPartidaNueva(S, Api.estado.entregas); save(); tab = 'inicio'; mus.go('menu'); render(); showChapterIntro(); }); break;
      case 'restart': S = G.newGame(); aplicarFecha(); olvidarDia(); if (Pm && Api.estado) Pm.prepararPartidaNueva(S, Api.estado.entregas); save(); closeModal(); tab = 'inicio'; mus.go('menu'); render(); showChapterIntro(); break;
    }
  });

  document.addEventListener('submit', (e) => {
    if (e.target && e.target.id === 'formCuenta') { e.preventDefault(); enviarCuenta(e.target); }
    if (e.target && e.target.id === 'formNombre') { e.preventDefault(); guardarNombre(); }
  });

  // Búsqueda en la tienda de equipos: solo se rehace la lista (el teclado no se cierra)
  document.addEventListener('input', (e) => {
    const el = e.target;
    if (!S || !el || el.id !== 'shopBusca') return;
    shopBusca = String(el.value || '').slice(0, 40);
    const g = $('shopGrid');
    if (g) g.innerHTML = shopHtml(categorias(), enBodega() >= maxEquip(), maxEquip());
    document.querySelectorAll('#tab-bodega .catrow [data-act="cat"]').forEach((b) => { const on = !shopBusca && b.dataset.k === catSel; b.classList.toggle('on', on); b.setAttribute('aria-selected', on); });
  });

  document.addEventListener('change', (e) => {
    const el = e.target;
    if (el && el.id === 'rolBuscar') { rolBuscar = el.value; return; }
    if (el && el.id === 'shopOrden') { setSub('shopOrden', el.value); const g = $('shopGrid'); if (g) g.innerHTML = shopHtml(categorias(), enBodega() >= maxEquip(), maxEquip()); return; }
    if (!el.dataset || !prep) return;
    const id = Number(el.dataset.id);
    if (el.dataset.act === 'tog-staff' || el.dataset.act === 'tog-equip') {
      const set = el.dataset.act === 'tog-staff' ? prep.staff : prep.equip;
      if (el.checked) set.add(id); else set.delete(id);
      const l = el.closest('.pick'); if (l) l.classList.toggle('sel', el.checked);
      renderPrep(true);
    }
  });

  /* ---------- Inicio ---------- */
  /* ---------- Idiomas: al inicio solo está js/lang/es.js; js/i18n.js carga el resto bajo pedido ---------- */
  let idiomaPedido = false;   // el aviso "idioma cambiado" solo cuando lo eligió el jugador
  function elegirIdioma(code) { if (!I18) return; idiomaPedido = true; I18.setIdioma(code); }

  // Textos del juego (nombres, imprevistos, registro) en el idioma elegido: js/i18n.js trae I18N.juego
  if (I18) {
    // Al cambiar de idioma se vuelve a pintar todo: textos fijos, pestaña, ventana abierta y chat
    I18.onChange(() => {
      enlazarTraductor();
      I18.aplicar();
      if (window.Mercado && window.Mercado.invalidar) window.Mercado.invalidar();
      invalidarOnline();
      if (S) render();
      if (window.Chat && window.Chat.refrescar) { try { window.Chat.refrescar(); } catch (e) { /* nada */ } }
      if (idiomaPedido && S) toast(T('idioma.cambiado'));
      idiomaPedido = false;
    });
  }
  try { if (window.PWA) window.PWA.onChange(() => { if (tab === 'inicio') render(); }); } catch (e) { /* sin instalación */ }

  /* Partida de demostración: ?demo=cap4 (ver docs/DEMO.md). Nunca pisa una partida sin preguntar. */
  function demoPedido() {
    try {
      // Copia "demo" publicada (sin parámetros en la dirección): carga la partida preparada solo la primera vez
      if (window.__ENVIVO_DEMO && !lsGet('envivo_demo_cargado')) { lsSet('envivo_demo_cargado', 1); return String(window.__ENVIVO_DEMO); }
      const m = /[?&]demo=([\w-]+)/.exec(location.search || '');
      if (!m) return null;
      // Se quita de la dirección para que recargar no lo vuelva a pedir
      const q = location.search.replace(/([?&])demo=[\w-]+&?/, '$1').replace(/[?&]$/, '');
      history.replaceState(null, '', location.pathname + q + location.hash);
      return m[1];
    } catch (e) { return null; }
  }
  function cargarDemo(kind) {
    let d = null;
    try { d = G.demoGame ? G.demoGame(kind) : null; } catch (e) { d = null; }
    if (!d) { toast(T('err.no_completo')); continuar(); return; }
    S = d; aplicarFecha(); olvidarDia(); save(); tab = 'inicio'; prep = null;
    closeModal(); mus.go('menu'); render(); toast(T('demo.listo')); continuar();
  }
  function pedirDemo(kind) {
    const hay = S && ((S.stats && S.stats.events > 0) || S.day > 1);
    if (!hay) { cargarDemo(kind); return; }
    confirmCb = () => cargarDemo(kind);
    openModal(`<div class="story-tag">${T('demo.titulo')}</div><h2>${T('comun.seguro')}</h2><p>${T('demo.texto', { dia: S.day })}</p>
      <button class="btn main" data-act="confirm-yes">${T('demo.si')}</button>
      <button class="btn" data-act="demo-no">${T('comun.cancelar')}</button>`);
  }
  function arrancar() {
    enlazarTraductor();
    if (I18) I18.aplicar();
    S = load() || G.newGame();
    aplicarFecha();
    save();
    render();
    const demo = G.demoGame ? demoPedido() : null;
    if (demo) { pedirDemo(demo); const red0 = () => setTimeout(conectar, 0); if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', red0, { once: true }); else red0(); return; }
    // Resultado que no se alcanzó a ver (se recargó en esa pantalla): se muestra otra vez
    const pend = lsGet(RES_KEY);
    const pendOk = pend && !S.currentEvent && pend.ev === S.stats.events;
    if (pend && !pendOk) lsSet(RES_KEY, null);
    if (S.currentEvent) showIncident();       // si cerraste la app en pleno evento, sigue donde quedó
    else if (pendOk && pend.r) { try { resDanos = Array.isArray(pend.danos) ? pend.danos : null; showResult(pend.r, pend.caja, false, pend.ty); } catch (e) { lsSet(RES_KEY, null); closeModal(); continuar(); } }
    else if (pendOk && pend.chapter) { try { showChapterDone(pend.chapter); } catch (e) { lsSet(RES_KEY, null); closeModal(); continuar(); } }
    else continuar();
    // Guía del primer evento (js/guia.js, con defer): solo en una partida nueva; si aún no cargó, la toma al cargar
    const guiaCtx = { estado: () => S, A, tab: () => tab, idioma: () => (I18 ? I18.idioma : 'es') };
    if (window.Guia) window.Guia.iniciar(guiaCtx); else window.__guiaCtx = guiaCtx;
    // La red (tienda, cuenta, chat, Google Play) después de la primera pantalla y de los scripts diferidos
    const red = () => setTimeout(conectar, 0);
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', red, { once: true }); else red();
  }
  // Conectar con la tienda (si hay servidor). Si volvemos de un pago aprobado, avisar.
  async function conectar() {
    GP = GP || window.GooglePlay || null;
    const volvioDePago = /[?&]compra=ok\b/.test(location.search);
    if (volvioDePago) { try { history.replaceState(null, '', location.pathname); } catch (e) { /* nada */ } }
    if (window.Api && window.Api.iniciar) await window.Api.iniciar();
    await alConectar(false);
    if (window.Chat && Api.disponible) window.Chat.iniciar(ctxChat());
    if (Api.estado && Api.estado.logueado) {
      // La partida de la nube ya se revisó en alConectar (más nueva, igual o hay que elegir): solo las entregas
      aplicarEntregas(); render();
    }
    if (volvioDePago && !enApp()) AN('compra_aprobada', { canal: 'web_plux' });
    if (volvioDePago && !enApp()) { tab = 'tienda'; trasCompra(); render(); toast(T('tienda.compra_ok')); snd.play('chapter'); }
    else if (sinLeerSoporte()) toast(T('soporte.nuevas', { n: sinLeerSoporte() }));
    // Google Play (solo en la app de Android): precios y compras que quedaron sin confirmar
    await iniciarPlay();
  }
  // Íconos fijos de la barra de abajo y la cabecera
  document.querySelectorAll('[data-ico]').forEach((el) => { el.insertAdjacentHTML('afterbegin', I(el.dataset.ico)); });
  // Con otro idioma guardado, js/i18n.js trae su diccionario (I18N.listo) y después se pinta, ya en ese idioma
  if (I18 && I18.listo && typeof I18.listo.then === 'function') I18.listo.then(arrancar, arrancar);
  else arrancar();
  window.__game = { get state() { return S; }, // para las pruebas automáticas
    // El plan de cámaras de la preparación abierta (calidad base, posiciones y combos), como lo calcula la lógica
    prepPlan() {
      if (!prep) return null;
      const c = S.contracts.find((x) => x.id === prep.id);
      if (!c) return null;
      const cq = G.computeQuality(S, c, S.staff.filter((p) => prep.staff.has(p.id)), S.equip.filter((e) => prep.equip.has(e.id)), colPrep(c));
      return { q: cq.q, col: prep.col, positions: cq.cameraPlan.positions, combos: cq.cameraPlan.combos };
    } };
  // js/hub.js (con defer) pinta Inicio otra vez al llegar, si la primera pantalla salió sin él
  window.EnVivoRepintar = () => { if (S && tab === 'inicio' && !VI) render(); };
})();
