#!/usr/bin/env node
/**
 * Pruebas de configurar_servidor.js contra un Discord FALSO (servidor http local). No se conecta a internet.
 *   node test.js     (o: npm test)
 *
 * Comprueba:
 *  1. Que la primera corrida crea todo igual a estructura.json (roles, permisos, categorías, canales, foros, AutoMod,
 *     Comunidad, Onboarding, mensajes fijados) sin dejar marcadores {..} sin reemplazar.
 *  2. Que una segunda corrida no cambia nada (idempotente), también sin el archivo de estado.
 *  3. Que respeta los límites de Discord (429 con retry_after, límite global, cubos agotados).
 *  4. Que nunca imprime el token (ni siquiera cuando Discord lo rechaza) y nunca borra nada (cero DELETE).
 *  5. Que un cambio en el diseño se aplica sin tocar lo que alguien creó a mano.
 *  6. Que --simular no hace ninguna llamada.
 */
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const DIR = path.dirname(fileURLToPath(import.meta.url));
const SCRIPT = path.join(DIR, 'configurar_servidor.js');
const TOKEN = 'MTAwMDAwMDAwMDAwMDAwMDAw.SECRETO.token-de-prueba-que-no-debe-salir-nunca';
const GUILD = '900000000000000001';
const DUENO = '900000000000000002';
const BOT = '900000000000000003';
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'envivo-discord-'));

let fallos = 0;
let pasos = 0;
const ok = (cond, msg) => { pasos++; if (cond) console.log(`  ✔ ${msg}`); else { fallos++; console.log(`  ✘ ${msg}`); } };

