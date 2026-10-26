/* =========================================================
   EN VIVO Tycoon — Compras premium dentro del juego
   - Agrega los equipos exclusivos al catálogo (no se pueden comprar con dinero del juego,
     ni vender, solo se consiguen en la tienda con créditos).
   - Aplica las "entregas" que manda el servidor (cada una UNA sola vez por partida).
   - Efectos del Pase VIP (según el nivel VIP, tabla PASE_VIP): más eventos por día (modo historia), reparaciones más
     baratas (30 a 50 %) y 1 oferta extra al día. El bono diario y las obras más rápidas los da el servidor (server/src/Vip.php).
   - Los equipos VIP canjeados funcionan siempre, con o sin el Pase VIP.
   El saldo de créditos y el VIP los decide SIEMPRE el servidor (server/API.md).
   ========================================================= */
(function (root) {
  'use strict';
  const G = root.Game || (typeof require !== 'undefined' ? require('./logic.js') : null);

  // Las claves (dron4k, grua, unidad_movil, generador, vip_*) no cambian: el servidor las usa.
  // Nombres y datos siguen el catálogo realista (docs/EQUIPOS_REALES.md, marcas parodia).
  const EXCLUSIVOS = {
    dron4k:       { name: 'DGI Inspira 3X Cine (dron) Exclusivo', icon: 'dron', creditos: 450, cat: 'cam', subtipo: 'dron_cine', q: 5, price: 0, minRep: 0, rareza: 'exclusivo', durabilidad: 2,
                    requiere: ['piloto_dron'], eventos: ['lanzamiento_autos', 'concierto', 'final', 'boda'], premium: true, repairBase: 2200,
                    desc: 'Dron de cine con cámara 4K de lentes cambiables. Tomas aéreas de calidad 5. Necesita piloto de dron.' },
    grua:         { name: 'Grúa telescópica de 12 m con cabeza remota', icon: 'grua', creditos: 650, cat: 'cam', subtipo: 'grua', q: 4, price: 0, minRep: 0, rareza: 'exclusivo', durabilidad: 4,
                    eventos: ['concierto', 'lanzamiento_autos', 'lanzamiento', 'graduacion', 'final'], premium: true, repairBase: 2600,
                    desc: 'Barridos de cine sobre el público. Cámara de calidad 4 para las posiciones de grúa o jib.' },
    unidad_movil: { name: 'Sprinto OB equipada (4 a 6 cámaras)', icon: 'unidad_movil', creditos: 900, cat: 'vehicle', subtipo: 'ob_chica', q: 4, price: 0, minRep: 0, rareza: 'exclusivo', durabilidad: 4,
                    eventos: ['ligapro', 'concierto', 'final'], premium: true, repairBase: 3500,
                    desc: 'Unidad móvil con switcher, audio e intercom adentro. Cuenta como switcher de calidad 4.' },
    generador:    { name: 'Kummins 22 kVA diésel insonorizado', icon: 'generador', creditos: 250, cat: 'power', subtipo: 'generador_diesel', q: 4, price: 0, minRep: 0, rareza: 'exclusivo', durabilidad: 5,
                    eventos: ['ligapro', 'concierto', 'final', 'lanzamiento_autos'], premium: true, repairBase: 900,
                    desc: 'Generador silencioso para estadios y conciertos: si se va la luz, tú sigues al aire.' },
    // Solo VIP: se canjean con el Pase VIP activo y después funcionan SIEMPRE (con o sin el Pase)
    vip_cam8k:     { name: 'Zony HDK-3600 4K HDR Edición VIP (con lente box 107x)', icon: 'cam_cine', creditos: 800, cat: 'cam', subtipo: 'sistema_4k', q: 6, price: 0, minRep: 0, rareza: 'vip', durabilidad: 5,
                     requiere: ['lente_b4', 'cable_fibra_smpte', 'shader'], incluyeLente: true, incluyeFibra: true, eventos: ['final', 'ligapro'], premium: true, vip: true, repairBase: 4000,
                     desc: 'Cadena de cámara de sistema 4K con lente box y fibra incluidos. La mejor imagen del juego (calidad 6). Lleva un shader.' },
    vip_switcher:  { name: 'Rozz Carbonita Ultra Edición VIP', icon: 'switch_pro', creditos: 1000, cat: 'switcher', subtipo: 'sdi_me', q: 5, price: 0, minRep: 0, rareza: 'vip', durabilidad: 5,
                     eventos: ['ligapro', 'final', 'concierto'], premium: true, vip: true, repairBase: 4200,
                     desc: 'Switcher de televisión con panel: repeticiones y gráficos de nivel nacional. Calidad 5.' },
    vip_satelital: { name: 'Enlace satelital portátil (flyaway) Edición VIP', icon: 'stream', creditos: 700, cat: 'internet', subtipo: 'satelite', q: 5, price: 0, minRep: 0, rareza: 'vip', durabilidad: 5,
                     eventos: ['final', 'internacional_host', 'internacional_unilateral'], premium: true, vip: true, repairBase: 2500,
                     desc: 'Tu transmisión sale por satélite: el internet nunca te deja mal.' },
  };
  const DURABLES = ['item', 'equipo', 'personal', 'personal_intl'];   // se vuelven a entregar si empiezas partida nueva
  const VIP_DESCUENTO = 0.3;   // descuento base del Pase VIP (VIP 1); crece con el nivel (PASE_VIP)

  /* Ventajas del Pase VIP de 30 días por nivel VIP ("desde" ese nivel; con el Pase activo y nivel 0 cuenta como VIP 1).
     MISMA tabla que server/src/Vip.php (Vip::PASE): tests/pruebas_vip.php revisa que sean iguales.
     turnos: eventos por día en el modo historia (sin Pase: 3). descuento: % menos al reparar. obra: % menos de tiempo en las
     obras de la Sede oficial (servidor). bono: bono diario (servidor). Nada de esto da poder en Copa, Duelos, Liga ni Festival. */
  const PASE_VIP = [
    { desde: 1, turnos: 4, descuento: 30, obra: 10, bono: { dinero: 150, creditos: 10, cable: 1, battery: 0, reparar: false } },
    { desde: 3, turnos: 4, descuento: 35, obra: 15, bono: { dinero: 250, creditos: 10, cable: 2, battery: 1, reparar: false } },
    { desde: 5, turnos: 5, descuento: 40, obra: 20, bono: { dinero: 400, creditos: 15, cable: 2, battery: 2, reparar: false } },
    { desde: 7, turnos: 5, descuento: 45, obra: 25, bono: { dinero: 600, creditos: 15, cable: 3, battery: 3, reparar: false } },
    { desde: 9, turnos: 5, descuento: 50, obra: 30, bono: { dinero: 800, creditos: 20, cable: 4, battery: 4, reparar: true } },
  ];
  const TURNOS_BASE = 3;
  function pase(nivel) {
    const n = Math.max(1, Math.min(10, Math.floor(Number(nivel) || 0)));
    let o = PASE_VIP[0];
    PASE_VIP.forEach((f) => { if (n >= f.desde) o = f; });
    return Object.assign({ nivel: n }, o);
  }

  let vipActivo = false;
  let vipNivel = 0;
  // Ventajas que tocan ahora (null sin el Pase VIP activo)
  const paseActual = () => (vipActivo ? pase(vipNivel) : null);

  function estado(s) {
    if (!s.premium || typeof s.premium !== 'object') s.premium = {};
    if (!Array.isArray(s.premium.aplicadas)) s.premium.aplicadas = [];
    return s.premium;
  }
  function anotar(s, text) {
    s.log.unshift({ day: s.day, text });
    if (s.log.length > 80) s.log.length = 80;
  }
  // Textos con clave (TEXTOS de js/datos.js): se guardan con k / p para que el registro cambie con el idioma
  const tx = (k, p) => (G.tx ? G.tx(k, p) : k);
  function anotarK(s, k, p) {
    s.log.unshift({ day: s.day, text: tx(k, p), k, p: p || null });
    if (s.log.length > 80) s.log.length = 80;
  }
  function nuevoId(s) { s.idc = (s.idc || 0) + 1; return s.idc; }
  const esPremium = (type) => !!(G.CATALOG[type] && G.CATALOG[type].premium);
  // Edición Exclusiva canjeada con créditos (vive en el inventario del servidor): no se vende al desarmadero, se revende en el mercado.
  // La comprada con dinero del juego (sin srvId) se vende como cualquier equipo.
  const exclusivoDelServidor = (e) => !!(e && e.srvId !== undefined && G.CATALOG[e.type] && G.CATALOG[e.type].exclusivo);

  /* ---------- Catálogo y reglas protegidas ---------- */
  Object.keys(EXCLUSIVOS).forEach((k) => {
    // Los textos viven en js/datos.js (item.<clave>.nombre / .desc) para poder traducirlos
    if (G.tx && G.TEXTOS && G.TEXTOS['item.' + k + '.nombre']) { EXCLUSIVOS[k].name = G.tx('item.' + k + '.nombre'); EXCLUSIVOS[k].desc = G.tx('item.' + k + '.desc'); if (G.TEXTOS['item.' + k + '.uso']) EXCLUSIVOS[k].uso = G.tx('item.' + k + '.uso'); }
    G.CATALOG[k] = Object.assign({ key: k }, EXCLUSIVOS[k]);
  });

  // El costo sale de la lógica (G.repairCost: repairBase de la Edición Exclusiva, factor de vehículos, alquilados gratis);
  // aquí solo se aplica el descuento VIP. Así lo que se muestra (Bodega, flota) es lo mismo que se cobra.
  const repairCostLogica = G.repairCost;
  function costoReparar(e) {
    const c = Math.max(0, repairCostLogica(e) || 0);
    const p = paseActual();
    return p ? Math.round(c * (100 - p.descuento) / 100) : c;
  }

  const buyOriginal = G.buy;
  const sellOriginal = G.sell;
  G.buy = function (s, type) {
    if (esPremium(type)) return { ok: false, msg: tx('msg.exclusivo_tienda') };
    return buyOriginal(s, type);
  };
  G.sell = function (s, id) {
    const e = s.equip.find((x) => x.id === id);
    if (e && (esPremium(e.type) || exclusivoDelServidor(e))) return { ok: false, msg: tx('msg.exclusivo_no_vender') };
    return sellOriginal(s, id);
  };
  const sellPriceOriginal = G.sellPrice;
  G.sellPrice = (e) => (esPremium(e.type) || exclusivoDelServidor(e) ? 0 : sellPriceOriginal(e));
  G.repairCost = costoReparar;
  G.repair = function (s, id) {
    const e = s.equip.find((x) => x.id === id);
    if (!e) return { ok: false, msg: tx('msg.no_existe') };
    const cost = costoReparar(e);
    if (cost <= 0) return { ok: false, msg: tx('msg.como_nuevo') };
    if (s.money < cost) return { ok: false, msg: tx('msg.reparar_cuesta', { monto: G.money(cost) }) };
    s.money -= cost;
    e.condition = 100;
    // El nombre va con su clave (si la tiene) para que el registro se traduzca
    const item = G.TEXTOS && G.TEXTOS['item.' + e.type + '.nombre'] ? { k: 'item.' + e.type + '.nombre' } : G.CATALOG[e.type].name;
    anotarK(s, vipActivo ? 'log.reparaste_vip' : 'log.reparaste', { item, monto: G.money(cost) });
    return { ok: true, msg: tx('msg.quedo_nuevo') };
  };

  /* ---------- Equipos VIP: funcionan SIEMPRE ----------
     Decisión de Dimitry (oct. 2026): "lo comprado con diamantes se debe quedar". Los equipos VIP se canjean con el Pase VIP
     activo, pero después son tuyos y funcionan siempre (modo historia y en línea), con o sin el Pase. El Pase VIP da otras
     ventajas (PASE_VIP, abajo). bloqueado() queda por compatibilidad y siempre dice que no. */
  const esVip = (type) => !!(G.CATALOG[type] && G.CATALOG[type].vip);
  const bloqueado = () => false;

  /* ---------- Inventario del servidor (equipos que se pueden intercambiar en el mercado) ---------- */
  // Cada equipo del servidor vive en la partida con srvId. El servidor manda: si ya no está en su
  // inventario (lo publicaste o lo vendiste) sale de la bodega; si llegó uno nuevo, entra al 100 %.
  function sincronizarInventario(s, inventario) {
    if (!Array.isArray(inventario)) return { agregados: [], quitados: [] };
    const enUso = s.currentEvent ? s.currentEvent.equipIds : [];
    const ids = inventario.map((x) => x.id);
    const agregados = [], quitados = [];
    s.equip = s.equip.filter((e) => {
      if (e.srvId === undefined || ids.includes(e.srvId) || enUso.includes(e.id)) return true;
      quitados.push(G.CATALOG[e.type] ? G.CATALOG[e.type].name : e.type);
      return false;
    });
    inventario.forEach((x) => {
      if (!G.CATALOG[x.item] || s.equip.some((e) => e.srvId === x.id)) return;
      s.equip.push({ id: nuevoId(s), type: x.item, condition: 100, srvId: x.id, serie: x.serie });
      agregados.push(`${G.CATALOG[x.item].name}${x.serie ? ' #' + String(x.serie).padStart(4, '0') : ''}`);
    });
    agregados.forEach((t) => anotar(s, `🎁 Llegó a tu bodega: ${t}.`));
    quitados.forEach((t) => anotar(s, `🏷️ ${t} salió de tu bodega (mercado).`));
    return { agregados, quitados };
  }
  const nombreSerie = (e) => `${(G.CATALOG[e.type] || { name: e.type }).name}${e.serie ? ' #' + String(e.serie).padStart(4, '0') : ''}`;

  /* ---------- Entregas del servidor ---------- */
  const ESTRELLAS = ['Andrés "El Pulso" Vera', 'Majo Cifuentes', 'Rafa Tamayo', 'Doménica Arias', 'Javier "Zoom" Haro'];

  function aplicarUna(s, en) {
    const n = Math.max(1, Number(en.cantidad) || 1);
    switch (en.tipo) {
      case 'item': {
        const it = G.CATALOG[en.item];
        if (!it) return null;
        // Lo de diamantes no ocupa cupo de bodega (Game.cuentaBodega): llega siempre
        s.equip.push({ id: nuevoId(s), type: en.item, condition: 100 });
        return `Llegó a tu bodega: ${it.name}.`;
      }
      case 'equipo': {
        // Pieza de la tienda canjeada con créditos para completar un combo (POST /api/gastar "juego:<clave>"): va a la bodega
        // aunque con dinero del juego todavía pida más fama
        const it = G.CATALOG[en.item];
        if (!it) return null;
        s.equip.push({ id: nuevoId(s), type: en.item, condition: 100 });
        return `Llegó a tu bodega: ${it.name}.`;
      }
      case 'consumible': {
        if (!G.CONSUMABLES[en.item]) return null;
        s.stock[en.item] = (s.stock[en.item] || 0) + n;
        return `Recibiste ${n} × ${G.CONSUMABLES[en.item].name}.`;
      }
      case 'personal': {
        if (!G.ROLES[en.item]) return null;
        const role = G.normRole ? G.normRole(en.item) : en.item; // 'cam' / 'stream' del servidor → roles nuevos
        const skill = Math.min(5, Math.max(1, n));
        const tier = skill >= 4 ? 'senior' : skill >= 3 ? 'semi_senior' : 'junior';
        const usados = s.staff.map((p) => p.name);
        const name = ESTRELLAS.find((x) => !usados.includes(x)) || `Profesional ${nuevoId(s)}`;
        s.staff.push({ id: nuevoId(s), name, role, tier, skill, wage: 25 + skill * 18, morale: 100, events: 0,
          eventos_nacionales: 0, eventos_internacionales: 0, premium: true });
        return `Se unió a tu equipo: ${name} (${G.ROLES[role].name}, habilidad ${skill}).`;
      }
      case 'curso_intl': {
        // Capacitación internacional con créditos (POST /api/gastar "curso_intl:<rol>:<id>"): cantidad = id de la persona en
        // la partida. Si ya no está (otra partida), la recibe la primera de ese rol que todavía no tenga experiencia afuera.
        const role = G.normRole ? G.normRole(en.item) : en.item;
        const sinExp = (p) => !(G.isIntlExp ? G.isIntlExp(p) : p.eventos_internacionales > 0);
        const p = s.staff.find((x) => x.id === Number(en.cantidad) && sinExp(x))
          || s.staff.filter((x) => (G.normRole ? G.normRole(x.role) : x.role) === role && sinExp(x)).sort((a, b) => b.skill - a.skill)[0];
        if (!p) return null;
        if (G.darCursoIntl) G.darCursoIntl(s, p); else { p.eventos_internacionales = 1; p.cursoIntl = true; }
        const quien = p.owner ? 'Tú' : p.name;
        return `${quien} terminó la capacitación internacional: ya tiene experiencia internacional.`;
      }
      case 'personal_intl': {
        // Persona con experiencia internacional canjeada con créditos (POST /api/gastar "personal_intl:<rol>"): Semi-senior
        // (el nivel que se contrata con tu fama; sin ventaja en Duelos), habilidad cantidad, 1 evento internacional
        if (!G.ROLES[en.item]) return null;
        const role = G.normRole ? G.normRole(en.item) : en.item;
        const skill = Math.min(5, Math.max(1, n));
        const name = G.nuevoNombre ? G.nuevoNombre(s) : `Profesional ${nuevoId(s)}`;
        const wage = Math.round((G.baseWage ? G.baseWage(role, 'semi_senior', skill) : 60) * 1.1);
        s.staff.push({ id: nuevoId(s), name, role, tier: 'semi_senior', skill, wage, morale: 100, events: 0,
          eventos_nacionales: 0, eventos_internacionales: 1, premium: true });
        (s.contracts || []).forEach((c) => { if (c.internacional && G.requisitosInternacional) c.requisitos = G.requisitosInternacional(s, c, s.staff.map((x) => x.id), s.equip.map((e) => e.id)); });
        return `Se unió a tu equipo: ${name} (${G.ROLES[role].name}, con experiencia internacional).`;
      }
      case 'dinero': {
        s.money += n;
        return `Recibiste ${G.money(n)} para tu productora.`;
      }
      case 'reparar_todo': {
        s.equip.forEach((e) => { e.condition = 100; });
        return 'Todos tus equipos quedaron como nuevos.';
      }
      default: return null;
    }
  }

  /* Aplica las entregas que todavía no están en esta partida. Devuelve los textos de lo recibido. */
  function aplicarEntregas(s, entregas) {
    const p = estado(s);
    const hechos = [];
    (entregas || []).forEach((en) => {
      if (!en || typeof en.id !== 'number' || p.aplicadas.includes(en.id)) return;
      p.aplicadas.push(en.id);
      const t = aplicarUna(s, en);
      if (t) { hechos.push(t); anotar(s, '🎁 ' + t); }
    });
    return hechos;
  }

  /* Partida nueva: lo que se gasta (dinero, repuestos, reparaciones) no se vuelve a entregar;
     los equipos y el personal comprados sí (tus compras siguen siendo tuyas). */
  function prepararPartidaNueva(s, entregas) {
    const p = estado(s);
    p.aplicadas = (entregas || []).filter((en) => !DURABLES.includes(en.tipo)).map((en) => en.id);
    return aplicarEntregas(s, entregas);
  }

  /* ---------- VIP ---------- */
  // activo: Pase VIP de 30 días; nivel: nivel VIP 1–10 (para la tabla PASE_VIP). Sin nivel se queda el que ya tenía.
  function setVip(activo, nivel) {
    vipActivo = !!activo;
    if (nivel !== undefined && nivel !== null && isFinite(Number(nivel))) vipNivel = Math.max(0, Math.min(10, Math.floor(Number(nivel))));
  }
  // Más eventos por día en el modo historia con el Pase VIP (los intentos en línea nunca usan extensiones)
  if (typeof G.registrarExtension === 'function') {
    G.registrarExtension({ id: 'pase_vip', limites: () => { const p = paseActual(); return { turnos: p ? p.turnos - TURNOS_BASE : 0 }; } });
  }
  // Una oferta extra por día mientras el VIP está activo
  function tickVip(s) {
    const p = estado(s);
    if (!vipActivo || s.gameOver || s.currentEvent) return false;
    if (p.vipDia === s.day) return false;
    p.vipDia = s.day;
    const c = G.addContract(s);
    if (c) { c.vip = true; anotar(s, `⭐ VIP: ${c.client} te buscó directamente.`); return true; }
    return false;
  }

  root.Premium = { EXCLUSIVOS, exclusivoDelServidor, aplicarEntregas, prepararPartidaNueva, sincronizarInventario, setVip, tickVip, esPremium, esVip, bloqueado, nombreSerie, costoReparar,
    PASE_VIP, pase, paseActual, get vip() { return vipActivo; }, get nivel() { return vipNivel; } };
  if (typeof module !== 'undefined' && module.exports) module.exports = root.Premium;
})(typeof window !== 'undefined' ? window : globalThis);
