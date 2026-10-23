#!/usr/bin/env node
/**
 * EN VIVO Tycoon · Configurador del servidor oficial de Discord
 * ---------------------------------------------------------------
 * Lee estructura.json y deja el servidor de Discord igual al diseño: roles, categorías, canales, permisos,
 * etiquetas de los foros, AutoMod, Comunidad, Onboarding y los mensajes fijos (bienvenida, reglas, FAQ...).
 *
 *  - Se puede correr las veces que quieras: solo crea lo que falta y actualiza lo que cambió (idempotente).
 *  - NUNCA borra nada: ni canales, ni roles, ni mensajes, ni reglas (el script no hace ninguna llamada DELETE).
 *  - El token se lee de la variable DISCORD_TOKEN o del archivo .env junto a este script (ignorado por git).
 *    Nunca se imprime ni se guarda en otro lado.
 *
 * Uso:
 *   node configurar_servidor.js             configura el servidor
 *   node configurar_servidor.js --simular   muestra qué haría, sin conectarse a Discord (no necesita token)
 *   node configurar_servidor.js --ayuda
 *
 * Node 18 o más nuevo. Sin dependencias (usa fetch contra la API REST v10 de Discord).
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const DIR = path.dirname(fileURLToPath(import.meta.url));
const ARGS = process.argv.slice(2);
const argValor = (n) => { const i = ARGS.indexOf(n); return i >= 0 ? ARGS[i + 1] : undefined; };
const SIMULAR = ARGS.includes('--simular');
const API_OFICIAL = 'https://discord.com/api/v10';

// Permisos de Discord (bits). https://discord.com/developers/docs/topics/permissions
const PERMISOS = {
  CREATE_INSTANT_INVITE: 0, KICK_MEMBERS: 1, BAN_MEMBERS: 2, ADMINISTRATOR: 3, MANAGE_CHANNELS: 4, MANAGE_GUILD: 5,
  ADD_REACTIONS: 6, VIEW_AUDIT_LOG: 7, PRIORITY_SPEAKER: 8, STREAM: 9, VIEW_CHANNEL: 10, SEND_MESSAGES: 11,
  SEND_TTS_MESSAGES: 12, MANAGE_MESSAGES: 13, EMBED_LINKS: 14, ATTACH_FILES: 15, READ_MESSAGE_HISTORY: 16,
  MENTION_EVERYONE: 17, USE_EXTERNAL_EMOJIS: 18, VIEW_GUILD_INSIGHTS: 19, CONNECT: 20, SPEAK: 21, MUTE_MEMBERS: 22,
  DEAFEN_MEMBERS: 23, MOVE_MEMBERS: 24, USE_VAD: 25, CHANGE_NICKNAME: 26, MANAGE_NICKNAMES: 27, MANAGE_ROLES: 28,
  MANAGE_WEBHOOKS: 29, MANAGE_GUILD_EXPRESSIONS: 30, USE_APPLICATION_COMMANDS: 31, REQUEST_TO_SPEAK: 32,
  MANAGE_EVENTS: 33, MANAGE_THREADS: 34, CREATE_PUBLIC_THREADS: 35, CREATE_PRIVATE_THREADS: 36,
  USE_EXTERNAL_STICKERS: 37, SEND_MESSAGES_IN_THREADS: 38, USE_EMBEDDED_ACTIVITIES: 39, MODERATE_MEMBERS: 40,
  VIEW_CREATOR_MONETIZATION_ANALYTICS: 41, USE_SOUNDBOARD: 42, CREATE_GUILD_EXPRESSIONS: 43, CREATE_EVENTS: 44,
  USE_EXTERNAL_SOUNDS: 45, SEND_VOICE_MESSAGES: 46, SEND_POLLS: 49, USE_EXTERNAL_APPS: 50, PIN_MESSAGES: 51,
};
const TIPO_CANAL = { texto: 0, voz: 2, categoria: 4, anuncios: 5, escenario: 13, foro: 15 };
const TIPOS_VOZ = new Set([2, 13]);
const FORO_REQUIERE_ETIQUETA = 1 << 4;
const AUTOMOD_TIPO = { palabras: 1, spam: 3, lista_discord: 4, menciones: 5 };
const AUTOMOD_UNICO = new Set([3, 4, 5]);          // Discord permite solo una regla de estos tipos por servidor
const AUTOMOD_PRESETS = { groserias: 1, sexual: 2, insultos: 3 };

// ---------------------------------------------------------------- utilidades
let SECRETOS = [];
const ocultar = (t) => { let s = String(t); for (const x of SECRETOS) if (x && x.length >= 6) s = s.split(x).join('***'); return s; };
const log = (...a) => console.log(ocultar(a.join(' ')));
const aviso = (...a) => console.warn(ocultar(a.join(' ')));
const dormir = (ms) => new Promise((r) => setTimeout(r, ms));
const bits = (lista = []) => {
  let v = 0n;
  for (const n of lista) {
    if (!(n in PERMISOS)) throw new Error(`Permiso desconocido en estructura.json: ${n}`);
    v |= 1n << BigInt(PERMISOS[n]);
  }
  return v.toString();
};
const tieneBit = (permisos, nombre) => (BigInt(permisos || '0') & (1n << BigInt(PERMISOS[nombre]))) !== 0n;
const color = (hex) => (hex ? parseInt(String(hex).replace('#', ''), 16) : 0);
const esTextoLike = (tipo) => !TIPOS_VOZ.has(tipo) && tipo !== 4;
const normNombre = (nombre, tipo) => {
  const n = String(nombre).trim();
  return esTextoLike(tipo) ? n.toLowerCase().replace(/\s+/g, '-') : n;
};
const ordenar = (arr) => [...(arr || [])].map(String).sort();
const igual = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const plantilla = (t, s) => String(t).replaceAll('{N}', s.numero).replaceAll('{CIUDAD}', s.ciudad)
  .replaceAll('{ciudad}', s.ciudad.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-'));

function cargarEnv(archivo) {
  const out = {};
  if (!archivo || !fs.existsSync(archivo)) return out;
  const texto = fs.readFileSync(archivo, 'utf8').replace(/^﻿/, '');
  for (const linea of texto.split(/\r?\n/)) {
    const l = linea.trim();
    if (!l || l.startsWith('#')) continue;
    const m = l.match(/^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (!m) continue;
    let v = m[2].trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    out[m[1]] = v;
  }
  return out;
}

function ayuda() {
  console.log(`
Configurador del Discord de EN VIVO Tycoon

  node configurar_servidor.js             Configura el servidor (crea lo que falta, actualiza lo que cambió).
  node configurar_servidor.js --simular   Muestra lo que haría, sin conectarse a Discord (no necesita token).

Necesita (en variables de entorno o en el archivo discord/.env):
  DISCORD_TOKEN=el token del bot "EN VIVO Bot"   (nunca lo subas a GitHub)
  DISCORD_GUILD_ID=el número (ID) de tu servidor de Discord
Opcional:
  SOPORTE_CORREO=correo de soporte para los mensajes (si no, dice "el correo que aparece en el juego")

Otras opciones: --estructura <archivo.json>  --env <archivo .env>  --estado <archivo de estado>
Guía completa: docs/DISCORD.md`);
}

// ---------------------------------------------------------------- cliente de la API
class ErrorDiscord extends Error {
  constructor(status, datos, metodo, ruta) {
    const detalle = datos && typeof datos === 'object'
      ? `${datos.message || ''}${datos.code ? ` (código ${datos.code})` : ''}${datos.errors ? ' ' + JSON.stringify(datos.errors).slice(0, 600) : ''}`
      : String(datos || '').slice(0, 300);
    super(`Discord respondió ${status} a ${metodo} ${ruta}: ${detalle}`);
    this.status = status; this.datos = datos;
  }
}

class Discord {
  constructor(base, token) {
    this.base = base.replace(/\/+$/, '');
    this.token = token;
    this.llamadas = 0; this.escrituras = 0; this.esperas = 0;
    this.pausaGlobalHasta = 0;
    this.pausas = new Map();
  }
  claveCubo(metodo, ruta) {
    // Los límites de Discord dependen de la ruta y su ID principal (servidor o canal); los demás IDs se agrupan.
    const r = ruta.split('?')[0].replace(/^(\/(?:guilds|channels)\/\d+)(.*)$/, (m, a, b) => a + b.replace(/\/\d{5,}/g, '/:id'));
    return `${metodo} ${r}`;
  }
  async pedir(metodo, ruta, cuerpo, razon) {
    const cubo = this.claveCubo(metodo, ruta);
    for (let intento = 0; intento < 10; intento++) {
      const espera = Math.max(this.pausaGlobalHasta, this.pausas.get(cubo) || 0) - Date.now();
      if (espera > 0) await dormir(espera);
      const headers = {
        Authorization: `Bot ${this.token}`,
        'User-Agent': 'DiscordBot (https://juego.tukanec.com, 1.0) EnVivoConfigurador',
      };
      if (cuerpo !== undefined) headers['Content-Type'] = 'application/json';
      if (razon) headers['X-Audit-Log-Reason'] = encodeURIComponent(String(razon).slice(0, 400));
      let res;
      try {
        res = await fetch(this.base + ruta, { method: metodo, headers, body: cuerpo !== undefined ? JSON.stringify(cuerpo) : undefined,
          signal: AbortSignal.timeout(30000) });
      } catch (e) {
        if (intento >= 4) throw new Error(`No se pudo conectar con Discord (${e.cause?.code || e.name}). Revisa tu internet.`);
        await dormir(1000 * 2 ** intento);
        continue;
      }
      this.llamadas++;
      if (metodo !== 'GET') this.escrituras++;
      const restante = res.headers.get('x-ratelimit-remaining');
      const reinicio = parseFloat(res.headers.get('x-ratelimit-reset-after') || '');
      if (restante === '0' && reinicio > 0) this.pausas.set(cubo, Date.now() + reinicio * 1000 + 50);
      if (res.status === 429) {
        let datos = {};
        try { datos = await res.json(); } catch { /* sin cuerpo */ }
        let seg = Number(datos.retry_after);
        if (!Number.isFinite(seg)) seg = parseFloat(res.headers.get('retry-after') || '1');
        if (!Number.isFinite(seg) || seg < 0) seg = 1;
        seg = Math.min(seg, 300);
        this.esperas++;
        const global = datos.global || res.headers.get('x-ratelimit-global') === 'true';
        log(`   ⏳ Discord pidió esperar ${seg.toFixed(2)} s${global ? ' (límite general)' : ''}; reintentando...`);
        const hasta = Date.now() + seg * 1000 + 50;
        if (global) this.pausaGlobalHasta = hasta; else this.pausas.set(cubo, hasta);
        continue;
      }
      if (res.status >= 500 && intento < 4) { await dormir(1000 * 2 ** intento); continue; }
      if (res.status === 204) return null;
      const texto = await res.text();
      let datos = null;
      try { datos = texto ? JSON.parse(texto) : null; } catch { datos = texto; }
      if (!res.ok) throw new ErrorDiscord(res.status, datos, metodo, ruta);
      return datos;
    }
    throw new Error(`Demasiados reintentos con ${metodo} ${ruta}`);
  }
}

