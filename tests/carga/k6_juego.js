// =====================================================================================================================
//  Prueba de carga de EN VIVO Tycoon con k6 (https://k6.io). Instrucciones en español: docs/PRUEBA_CARGA.md
//  Simula jugadores con el celular abierto en el juego (por defecto ~300 a la vez):
//    - cada jugador usa una cuenta de prueba ya creada (tests/carga/preparar_cuentas.php: galleta de sesión), y una
//      parte entra con correo y clave de verdad (POST /api/entrar, LOGIN_PCT %),
//    - pide /api/estado al abrir y cada ~60 s, y lee el chat (GET /api/chat) cada 3 a 20 s, como el juego,
//    - de vez en cuando escribe en el chat (mensaje rápido) y abre el Desafío del día: empezar + terminar
//      (POST /api/desafio/empezar y /terminar: el servidor busca la semilla y repite la jugada en el validador),
//    - /api/salud cada tanto (lo que mira el monitor externo).
//  Uso:   k6 run -e BASE=http://127.0.0.1:8080 -e CUENTAS=/tmp/cuentas.json tests/carga/k6_juego.js
//  Variables (-e): BASE, CUENTAS (JSON de preparar_cuentas.php), JUGADORES (300), SUBIDA (2m), MESETA (5m),
//    BAJADA (1m), LOGIN_PCT (10), DESAFIO_PCT (30: % de jugadores que juegan el Desafío una vez), CHAT_PCT (5: % de
//    lecturas del chat en que además escriben), IP_POR_JUGADOR (1: manda CF-Connecting-IP distinto por jugador; solo
//    sirve si k6 corre EN el servidor contra nginx en 127.0.0.1, que confía en esa cabecera desde 127.0.0.1; así los
//    límites por IP cuentan a cada jugador por separado como en la realidad), HOST (Host: para --resolve sin DNS).
// =====================================================================================================================
import http from 'k6/http';
import { check, sleep } from 'k6';
import { SharedArray } from 'k6/data';
import { Counter, Rate, Trend } from 'k6/metrics';

const BASE = (__ENV.BASE || 'http://127.0.0.1:8080').replace(/\/$/, '');
const JUGADORES = Number(__ENV.JUGADORES || 300);
const LOGIN_PCT = Number(__ENV.LOGIN_PCT ?? 10);
const DESAFIO_PCT = Number(__ENV.DESAFIO_PCT ?? 30);
const CHAT_PCT = Number(__ENV.CHAT_PCT ?? 5);
const IP_POR_JUGADOR = (__ENV.IP_POR_JUGADOR ?? '1') === '1';
const HOST = __ENV.HOST || '';

const cuentas = new SharedArray('cuentas', () => JSON.parse(open(__ENV.CUENTAS || './cuentas.json')));

export const options = {
  scenarios: {
    jugadores: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: __ENV.SUBIDA || '2m', target: JUGADORES },
        { duration: __ENV.MESETA || '5m', target: JUGADORES },
        { duration: __ENV.BAJADA || '1m', target: 0 },
      ],
      gracefulRampDown: '20s',
    },
  },
  thresholds: {
    // Lo que se considera "aguanta": casi sin errores y respuestas rápidas en lo que el jugador nota
    errores_servidor: ['rate<0.01'],
    'http_req_duration{ruta:estado}': ['p(95)<800'],
    'http_req_duration{ruta:chat}': ['p(95)<500'],
    'http_req_duration{ruta:entrar}': ['p(95)<1500'],
    'http_req_duration{ruta:desafio_terminar}': ['p(95)<5000'],
  },
  summaryTrendStats: ['avg', 'med', 'p(90)', 'p(95)', 'p(99)', 'max'],
  discardResponseBodies: false,
};

const erroresServidor = new Rate('errores_servidor');   // 5xx o sin respuesta
const limitados = new Counter('limitados_429');          // frenados por el límite (nginx o PHP)
const desafios = new Counter('desafios_terminados');
const desafioValidacion = new Trend('desafio_validacion_ms', true);
http.setResponseCallback(http.expectedStatuses({ min: 200, max: 299 }, 409, 410, 429));

function ipDe(vu) { return `10.${(vu >> 16) & 255}.${(vu >> 8) & 255}.${vu & 255 || 1}`; }

function cab(vu, extra) {
  const h = Object.assign({ 'X-Envivo': '1', 'Content-Type': 'application/json', 'User-Agent': 'k6-envivo-carga' }, extra || {});
  if (IP_POR_JUGADOR) h['CF-Connecting-IP'] = ipDe(vu);
  if (HOST) h.Host = HOST;
  return h;
}

