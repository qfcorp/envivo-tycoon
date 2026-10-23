#!/usr/bin/env node
/* =========================================================
   EN VIVO Tycoon — Validador de intentos de evento (Node)
   Carga las reglas del juego (js/datos.js si existe, js/logic.js y js/premium.js si existe)
   y repite cada intento con la semilla del servidor. Ver README.md.

   Como módulo:  const V = require('./validador.js');  V.validate(intento)
   Por consola:  node validador.js < intento.json        (imprime el resultado en JSON)
                 node validador.js --version             (versión de la lógica cargada)
   Carpeta del juego: la de arriba de server/ (o la variable ENVIVO_JUEGO=/var/www/envivo).
   ========================================================= */
'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const Intento = require('./intento.js');

const RAIZ = path.resolve(process.env.ENVIVO_JUEGO || path.join(__dirname, '..', '..'));
const ARCHIVOS = ['datos.js', 'logic.js', 'premium.js'].map((f) => path.join(RAIZ, 'js', f));
const [DATOS, LOGICA, PREMIUM] = ARCHIVOS;

let motor = null; // { G, Premium, version, firma, cargado }

function firmaArchivos() {
  return ARCHIVOS.map((f) => { try { const st = fs.statSync(f); return `${st.mtimeMs}:${st.size}`; } catch (e) { return '-'; } }).join('|');
}

function olvidar(f) { try { delete require.cache[require.resolve(f)]; } catch (e) { /* no estaba */ } }

/* Carga (o recarga) la lógica. Si algo falla, se queda con la versión anterior y lanza el error. */
function cargar() {
  const firma = firmaArchivos();
  const hash = crypto.createHash('sha256');
  ARCHIVOS.forEach((f) => { if (fs.existsSync(f)) hash.update(path.basename(f) + '\0' + fs.readFileSync(f)); });
  const version = hash.digest('hex').slice(0, 12);
  ARCHIVOS.forEach(olvidar);
  const viejoGame = globalThis.Game, viejoPremium = globalThis.Premium;
  delete globalThis.Game; delete globalThis.Premium;
  try {
    if (fs.existsSync(DATOS)) {
      const d = require(DATOS);
      // Si datos.js solo exporta (module.exports) lo dejamos también como global, por si logic.js lo busca así
      if (d && typeof d === 'object' && Object.keys(d).length && globalThis.Datos === undefined) globalThis.Datos = d;
    }
    const G = require(LOGICA);
    for (const f of ['newGame', 'startEvent', 'currentIncident', 'resolveIncident', 'finishEvent']) {
      if (typeof G[f] !== 'function') throw new Error(`js/logic.js no exporta ${f}()`);
    }
    let Premium = null;
    if (fs.existsSync(PREMIUM)) { globalThis.Game = G; Premium = require(PREMIUM); }
    motor = { G, Premium, version, firma, cargado: new Date().toISOString() };
    return motor;
  } catch (e) {
    if (viejoGame !== undefined) globalThis.Game = viejoGame;
    if (viejoPremium !== undefined) globalThis.Premium = viejoPremium;
    throw e;
  }
}

/* Recarga sola si alguien actualizó js/ (git pull) — así no hace falta reiniciar el servicio. */
function motorActual() {
  if (!motor || (process.env.ENVIVO_RECARGAR !== '0' && firmaArchivos() !== motor.firma)) {
    try { cargar(); } catch (e) { if (!motor) throw e; console.error('[validador] no se pudo recargar la lógica, sigo con la anterior:', e.message); }
  }
  return motor;
}

/* Guardia: mientras se repite un intento, Math.random está prohibido (rompería la repetición) y
   se anota si la lógica mira el reloj (Date.now / new Date()). Todo es síncrono: no afecta a nadie más. */
function conGuardia(fn) {
  const rnd = Math.random, now = Date.now, D = globalThis.Date;
  const uso = { random: 0, reloj: 0 };
  Math.random = () => { uso.random++; throw new Intento.ErrorIntento('logica_no_determinista', 'js/logic.js usó Math.random durante el evento: la jugada no se puede repetir. Hay que usar rnd(s).'); };
  Date.now = () => { uso.reloj++; return now.call(D); };
  try { return { valor: fn(), uso }; } finally { Math.random = rnd; Date.now = now; }
}

function validate(intento) {
  let m;
  try { m = motorActual(); } catch (e) {
    return { valido: false, calidad: null, estrellas: null, coincide: false, version_logica: null,
      detalle: { motivo: 'logica_no_carga', mensaje: String(e.message || e) } };
  }
  const t0 = process.hrtime.bigint();
  if (m.Premium && typeof m.Premium.setVip === 'function') m.Premium.setVip(!!(intento && intento.vip === true));
  const { valor: r, uso } = conGuardia(() => Intento.repetir(m.G, intento));
  if (m.Premium && typeof m.Premium.setVip === 'function') m.Premium.setVip(false);
  if (uso.random) { r.valido = false; r.coincide = false; r.detalle.motivo = 'logica_no_determinista'; }
  if (uso.reloj) r.detalle.aviso = 'js/logic.js usó Date.now durante el evento (revisar que no cambie el resultado).';
  r.version_logica = m.version;
  if (intento && typeof intento.version_logica === 'string' && intento.version_logica !== m.version) r.detalle.version_distinta = true;
  r.detalle.ms = Number(process.hrtime.bigint() - t0) / 1e6;
  return r;
}

/* Para pruebas y para el cliente: juega un intento eligiendo con elegir(incidente, n). */
function play(intento, elegir) {
  const m = motorActual();
  if (m.Premium && m.Premium.setVip) m.Premium.setVip(!!(intento && intento.vip === true));
  try { return conGuardia(() => Intento.jugar(m.G, intento, elegir)).valor; } finally { if (m.Premium && m.Premium.setVip) m.Premium.setVip(false); }
}

function info() {
  const m = motorActual();
  return { version_logica: m.version, cargado: m.cargado, raiz: RAIZ, premium: !!m.Premium, datos: fs.existsSync(DATOS) };
}

module.exports = { validate, play, info, cargar, motorActual, RAIZ };

/* ---------- Modo consola (respaldo para PHP con proc_open) ---------- */
if (require.main === module) {
  if (process.argv.includes('--version')) {
    try { process.stdout.write(JSON.stringify(info()) + '\n'); process.exit(0); } catch (e) { process.stderr.write(String(e.message) + '\n'); process.exit(2); }
  }
  const trozos = [];
  let largo = 0;
  process.stdin.on('data', (b) => {
    largo += b.length;
    if (largo > 256 * 1024) { process.stdout.write(JSON.stringify({ valido: false, detalle: { motivo: 'muy_grande', mensaje: 'Máximo 256 KB.' } }) + '\n'); process.exit(1); }
    trozos.push(b);
  });
  process.stdin.on('end', () => {
    let intento;
    try { intento = JSON.parse(Buffer.concat(trozos).toString('utf8')); } catch (e) {
      process.stdout.write(JSON.stringify({ valido: false, calidad: null, estrellas: null, coincide: false, detalle: { motivo: 'json_invalido', mensaje: 'La entrada no es JSON válido.' } }) + '\n');
      process.exit(1);
    }
    const r = validate(intento);
    process.stdout.write(JSON.stringify(r) + '\n');
    process.exit(r.detalle && r.detalle.motivo === 'logica_no_carga' ? 2 : 0);
  });
}