/** Modo --simular: no se conecta a nada. Las lecturas devuelven un servidor vacío y las escrituras solo se muestran. */
class Simulador {
  constructor() { this.llamadas = 0; this.escrituras = 0; this.esperas = 0; this.n = 0; }
  async pedir(metodo, ruta, cuerpo, razon) {
    const g = 'SIMULADO';
    if (metodo === 'GET') {
      if (ruta === '/users/@me') return { id: 'bot', username: 'EN VIVO Bot (simulado)' };
      if (/^\/guilds\/[^/]+$/.test(ruta.split('?')[0])) return { id: g, name: 'tu servidor (simulado)', owner_id: 'dueno', features: [], verification_level: 0, explicit_content_filter: 0 };
      if (ruta.endsWith('/roles')) return [{ id: g, name: '@everyone', position: 0, permissions: '0' }, { id: 'rolbot', name: 'EN VIVO Bot', position: 1, permissions: '8', managed: true }];
      if (ruta.includes('/members/')) return { roles: ['rolbot'] };
      if (ruta.endsWith('/onboarding')) return { prompts: [], default_channel_ids: [], enabled: false, mode: 0 };
      return [];
    }
    this.escrituras++;
    log(`   [simular] ${metodo.padEnd(5)} ${razon || ruta}`);
    const id = `sim${++this.n}`;
    if (cuerpo && typeof cuerpo === 'object' && !Array.isArray(cuerpo)) return { id, ...cuerpo, author: { id: 'bot' } };
    return { id };
  }
}

// ---------------------------------------------------------------- diseño
function leerEstructura(archivo) {
  let est;
  try { est = JSON.parse(fs.readFileSync(archivo, 'utf8').replace(/^﻿/, '')); } catch (e) {
    throw new Error(`No se pudo leer ${archivo}: ${e.message}`);
  }
  est._dir = path.dirname(path.resolve(archivo));
  const sj = est.servidores_del_juego || { lista: [] };
  // Roles: los de los servidores del juego van después de "Jugador verificado"
  const roles = [];
  for (const r of est.roles) {
    roles.push(r);
    if (r.clave === sj.roles_despues_de) {
      for (const s of sj.lista) roles.push({ clave: `servidor-${s.numero}`, nombre: plantilla(sj.plantilla_rol, s), color: sj.color,
        separado: false, mencionable: false, permisos: [], grupo: 'servidor' });
    }
  }
  if (!roles.some((r) => r.grupo === 'servidor')) for (const s of sj.lista) roles.push({ clave: `servidor-${s.numero}`, nombre: plantilla(sj.plantilla_rol, s), color: sj.color, separado: false, mencionable: false, permisos: [], grupo: 'servidor' });
  // Canales de cada servidor del juego y etiquetas del foro de reclutamiento
  const categorias = est.categorias.map((c) => ({ ...c, canales: c.canales.map((x) => ({ ...x })) }));
  const catSrv = categorias.find((c) => c.clave === sj.categoria);
  if (catSrv) for (const s of sj.lista) {
    catSrv.canales.push({ clave: `servidor-${s.numero}`, nombre: plantilla(sj.plantilla_canal, s), tipo: 'texto', lento: 3,
      tema: plantilla(sj.plantilla_tema, s), permisos: { [`servidor-${s.numero}`]: { permitir: ['VIEW_CHANNEL'] } } });
  }
  for (const c of categorias) for (const ch of c.canales) {
    if (ch.etiquetas_servidores_despues_de !== undefined && sj.plantilla_etiqueta) {
      const extra = sj.lista.map((s) => ({ nombre: plantilla(sj.plantilla_etiqueta, s), emoji: '🏙️' }));
      ch.etiquetas = [...ch.etiquetas.slice(0, ch.etiquetas_servidores_despues_de), ...extra, ...ch.etiquetas.slice(ch.etiquetas_servidores_despues_de)];
    }
  }
  return { ...est, rolesFinal: roles, categoriasFinal: categorias };
}

function correoSoporte(est, idioma) {
  const c = (process.env.SOPORTE_CORREO || est.juego.correo_soporte || '').trim();
  return c || (est.textos_correo_pendiente?.[idioma] || est.textos_correo_pendiente?.es || 'el correo de soporte del juego');
}

