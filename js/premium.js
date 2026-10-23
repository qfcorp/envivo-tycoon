/* =========================================================
   EN VIVO Tycoon — Compras premium dentro del juego
   - Agrega los equipos exclusivos al catálogo (no se pueden comprar con dinero del juego,
     ni vender, solo se consiguen en la tienda con créditos).
   - Aplica las "entregas" que manda el servidor (cada una UNA sola vez por partida).
   - Efectos del Pase VIP: reparaciones 30 % más baratas y 1 oferta extra al día.
   El saldo de créditos y el VIP los decide SIEMPRE el servidor (server/API.md).
   ========================================================= */
(function (root) {
  'use strict';
  const G = root.Game || (typeof require !== 'undefined' ? require('./logic.js') : null);

  const EXCLUSIVOS = {
    dron4k:       { name: 'Dron 4K',                        icon: 'dron',         cat: 'cam',      price: 0, q: 4, minRep: 0, premium: true, repairBase: 2200, desc: 'Tomas aéreas espectaculares. Cuenta como cámara de calidad 4.' },
    grua:         { name: 'Cámara en grúa telescópica',     icon: 'grua',         cat: 'cam',      price: 0, q: 4, minRep: 0, premium: true, repairBase: 2600, desc: 'Barridos de cine sobre el público. Cámara de calidad 4.' },
    unidad_movil: { name: 'Unidad móvil de transmisión',    icon: 'unidad_movil', cat: 'switcher', price: 0, q: 3, minRep: 0, premium: true, repairBase: 3500, desc: 'Un estudio completo sobre ruedas. Switcher de calidad 3.' },
    generador:    { name: 'Generador diésel',               icon: 'generador',    cat: 'power',    price: 0, q: 1, minRep: 0, premium: true, repairBase: 900,  desc: 'Si se va la luz, tú sigues al aire.' },
  };
  const DURABLES = ['item', 'personal'];   // se vuelven a entregar si empiezas partida nueva
  const VIP_DESCUENTO = 0.3;

  let vipActivo = false;

  function estado(s) {
    if (!s.premium || typeof s.premium !== 'object') s.premium = {};
    if (!Array.isArray(s.premium.aplicadas)) s.premium.aplicadas = [];
    return s.premium;
  }
  function anotar(s, text) {
    s.log.unshift({ day: s.day, text });
    if (s.log.length > 80) s.log.length = 80;
  }
  function nuevoId(s) { s.idc = (s.idc || 0) + 1; return s.idc; }
  const esPremium = (type) => !!(G.CATALOG[type] && G.CATALOG[type].premium);

  /* ---------- Catálogo y reglas protegidas ---------- */
  Object.keys(EXCLUSIVOS).forEach((k) => { G.CATALOG[k] = EXCLUSIVOS[k]; });

  function costoReparar(e) {
    const it = G.CATALOG[e.type];
    const base = it.premium ? it.repairBase : it.price;
    const c = Math.round(base * 0.4 * (100 - e.condition) / 100);
    return vipActivo ? Math.round(c * (1 - VIP_DESCUENTO)) : c;
  }

  const buyOriginal = G.buy;
  const sellOriginal = G.sell;
  G.buy = function (s, type) {
    if (esPremium(type)) return { ok: false, msg: 'Este equipo es exclusivo: se consigue en la Tienda con créditos.' };
    return buyOriginal(s, type);
  };
  G.sell = function (s, id) {
    const e = s.equip.find((x) => x.id === id);
    if (e && esPremium(e.type)) return { ok: false, msg: 'Los equipos exclusivos no se pueden vender.' };
    return sellOriginal(s, id);
  };
  const sellPriceOriginal = G.sellPrice;
  G.sellPrice = (e) => (esPremium(e.type) ? 0 : sellPriceOriginal(e));
  G.repairCost = costoReparar;
  G.repair = function (s, id) {
    const e = s.equip.find((x) => x.id === id);
    if (!e) return { ok: false, msg: 'No existe.' };
    const cost = costoReparar(e);
    if (cost <= 0) return { ok: false, msg: 'Está como nuevo.' };
    if (s.money < cost) return { ok: false, msg: `Reparar cuesta ${G.money(cost)}.` };
    s.money -= cost;
    e.condition = 100;
    anotar(s, `Reparaste ${G.CATALOG[e.type].name} (${G.money(cost)})${vipActivo ? ' con descuento VIP' : ''}.`);
    return { ok: true, msg: 'Quedó como nuevo.' };
  };

  /* ---------- Entregas del servidor ---------- */
  const NOMBRE_ROL = { cam: 'Camarógrafo', dir: 'Director / vMix', audio: 'Sonidista', stream: 'Técnico de streaming' };
  const ESTRELLAS = ['Andrés "El Pulso" Vera', 'Majo Cifuentes', 'Rafa Tamayo', 'Doménica Arias', 'Javier "Zoom" Haro'];

  function aplicarUna(s, en) {
    const n = Math.max(1, Number(en.cantidad) || 1);
    switch (en.tipo) {
      case 'item': {
        const it = G.CATALOG[en.item];
        if (!it) return null;
        if (s.equip.length >= 40) return `No cupo ${it.name} en la bodega.`;
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
        const skill = Math.min(5, Math.max(1, n));
        const usados = s.staff.map((p) => p.name);
        const name = ESTRELLAS.find((x) => !usados.includes(x)) || `Profesional ${nuevoId(s)}`;
        s.staff.push({ id: nuevoId(s), name, role: en.item, skill, wage: 25 + skill * 18, morale: 100, events: 0, premium: true });
        return `Se unió a tu equipo: ${name} (${NOMBRE_ROL[en.item]}, habilidad ${skill}).`;
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
  function setVip(activo) { vipActivo = !!activo; }
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

  root.Premium = { EXCLUSIVOS, aplicarEntregas, prepararPartidaNueva, setVip, tickVip, esPremium, costoReparar, get vip() { return vipActivo; } };
  if (typeof module !== 'undefined' && module.exports) module.exports = root.Premium;
})(typeof window !== 'undefined' ? window : globalThis);