// ------------------------------------------------------------------ Discord falso
const BITS = { ADMINISTRATOR: 3n, VIEW_CHANNEL: 10n, SEND_MESSAGES: 11n };
function crearDiscordFalso() {
  let sig = 1000n;
  const nuevoId = () => (900000000000100000n + sig++).toString();
  const st = {
    guild: { id: GUILD, name: 'Servidor de prueba', owner_id: DUENO, features: [], verification_level: 0, explicit_content_filter: 0,
      default_message_notifications: 0, preferred_locale: 'en-US', description: null, rules_channel_id: null, public_updates_channel_id: null,
      safety_alerts_channel_id: null },
    roles: [
      { id: GUILD, name: '@everyone', position: 0, permissions: '1071698660929', color: 0, hoist: false, mentionable: false, managed: false },
      { id: '900000000000000010', name: 'EN VIVO Bot', position: 1, permissions: '8', color: 0, hoist: false, mentionable: false, managed: true },
      { id: '900000000000000011', name: 'Amigos', position: 2, permissions: '0', color: 255, hoist: false, mentionable: true, managed: false },
    ],
    members: { [DUENO]: { user: { id: DUENO }, roles: ['900000000000000011'] }, [BOT]: { user: { id: BOT }, roles: ['900000000000000010'] } },
    channels: [],
    messages: {},
    automod: [{ id: '900000000000000020', guild_id: GUILD, name: 'Regla hecha a mano', creator_id: DUENO, event_type: 1, trigger_type: 1,
      trigger_metadata: { keyword_filter: ['palabraprohibida'], regex_patterns: [], allow_list: [] }, actions: [{ type: 1, metadata: {} }],
      enabled: true, exempt_roles: [], exempt_channels: [] }],
    onboarding: { guild_id: GUILD, prompts: [], default_channel_ids: [], enabled: false, mode: 0 },
    log: [],             // { metodo, ruta, status }
    limites: { r429: 0, global429: 0 },
    inyectar: { rolesPost429: 0, global429: 0, agotarCubo: false },
    tokenVisto: new Set(),
  };
  // Canales por defecto de un servidor nuevo (el script no los debe tocar)
  const cTexto = { id: nuevoId(), type: 4, name: 'Text Channels', position: 0, parent_id: null, permission_overwrites: [] };
  const cVoz = { id: nuevoId(), type: 4, name: 'Voice Channels', position: 1, parent_id: null, permission_overwrites: [] };
  st.channels.push(cTexto, cVoz,
    { id: nuevoId(), type: 0, name: 'general', position: 0, parent_id: cTexto.id, topic: null, rate_limit_per_user: 0, permission_overwrites: [], nsfw: false, flags: 0 },
    { id: nuevoId(), type: 2, name: 'General', position: 0, parent_id: cVoz.id, user_limit: 0, permission_overwrites: [], flags: 0 });
  st.guild.system_channel_id = st.channels[2].id;

  const err = (res, status, message, code = 0, extra = {}) => { res.writeHead(status, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ message, code, ...extra })); return null; };
  const json = (res, status, datos, headers = {}) => {
    if (datos === null) { res.writeHead(204, headers); res.end(); return; }
    res.writeHead(status, { 'Content-Type': 'application/json', ...headers }); res.end(JSON.stringify(datos));
  };
  const textual = (t) => ![2, 4, 13].includes(t);
  const normCanal = (c) => {
    if (c.name && textual(c.type)) c.name = c.name.toLowerCase().replace(/\s+/g, '-');   // como Discord
    return c;
  };
  const validarCanal = (c) => {
    if (!c.name || c.name.length > 100) return 'name';
    if ((c.type === 5 || c.type === 13) && !st.guild.features.includes('COMMUNITY')) return 'Este tipo de canal necesita COMMUNITY';
    if (c.topic && c.topic.length > (c.type === 15 ? 4096 : 1024)) return 'topic muy largo';
    if (c.rate_limit_per_user > 21600 || c.default_thread_rate_limit_per_user > 21600) return 'slowmode';
    if (c.available_tags) {
      if (c.available_tags.length > 20) return 'más de 20 etiquetas';
      for (const t of c.available_tags) if (!t.name || t.name.length > 20) return `etiqueta "${t.name}" muy larga`;
    }
    for (const o of c.permission_overwrites || []) {
      if (!/^\d+$/.test(String(o.allow)) || !/^\d+$/.test(String(o.deny))) return 'overwrite inválido';
      if (o.id !== GUILD && !st.roles.some((r) => r.id === o.id) && !st.members[o.id]) return `overwrite para id desconocido ${o.id}`;
    }
    if (c.parent_id && !st.channels.some((x) => x.id === c.parent_id && x.type === 4)) return 'parent_id';
    return null;
  };
  const puedeVerYEscribir = (c) => {
    // ¿@everyone puede ver y escribir? (categoría + canal)
    let perm = BigInt(st.roles.find((r) => r.id === GUILD).permissions);
    const aplicar = (ow) => { const o = (ow || []).find((x) => x.id === GUILD); if (o) perm = (perm & ~BigInt(o.deny)) | BigInt(o.allow); };
    aplicar(c.permission_overwrites);
    const ver = (perm >> BITS.VIEW_CHANNEL) & 1n; const esc = (perm >> BITS.SEND_MESSAGES) & 1n;
    return { ver: !!ver, escribir: !!(ver && esc) };
  };

  const server = http.createServer(async (req, res) => {
    let cuerpo = '';
    for await (const ch of req) cuerpo += ch;
    const url = new URL(req.url, 'http://x');
    const ruta = url.pathname.replace(/^\/api\/v10/, '');
    const m = req.method;
    const entrada = { metodo: m, ruta, status: 0, razon: req.headers['x-audit-log-reason'] ? decodeURIComponent(req.headers['x-audit-log-reason']) : '' };
    st.log.push(entrada);
    const responder = (status, datos, headers) => { entrada.status = status; return json(res, status, datos, headers); };
    const error = (status, msg, code, extra) => { entrada.status = status; return err(res, status, msg, code, extra); };
    if (req.headers.authorization !== `Bot ${TOKEN}`) return error(401, '401: Unauthorized', 0);
    let b = null;
    if (cuerpo) { try { b = JSON.parse(cuerpo); } catch { return error(400, 'JSON inválido', 50109); } }

    // Límites inyectados
    if (st.inyectar.global429 > 0 && m === 'GET') { st.inyectar.global429--; st.limites.global429++; return error(429, 'You are being rate limited.', 0, { retry_after: 0.15, global: true }); }
    if (st.inyectar.rolesPost429 > 0 && m === 'POST' && ruta === `/guilds/${GUILD}/roles`) {
      st.inyectar.rolesPost429--; st.limites.r429++;
      entrada.status = 429;
      res.writeHead(429, { 'Content-Type': 'application/json', 'Retry-After': '1', 'X-RateLimit-Scope': 'user' });
      res.end(JSON.stringify({ message: 'You are being rate limited.', retry_after: 0.2, global: false }));
      return;
    }
    const cabeceras = st.inyectar.agotarCubo && m === 'POST' ? { 'X-RateLimit-Remaining': '0', 'X-RateLimit-Reset-After': '0.05', 'X-RateLimit-Bucket': 'abc' } : {};
    const R = (status, datos) => responder(status, datos, cabeceras);
    const g = `/guilds/${GUILD}`;
    let p;

    if (m === 'GET' && ruta === '/users/@me') return R(200, { id: BOT, username: 'EN VIVO Bot', bot: true });
    if (ruta.startsWith('/guilds/') && !ruta.startsWith(g)) return error(404, 'Unknown Guild', 10004);
    if (m === 'GET' && ruta === g) return R(200, { ...st.guild, roles: st.roles });
    if (m === 'PATCH' && ruta === g) {
      if (b.features && b.features.includes('COMMUNITY') && !st.guild.features.includes('COMMUNITY')) {
        if (!(b.rules_channel_id ?? st.guild.rules_channel_id) || !(b.public_updates_channel_id ?? st.guild.public_updates_channel_id)) return error(400, 'Faltan canales de Comunidad', 50035);
        if (Math.max(b.verification_level ?? 0, st.guild.verification_level) < 1 || (b.explicit_content_filter ?? st.guild.explicit_content_filter) !== 2) return error(400, 'Seguridad insuficiente', 50035);
      }
      if ((b.description !== undefined || b.safety_alerts_channel_id !== undefined) && !(b.features || st.guild.features).includes('COMMUNITY')) return error(400, 'Necesita COMMUNITY', 50035);
      Object.assign(st.guild, b);
      return R(200, { ...st.guild });
    }
    if ((p = ruta.match(/^\/guilds\/\d+\/members\/(\d+)$/)) && m === 'GET') {
      const mem = st.members[p[1]];
      return mem ? R(200, mem) : error(404, 'Unknown Member', 10007);
    }
    if ((p = ruta.match(/^\/guilds\/\d+\/members\/(\d+)\/roles\/(\d+)$/)) && m === 'PUT') {
      const mem = st.members[p[1]]; if (!mem) return error(404, 'Unknown Member', 10007);
      if (!st.roles.some((r) => r.id === p[2])) return error(404, 'Unknown Role', 10011);
      if (!mem.roles.includes(p[2])) mem.roles.push(p[2]);
      return R(204, null);
    }
    // Roles
    if (ruta === `${g}/roles` && m === 'GET') return R(200, st.roles);
    if (ruta === `${g}/roles` && m === 'POST') {
      if (!b.name || b.name.length > 100) return error(400, 'name', 50035);
      for (const r of st.roles) if (r.id !== GUILD && r.position >= 1) r.position++;
      const rol = { id: nuevoId(), name: b.name, color: b.color || 0, hoist: !!b.hoist, mentionable: !!b.mentionable, permissions: String(b.permissions || '0'), position: 1, managed: false };
      st.roles.push(rol);
      return R(200, rol);
    }
    if (ruta === `${g}/roles` && m === 'PATCH') {
      for (const x of b) { const r = st.roles.find((y) => y.id === x.id); if (!r) return error(404, 'Unknown Role', 10011); r.position = x.position; }
      const resto = st.roles.filter((r) => r.id !== GUILD).sort((a, c) => a.position - c.position || (BigInt(a.id) < BigInt(c.id) ? -1 : 1));
      resto.forEach((r, i) => { r.position = i + 1; });
      return R(200, st.roles);
    }
    if ((p = ruta.match(/^\/guilds\/\d+\/roles\/(\d+)$/)) && m === 'PATCH') {
      const r = st.roles.find((y) => y.id === p[1]); if (!r) return error(404, 'Unknown Role', 10011);
      if (r.managed && b.permissions) return error(403, 'Missing Permissions', 50013);
      Object.assign(r, b, b.permissions !== undefined ? { permissions: String(b.permissions) } : {});
      return R(200, r);
    }
    // Canales
    if (ruta === `${g}/channels` && m === 'GET') return R(200, st.channels);
    if (ruta === `${g}/channels` && m === 'POST') {
      const c = normCanal({ id: nuevoId(), type: b.type ?? 0, name: b.name, topic: b.topic ?? null, position: st.channels.filter((x) => x.parent_id === (b.parent_id || null)).length,
        parent_id: b.parent_id || null, permission_overwrites: (b.permission_overwrites || []).map((o) => ({ ...o, allow: String(o.allow), deny: String(o.deny) })),
        rate_limit_per_user: b.rate_limit_per_user ?? 0, nsfw: false, flags: 0 });
      if (c.type === 2 || c.type === 13) { c.user_limit = b.user_limit ?? 0; delete c.topic; }
      if (c.type === 4) { delete c.topic; delete c.rate_limit_per_user; }
      if (c.type === 5) delete c.rate_limit_per_user;
      if (c.type === 15) {
        c.available_tags = (b.available_tags || []).map((t) => ({ id: nuevoId(), name: t.name, moderated: !!t.moderated, emoji_id: null, emoji_name: t.emoji_name ?? null }));
        c.default_reaction_emoji = b.default_reaction_emoji || null;
        c.default_thread_rate_limit_per_user = b.default_thread_rate_limit_per_user ?? 0;
        c.default_sort_order = b.default_sort_order ?? null; c.default_forum_layout = b.default_forum_layout ?? 0;
      }
      if ('flags' in b) return error(400, 'flags no se acepta al crear', 50035);
      const e = validarCanal(c); if (e) return error(400, e, 50035);
      st.channels.push(c);
      return R(201, c);
    }
    if (ruta === `${g}/channels` && m === 'PATCH') {
      for (const x of b) { const c = st.channels.find((y) => y.id === x.id); if (!c) return error(404, 'Unknown Channel', 10003); c.position = x.position; if (x.parent_id !== undefined) c.parent_id = x.parent_id; }
      return R(204, null);
    }
    if ((p = ruta.match(/^\/channels\/(\d+)$/)) && m === 'PATCH') {
      const c = st.channels.find((y) => y.id === p[1]); if (!c) return error(404, 'Unknown Channel', 10003);
      const nuevo = normCanal({ ...c, ...b });
      if (b.type !== undefined && b.type !== c.type && !([0, 5].includes(c.type) && [0, 5].includes(b.type))) return error(400, 'type', 50024);
      if (b.available_tags) nuevo.available_tags = b.available_tags.map((t) => ({ id: t.id || nuevoId(), name: t.name, moderated: !!t.moderated, emoji_id: null, emoji_name: t.emoji_name ?? null }));
      if (b.permission_overwrites) nuevo.permission_overwrites = b.permission_overwrites.map((o) => ({ ...o, allow: String(o.allow), deny: String(o.deny) }));
      const e = validarCanal(nuevo); if (e) return error(400, e, 50035);
      Object.assign(c, nuevo);
      return R(200, c);
    }
    // Mensajes
    if ((p = ruta.match(/^\/channels\/(\d+)\/messages$/))) {
      const c = st.channels.find((y) => y.id === p[1]); if (!c) return error(404, 'Unknown Channel', 10003);
      st.messages[c.id] ??= [];
      if (m === 'GET') return R(200, [...st.messages[c.id]].reverse().slice(0, Number(url.searchParams.get('limit') || 50)));
      if (m === 'POST') {
        if (![0, 5].includes(c.type)) return error(400, 'No se puede escribir aquí', 50008);
        const embeds = b.embeds || [];
        if (embeds.length > 10) return error(400, 'embeds', 50035);
        let total = 0;
        for (const e of embeds) {
          if ((e.description || '').length > 4096 || (e.title || '').length > 256) return error(400, 'embed muy largo', 50035);
          total += (e.title || '').length + (e.description || '').length + (e.footer?.text || '').length;
        }
        if (total > 6000) return error(400, 'embeds suman más de 6000', 50035);
        const msg = { id: nuevoId(), channel_id: c.id, author: { id: BOT, bot: true }, content: b.content || '', embeds: embeds.map((e) => ({ type: 'rich', ...e })), pinned: false, allowed: b.allowed_mentions };
        st.messages[c.id].push(msg);
        return R(200, msg);
      }
    }
    if ((p = ruta.match(/^\/channels\/(\d+)\/messages\/(\d+)$/)) && m === 'PATCH') {
      const msg = (st.messages[p[1]] || []).find((x) => x.id === p[2]); if (!msg) return error(404, 'Unknown Message', 10008);
      if (b.embeds) msg.embeds = b.embeds.map((e) => ({ type: 'rich', ...e }));
      msg.edited = true;
      return R(200, msg);
    }
    if ((p = ruta.match(/^\/channels\/(\d+)\/messages\/pins\/(\d+)$/)) && m === 'PUT') {
      const msg = (st.messages[p[1]] || []).find((x) => x.id === p[2]); if (!msg) return error(404, 'Unknown Message', 10008);
      msg.pinned = true; return R(204, null);
    }
    // AutoMod
    if (ruta === `${g}/auto-moderation/rules` && m === 'GET') return R(200, st.automod);
    const validarRegla = (r) => {
      const tm = r.trigger_metadata || {};
      for (const k of tm.keyword_filter || []) if (k.length > 60) return 'keyword > 60';
      if ((tm.keyword_filter || []).length > 1000) return 'keywords > 1000';
      if ((tm.regex_patterns || []).length > 10) return 'regex > 10';
      for (const x of tm.regex_patterns || []) if (x.length > 260 || /\(\?[=!<]/.test(x)) return 'regex inválida';
      for (const a of r.actions || []) {
        if (a.type === 1 && (a.metadata?.custom_message || '').length > 150) return 'custom_message > 150';
        if (a.type === 2 && !st.channels.some((c) => c.id === a.metadata?.channel_id)) return 'canal de alerta';
        if (a.type === 3 && ![1, 5].includes(r.trigger_type)) return 'timeout solo con keyword o mention';
      }
      if ((r.exempt_roles || []).length > 20 || (r.exempt_channels || []).length > 50) return 'exentos';
      return null;
    };
    if (ruta === `${g}/auto-moderation/rules` && m === 'POST') {
      const max = { 1: 6, 3: 1, 4: 1, 5: 1 }[b.trigger_type];
      if (st.automod.filter((r) => r.trigger_type === b.trigger_type).length >= max) return error(400, 'Maximum number of rules of this trigger type reached', 30037);
      const e = validarRegla(b); if (e) return error(400, e, 50035);
      const r = { id: nuevoId(), guild_id: GUILD, creator_id: BOT, ...b };
      st.automod.push(r);
      return R(200, r);
    }
    if ((p = ruta.match(/^\/guilds\/\d+\/auto-moderation\/rules\/(\d+)$/)) && m === 'PATCH') {
      const r = st.automod.find((x) => x.id === p[1]); if (!r) return error(404, 'Unknown rule', 10066);
      if ('trigger_type' in b) return error(400, 'trigger_type no se puede cambiar', 50035);
      const e = validarRegla({ ...r, ...b }); if (e) return error(400, e, 50035);
      Object.assign(r, b);
      return R(200, r);
    }
    // Onboarding
    if (ruta === `${g}/onboarding` && m === 'GET') return R(200, st.onboarding);
    if (ruta === `${g}/onboarding` && m === 'PUT') {
      if (!st.guild.features.includes('COMMUNITY')) return error(400, 'Necesita COMMUNITY', 50035);
      const defs = (b.default_channel_ids || []).map((id) => st.channels.find((c) => c.id === id));
      if (defs.some((c) => !c)) return error(400, 'canal por defecto desconocido', 50035);
      if (defs.length < 7) return error(400, 'Se necesitan 7 canales por defecto', 350000);
      if (defs.filter((c) => {
        const cat = st.channels.find((x) => x.id === c.parent_id);
        const v = puedeVerYEscribir(c), vc = cat ? puedeVerYEscribir(cat) : { ver: true };
        return v.escribir && vc.ver !== false;
      }).length < 5) return error(400, 'Se necesitan 5 canales donde @everyone pueda escribir', 350000);
      for (const q of b.prompts || []) {
        if (!q.id || !q.title) return error(400, 'prompt sin id', 50035);
        for (const o of q.options || []) {
          if (!o.id || !o.title) return error(400, 'opción sin id', 50035);
          if (!(o.role_ids || []).length && !(o.channel_ids || []).length) return error(400, 'opción sin rol ni canal', 50035);
          for (const id of o.role_ids || []) if (!st.roles.some((r) => r.id === id)) return error(400, 'rol desconocido', 50035);
          for (const id of o.channel_ids || []) if (!st.channels.some((c) => c.id === id)) return error(400, 'canal desconocido', 50035);
        }
      }
      st.onboarding = { guild_id: GUILD, enabled: !!b.enabled, mode: b.mode ?? 0, default_channel_ids: b.default_channel_ids,
        prompts: b.prompts.map((q) => ({ ...q, options: q.options.map((o) => ({ id: o.id, title: o.title, description: o.description ?? null,
          emoji: o.emoji_name ? { id: null, name: o.emoji_name, animated: false } : null, role_ids: o.role_ids, channel_ids: o.channel_ids })) })) };
      return R(200, st.onboarding);
    }
    return error(404, `Ruta desconocida en el Discord falso: ${m} ${ruta}`, 0);
  });
  return { server, st };
}