/** Convierte un archivo de mensajes/ en embeds de Discord. ids: { canales, roles } */
function construirMensaje(est, def, ids) {
  const ruta = path.resolve(est._dir, def.archivo);
  let md = fs.readFileSync(ruta, 'utf8').replace(/^﻿/, '').replace(/\r\n/g, '\n').trim();
  const faltan = [];
  const lista = est.servidores_del_juego.lista.map((s) => `• ${ids.canales[`servidor-${s.numero}`] ? `<#${ids.canales[`servidor-${s.numero}`]}>` : plantilla(est.servidores_del_juego.plantilla_canal, s)} — ${plantilla(est.servidores_del_juego.plantilla_rol, s)}`).join('\n');
  md = md.replace(/\{(#|@&)([\w.-]+)\}|\{(WEB|CORREO|SERVIDORES)\}/g, (m, tipo, clave, fija) => {
    if (fija === 'WEB') return est.juego.web;
    if (fija === 'CORREO') return correoSoporte(est, def.idioma);
    if (fija === 'SERVIDORES') return lista;
    const id = tipo === '#' ? ids.canales[clave] : ids.roles[clave];
    if (!id) { faltan.push(m); return m; }
    return tipo === '#' ? `<#${id}>` : `<@&${id}>`;
  });
  const quedan = md.match(/\{[#@A-Z][^}\s]*\}/g);
  if (quedan) faltan.push(...quedan.filter((q) => !faltan.includes(q)));
  const secciones = md.split(/\n-{3,}\n/).map((s) => s.trim()).filter(Boolean);
  const embeds = secciones.map((s) => {
    let title;
    const m = s.match(/^#\s+(.+)(\n|$)/);
    if (m) { title = m[1].trim(); s = s.slice(m[0].length).trim(); }
    const e = { color: color(def.color) };
    if (title) e.title = title;
    e.description = s;
    return e;
  });
  embeds[0].url = `${est.juego.web.replace(/\/+$/, '')}/#discord-${def.ref}`;   // marca invisible: así el script reconoce su mensaje
  embeds[embeds.length - 1].footer = { text: `${est.juego.nombre} · ${est.juego.empresa}` };
  return { embeds, faltan };
}

function medidaEmbeds(embeds) {
  return embeds.reduce((t, e) => t + (e.title || '').length + (e.description || '').length + (e.footer?.text || '').length, 0);
}

/** Revisa el diseño antes de tocar Discord. Devuelve la lista de problemas (vacía = todo bien). */
function validar(est) {
  const p = [];
  const claveRol = new Set();
  for (const r of est.rolesFinal) {
    if (claveRol.has(r.clave)) p.push(`Rol repetido: ${r.clave}`);
    claveRol.add(r.clave);
    if (!r.nombre || r.nombre.length > 100) p.push(`Nombre de rol inválido: ${r.clave}`);
    try { bits(r.permisos); } catch (e) { p.push(e.message); }
  }
  try { bits(est.permisos_everyone); } catch (e) { p.push(e.message); }
  const claveCanal = new Set();
  const revisarPermisos = (dueño, obj) => {
    for (const [k, v] of Object.entries(obj || {})) {
      if (k !== '@everyone' && !claveRol.has(k)) p.push(`${dueño}: el rol "${k}" de los permisos no existe`);
      try { bits(v.permitir); bits(v.denegar); } catch (e) { p.push(`${dueño}: ${e.message}`); }
    }
  };
  for (const c of est.categoriasFinal) {
    if (claveCanal.has(c.clave)) p.push(`Clave repetida: ${c.clave}`);
    claveCanal.add(c.clave);
    revisarPermisos(`Categoría ${c.clave}`, c.permisos);
    if (c.canales.length > 50) p.push(`La categoría ${c.clave} tiene más de 50 canales`);
    for (const ch of c.canales) {
      if (claveCanal.has(ch.clave)) p.push(`Clave de canal repetida: ${ch.clave}`);
      claveCanal.add(ch.clave);
      if (!(ch.tipo in TIPO_CANAL) || ch.tipo === 'categoria') p.push(`Canal ${ch.clave}: tipo "${ch.tipo}" no válido`);
      if (!ch.nombre || ch.nombre.length > 100) p.push(`Canal ${ch.clave}: nombre vacío o de más de 100 letras`);
      const maxTema = ch.tipo === 'foro' ? 4096 : 1024;
      if ((ch.tema || '').length > maxTema) p.push(`Canal ${ch.clave}: el tema tiene ${ch.tema.length} letras (máximo ${maxTema})`);
      for (const k of ['lento', 'lento_hilos']) if (ch[k] !== undefined && !(Number.isInteger(ch[k]) && ch[k] >= 0 && ch[k] <= 21600)) p.push(`Canal ${ch.clave}: ${k} debe ser de 0 a 21600 segundos`);
      if (ch.limite_usuarios !== undefined && !(ch.limite_usuarios >= 0 && ch.limite_usuarios <= 99)) p.push(`Canal ${ch.clave}: límite de usuarios de 0 a 99`);
      if (ch.etiquetas) {
        if (ch.tipo !== 'foro') p.push(`Canal ${ch.clave}: solo los foros tienen etiquetas`);
        if (ch.etiquetas.length > 20) p.push(`Foro ${ch.clave}: tiene ${ch.etiquetas.length} etiquetas (máximo 20)`);
        const vistos = new Set();
        for (const t of ch.etiquetas) {
          if (!t.nombre || t.nombre.length > 20) p.push(`Foro ${ch.clave}: la etiqueta "${t.nombre}" tiene más de 20 letras`);
          if (vistos.has(t.nombre)) p.push(`Foro ${ch.clave}: etiqueta repetida "${t.nombre}"`);
          vistos.add(t.nombre);
        }
      }
      revisarPermisos(`Canal ${ch.clave}`, ch.permisos);
    }
  }
  for (const k of Object.values(est.comunidad || {})) if (!claveCanal.has(k)) p.push(`comunidad: el canal "${k}" no existe`);
  const ob = est.onboarding;
  if (ob) {
    for (const k of ob.canales_por_defecto) if (!claveCanal.has(k)) p.push(`onboarding: canal por defecto "${k}" no existe`);
    if (ob.canales_por_defecto.length < 7) p.push('onboarding: Discord pide al menos 7 canales por defecto');
    const revisarOpcion = (o, q) => {
      for (const r of o.roles || []) if (!claveRol.has(r)) p.push(`onboarding "${q}": rol "${r}" no existe`);
      for (const c of o.canales || []) if (!claveCanal.has(c)) p.push(`onboarding "${q}": canal "${c}" no existe`);
      if (!(o.roles || []).length && !(o.canales || []).length) p.push(`onboarding "${q}": la opción "${o.titulo}" debe dar un rol o un canal`);
      if ((o.titulo || '').length > 50) p.push(`onboarding "${q}": la opción "${o.titulo}" tiene más de 50 letras`);
      if ((o.descripcion || '').length > 100) p.push(`onboarding "${q}": la descripción de "${o.titulo}" tiene más de 100 letras`);
    };
    for (const q of ob.preguntas) {
      if ((q.titulo || '').length > 100) p.push(`onboarding: la pregunta "${q.clave}" tiene más de 100 letras`);
      for (const o of q.opciones) revisarOpcion(o, q.clave);
      if (q.opciones_desde_servidores && ob.opcion_sin_servidor) revisarOpcion(ob.opcion_sin_servidor, q.clave);
    }
  }
  const nombresAuto = new Set();
  let palabrasClave = 0;
  for (const r of est.automod) {
    if (nombresAuto.has(r.nombre)) p.push(`AutoMod: nombre repetido "${r.nombre}"`);
    nombresAuto.add(r.nombre);
    if (!(r.tipo in AUTOMOD_TIPO)) p.push(`AutoMod "${r.nombre}": tipo "${r.tipo}" no válido`);
    if (r.tipo === 'palabras') palabrasClave++;
    if ((r.palabras || []).length > 1000) p.push(`AutoMod "${r.nombre}": más de 1000 palabras`);
    for (const w of r.palabras || []) if (w.length > 60) p.push(`AutoMod "${r.nombre}": "${w}" tiene más de 60 letras`);
    if ((r.regex || []).length > 10) p.push(`AutoMod "${r.nombre}": máximo 10 expresiones regulares`);
    for (const x of r.regex || []) {
      if (x.length > 260) p.push(`AutoMod "${r.nombre}": una expresión tiene más de 260 letras`);
      if (/\(\?[=!<]/.test(x)) p.push(`AutoMod "${r.nombre}": Discord no acepta (?= (?! ni (?<= en las expresiones`);
    }
    if ((r.acciones?.bloquear || '').length > 150) p.push(`AutoMod "${r.nombre}": el mensaje de bloqueo tiene más de 150 letras`);
    if (r.acciones?.silenciar_segundos && !['palabras', 'menciones'].includes(r.tipo)) p.push(`AutoMod "${r.nombre}": silenciar solo funciona con palabras o menciones`);
    if ((r.acciones?.silenciar_segundos || 0) > 2419200) p.push(`AutoMod "${r.nombre}": silenciar máximo 28 días`);
    if (!r.acciones?.bloquear && !r.acciones?.alertar) p.push(`AutoMod "${r.nombre}": necesita bloquear o alertar`);
    for (const k of r.exentos_roles || []) if (!claveRol.has(k)) p.push(`AutoMod "${r.nombre}": rol exento "${k}" no existe`);
    for (const k of r.exentos_canales || []) if (!claveCanal.has(k)) p.push(`AutoMod "${r.nombre}": canal exento "${k}" no existe`);
    if (r.tipo === 'menciones' && !(r.limite_menciones >= 1 && r.limite_menciones <= 50)) p.push(`AutoMod "${r.nombre}": límite de menciones de 1 a 50`);
  }
  if (palabrasClave > 6) p.push(`AutoMod: Discord permite máximo 6 reglas de palabras (hay ${palabrasClave})`);
  // Mensajes: se arman con IDs de prueba (19 dígitos, como los reales) para medir el largo
  const falsos = { canales: {}, roles: {} };
  for (const k of claveCanal) falsos.canales[k] = '1234567890123456789';
  for (const k of claveRol) falsos.roles[k] = '1234567890123456789';
  const refs = new Set();
  for (const m of est.mensajes) {
    if (refs.has(m.ref)) p.push(`Mensaje repetido: ${m.ref}`);
    refs.add(m.ref);
    if (!claveCanal.has(m.canal)) { p.push(`Mensaje ${m.ref}: el canal "${m.canal}" no existe`); continue; }
    if (!fs.existsSync(path.resolve(est._dir, m.archivo))) { p.push(`Mensaje ${m.ref}: no existe el archivo ${m.archivo}`); continue; }
    const { embeds, faltan } = construirMensaje(est, m, falsos);
    if (faltan.length) p.push(`Mensaje ${m.ref}: no se reconoce ${faltan.join(', ')}`);
    if (embeds.length > 10) p.push(`Mensaje ${m.ref}: más de 10 secciones (---)`);
    for (const e of embeds) {
      if ((e.title || '').length > 256) p.push(`Mensaje ${m.ref}: un título tiene más de 256 letras`);
      if (e.description.length > 4096) p.push(`Mensaje ${m.ref}: una sección tiene ${e.description.length} letras (máximo 4096)`);
    }
    // 200 de margen por si el correo de soporte es largo
    if (medidaEmbeds(embeds) > 5800) p.push(`Mensaje ${m.ref}: tiene ${medidaEmbeds(embeds)} letras en total (máximo 5800)`);
  }
  return p;
}

// ---------------------------------------------------------------- el configurador
class Configurador {
  constructor(api, est, guildId, archivoEstado) {
    this.api = api; this.est = est; this.g = guildId; this.archivoEstado = archivoEstado;
    this.ids = { roles: {}, canales: {}, mensajes: {}, automod: {} };
    this.cuenta = {};
    this.avisos = [];
    this.manual = [];
    this.estado = this.leerEstado();
  }
  contar(tipo, que) { this.cuenta[tipo] ??= { creado: 0, actualizado: 0, igual: 0 }; this.cuenta[tipo][que]++; }
  avisar(t) { this.avisos.push(t); aviso(`   ⚠️  ${t}`); }

  leerEstado() {
    if (SIMULAR || !this.archivoEstado || !fs.existsSync(this.archivoEstado)) return null;
    try {
      const e = JSON.parse(fs.readFileSync(this.archivoEstado, 'utf8'));
      return e.guild_id === this.g ? e : null;   // estado de otro servidor: no sirve
    } catch { return null; }
  }
  guardarEstado() {
    if (SIMULAR || !this.archivoEstado) return;
    const datos = { _leeme: 'IDs de lo que creó configurar_servidor.js. No tiene secretos. Si lo borras, el script encuentra todo por nombre.',
      guild_id: this.g, actualizado: new Date().toISOString(), ...this.ids };
    fs.writeFileSync(this.archivoEstado, JSON.stringify(datos, null, 2));
  }

  async correr() {
    log('🔎 Revisando el bot y el servidor...');
    this.yo = await this.api.pedir('GET', '/users/@me');
    this.guild = await this.api.pedir('GET', `/guilds/${this.g}`);
    this.roles = await this.api.pedir('GET', `/guilds/${this.g}/roles`);
    const miembro = await this.api.pedir('GET', `/guilds/${this.g}/members/${this.yo.id}`);
    const misRoles = this.roles.filter((r) => miembro.roles.includes(r.id) || r.id === this.g);
    const esAdmin = this.guild.owner_id === this.yo.id || misRoles.some((r) => tieneBit(r.permissions, 'ADMINISTRATOR'));
    this.rolesBot = new Set(miembro.roles);
    this.esComunidad = (this.guild.features || []).includes('COMMUNITY');
    log(`   Bot: ${this.yo.username} · Servidor: ${this.guild.name}${this.esComunidad ? ' · Comunidad: activada' : ''}`);
    if (!esAdmin) {
      throw new Error('El bot no tiene el permiso "Administrador" en este servidor. Para la configuración inicial lo necesita '
        + '(debe crear roles de moderación y permisos de canales). Invítalo otra vez con el enlace de docs/DISCORD.md (paso 2) '
        + 'o dale Administrador a su rol en Ajustes del servidor → Roles.');
    }
    await this.asegurarRoles();
    await this.asegurarCategorias();
    const claveCom = new Set(Object.values(this.est.comunidad));
    await this.asegurarCanales((ch) => claveCom.has(ch.clave));     // primero los que pide Comunidad
    await this.asegurarComunidad();
    await this.asegurarCanales((ch) => !claveCom.has(ch.clave));
    await this.ordenarCanales();
    await this.asegurarMensajes();
    await this.asegurarAutomod();
    await this.asegurarOnboarding();
    this.revisarSobrantes();
    this.guardarEstado();
  }

  // ---------------- roles
  /** Posición del rol más alto del bot (cambia cuando se crean roles: Discord los pone abajo y sube a los demás). */
  get posBot() { return Math.max(0, ...this.roles.filter((r) => this.rolesBot.has(r.id)).map((r) => r.position)); }
  buscarRol(def) {
    const id = this.estado?.roles?.[def.clave];
    return (id && this.roles.find((r) => r.id === id)) || this.roles.find((r) => r.name === def.nombre && !r.managed);
  }
  async asegurarRoles() {
    log('👥 Roles...');
    for (const def of this.est.rolesFinal) {
      const quiero = { name: def.nombre, color: color(def.color), hoist: !!def.separado, mentionable: !!def.mencionable, permissions: bits(def.permisos) };
      let rol = this.buscarRol(def);
      if (!rol) {
        rol = await this.api.pedir('POST', `/guilds/${this.g}/roles`, quiero, `crear rol ${def.nombre}`);
        rol.position ??= 1;
        for (const r of this.roles) if (r.id !== this.g && r.position >= rol.position) r.position++;
        this.roles.push(rol);
        this.contar('Roles', 'creado');
      } else {
        const cambio = {};
        for (const k of Object.keys(quiero)) if (String(rol[k] ?? '') !== String(quiero[k])) cambio[k] = quiero[k];
        if (Object.keys(cambio).length) {
          if (rol.position >= this.posBot) {
            this.avisar(`No puedo cambiar el rol "${rol.name}" porque está más arriba que el rol del bot. Arrastra el rol del bot hasta arriba en Ajustes → Roles.`);
          } else {
            rol = Object.assign(rol, await this.api.pedir('PATCH', `/guilds/${this.g}/roles/${rol.id}`, cambio, `actualizar rol ${def.nombre} (${Object.keys(cambio).join(', ')})`));
            this.contar('Roles', 'actualizado');
          }
        } else this.contar('Roles', 'igual');
      }
      this.ids.roles[def.clave] = rol.id;
    }
    // @everyone: permisos base del servidor (sin mencionar a todos, sin encuestas ni hilos privados)
    const todos = this.roles.find((r) => r.id === this.g);
    const permisosTodos = bits(this.est.permisos_everyone);
    if (todos && String(todos.permissions) !== permisosTodos) {
      await this.api.pedir('PATCH', `/guilds/${this.g}/roles/${this.g}`, { permissions: permisosTodos }, 'actualizar permisos de @everyone');
      todos.permissions = permisosTodos;
      this.contar('Roles', 'actualizado');
    }
    // Orden: se reparten entre ellos los mismos lugares que ya ocupan (nunca suben por encima del bot ni mueven roles ajenos)
    if (!SIMULAR) {
      this.roles = await this.api.pedir('GET', `/guilds/${this.g}/roles`);
      const nuestros = this.est.rolesFinal.map((d) => this.roles.find((r) => r.id === this.ids.roles[d.clave])).filter((r) => r && r.position < this.posBot);
      const lugares = nuestros.map((r) => r.position).sort((a, b) => b - a);
      const cambios = nuestros.map((r, i) => ({ id: r.id, position: lugares[i] })).filter((c, i) => nuestros[i].position !== c.position);
      if (cambios.length) {
        await this.api.pedir('PATCH', `/guilds/${this.g}/roles`, nuestros.map((r, i) => ({ id: r.id, position: lugares[i] })), 'ordenar roles');
        this.contar('Orden', 'actualizado');
      }
    } else log('   [simular] ordenar roles como en estructura.json');
    // Rol "Bots" para el bot y "Admin QF" para el dueño (solo se agregan, nunca se quitan roles)
    const rolBots = this.ids.roles.bots;
    if (rolBots) {
      const m = await this.api.pedir('GET', `/guilds/${this.g}/members/${this.yo.id}`);
      if (!m.roles.includes(rolBots)) await this.api.pedir('PUT', `/guilds/${this.g}/members/${this.yo.id}/roles/${rolBots}`, undefined, 'dar rol Bots al bot');
    }
    if (this.est.servidor_discord?.asignar_admin_al_dueno && this.ids.roles.admin && this.guild.owner_id && this.guild.owner_id !== this.yo.id) {
      let m = null;
      try { m = await this.api.pedir('GET', `/guilds/${this.g}/members/${this.guild.owner_id}`); } catch { /* sin intent de miembros: no importa */ }
      if (m && !m.roles.includes(this.ids.roles.admin)) await this.api.pedir('PUT', `/guilds/${this.g}/members/${this.guild.owner_id}/roles/${this.ids.roles.admin}`, undefined, 'dar rol Admin QF al dueño');
    }
  }

  // ---------------- canales
  overwrites(permisos) {
    return Object.entries(permisos || {}).map(([k, v]) => ({
      id: k === '@everyone' ? this.g : this.ids.roles[k], type: 0, allow: bits(v.permitir), deny: bits(v.denegar),
    })).filter((o) => o.id);
  }
  /** Mezcla: se quedan los permisos que alguien puso a mano (para roles o personas que el script no maneja). */
  mezclarOverwrites(actuales, deseados) {
    const manejados = new Set([this.g, ...Object.values(this.ids.roles)]);
    const ajenos = (actuales || []).filter((o) => !manejados.has(o.id)).map((o) => ({ id: o.id, type: o.type, allow: String(o.allow), deny: String(o.deny) }));
    return [...ajenos, ...deseados];
  }
  overwritesIguales(actuales, deseados) {
    const n = (l) => (l || []).map((o) => `${o.id}:${o.type}:${o.allow}:${o.deny}`).sort();
    // Discord no guarda overwrites vacíos: allow=0 y deny=0 equivale a no tener nada
    return igual(n(actuales).filter((x) => !x.endsWith(':0:0')), n(deseados).filter((x) => !x.endsWith(':0:0')));
  }
  async canales() {
    if (!this._canales) this._canales = SIMULAR ? [] : await this.api.pedir('GET', `/guilds/${this.g}/channels`);
    return this._canales;
  }
  buscarCanal(lista, clave, nombre, tipo, parentId) {
    const id = this.estado?.canales?.[clave];
    const porId = id && lista.find((c) => c.id === id);
    if (porId) return porId;
    const n = normNombre(nombre, tipo);
    const mismos = lista.filter((c) => normNombre(c.name, c.type) === n && (c.type === tipo || (tipo === 5 && c.type === 0)));
    return mismos.find((c) => (c.parent_id || null) === (parentId || null)) || mismos[0];
  }
  async asegurarCategorias() {
    log('📁 Categorías...');
    const lista = await this.canales();
    for (const cat of this.est.categoriasFinal) {
      const ow = this.overwrites(cat.permisos);
      let actual = this.buscarCanal(lista, cat.clave, cat.nombre, 4, null);
      if (!actual) {
        actual = await this.api.pedir('POST', `/guilds/${this.g}/channels`, { name: cat.nombre, type: 4, permission_overwrites: ow }, `crear categoría ${cat.nombre}`);
        lista.push(actual);
        this.contar('Categorías', 'creado');
      } else {
        const cambio = {};
        if (actual.name !== cat.nombre) cambio.name = cat.nombre;
        const mezcla = this.mezclarOverwrites(actual.permission_overwrites, ow);
        if (!this.overwritesIguales(actual.permission_overwrites, mezcla)) cambio.permission_overwrites = mezcla;
        if (Object.keys(cambio).length) {
          Object.assign(actual, await this.api.pedir('PATCH', `/channels/${actual.id}`, cambio, `actualizar categoría ${cat.nombre} (${Object.keys(cambio).join(', ')})`));
          this.contar('Categorías', 'actualizado');
        } else this.contar('Categorías', 'igual');
      }
      this.ids.canales[cat.clave] = actual.id;
    }
  }
  canalDeseado(cat, ch) {
    let tipo = TIPO_CANAL[ch.tipo];
    const d = { name: ch.nombre, type: tipo, parent_id: this.ids.canales[cat.clave],
      permission_overwrites: this.overwrites({ ...(cat.permisos || {}), ...(ch.permisos || {}) }) };
    if (esTextoLike(tipo)) d.topic = ch.tema || '';
    if ([0, 15].includes(tipo)) d.rate_limit_per_user = ch.lento || 0;
    if (tipo === 2) d.user_limit = ch.limite_usuarios || 0;
    if (tipo === 15) {
      d.default_thread_rate_limit_per_user = ch.lento_hilos || 0;
      d.available_tags = (ch.etiquetas || []).map((t) => ({ name: t.nombre, emoji_name: t.emoji || null, moderated: !!t.solo_staff }));
      d.default_sort_order = ch.orden === 'creacion' ? 1 : 0;
      d.default_forum_layout = ch.vista === 'galeria' ? 2 : 1;
      d.default_reaction_emoji = ch.reaccion ? { emoji_name: ch.reaccion, emoji_id: null } : null;
    }
    return d;
  }
  async asegurarCanales(filtro) {
    const lista = await this.canales();
    let primero = true;
    for (const cat of this.est.categoriasFinal) for (const ch of cat.canales) {
      if (!filtro(ch)) continue;
      if (primero) { log('💬 Canales...'); primero = false; }
      const d = this.canalDeseado(cat, ch);
      if ((d.type === 5 || d.type === 13) && !this.esComunidad) {
        if (d.type === 13) { this.avisar(`El canal de escenario "${ch.nombre}" necesita Comunidad activada: se creará cuando la actives y vuelvas a correr el script.`); continue; }
        d.type = 0;   // anuncios: se crea como texto y se convierte cuando haya Comunidad
      }
      let actual = this.buscarCanal(lista, ch.clave, ch.nombre, d.type, d.parent_id);
      let creado = false;
      if (!actual) {
        const crear = { ...d };
        actual = await this.api.pedir('POST', `/guilds/${this.g}/channels`, crear, `crear canal ${ch.nombre}`);
        lista.push(actual);
        creado = true;
        this.contar('Canales', 'creado');
      }
      // Lo que no se puede poner al crear (o que cambió) se ajusta con PATCH
      const cambio = {};
      if (normNombre(actual.name, actual.type) !== normNombre(d.name, d.type)) cambio.name = d.name;
      if (actual.type !== d.type && [0, 5].includes(actual.type) && [0, 5].includes(d.type)) cambio.type = d.type;
      if ((actual.parent_id || null) !== (d.parent_id || null)) cambio.parent_id = d.parent_id;
      if ('topic' in d && (actual.topic || '') !== d.topic) cambio.topic = d.topic;
      for (const k of ['rate_limit_per_user', 'user_limit', 'default_thread_rate_limit_per_user', 'default_sort_order', 'default_forum_layout']) {
        if (k in d && (actual[k] ?? 0) !== d[k]) cambio[k] = d[k];
      }
      const mezcla = this.mezclarOverwrites(actual.permission_overwrites, d.permission_overwrites);
      if (!this.overwritesIguales(actual.permission_overwrites, mezcla)) cambio.permission_overwrites = mezcla;
      if (d.type === 15) {
        const req = ch.requiere_etiqueta ? FORO_REQUIERE_ETIQUETA : 0;
        const flags = ((actual.flags || 0) & ~FORO_REQUIERE_ETIQUETA) | req;
        if ((actual.flags || 0) !== flags) cambio.flags = flags;
        const reaccion = actual.default_reaction_emoji?.emoji_name || null;
        if (reaccion !== (d.default_reaction_emoji?.emoji_name || null)) cambio.default_reaction_emoji = d.default_reaction_emoji;
        // Etiquetas: se conservan las que alguien creó a mano y las existentes mantienen su ID
        const existentes = actual.available_tags || [];
        const tags = d.available_tags.map((t) => { const e = existentes.find((x) => x.name === t.name); return e ? { id: e.id, ...t } : t; });
        const ajenas = existentes.filter((x) => !d.available_tags.some((t) => t.name === x.name));
        const finales = [...tags, ...ajenas].slice(0, 20);
        if (ajenas.length && tags.length + ajenas.length > 20) this.avisar(`El foro ${ch.nombre} tiene etiquetas hechas a mano y ya no caben todas (máximo 20).`);
        const n = (l) => l.map((t) => `${t.name}|${t.emoji_name || ''}|${!!t.moderated}`);
        if (!igual(n(existentes), n(finales))) cambio.available_tags = finales;
      }
      if (Object.keys(cambio).length) {
        Object.assign(actual, await this.api.pedir('PATCH', `/channels/${actual.id}`, cambio, `${creado ? 'ajustar' : 'actualizar'} canal ${ch.nombre} (${Object.keys(cambio).join(', ')})`));
        if (!creado) this.contar('Canales', 'actualizado');
      } else if (!creado) this.contar('Canales', 'igual');
      this.ids.canales[ch.clave] = actual.id;
    }
  }
  async ordenarCanales() {
    if (SIMULAR) { log('   [simular] ordenar categorías y canales como en estructura.json'); return; }
    const lista = await this.canales();
    const pos = (id) => lista.find((c) => c.id === id);
    const cambios = [];
    const creciente = (ids) => ids.every((id, i) => i === 0 || (pos(ids[i - 1]).position < pos(id).position));
    const cats = this.est.categoriasFinal.map((c) => this.ids.canales[c.clave]).filter((id) => pos(id));
    if (!creciente(cats)) cats.forEach((id, i) => cambios.push({ id, position: i }));
    for (const cat of this.est.categoriasFinal) {
      const ids = cat.canales.map((ch) => this.ids.canales[ch.clave]).filter((id) => pos(id));
      const texto = ids.filter((id) => !TIPOS_VOZ.has(pos(id).type));
      const voz = ids.filter((id) => TIPOS_VOZ.has(pos(id).type));
      if (!creciente(texto) || !creciente(voz)) ids.forEach((id, i) => cambios.push({ id, position: i }));
    }
    if (cambios.length) {
      await this.api.pedir('PATCH', `/guilds/${this.g}/channels`, cambios, 'ordenar categorías y canales');
      for (const c of cambios) pos(c.id).position = c.position;
      this.contar('Orden', 'actualizado');
    }
  }

  // ---------------- Comunidad
  async asegurarComunidad() {
    log('🏛️  Comunidad...');
    const sd = this.est.servidor_discord || {};
    const c = this.est.comunidad;
    const quiero = {
      rules_channel_id: this.ids.canales[c.canal_reglas],
      public_updates_channel_id: this.ids.canales[c.canal_avisos_discord],
      safety_alerts_channel_id: this.ids.canales[c.canal_alertas_seguridad],
      verification_level: Math.max(this.guild.verification_level || 0, sd.nivel_verificacion ?? 2),
      explicit_content_filter: sd.filtro_contenido_explicito ?? 2,
      default_message_notifications: sd.notificaciones_por_defecto ?? 1,
      preferred_locale: sd.idioma_principal || 'es-419',
      description: sd.descripcion || null,
    };
    const cambio = {};
    for (const [k, v] of Object.entries(quiero)) if (v !== undefined && (this.guild[k] ?? null) !== v) cambio[k] = v;
    if (!this.esComunidad) cambio.features = [...new Set([...(this.guild.features || []), 'COMMUNITY'])];
    if (!Object.keys(cambio).length) { this.contar('Servidor', 'igual'); return; }
    try {
      const g = await this.api.pedir('PATCH', `/guilds/${this.g}`, cambio, `${cambio.features ? 'activar Comunidad y ' : ''}ajustar el servidor (${Object.keys(cambio).join(', ')})`);
      Object.assign(this.guild, g || cambio);
      if (cambio.features) { this.esComunidad = true; log('   ✅ Comunidad activada.'); }
      this.contar('Servidor', 'actualizado');
    } catch (e) {
      if (cambio.features) {
        this.avisar(`No se pudo activar Comunidad automáticamente (${e.message}). Actívala a mano (docs/DISCORD.md, paso 1) y vuelve a correr el script.`);
        delete cambio.features;
        try { await this.api.pedir('PATCH', `/guilds/${this.g}`, { verification_level: quiero.verification_level, explicit_content_filter: quiero.explicit_content_filter, default_message_notifications: quiero.default_message_notifications }, 'ajustar seguridad del servidor'); } catch { /* seguimos */ }
      } else this.avisar(`No se pudieron ajustar los datos del servidor: ${e.message}`);
    }
  }

  // ---------------- mensajes fijos
  async asegurarMensajes() {
    log('📝 Mensajes fijos (bienvenida, reglas, FAQ...)...');
    const porCanal = new Map();
    for (const def of this.est.mensajes) {
      const canal = this.ids.canales[def.canal];
      if (!canal) { this.avisar(`No existe el canal de ${def.ref}`); continue; }
      if (!porCanal.has(canal)) porCanal.set(canal, SIMULAR ? [] : await this.api.pedir('GET', `/channels/${canal}/messages?limit=100`));
      const historial = porCanal.get(canal);
      const { embeds } = construirMensaje(this.est, def, this.ids);
      const marca = embeds[0].url;
      const previo = historial.find((m) => m.author?.id === this.yo.id && m.embeds?.[0]?.url === marca);
      const cuerpo = { embeds, allowed_mentions: { parse: [] } };
      if (!previo) {
        const m = await this.api.pedir('POST', `/channels/${canal}/messages`, cuerpo, `publicar mensaje ${def.ref}`);
        historial.push(m);
        this.ids.mensajes[def.ref] = m.id;
        this.contar('Mensajes', 'creado');
        if (def.fijar) await this.fijar(canal, m.id, def.ref);
      } else {
        this.ids.mensajes[def.ref] = previo.id;
        const n = (l) => (l || []).map((e) => ({ t: e.title || '', d: e.description || '', c: e.color || 0, u: e.url || '', f: e.footer?.text || '' }));
        if (!igual(n(previo.embeds), n(embeds))) {
          await this.api.pedir('PATCH', `/channels/${canal}/messages/${previo.id}`, cuerpo, `actualizar mensaje ${def.ref}`);
          this.contar('Mensajes', 'actualizado');
        } else this.contar('Mensajes', 'igual');
        if (def.fijar && previo.pinned === false) await this.fijar(canal, previo.id, def.ref);
      }
    }
  }
  async fijar(canal, id, ref) {
    try { await this.api.pedir('PUT', `/channels/${canal}/messages/pins/${id}`, undefined, `fijar mensaje ${ref}`); } catch (e) {
      if (e.status === 404 || e.status === 405) {
        try { await this.api.pedir('PUT', `/channels/${canal}/pins/${id}`, undefined, `fijar mensaje ${ref}`); return; } catch (e2) { e = e2; }
      }
      this.avisar(`No se pudo fijar el mensaje ${ref}: ${e.message}`);
    }
  }

  // ---------------- AutoMod
  reglaDeseada(def) {
    const tipo = AUTOMOD_TIPO[def.tipo];
    const tm = {};
    if (tipo === 1) { tm.keyword_filter = def.palabras || []; tm.regex_patterns = def.regex || []; tm.allow_list = def.permitidas || []; }
    if (tipo === 4) { tm.presets = (def.listas || []).map((l) => AUTOMOD_PRESETS[l]).filter(Boolean); tm.allow_list = def.permitidas || []; }
    if (tipo === 5) { tm.mention_total_limit = def.limite_menciones; tm.mention_raid_protection_enabled = !!def.proteccion_raid; }
    const actions = [];
    const a = def.acciones || {};
    if (a.bloquear) actions.push({ type: 1, metadata: { custom_message: a.bloquear } });
    if (a.alertar && this.ids.canales[this.est.comunidad.canal_alertas_seguridad]) actions.push({ type: 2, metadata: { channel_id: this.ids.canales[this.est.comunidad.canal_alertas_seguridad] } });
    if (a.silenciar_segundos) actions.push({ type: 3, metadata: { duration_seconds: a.silenciar_segundos } });
    return {
      name: def.nombre, event_type: 1, trigger_type: tipo, trigger_metadata: tm, actions, enabled: true,
      exempt_roles: (def.exentos_roles || []).map((k) => this.ids.roles[k]).filter(Boolean),
      exempt_channels: (def.exentos_canales || []).map((k) => this.ids.canales[k]).filter(Boolean),
    };
  }
  reglaNormal(r, ref) {
    const tm = {};
    for (const k of Object.keys(ref.trigger_metadata)) {
      const v = r.trigger_metadata?.[k];
      tm[k] = Array.isArray(ref.trigger_metadata[k]) ? ordenar(v || []) : (v ?? null);
    }
    return {
      name: r.name, event_type: r.event_type, trigger_metadata: tm, enabled: !!r.enabled,
      actions: (r.actions || []).map((x) => ({ type: x.type, m: x.type === 1 ? (x.metadata?.custom_message || '') : x.type === 2 ? String(x.metadata?.channel_id || '') : x.type === 3 ? Number(x.metadata?.duration_seconds || 0) : '' }))
        .sort((p, q) => p.type - q.type),
      exempt_roles: ordenar(r.exempt_roles), exempt_channels: ordenar(r.exempt_channels),
    };
  }
  async asegurarAutomod() {
    log('🛡️  AutoMod...');
    const reglas = SIMULAR ? [] : await this.api.pedir('GET', `/guilds/${this.g}/auto-moderation/rules`);
    for (const def of this.est.automod) {
      const d = this.reglaDeseada(def);
      const id = this.estado?.automod?.[def.nombre];
      let actual = (id && reglas.find((r) => r.id === id)) || reglas.find((r) => r.name === d.name && r.trigger_type === d.trigger_type);
      // De los tipos que Discord permite solo una vez, se ajusta la que ya exista (aunque la hayas creado a mano)
      if (!actual && AUTOMOD_UNICO.has(d.trigger_type)) actual = reglas.find((r) => r.trigger_type === d.trigger_type);
      try {
        if (!actual) {
          const r = await this.api.pedir('POST', `/guilds/${this.g}/auto-moderation/rules`, d, `crear regla AutoMod ${d.name}`);
          reglas.push(r);
          this.ids.automod[def.nombre] = r.id;
          this.contar('AutoMod', 'creado');
        } else {
          this.ids.automod[def.nombre] = actual.id;
          if (!igual(this.reglaNormal(actual, d), this.reglaNormal(d, d))) {
            const { trigger_type, ...cambio } = d;   // el tipo de una regla no se puede cambiar
            await this.api.pedir('PATCH', `/guilds/${this.g}/auto-moderation/rules/${actual.id}`, cambio, `actualizar regla AutoMod ${d.name}`);
            this.contar('AutoMod', 'actualizado');
          } else this.contar('AutoMod', 'igual');
        }
      } catch (e) {
        if (e.datos?.code === 30037) this.avisar(`AutoMod "${d.name}": Discord ya tiene el máximo de reglas de este tipo (6 de palabras). Borra a mano una regla que no uses en Ajustes → AutoMod y vuelve a correr el script.`);
        else this.avisar(`AutoMod "${d.name}": ${e.message}`);
      }
    }
  }

  // ---------------- Onboarding
  snowflake() {
    this._sf = (this._sf || 0) + 1;
    return (((BigInt(Date.now()) - 1420070400000n) << 22n) + BigInt(this._sf)).toString();
  }
  async asegurarOnboarding() {
    const ob = this.est.onboarding;
    if (!ob) return;
    log('🚪 Onboarding (preguntas al entrar)...');
    if (!this.esComunidad) { this.avisar('El Onboarding necesita Comunidad activada; vuelve a correr el script después de activarla.'); return; }
    const actual = SIMULAR ? { prompts: [] } : await this.api.pedir('GET', `/guilds/${this.g}/onboarding`);
    const sj = this.est.servidores_del_juego;
    const prompts = ob.preguntas.map((q) => {
      let opciones = q.opciones;
      if (q.opciones_desde_servidores) {
        const t = ob.plantilla_opcion_servidor;
        opciones = [...sj.lista.map((s) => ({ titulo: plantilla(t.titulo, s), descripcion: plantilla(t.descripcion, s), emoji: t.emoji,
          roles: [`servidor-${s.numero}`], canales: [`servidor-${s.numero}`] })), ...(ob.opcion_sin_servidor ? [ob.opcion_sin_servidor] : [])];
      }
      const previa = (actual.prompts || []).find((p) => p.title === q.titulo);
      return {
        id: previa?.id || this.snowflake(), type: 0, title: q.titulo, single_select: !!q.una_sola, required: !!q.obligatoria,
        in_onboarding: q.antes_de_entrar !== false,
        options: opciones.map((o) => {
          const op = previa?.options?.find((x) => x.title === o.titulo);
          return { id: op?.id || this.snowflake(), title: o.titulo, description: o.descripcion || null,
            emoji_name: o.emoji || undefined, emoji: o.emoji ? { name: o.emoji, id: null } : undefined,
            role_ids: (o.roles || []).map((k) => this.ids.roles[k]).filter(Boolean),
            channel_ids: (o.canales || []).map((k) => this.ids.canales[k]).filter(Boolean) };
        }),
      };
    });
    const quiero = { prompts, default_channel_ids: ob.canales_por_defecto.map((k) => this.ids.canales[k]).filter(Boolean), enabled: true, mode: ob.modo ?? 0 };
    const n = (o) => ({
      e: !!o.enabled, m: o.mode ?? 0, d: ordenar(o.default_channel_ids),
      p: (o.prompts || []).map((p) => ({ t: p.title, s: !!p.single_select, r: !!p.required, i: !!p.in_onboarding, ty: p.type ?? 0,
        o: (p.options || []).map((x) => ({ t: x.title, d: x.description || '', e: x.emoji?.name || x.emoji_name || '', r: ordenar(x.role_ids), c: ordenar(x.channel_ids) })) })),
    });
    if (igual(n(actual), n(quiero))) { this.contar('Onboarding', 'igual'); return; }
    try {
      await this.api.pedir('PUT', `/guilds/${this.g}/onboarding`, quiero, 'configurar Onboarding (idioma, servidor del juego, intereses)');
      this.contar('Onboarding', (actual.prompts || []).length ? 'actualizado' : 'creado');
    } catch (e) {
      this.avisar(`Onboarding: ${e.message}. Puedes configurarlo a mano en Ajustes del servidor → Onboarding (docs/DISCORD.md).`);
    }
  }

  // ---------------- lo que hay que hacer a mano
  revisarSobrantes() {
    if (SIMULAR) return;
    const nuestros = new Set(Object.values(this.ids.canales));
    const sobran = (this._canales || []).filter((c) => !nuestros.has(c.id)
      && /^(general|reglas|rules|moderator-only|solo-moderadores|text channels|voice channels|canales de texto|canales de voz)$/i.test(c.name));
    if (sobran.length) this.manual.push(`Si quieres, borra a mano los canales que Discord creó al inicio y ya no se usan: ${sobran.map((c) => c.name).join(', ')} (el script nunca borra nada).`);
    if (this.esComunidad) this.manual.push('Activa la verificación de reglas (Rules Screening) y pega las reglas cortas de estructura.json → reglas_para_verificacion (docs/DISCORD.md, paso 5).');
    this.manual.push('Cuando termines, quítale el permiso "Administrador" al rol del bot (docs/DISCORD.md, paso 6).');
  }

  resumen() {
    log('');
    log(SIMULAR ? '🧪 Simulación terminada: no se cambió nada en Discord.' : `✅ Listo: servidor «${this.guild.name}» configurado.`);
    const nombres = { creado: 'creados', actualizado: 'actualizados', igual: 'sin cambios' };
    for (const [tipo, c] of Object.entries(this.cuenta)) {
      log(`   ${tipo.padEnd(11)} ${Object.entries(c).filter(([, v]) => v).map(([k, v]) => `${v} ${nombres[k]}`).join(' · ') || '—'}`);
    }
    log(`   Llamadas a Discord: ${this.api.llamadas} (cambios: ${this.api.escrituras}, esperas por límite: ${this.api.esperas})`);
    if (this.avisos.length) { log(''); log(`⚠️  Avisos (${this.avisos.length}):`); for (const a of this.avisos) log(`   - ${a}`); }
    if (this.manual.length) { log(''); log('👉 Falta hacer a mano:'); for (const m of this.manual) log(`   - ${m}`); }
  }
}

// ---------------------------------------------------------------- inicio
async function main() {
  if (ARGS.includes('--ayuda') || ARGS.includes('--help') || ARGS.includes('-h')) { ayuda(); return 0; }
  const archivoEnv = argValor('--env') || path.join(DIR, '.env');
  const env = { ...cargarEnv(archivoEnv), ...Object.fromEntries(Object.entries(process.env).filter(([, v]) => v !== '')) };
  if (env.SOPORTE_CORREO && !process.env.SOPORTE_CORREO) process.env.SOPORTE_CORREO = env.SOPORTE_CORREO;
  const token = String(env.DISCORD_TOKEN || '').trim().replace(/^Bot\s+/i, '');
  SECRETOS = [token];
  const guild = String(env.DISCORD_GUILD_ID || '').trim();
  const est = leerEstructura(argValor('--estructura') || path.join(DIR, 'estructura.json'));

  const problemas = validar(est);
  if (problemas.length) {
    aviso(`❌ estructura.json tiene ${problemas.length} problema(s); no se tocó Discord:`);
    for (const p of problemas) aviso(`   - ${p}`);
    return 1;
  }
  log(`📋 Diseño OK: ${est.rolesFinal.length} roles, ${est.categoriasFinal.length} categorías, ${est.categoriasFinal.reduce((t, c) => t + c.canales.length, 0)} canales, ${est.automod.length} reglas AutoMod, ${est.mensajes.length} mensajes.`);

  let api;
  if (SIMULAR) {
    log('🧪 Modo simulación: no se conecta a Discord, solo muestra lo que haría en un servidor vacío.');
    api = new Simulador();
  } else {
    if (!token) { aviso('❌ Falta DISCORD_TOKEN. Ponlo en discord/.env o como variable de entorno (docs/DISCORD.md, paso 3).'); return 1; }
    if (!/^\d{15,22}$/.test(guild)) { aviso('❌ Falta DISCORD_GUILD_ID o no es un número (es el ID del servidor, docs/DISCORD.md, paso 2).'); return 1; }
    let base = API_OFICIAL;
    if (env.DISCORD_API_BASE) {
      // Solo para las pruebas automáticas: un Discord falso en esta misma computadora
      const u = new URL(env.DISCORD_API_BASE);
      if (!(u.protocol === 'https:' && u.hostname === 'discord.com') && !['127.0.0.1', 'localhost', '[::1]'].includes(u.hostname)) {
        aviso('❌ DISCORD_API_BASE solo puede ser discord.com o esta computadora (pruebas). Bórrala de tu .env.');
        return 1;
      }
      base = env.DISCORD_API_BASE;
    }
    api = new Discord(base, token);
  }
  const archivoEstado = argValor('--estado') || env.DISCORD_ESTADO || path.join(DIR, '.estado.json');
  const conf = new Configurador(api, est, SIMULAR ? 'SIMULADO' : guild, archivoEstado);
  try {
    await conf.correr();
  } catch (e) {
    if (e.status === 401) aviso('❌ Discord no aceptó el token (401). Copia otra vez el token del bot (Developer Portal → Bot → Reset Token) en discord/.env.');
    else if (e.status === 403) aviso(`❌ Sin permiso (403). ¿Invitaste el bot al servidor correcto y con Administrador? Detalle: ${e.message}`);
    else if (e.status === 404 && /\/guilds\//.test(e.message)) aviso('❌ No encuentro el servidor (404). Revisa DISCORD_GUILD_ID y que el bot esté invitado al servidor.');
    else aviso(`❌ ${e.message}`);
    conf.guardarEstado();
    return 1;
  }
  conf.resumen();
  return 0;
}

main().then((codigo) => { process.exitCode = codigo; }, (e) => { aviso(`❌ ${e?.message || e}`); process.exitCode = 1; });