function anotar(r, ruta) {
  const caido = r.status === 0 || r.status >= 500;
  erroresServidor.add(caido, { ruta });
  if (r.status === 429) limitados.add(1, { ruta });
  return !caido;
}

function pedir(metodo, ruta, etiqueta, cuerpo, vu, galleta) {
  const params = { headers: cab(vu), tags: { ruta: etiqueta }, timeout: '30s' };
  if (galleta) params.cookies = { envivo_s: { value: galleta, replace: true } };
  const r = metodo === 'GET' ? http.get(BASE + ruta, params) : http.post(BASE + ruta, cuerpo ? JSON.stringify(cuerpo) : '{}', params);
  anotar(r, etiqueta);
  return r;
}
function json(r) { try { return r.json(); } catch (e) { return null; } }

// Estado de cada jugador virtual (cada VU es un jugador)
const yo = { galleta: null, chatDesde: 0, proxEstado: 0, vueltas: 0, desafio: false };

function entrar(vu, c) {
  yo.desafio = Math.random() * 100 < DESAFIO_PCT;   // este jugador jugará el Desafío una vez
  if (Math.random() * 100 < LOGIN_PCT) {
    const r = pedir('POST', '/api/entrar', 'entrar', { email: c.email, clave: c.clave }, vu, null);
    check(r, { 'entrar 200': (x) => x.status === 200 });
    const g = r.cookies && r.cookies.envivo_s && r.cookies.envivo_s[0] ? r.cookies.envivo_s[0].value : null;
    yo.galleta = g || c.galleta;   // la galleta va a mano en cada petición (no depende del Secure/Domain)
  } else {
    yo.galleta = c.galleta;
  }
  const e = pedir('GET', '/api/estado', 'estado', null, vu, yo.galleta);
  check(e, { 'estado 200': (x) => x.status === 200 });
  yo.proxEstado = Date.now() + 60000;
}

function desafio(vu) {
  yo.desafio = false;
  const d = pedir('GET', '/api/desafio', 'desafio', null, vu, yo.galleta);
  if (d.status !== 200) return;
  // Maleta barata que siempre entra en el presupuesto: 1 cámara básica + switcher, audio, encoder, internet, UPS y lluvia
  const r = pedir('POST', '/api/desafio/empezar', 'desafio_empezar', { personal: [], equipos: ['e5', 'e9', 'e11', 'e13', 'e14', 'e15', 'e16'] }, vu, yo.galleta);
  const j = json(r);
  const id = j && (j.intento_id || (j.intento && j.intento.intento_id));
  if (r.status !== 200 || !id) return;
  sleep(5 + Math.random() * 10);   // "juega" el evento
  const t0 = Date.now();
  const f = pedir('POST', '/api/desafio/terminar', 'desafio_terminar', { intento_id: id, decisiones: [0, 1, 0] }, vu, yo.galleta);
  desafioValidacion.add(Date.now() - t0);
  if (check(f, { 'desafio terminar 200': (x) => x.status === 200 })) desafios.add(1);
}

export default function () {
  const vu = __VU;
  const c = cuentas[(vu - 1) % cuentas.length];
  if (!yo.galleta) entrar(vu, c);

  // Leer el chat (como el juego: cada 3 s con el chat abierto, hasta 20 s con el chat cerrado)
  const r = pedir('GET', `/api/chat?canal=servidor&desde=${yo.chatDesde}`, 'chat', null, vu, yo.galleta);
  const j = json(r);
  if (j && Array.isArray(j.mensajes) && j.mensajes.length) yo.chatDesde = Math.max(yo.chatDesde, ...j.mensajes.map((m) => Number(m.id) || 0));
  if (Math.random() * 100 < CHAT_PCT) {
    const rap = ['hola', 'vamos_festival', 'buen_evento'][Math.floor(Math.random() * 3)];
    pedir('POST', '/api/chat', 'chat_escribir', { canal: 'servidor', rapido: rap }, vu, yo.galleta);
  }
  if (Date.now() > yo.proxEstado) {
    pedir('GET', '/api/estado', 'estado', null, vu, yo.galleta);
    yo.proxEstado = Date.now() + 45000 + Math.random() * 30000;
  }
  yo.vueltas++;
  if (yo.desafio && yo.vueltas >= 2 + (vu % 5)) desafio(vu);
  if (vu % 50 === 1 && Math.random() < 0.05) pedir('GET', '/api/salud', 'salud', null, vu, null);
  sleep(Math.random() < 0.3 ? 3 : 3 + Math.random() * 17);
}
