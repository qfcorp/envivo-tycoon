/* Ayuda para las pruebas con navegador: en Inicio las tarjetas de los módulos viven en los lugares de la sede
   (js/hub.js), ya no en filas plegables.
     abrirLugar(page, k)        → toca el lugar k ('misiones', 'sala', 'sede', 'mas'...) y deja su hoja abierta
     verEnInicio(page, sel, ms) → busca qué lugar tiene `sel`, lo abre y espera a verlo (true / false)
   Uso:  const { verEnInicio, abrirLugar } = require('./hub_ayuda'); */
'use strict';

async function irAInicio(page) {
  const en = await page.evaluate(() => { const s = document.querySelector('#tab-inicio.on'); return !!s; });
  if (!en) { await page.evaluate(() => { const b = document.querySelector('nav button[data-tab="inicio"]'); if (b) b.click(); }); await page.waitForTimeout(120); }
}

async function abrirLugar(page, k) {
  await irAInicio(page);
  await page.evaluate((lugar) => {
    if (window.Hub && window.Hub.abierta && window.Hub.abierta() === lugar && document.getElementById('hubSheet')) return;
    if (window.Hub) window.Hub.cerrar();
    const b = document.querySelector(lugar === 'mas' ? '.hub-mas' : `.hs[data-hub="${lugar}"]`);
    if (b) b.click();
  }, k);
  await page.waitForTimeout(100);
}

async function verEnInicio(page, sel, ms) {
  const fin = Date.now() + (ms || 6000);
  await irAInicio(page);
  for (;;) {
    const ya = await page.evaluate((q) => { const h = document.getElementById('hubSheet'); return !!(h && h.querySelector(q)) || !!document.querySelector('#tab-inicio > ' + q); }, sel).catch(() => false);
    if (ya) return true;
    const k = await page.evaluate((q) => (window.Hub && window.Hub.buscar ? window.Hub.buscar(q) : null), sel).catch(() => null);
    if (k && Date.now() <= fin) { await abrirLugar(page, k); await page.waitForTimeout(60); continue; }
    if (Date.now() > fin) return false;
    await page.waitForTimeout(150);
  }
}

module.exports = { abrirLugar, verEnInicio, irAInicio };
