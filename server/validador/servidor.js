#!/usr/bin/env node
/* =========================================================
   EN VIVO Tycoon — Servicio HTTP del validador (solo Node, sin paquetes)
   Escucha SOLO en 127.0.0.1 (PHP lo llama desde la misma máquina).
     POST /validar   cuerpo: intento JSON   cabecera: X-Validador-Clave: <clave>   → resultado JSON
     GET  /salud     cabecera con la clave → { ok, version_logica, ... }
   Variables de entorno:
     VALIDADOR_PUERTO   (por defecto 8790)
     VALIDADOR_CLAVE    (obligatoria, mínimo 24 caracteres) o VALIDADOR_CLAVE_ARCHIVO=/etc/envivo/validador.clave
     ENVIVO_JUEGO       carpeta del juego (por defecto la de arriba de server/)
   ========================================================= */
'use strict';
const http = require('http');
const fs = require('fs');
const crypto = require('crypto');
const V = require('./validador.js');

const HOST = '127.0.0.1';
const PUERTO = Number(process.env.VALIDADOR_PUERTO || 8790);
const MAX_CUERPO = 256 * 1024;

function leerClave() {
  let c = process.env.VALIDADOR_CLAVE || '';
  if (!c && process.env.VALIDADOR_CLAVE_ARCHIVO) {
    try { c = fs.readFileSync(process.env.VALIDADOR_CLAVE_ARCHIVO, 'utf8').trim(); } catch (e) { /* abajo avisa */ }
  }
  return c;
}
const CLAVE = leerClave();
if (CLAVE.length < 24) {
  console.error('ERROR: falta VALIDADOR_CLAVE (mínimo 24 caracteres). Ver server/validador/README.md');
  process.exit(1);
}
const CLAVE_HASH = crypto.createHash('sha256').update(CLAVE).digest();
function claveOk(req) {
  const h = req.headers['x-validador-clave'];
  if (typeof h !== 'string' || !h) return false;
  return crypto.timingSafeEqual(crypto.createHash('sha256').update(h).digest(), CLAVE_HASH);
}

function responder(res, codigo, obj, cerrar) {
  const cuerpo = JSON.stringify(obj);
  const h = { 'Content-Type': 'application/json; charset=utf-8', 'Content-Length': Buffer.byteLength(cuerpo), 'Cache-Control': 'no-store' };
  if (cerrar) h.Connection = 'close'; // el cliente no debe reutilizar esta conexión
  res.writeHead(codigo, h);
  res.end(cuerpo);
}

// Cargar la lógica al arrancar: si js/logic.js tiene un error, el servicio no arranca (systemd lo reintenta)
try { const i = V.info(); console.log(`[validador] lógica ${i.version_logica} cargada desde ${i.raiz}${i.premium ? ' (con premium.js)' : ''}`); } catch (e) {
  console.error('ERROR: no se pudo cargar js/logic.js:', e.message);
  process.exit(1);
}

let atendidos = 0, rechazados = 0;
const servidor = http.createServer((req, res) => {
  const url = (req.url || '').split('?')[0];
  if (!claveOk(req)) { rechazados++; return responder(res, 401, { error: 'clave' }); }
  if (req.method === 'GET' && url === '/salud') {
    try { return responder(res, 200, Object.assign({ ok: true, atendidos, rechazados, memoria_mb: Math.round(process.memoryUsage().rss / 1048576) }, V.info())); } catch (e) { return responder(res, 500, { ok: false, error: e.message }); }
  }
  if (url !== '/validar') return responder(res, 404, { error: 'ruta' });
  if (req.method !== 'POST') return responder(res, 405, { error: 'metodo' });
  const muyGrande = () => {
    cortado = true;
    res.on('finish', () => req.socket && req.socket.destroy()); // cerrar después de mandar la respuesta
    responder(res, 413, { error: 'muy_grande' }, true);
  };
  const trozos = [];
  let largo = 0, cortado = false;
  if (Number(req.headers['content-length'] || 0) > MAX_CUERPO) return muyGrande();
  req.on('data', (b) => {
    if (cortado) return;
    largo += b.length;
    if (largo > MAX_CUERPO) { muyGrande(); return; }
    trozos.push(b);
  });
  req.on('end', () => {
    if (cortado) return;
    let intento;
    try { intento = JSON.parse(Buffer.concat(trozos).toString('utf8')); } catch (e) {
      return responder(res, 400, { valido: false, calidad: null, estrellas: null, coincide: false, detalle: { motivo: 'json_invalido', mensaje: 'El cuerpo no es JSON válido.' } });
    }
    atendidos++;
    const r = V.validate(intento);
    responder(res, r.detalle && r.detalle.motivo === 'logica_no_carga' ? 503 : 200, r);
  });
});
servidor.requestTimeout = 5000;
servidor.headersTimeout = 5000;
servidor.keepAliveTimeout = 5000;
servidor.listen(PUERTO, HOST, () => console.log(`[validador] escuchando en http://${HOST}:${PUERTO}`));
const salir = () => servidor.close(() => process.exit(0));
process.on('SIGTERM', salir);
process.on('SIGINT', salir);