// ------------------------------------------------------------------ correr el script
function correr(args, env = {}) {
  return new Promise((resolve) => {
    const hijo = spawn(process.execPath, [SCRIPT, ...args], {
      env: { PATH: process.env.PATH, SYSTEMROOT: process.env.SYSTEMROOT || '', ...env },
      cwd: TMP,
    });
    let out = '';
    hijo.stdout.on('data', (d) => { out += d; });
    hijo.stderr.on('data', (d) => { out += d; });
    hijo.on('close', (code) => resolve({ code, out }));
  });
}

// ------------------------------------------------------------------ lo que debería quedar (calculado desde estructura.json)
const est = JSON.parse(fs.readFileSync(path.join(DIR, 'estructura.json'), 'utf8'));
const permisoABits = (() => {
  const src = fs.readFileSync(SCRIPT, 'utf8');
  const bloque = src.slice(src.indexOf('const PERMISOS = {'), src.indexOf('};', src.indexOf('const PERMISOS = {')));
  const mapa = {};
  for (const [, k, v] of bloque.matchAll(/([A-Z_]+): (\d+)/g)) mapa[k] = BigInt(v);
  return (lista = []) => lista.reduce((t, n) => t | (1n << mapa[n]), 0n).toString();
})();
const sj = est.servidores_del_juego;
const rolesEsperados = [];
for (const r of est.roles) {
  rolesEsperados.push(r);
  if (r.clave === sj.roles_despues_de) for (const s of sj.lista) rolesEsperados.push({ clave: `servidor-${s.numero}`, nombre: `Servidor ${s.numero} · ${s.ciudad}`, color: sj.color, separado: false, mencionable: false, permisos: [] });
}
const norm = (n, t) => (![2, 4, 13].includes(t) ? n.toLowerCase().replace(/\s+/g, '-') : n);
const TIPOS = { texto: 0, voz: 2, anuncios: 5, escenario: 13, foro: 15 };

