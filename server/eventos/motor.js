#!/usr/bin/env node
/* =========================================================
   EN VIVO Tycoon — Ayudante de los eventos en línea (Duelo de Productoras y Desafío Técnico del Día)
   Usa EXACTAMENTE las mismas reglas que el validador (server/validador/validador.js → js/logic.js),
   así que todo lo que calcula aquí lo puede repetir el validador.

   Acciones (entrada JSON por stdin, una línea JSON por stdout):
     { "accion": "fantasma", "intento": {...sin decisiones...}, "politica": "prudente", "fijar": true }
        → juega el intento con la política de la IA (el "fantasma" del defensor de un duelo) y lo
          valida con el validador: { ok, decisiones, calidad, estrellas, incidentes, contrato, version_logica }
          (fijar: deja en contrato.imprevistos los imprevistos sorteados, para dárselos iguales al retador)
     { "accion": "semilla", "intento": {...sin seed...}, "semilla_base": 123, "requeridos": ["lluvia"], "max": 3000 }
        → busca la primera variante k de la semilla del día con la que el evento trae TODOS los imprevistos
          requeridos (para "lunes lluvia garantizada", etc.): { ok, seed, k, incidentes, completo }
     { "accion": "version" } → { ok, version_logica }
   Como módulo: const M = require('./motor.js'); M.fantasma(intento, 'prudente'); M.semilla(...)
   Uso desde PHP: proc_open([node, 'server/eventos/motor.js']) (ver server/src/Repeticion.php).
   ========================================================= */
'use strict';
const path = require('path');
const V = require(path.join(__dirname, '..', 'validador', 'validador.js'));
const Intento = require(path.join(__dirname, '..', 'validador', 'intento.js'));

const POLITICAS = {
  // "Productor prudente": la primera opción disponible (las opciones de cada imprevisto vienen ordenadas
  // de la más preparada a la más improvisada). No mira el futuro ni el azar: un retador atento le puede ganar.
  prudente: (inc) => { const op = inc.choices.find((c) => c.ok); return op ? op.i : 0; },
  // "Productor arriesgado": la opción disponible del medio (para variar, no se usa por defecto)
  arriesgado: (inc) => { const op = inc.choices.filter((c) => c.ok); return op.length ? op[Math.floor((op.length - 1) / 2)].i : 0; },
};

/* Variante k de la semilla del día (k = 0 es la semilla base). Entero de 32 bits con signo. */
function variante(base, k) { return k === 0 ? (base | 0) : ((base | 0) + Math.imul(k, 0x9E3779B1) + Math.imul(k, k)) | 0; }

/* Fantasma del defensor. Con fijar=true primero sortea los imprevistos con el equipo del defensor y los deja en
   contrato.imprevistos (el retador recibe el MISMO contrato): si js/logic.js respeta esa lista (ver
   server/INTEGRAR_DUELOS_DESAFIO.md), los dos lados juegan exactamente los mismos imprevistos. Si no la respeta, el campo
   se ignora y todo sigue funcionando con la misma semilla. Devuelve también el intento final (el que se guarda). */
function fantasma(intento, politica, fijar) {
  const elegir = POLITICAS[politica] || POLITICAS.prudente;
  const sin = Object.assign({}, intento);
  delete sin.decisiones; delete sin.cliente_resultado;
  if (fijar) {
    try {
      const m = V.motorActual();
      const c = Object.assign({}, sin.contrato); delete c.imprevistos;
      sin.contrato = Object.assign(c, { imprevistos: incidentesDe(m.G, m.Premium, Object.assign({}, sin, { contrato: c })) });
    } catch (e) {
      return { ok: false, motivo: e && e.motivo ? e.motivo : 'error_logica', mensaje: String((e && e.message) || e) };
    }
  }
  let jugado;
  try { jugado = V.play(sin, (inc) => elegir(inc)); } catch (e) {
    return { ok: false, motivo: e && e.motivo ? e.motivo : 'error_logica', mensaje: String((e && e.message) || e) };
  }
  // Se repite con el validador: el resultado del fantasma es el mismo que el validador daría
  const r = V.validate(Object.assign({}, sin, { decisiones: jugado.decisiones, cliente_resultado: jugado.resultado }));
  if (!r.valido) return { ok: false, motivo: (r.detalle && r.detalle.motivo) || 'no_valido', mensaje: r.detalle && r.detalle.mensaje };
  return { ok: true, politica: POLITICAS[politica] ? politica : 'prudente', decisiones: jugado.decisiones, calidad: r.calidad, estrellas: r.estrellas,
    incidentes: (r.detalle.incidentes || []).map((x) => ({ clave: x.clave, eleccion: x.eleccion, q: x.q })), version_logica: r.version_logica,
    contrato: sin.contrato };
}

