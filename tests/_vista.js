'use strict';
const path=require('path'),fs=require('fs');const {chromium}=require('playwright');
const RAIZ=path.resolve(__dirname,'..');const BASE='http://envivo.test';
(async()=>{const b=await chromium.launch();
const c0=await b.newContext();const p0=await c0.newPage();await p0.setContent('<html></html>');await p0.addScriptTag({path:path.join(RAIZ,'js/datos.js')});await p0.addScriptTag({path:path.join(RAIZ,'js/logic.js')});
const save=await p0.evaluate(()=>{const s=Game.newGame(7);s.chapter=2;s.day=12;s.stats.events=14;s.money=4200;s.rep=18;return Game.serialize(s);});await c0.close();
const ctx=await b.newContext({viewport:{width:390,height:844},deviceScaleFactor:1});const page=await ctx.newPage();
await ctx.route(BASE+'/**',async r=>{const u=new URL(r.request().url());if(u.pathname==='/')return r.fulfill({status:200,contentType:'text/html',body:fs.readFileSync(path.join(RAIZ,'index.html'))});
if(u.pathname==='/api/estado')return r.fulfill({status:200,contentType:'application/json',body:JSON.stringify({ok:true,tienda:{productos:[],premium:[]},logueado:false,entregas:[],inventario:[],plux:{disponible:false,ambiente:'sandbox'}})});
if(u.pathname.startsWith('/api/'))return r.fulfill({status:404,contentType:'application/json',body:'{}'});
const f=path.join(RAIZ,u.pathname.slice(1));if(fs.existsSync(f)&&fs.statSync(f).isFile())return r.fulfill({status:200,contentType:f.endsWith('.js')?'text/javascript':'application/octet-stream',body:fs.readFileSync(f)});return r.fulfill({status:404,body:''});});
await page.addInitScript(s=>{localStorage.setItem('envivo_lang','es');localStorage.setItem('envivo_tycoon_save_v1',s);localStorage.setItem('envivo_aviso_cuenta','3');localStorage.setItem('envivo_guia_v1','"1"');},save);
await page.goto(BASE+'/?fecha=2026-12-20');await page.waitForTimeout(2500);
for(let i=0;i<5;i++){const x=await page.$('#overlay.on [data-act="close-story"], #overlay.on [data-act="close"], #overlay.on .btn.main');if(!x)break;await x.click();await page.waitForTimeout(300);}
console.log(JSON.stringify(await page.evaluate(()=>(window.EnVivoInicio||[]).map(m=>{let h='';try{h=m.tarjeta({S:()=>null})||''}catch(e){h='ERR'};return {id:m.id,orden:m.orden}}))));
console.log(await page.evaluate(()=>[...document.querySelectorAll('#tab-inicio > *')].map(e=>e.className+' | '+(e.querySelector('h2,h3,.story-tag,b')||{textContent:''}).textContent.trim().slice(0,40)).join('\n')));
await page.screenshot({path:process.argv[2],fullPage:true});
console.log(await page.evaluate(()=>document.documentElement.scrollHeight));await b.close();})();