function verificarEstructura(st, etiqueta) {
  console.log(`\n▶ ${etiqueta}: la estructura coincide con estructura.json`);
  const rolPorNombre = (n) => st.roles.find((r) => r.name === n);
  const idRol = {};
  let rolesOk = true;
  for (const r of rolesEsperados) {
    const x = rolPorNombre(r.nombre);
    if (!x) { rolesOk = false; console.log(`     falta el rol ${r.nombre}`); continue; }
    idRol[r.clave] = x.id;
    const colorEsperado = r.color ? parseInt(r.color.slice(1), 16) : 0;
    if (x.color !== colorEsperado || x.hoist !== !!r.separado || x.permissions !== permisoABits(r.permisos)) { rolesOk = false; console.log(`     rol distinto: ${r.nombre}`); }
  }
  ok(rolesOk, `${rolesEsperados.length} roles con su color, separación y permisos`);
  ok(st.roles.filter((r) => rolesEsperados.some((e) => e.nombre === r.name)).length === rolesEsperados.length, 'sin roles duplicados');
  // orden de roles: de arriba hacia abajo como en el diseño, todos por debajo del bot
  const pos = rolesEsperados.map((r) => rolPorNombre(r.nombre)?.position ?? -1);
  ok(pos.every((p, i) => i === 0 || p < pos[i - 1]), 'roles ordenados como en estructura.json');
  const bot = st.roles.find((r) => r.managed);
  ok(pos.every((p) => p < bot.position), 'todos los roles quedan debajo del rol del bot');
  ok(st.roles.find((r) => r.name === 'Amigos')?.color === 255, 'el rol "Amigos" (hecho a mano) sigue igual');
  ok(st.roles.find((r) => r.id === GUILD).permissions === permisoABits(est.permisos_everyone), '@everyone con los permisos base (sin @everyone, sin encuestas)');
  ok(st.members[BOT].roles.includes(idRol.bots), 'el bot tiene el rol Bots');
  ok(st.members[DUENO].roles.includes(idRol.admin) && st.members[DUENO].roles.includes('900000000000000011'), 'el dueño recibió Admin QF y conserva sus roles');

  // canales
  const ow = (perms) => Object.entries(perms || {}).map(([k, v]) => `${k === '@everyone' ? GUILD : idRol[k]}:${permisoABits(v.permitir)}:${permisoABits(v.denegar)}`).sort();
  const owActual = (c) => (c.permission_overwrites || []).map((o) => `${o.id}:${o.allow}:${o.deny}`).sort();
  let catOk = true, canOk = true, foroOk = true, ordenOk = true;
  const idCanal = {};
  const cats = [];
  for (const cat of est.categorias) {
    const c = st.channels.find((x) => x.type === 4 && x.name === cat.nombre);
    if (!c || JSON.stringify(owActual(c)) !== JSON.stringify(ow(cat.permisos))) { catOk = false; console.log(`     categoría distinta: ${cat.nombre}`); continue; }
    idCanal[cat.clave] = c.id; cats.push(c);
    const canales = [...cat.canales];
    if (cat.clave === sj.categoria) for (const s of sj.lista) canales.push({ clave: `servidor-${s.numero}`, nombre: `🏙️┃servidor-${s.numero}-${s.ciudad.toLowerCase()}`, tipo: 'texto', lento: 3, permisos: { [`servidor-${s.numero}`]: { permitir: ['VIEW_CHANNEL'] } } });
    const hijos = [];
    for (const ch of canales) {
      const t = TIPOS[ch.tipo];
      const x = st.channels.filter((y) => y.parent_id === c.id && y.type === t && y.name === norm(ch.nombre, t));
      if (x.length !== 1) { canOk = false; console.log(`     canal ${ch.nombre}: ${x.length} encontrados`); continue; }
      const y = x[0]; idCanal[ch.clave] = y.id; hijos.push(y);
      const esperadoOw = ow({ ...(cat.permisos || {}), ...(ch.permisos || {}) });
      if (JSON.stringify(owActual(y)) !== JSON.stringify(esperadoOw)) { canOk = false; console.log(`     permisos distintos en ${ch.nombre}`); }
      if (![2, 13].includes(t) && (y.topic || '') !== (ch.tema || '') && ch.tema !== undefined) { canOk = false; console.log(`     tema distinto en ${ch.nombre}`); }
      if ([0, 15].includes(t) && (y.rate_limit_per_user || 0) !== (ch.lento || 0)) { canOk = false; console.log(`     modo lento distinto en ${ch.nombre}`); }
      if (t === 2 && (y.user_limit || 0) !== (ch.limite_usuarios || 0)) { canOk = false; console.log(`     límite distinto en ${ch.nombre}`); }
      if (t === 15) {
        let tags = ch.etiquetas.map((e) => e.nombre);
        if (ch.etiquetas_servidores_despues_de !== undefined) tags = [...tags.slice(0, ch.etiquetas_servidores_despues_de), ...sj.lista.map((s) => `S${s.numero} · ${s.ciudad}`), ...tags.slice(ch.etiquetas_servidores_despues_de)];
        const reales = y.available_tags.map((e) => e.name);
        const mod = ch.etiquetas.filter((e) => e.solo_staff).map((e) => e.nombre).sort();
        const modReales = y.available_tags.filter((e) => e.moderated).map((e) => e.name).sort();
        if (JSON.stringify(reales) !== JSON.stringify(tags) || JSON.stringify(mod) !== JSON.stringify(modReales)) { foroOk = false; console.log(`     etiquetas distintas en ${ch.nombre}`); }
        if (!!(y.flags & 16) !== !!ch.requiere_etiqueta) { foroOk = false; console.log(`     "requiere etiqueta" distinto en ${ch.nombre}`); }
        if ((y.default_thread_rate_limit_per_user || 0) !== (ch.lento_hilos || 0)) { foroOk = false; console.log(`     modo lento de hilos distinto en ${ch.nombre}`); }
        if ((y.default_reaction_emoji?.emoji_name || null) !== (ch.reaccion || null)) { foroOk = false; console.log(`     reacción distinta en ${ch.nombre}`); }
      }
    }
    for (const grupo of [hijos.filter((h) => ![2, 13].includes(h.type)), hijos.filter((h) => [2, 13].includes(h.type))]) {
      if (!grupo.every((h, i) => i === 0 || h.position > grupo[i - 1].position)) { ordenOk = false; console.log(`     orden distinto en ${cat.nombre}`); }
    }
  }
  if (!cats.every((c, i) => i === 0 || c.position > cats[i - 1].position)) ordenOk = false;
  ok(catOk, `${est.categorias.length} categorías con sus permisos`);
  ok(canOk, 'todos los canales (texto, anuncios, foros, voz, escenario) con tema, modo lento y permisos');
  ok(foroOk, 'foros con etiquetas (las de staff moderadas), "requiere etiqueta", modo lento y reacción');
  ok(ordenOk, 'categorías y canales en el orden del diseño');
  ok(st.channels.some((c) => c.name === 'general' && c.type === 0) && st.channels.some((c) => c.name === 'Text Channels'), 'los canales que Discord creó al inicio siguen ahí (no se borra nada)');
  // servidor del juego visible solo con su rol
  const srv = st.channels.find((c) => c.id === idCanal['servidor-1']);
  ok(srv && srv.permission_overwrites.some((o) => o.id === GUILD && (BigInt(o.deny) >> 10n) & 1n) && srv.permission_overwrites.some((o) => o.id === idRol['servidor-1'] && (BigInt(o.allow) >> 10n) & 1n),
    'el canal del Servidor 1 está oculto para todos y visible para su rol');
  const fr = st.channels.find((c) => c.id === idCanal['idioma-fr']);
  ok(fr && fr.permission_overwrites.some((o) => o.id === idRol.fr && (BigInt(o.allow) >> 10n) & 1n), 'los canales de idioma se abren con su rol de idioma');

  // Comunidad
  ok(st.guild.features.includes('COMMUNITY') && st.guild.rules_channel_id === idCanal.reglas && st.guild.public_updates_channel_id === idCanal['avisos-de-discord'],
    'Comunidad activada con #reglas y el canal de avisos de Discord');
  ok(st.guild.verification_level >= 2 && st.guild.explicit_content_filter === 2 && st.guild.safety_alerts_channel_id === idCanal['automod-alertas'], 'verificación, filtro de contenido y alertas de seguridad');

  // AutoMod
  const reglas = est.automod.map((r) => st.automod.find((x) => x.name === r.nombre));
  ok(reglas.every(Boolean), `${est.automod.length} reglas de AutoMod creadas`);
  const inv = st.automod.find((x) => x.name.includes('Invitaciones'));
  ok(inv && inv.trigger_metadata.regex_patterns.length === 5 && inv.actions.some((a) => a.type === 3) && inv.actions.some((a) => a.type === 2 && a.metadata.channel_id === idCanal['automod-alertas']),
    'regla de invitaciones: regex, silencio y alerta al canal de staff');
  const es = st.automod.find((x) => x.name.includes('Groserías'));
  ok(es && es.trigger_metadata.keyword_filter.includes('chucha') && es.trigger_metadata.keyword_filter.includes('*verga*'), 'groserías en español (incluye jerga de Ecuador)');
  const men = st.automod.find((x) => x.trigger_type === 5);
  ok(men && men.trigger_metadata.mention_total_limit === 5 && men.trigger_metadata.mention_raid_protection_enabled === true, 'límite de menciones y protección contra raids');
  ok(st.automod.some((x) => x.name === 'Regla hecha a mano'), 'la regla de AutoMod hecha a mano sigue ahí');

  // Onboarding
  const ob = st.onboarding;
  ok(ob.enabled && ob.default_channel_ids.length === est.onboarding.canales_por_defecto.length, 'Onboarding activado con sus canales por defecto');
  const idioma = ob.prompts.find((q) => q.title === est.onboarding.preguntas[0].titulo);
  ok(idioma && idioma.required && idioma.options.length === 10 && idioma.options.every((o) => o.role_ids.length === 1), 'pregunta de idioma obligatoria con 10 idiomas y su rol');
  const servidor = ob.prompts.find((q) => q.title === est.onboarding.preguntas[1].titulo);
  ok(servidor && servidor.options.some((o) => o.title === 'Servidor 1 · Quito' && o.role_ids[0] === idRol['servidor-1'] && o.channel_ids[0] === idCanal['servidor-1']), 'pregunta de servidor del juego → rol y canal del servidor');
  ok(ob.prompts.length === 3, 'tres preguntas: idioma, servidor e intereses');

  // Mensajes
  let msjOk = true, marcadores = true, fijados = true, menciones = true;
  for (const def of est.mensajes) {
    const lista = (st.messages[idCanal[def.canal]] || []).filter((x) => x.embeds?.[0]?.url?.endsWith(`#discord-${def.ref}`));
    if (lista.length !== 1) { msjOk = false; console.log(`     mensaje ${def.ref}: ${lista.length}`); continue; }
    const texto = JSON.stringify(lista[0].embeds);
    if (/\{[#@A-Z][^}\s]*\}/.test(texto)) { marcadores = false; console.log(`     ${def.ref} tiene marcadores sin reemplazar`); }
    if (def.fijar && !lista[0].pinned) fijados = false;
    if (!lista[0].allowed || lista[0].allowed.parse?.length !== 0) menciones = false;
  }
  ok(msjOk, `${est.mensajes.length} mensajes fijos publicados una sola vez`);
  ok(marcadores, 'los mensajes no tienen {marcadores} sin reemplazar (canales y roles quedaron como enlaces)');
  ok(fijados, 'los mensajes quedaron fijados');
  ok(menciones, 'los mensajes no notifican a nadie (allowed_mentions vacío)');
  const reglasEs = st.messages[idCanal.reglas].find((x) => x.embeds[0].url.endsWith('reglas-es'));
  ok(reglasEs && reglasEs.embeds.some((e) => e.description.includes(`<@&${idRol.mod}>`)) && reglasEs.embeds.some((e) => e.description.includes(`<#${idCanal.errores}>`)), 'las reglas enlazan roles del staff y canales');
  return { idRol, idCanal };
}

// ------------------------------------------------------------------ pruebas
async function main() {
  const { server, st } = crearDiscordFalso();
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${server.address().port}/api/v10`;
  const estado = path.join(TMP, 'estado.json');
  const env = { DISCORD_TOKEN: TOKEN, DISCORD_GUILD_ID: GUILD, DISCORD_API_BASE: base, DISCORD_ESTADO: estado };
  const escrituras = () => st.log.filter((l) => l.metodo !== 'GET' && l.status && l.status < 400).length;
  const borrados = () => st.log.filter((l) => l.metodo === 'DELETE').length;
  const sinSecreto = (out) => !out.includes(TOKEN) && !out.includes('SECRETO') && !out.includes('token-de-prueba');

  try {
    console.log('▶ Validación: --simular no se conecta a nada');
    let r = await correr(['--simular', '--env', path.join(TMP, 'no-existe.env')], { DISCORD_API_BASE: base });
    ok(r.code === 0, 'termina bien sin token');
    ok(st.log.length === 0, 'cero llamadas al Discord falso');
    ok(r.out.includes('[simular]') && r.out.includes('crear rol Admin QF') && r.out.includes('crear regla AutoMod'), 'muestra las acciones que haría');
    r = await correr(['--simular'], { DISCORD_TOKEN: TOKEN, DISCORD_API_BASE: base });
    ok(r.code === 0 && st.log.length === 0 && sinSecreto(r.out), 'con token tampoco llama a Discord ni lo muestra');

    console.log('\n▶ Token inválido: mensaje claro y sin mostrar el token');
    r = await correr([], { ...env, DISCORD_TOKEN: 'Bot ' + TOKEN.replace('SECRETO', 'SECRETX') });
    ok(r.code === 1 && /token/i.test(r.out) && r.out.includes('401'), 'explica que Discord no aceptó el token');
    ok(!r.out.includes('SECRETX') && sinSecreto(r.out), 'no imprime el token');
    r = await correr([], { ...env, DISCORD_API_BASE: 'http://otra-pagina.example.com/api' });
    ok(r.code === 1 && r.out.includes('DISCORD_API_BASE') && sinSecreto(r.out), 'no manda el token a una dirección que no sea Discord');

    console.log('\n▶ Primera corrida (con límites de Discord: 429 de una ruta, 429 global y cubos agotados)');
    st.log.length = 0;
    st.inyectar = { rolesPost429: 2, global429: 1, agotarCubo: true };
    const t0 = Date.now();
    r = await correr([], env);
    if (r.code !== 0) console.log(r.out);
    ok(r.code === 0, 'termina bien (código 0)');
    ok(st.limites.r429 === 2 && st.limites.global429 === 1, 'Discord falso respondió 3 veces 429');
    ok((r.out.match(/Discord pidió esperar/g) || []).length === 3 && r.out.includes('límite general'), 'el script esperó retry_after y reintentó');
    ok(Date.now() - t0 >= 550, 'respetó los tiempos de espera');
    ok(!st.log.some((l) => l.status >= 400 && l.status !== 429), 'ninguna llamada rechazada por Discord');
    ok(sinSecreto(r.out), 'la salida no tiene el token');
    ok(r.out.includes('Listo') && r.out.includes('Roles') && r.out.includes('creados'), 'imprime el resumen');
    ok(borrados() === 0, 'cero DELETE');
    ok(st.log.filter((l) => l.metodo !== 'GET').every((l) => l.razon), 'cada cambio deja su motivo en el registro de auditoría');
    ok(fs.existsSync(estado) && !fs.readFileSync(estado, 'utf8').includes(TOKEN), 'guardó el archivo de estado (sin el token)');
    verificarEstructura(st, 'Después de la primera corrida');

    console.log('\n▶ Segunda corrida: no cambia nada (idempotente)');
    st.inyectar = { rolesPost429: 0, global429: 0, agotarCubo: false };
    st.log.length = 0;
    r = await correr([], env);
    ok(r.code === 0, 'termina bien');
    ok(escrituras() === 0, `cero cambios en Discord (${st.log.filter((l) => l.metodo !== 'GET').map((l) => l.razon).join(' | ') || 'ninguno'})`);
    ok(r.out.includes('sin cambios') && !r.out.includes('creados'), 'el resumen dice "sin cambios"');

    console.log('\n▶ Tercera corrida sin archivo de estado: encuentra todo por nombre');
    fs.rmSync(estado);
    st.log.length = 0;
    r = await correr([], env);
    ok(r.code === 0 && escrituras() === 0, `cero cambios (${st.log.filter((l) => l.metodo !== 'GET').map((l) => l.razon).join(' | ') || 'ninguno'})`);

    console.log('\n▶ Cambios en el diseño: tema nuevo, Servidor 2, mensaje editado, permiso a mano conservado');
    const dir2 = path.join(TMP, 'diseno2');
    fs.cpSync(DIR, dir2, { recursive: true, filter: (s) => !s.includes('node_modules') && !s.endsWith('.env') });
    const est2 = JSON.parse(fs.readFileSync(path.join(dir2, 'estructura.json'), 'utf8'));
    est2.servidores_del_juego.lista.push({ numero: 2, ciudad: 'Guayaquil' });
    est2.categorias.find((c) => c.clave === 'comunidad').canales.find((c) => c.clave === 'fuera-de-tema').tema = 'Tema nuevo de prueba';
    est2.juego.correo_soporte = 'soporte@ejemplo.test';
    fs.writeFileSync(path.join(dir2, 'estructura.json'), JSON.stringify(est2, null, 2));
    // alguien agregó a mano un permiso para una persona en #fuera-de-tema y una etiqueta en sugerencias
    const ft = st.channels.find((c) => c.name === '🎲┃fuera-de-tema');
    ft.permission_overwrites.push({ id: DUENO, type: 1, allow: '8192', deny: '0' });
    const sug = st.channels.find((c) => c.name === '💡┃sugerencias');
    sug.available_tags.push({ id: '900000000000099999', name: 'Etiqueta manual', moderated: false, emoji_id: null, emoji_name: null });
    st.log.length = 0;
    r = await correr(['--estructura', path.join(dir2, 'estructura.json')], { ...env, DISCORD_ESTADO: path.join(TMP, 'estado2.json') });
    if (r.code !== 0) console.log(r.out);
    ok(r.code === 0, 'termina bien');
    ok(st.roles.some((x) => x.name === 'Servidor 2 · Guayaquil'), 'creó el rol Servidor 2 · Guayaquil');
    const c2 = st.channels.find((c) => c.name === '🏙️┃servidor-2-guayaquil');
    ok(!!c2, 'creó el canal del Servidor 2');
    ok(st.onboarding.prompts[1].options.some((o) => o.title === 'Servidor 2 · Guayaquil'), 'agregó el Servidor 2 al Onboarding');
    ok(st.channels.find((c) => c.name === '🛡️┃reclutamiento-de-asociaciones').available_tags.some((t) => t.name === 'S2 · Guayaquil'), 'agregó la etiqueta S2 · Guayaquil al reclutamiento');
    ok(ft.topic === 'Tema nuevo de prueba', 'actualizó el tema de #fuera-de-tema');
    ok(ft.permission_overwrites.some((o) => o.id === DUENO && o.allow === '8192'), 'conservó el permiso puesto a mano');
    ok(sug.available_tags.some((t) => t.name === 'Etiqueta manual' && t.id === '900000000000099999'), 'conservó la etiqueta hecha a mano');
    const bienvenida = st.messages[st.channels.find((c) => c.name === '👋┃bienvenida').id];
    ok(bienvenida.length === 3 && bienvenida.every((x) => x.edited) && bienvenida[0].embeds[0].description.includes('soporte@ejemplo.test'), 'editó los mensajes con el correo nuevo (sin publicar otros)');
    const faq = st.messages[st.channels.find((c) => c.name === '❓┃preguntas-frecuentes').id][0];
    ok(faq.embeds[0].description.includes(`<#${c2.id}>`), 'la FAQ ya lista el Servidor 2');
    ok(borrados() === 0, 'cero DELETE');
    st.log.length = 0;
    r = await correr(['--estructura', path.join(dir2, 'estructura.json')], { ...env, DISCORD_ESTADO: path.join(TMP, 'estado2.json') });
    ok(r.code === 0 && escrituras() === 0, `y otra corrida con el diseño nuevo no cambia nada (${st.log.filter((l) => l.metodo !== 'GET').map((l) => l.razon).join(' | ') || 'ninguno'})`);

    console.log('\n▶ Diseño con errores: se detiene antes de tocar Discord');
    const est3 = JSON.parse(JSON.stringify(est2));
    est3.categorias[1].canales[0].etiquetas.push({ nombre: 'Una etiqueta demasiado larga para Discord' });
    est3.automod[0].acciones.bloquear = 'x'.repeat(151);
    fs.writeFileSync(path.join(dir2, 'mal.json'), JSON.stringify(est3));
    st.log.length = 0;
    r = await correr(['--estructura', path.join(dir2, 'mal.json')], env);
    ok(r.code === 1 && r.out.includes('más de 20 letras') && r.out.includes('150'), 'explica los problemas');
    ok(st.log.length === 0, 'no hizo ninguna llamada');

    console.log('\n▶ Sin el permiso de Administrador: avisa y no cambia nada');
    const rolBot = st.roles.find((x) => x.managed);
    rolBot.permissions = '0';
    st.log.length = 0;
    r = await correr([], env);
    ok(r.code === 1 && r.out.includes('Administrador'), 'explica que falta Administrador');
    ok(escrituras() === 0, 'cero cambios');
    rolBot.permissions = '8';

    console.log('\n▶ .env junto al script (formato Windows con BOM y comillas)');
    const dir4 = path.join(TMP, 'conenv');
    fs.cpSync(DIR, dir4, { recursive: true, filter: (s) => !s.includes('node_modules') && !s.endsWith('.env') && !s.endsWith('.estado.json') });
    fs.writeFileSync(path.join(dir4, '.env'), `﻿# prueba\r\nDISCORD_TOKEN="${TOKEN}"\r\nDISCORD_GUILD_ID=${GUILD}\r\nDISCORD_API_BASE=${base}\r\n`);
    st.log.length = 0;
    r = await new Promise((resolve) => {
      const h = spawn(process.execPath, [path.join(dir4, 'configurar_servidor.js'), '--estado', path.join(TMP, 'estado4.json')], { env: { PATH: process.env.PATH }, cwd: TMP });
      let out = ''; h.stdout.on('data', (d) => { out += d; }); h.stderr.on('data', (d) => { out += d; });
      h.on('close', (code) => resolve({ code, out }));
    });
    if (r.code !== 0) console.log(r.out);
    ok(r.code === 0 && st.log.length > 0 && sinSecreto(r.out), 'lee el .env (BOM, comillas, CRLF) y se conecta sin mostrar el token');
    ok(st.channels.find((c) => c.name === '🎲┃fuera-de-tema').topic !== 'Tema nuevo de prueba' && !st.messages[st.channels.find((c) => c.name === '👋┃bienvenida').id][0].embeds[0].description.includes('soporte@ejemplo.test'),
      'volvió al diseño original (tema y correo) editando, sin publicar mensajes nuevos');
    ok(st.roles.some((x) => x.name === 'Servidor 2 · Guayaquil') && st.channels.some((c) => c.name === '🏙️┃servidor-2-guayaquil') && borrados() === 0,
      'lo que ya no está en el diseño (Servidor 2) se queda: nunca borra');
  } finally {
    server.close();
    fs.rmSync(TMP, { recursive: true, force: true });
  }
  console.log(`\n${fallos ? '❌' : '✅'} ${pasos - fallos}/${pasos} comprobaciones correctas`);
  process.exitCode = fallos ? 1 : 0;
}

main().catch((e) => { console.error(e); process.exitCode = 1; });