/* Qué imprevistos trae el evento con esta semilla y este equipo (sin jugar). */
function incidentesDe(G, Premium, intento) {
  const { s, contractId, staffIds, equipIds } = Intento.crearEstado(G, intento);
  if (Premium && Premium.setVip) Premium.setVip(intento.vip === true);
  try {
    const r = G.startEvent(s, contractId, staffIds, equipIds);
    if (!r || !r.ok) throw new Intento.ErrorIntento('evento_no_inicia', (r && r.msg) || 'No se pudo iniciar.');
    return s.currentEvent.incidents.map((x) => x.key);
  } finally { if (Premium && Premium.setVip) Premium.setVip(false); }
}

function semilla(intento, base, requeridos, max) {
  const m = V.motorActual();
  const req = Array.isArray(requeridos) ? requeridos.filter((x) => typeof x === 'string') : [];
  const tope = Math.max(1, Math.min(Number(max) || 3000, 20000));
  let mejor = null;
  try {
    for (let k = 0; k < tope; k++) {
      const seed = variante(Number(base) || 0, k);
      const inc = incidentesDe(m.G, m.Premium, Object.assign({}, intento, { seed }));
      const tiene = req.filter((x) => inc.includes(x)).length;
      if (!mejor || tiene > mejor.tiene) mejor = { seed, k, incidentes: inc, tiene };
      if (tiene === req.length) return { ok: true, seed, k, incidentes: inc, completo: true, version_logica: m.version };
    }
  } catch (e) {
    return { ok: false, motivo: e && e.motivo ? e.motivo : 'error_logica', mensaje: String((e && e.message) || e) };
  }
  // No hubo ninguna variante con todos: la que trae más (el evento igual se juega)
  return { ok: true, seed: mejor.seed, k: mejor.k, incidentes: mejor.incidentes, completo: false, version_logica: m.version };
}

function atender(x) {
  if (!x || typeof x !== 'object') return { ok: false, motivo: 'json_invalido' };
  if (x.accion === 'version') { try { return { ok: true, version_logica: V.info().version_logica }; } catch (e) { return { ok: false, motivo: 'logica_no_carga', mensaje: e.message }; } }
  if (x.accion === 'fantasma') return fantasma(x.intento, x.politica, x.fijar === true);
  if (x.accion === 'semilla') return semilla(x.intento, x.semilla_base, x.requeridos, x.max);
  return { ok: false, motivo: 'accion_desconocida' };
}

module.exports = { fantasma, semilla, variante, atender, POLITICAS };

if (require.main === module) {
  const trozos = [];
  let largo = 0;
  process.stdin.on('data', (b) => { largo += b.length; if (largo > 256 * 1024) { process.stdout.write('{"ok":false,"motivo":"muy_grande"}\n'); process.exit(1); } trozos.push(b); });
  process.stdin.on('end', () => {
    let x;
    try { x = JSON.parse(Buffer.concat(trozos).toString('utf8')); } catch (e) { process.stdout.write('{"ok":false,"motivo":"json_invalido"}\n'); process.exit(1); }
    let r;
    try { r = atender(x); } catch (e) { r = { ok: false, motivo: 'error', mensaje: String(e.message || e) }; }
    process.stdout.write(JSON.stringify(r) + '\n');
    process.exit(0);
  });
}
