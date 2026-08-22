#!/usr/bin/env node
// ============================================================
// DS Anti-Cheat — CROSS-WELT Push-Erkennung + Punkte-Graphen
// Scannt viele Welten (globale IDs), findet dieselbe Main<-Feeder-Beziehung
// ueber mehrere Welten, listet Doerfer pro Welt auf und holt die Punkte-
// Historie von DS-Ultimate fuer Graphen. Nur oeffentliche Daten. Verdacht,
// kein Beweis. Ausgabe: professionelle Website unter site/ zum Melden an Inno.
// ============================================================
'use strict';
const fs = require('fs');
const path = require('path');
const { loadWorld, pushPairs } = require('./lib.js');

const BANNER = [
' ____   ___  _   _  ____ ______ _ _ _',
'| __ ) / _ \\| \\ | |/ ___|__  (_) | | | __ _',
'|  _ \\| | | |  \\| | |  _  / /| | | | |/ _` |',
'| |_) | |_| | |\\  | |_| |/ /_| | | | | (_| |',
'|____/ \\___/|_| \\_|\\____/____|_|_|_|_|\\__,_|',
'        B O N G Zilla  -  Cross-Welt Anti-Cheat'
].join('\n');
const TTY=process.stdout.isTTY;
const C=TTY?{r:'\x1b[0m',b:'\x1b[1m',red:'\x1b[91m',yel:'\x1b[93m',grn:'\x1b[92m',cyn:'\x1b[96m',gray:'\x1b[90m',gold:'\x1b[38;5;214m'}:{r:'',b:'',red:'',yel:'',grn:'',cyn:'',gray:'',gold:''};

// --- Welten bestimmen ---
const argv = process.argv.slice(2);
let WORLDS;
if(argv.some(a=>/^de\d+$/.test(a))) WORLDS = argv.filter(a=>/^de\d+$/.test(a));
else {
  const START = /^\d+$/.test(argv[0]||'') ? +argv[0] : Number(process.env.START||256);
  const STEP  = Number(process.env.STEP||2);
  const COUNT = Number(process.env.COUNT||40);
  WORLDS=[]; for(let i=0,n=START; i<COUNT && n>0; i++,n-=STEP) WORLDS.push('de'+n);
}
const CROSS_MIN = Number(process.env.CROSS_MIN || 2);
const GRAPH_CASES = Number(process.env.GRAPH_CASES || 40); // so viele Top-Faelle mit Graphen
const OUT = path.join(__dirname,'site');
const sleep = ms => new Promise(r=>setTimeout(r,ms));
function esc(s){ return String(s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c])); }

// --- DS-Ultimate: Welt-ID + Punkte-Historie ---
const widCache={}, histCache={};
function parseNum(s){ s=String(s).replace(/<[^>]*>/g,'').replace(/[^0-9.,KMkm]/g,'').trim(); const m=s.match(/([0-9]+(?:[.,][0-9]+)?)\s*([KMkm]?)/); if(!m)return null; let v=parseFloat(m[1].replace(',','.')); if(/k/i.test(m[2]))v*=1e3; if(/m/i.test(m[2]))v*=1e6; return Math.round(v); }
async function duWorldId(world, samplePid){
  if(world in widCache) return widCache[world];
  const n=world.replace(/^de/,''); let id=null;
  try{ const h=await (await fetch(`https://ds-ultimate.de/de/${n}/player/${samplePid}`)).text(); const m=h.match(/\/api\/(\d+)\/player/); if(m)id=m[1]; }catch(e){}
  await sleep(120); return widCache[world]=id;
}
async function duHistory(wid, pid){
  if(!wid) return [];
  const key=wid+'/'+pid; if(histCache[key]) return histCache[key];
  let s=[];
  try{ const t=await (await fetch(`https://ds-ultimate.de/api/${wid}/player/${pid}/history`)).text(); const j=JSON.parse(t); s=(j.data||[]).map(r=>({date:r.created_at,points:parseNum(r.points)})).filter(x=>x.points!=null); }catch(e){}
  await sleep(120); return histCache[key]=s;
}
function svgLine(series,w=200,h=44){
  if(series.length<2) return '<span style="color:#6a5f45;font-size:11px">keine Historie</span>';
  const ys=series.map(p=>p.points), mn=Math.min(...ys), mx=Math.max(...ys), rng=(mx-mn)||1;
  const pts=series.map((p,i)=>{ const x=(i/(series.length-1))*(w-6)+3; const y=h-3-((p.points-mn)/rng)*(h-8); return x.toFixed(1)+','+y.toFixed(1); }).join(' ');
  const growth=ys[ys.length-1]-ys[0];
  const col=growth>0?'#5cb85c':'#c9a84c';
  return `<svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" style="vertical-align:middle"><polyline fill="none" stroke="${col}" stroke-width="1.6" points="${pts}"/></svg>`+
    `<span style="font-size:11px;color:#9b8c6a"> ${(mn/1000).toFixed(0)}K&rarr;${(mx/1000).toFixed(0)}K</span>`;
}
function asciiSpark(series){ if(series.length<2)return'(keine Historie)'; const b='▁▂▃▄▅▆▇█', ys=series.map(p=>p.points), mn=Math.min(...ys), mx=Math.max(...ys), r=(mx-mn)||1; return ys.map(v=>b[Math.min(7,Math.floor((v-mn)/r*7.999))]).join(''); }

(async function main(){
  console.log('\n'+C.gold+C.b+BANNER+C.r+'\n');
  console.log(`Scanne ${C.b}${WORLDS.length}${C.r} Welten (2er-Schritt): ${WORLDS[0]} ... ${WORLDS[WORLDS.length-1]}\n`);

  const names={}, points={}, rel={}, scanned=[], sampleP={};
  for(const w of WORLDS){
    process.stdout.write(`  ${w} ... `);
    let data; try{ data=await loadWorld(w); }catch(e){ console.log(C.gray+'nicht erreichbar'+C.r); continue; }
    scanned.push(w);
    for(const id in data.players){ names[id]=data.players[id].name; const p=data.players[id].points; if(!points[id]||p>points[id])points[id]=p; if(!sampleP[w])sampleP[w]=id; }
    pushPairs(data).forEach(p=>{
      const k=p.mainId+'<'+p.feederId;
      const e=rel[k] ||= {main:p.mainId,feeder:p.feederId,worlds:new Set(),villages:0,mule:true,deleted:0,perWorld:[]};
      e.worlds.add(w); e.villages+=p.count; if(!p.mule)e.mule=false; if(p.deleted)e.deleted++;
      e.perWorld.push({world:w,villages:p.count,oda:p.odaB,deleted:p.deleted});
    });
    console.log(C.grn+'ok'+C.r);
  }

  const cases=Object.values(rel).filter(e=>e.worlds.size>=CROSS_MIN)
    .map(e=>({...e,worldsList:[...e.worlds].sort(),nWorlds:e.worlds.size}))
    .sort((a,b)=>b.nWorlds-a.nWorlds||b.villages-a.villages);

  const byMain={}; cases.forEach(c=>{(byMain[c.main] ||= []).push(c);});
  const mains=Object.keys(byMain).map(m=>{const l=byMain[m];const aw=new Set();l.forEach(c=>c.worldsList.forEach(w=>aw.add(w)));return{main:m,feeders:l.length,worlds:[...aw].sort(),villages:l.reduce((t,c)=>t+c.villages,0)};}).sort((a,b)=>b.feeders-a.feeders||b.villages-a.villages);

  const nm=id=>(names[id]||'[geloescht]')+` (#${id})`;
  const nmS=id=>names[id]||('#'+id);

  // --- Graphen fuer Top-Faelle holen (DS-Ultimate) ---
  console.log(`\n${C.cyn}Hole Punkte-Historie fuer Top ${Math.min(GRAPH_CASES,cases.length)} Faelle ...${C.r}`);
  const graphs={}; // "world|pid" -> series
  for(const c of cases.slice(0,GRAPH_CASES)){
    for(const w of c.worldsList){
      const wid=await duWorldId(w, sampleP[w]||c.main);
      for(const pid of [c.main,c.feeder]){
        const key=w+'|'+pid; if(graphs[key]!==undefined) continue;
        graphs[key]=await duHistory(wid,pid);
      }
    }
  }

  // --- Website ---
  fs.mkdirSync(OUT,{recursive:true});
  const gen=new Date().toISOString();
  fs.writeFileSync(path.join(OUT,'data.json'), JSON.stringify({generated:gen,worldsScanned:scanned,cases:cases.slice(0,500).map(c=>({main:nm(c.main),feeder:nm(c.feeder),worlds:c.worldsList,villages:c.villages,perWorld:c.perWorld,feederKampfInaktiv:c.mule})),mains:mains.slice(0,300).map(m=>({main:nm(m.main),crossWorldFeeders:m.feeders,worlds:m.worlds,villages:m.villages}))},null,2));

  const css=`*{box-sizing:border-box}body{font:15px/1.6 -apple-system,Segoe UI,Roboto,sans-serif;margin:0;background:#12100c;color:#e9e2d0}
  header{background:linear-gradient(180deg,#1c1710,#12100c);border-bottom:2px solid #9b7a1a;padding:28px 20px;text-align:center}
  header h1{margin:0 0 6px;color:#c9a84c;font-size:26px}header p{margin:2px 0;color:#9b8c6a;font-size:14px}
  .wrap{max-width:1150px;margin:0 auto;padding:20px}
  .disc{background:#2a1c0c;border:1px solid #7a5010;border-radius:8px;padding:12px 16px;margin:18px 0;color:#e8c86a;font-size:14px}
  .stats{display:flex;gap:14px;flex-wrap:wrap;margin:18px 0}.stat{background:#1c1710;border:1px solid #3a2f18;border-radius:10px;padding:14px 20px;flex:1;min-width:150px}
  .stat b{display:block;font-size:28px;color:#c9a84c}.stat span{color:#9b8c6a;font-size:13px}
  h2{color:#c9a84c;border-bottom:1px solid #3a2f18;padding-bottom:6px;margin-top:34px}
  .filter input{background:#12100c;border:1px solid #3a2f18;color:#e9e2d0;padding:8px 12px;border-radius:6px;width:300px;font-size:14px;margin:8px 0}
  .case{background:#181309;border:1px solid #3a2f18;border-radius:10px;padding:14px 16px;margin:14px 0}
  .case h3{margin:0 0 4px;font-size:16px}.case .meta{color:#9b8c6a;font-size:13px;margin-bottom:10px}
  .badge{background:#7a1010;color:#fff;border-radius:4px;padding:1px 8px;font-size:11px;font-weight:bold}
  .nworld{display:inline-block;background:#c9a84c;color:#1a1409;border-radius:5px;padding:2px 9px;font-weight:bold;font-size:13px;margin-right:8px}
  table{border-collapse:collapse;width:100%;font-size:13px;margin:6px 0}th,td{border:1px solid #2f2717;padding:6px 9px;text-align:left}th{background:#221b10;color:#c9a84c}
  .gr{display:flex;gap:24px;flex-wrap:wrap;margin-top:10px}.grbox{background:#12100c;border:1px solid #2f2717;border-radius:8px;padding:8px 12px}
  .grbox b{color:#c9a84c;font-size:13px}
  a{color:#c9a84c}.mono{font-family:monospace}footer{text-align:center;color:#6a5f45;padding:30px;font-size:12px}`;

  const caseCards = cases.slice(0,GRAPH_CASES).map(c=>{
    const rows=c.perWorld.slice().sort((a,b)=>a.world.localeCompare(b.world)).map(pw=>`<tr><td class="mono">${esc(pw.world)}</td><td style="text-align:center"><b>${pw.villages}</b></td><td style="text-align:center">${pw.oda.toLocaleString('de-DE')}</td><td>${pw.deleted?'<span class="badge">geloescht</span>':''}</td></tr>`).join('');
    const graphBoxes=c.worldsList.map(w=>{
      const mG=graphs[w+'|'+c.main]||[], fG=graphs[w+'|'+c.feeder]||[];
      return `<div class="grbox"><b>${esc(w)}</b><br><span style="color:#9b8c6a;font-size:12px">Main:</span><br>${svgLine(mG)}<br><span style="color:#9b8c6a;font-size:12px">Feeder:</span><br>${svgLine(fG)}</div>`;
    }).join('');
    return `<div class="case" data-s="${esc((nmS(c.main)+' '+nmS(c.feeder)).toLowerCase())}">`+
      `<h3><span class="nworld">${c.nWorlds} Welten</span>${esc(nmS(c.feeder))} <span style="color:#9b8c6a">adelt</span> ${esc(nmS(c.main))}</h3>`+
      `<div class="meta">${c.villages} Doerfer gesamt &middot; Feeder ${c.mule?'<span class="badge">kampf-inaktiv</span>':'<span style="color:#888">kriegsaehnlich</span>'} &middot; #${esc(c.feeder)} &rarr; #${esc(c.main)}</div>`+
      `<table><thead><tr><th>Welt</th><th>Doerfer geadelt</th><th>Feeder-ODA</th><th></th></tr></thead><tbody>${rows}</tbody></table>`+
      `<div class="gr">${graphBoxes}</div></div>`;
  }).join('');

  const restRows = cases.slice(GRAPH_CASES).map(c=>`<tr data-s="${esc((nmS(c.main)+' '+nmS(c.feeder)).toLowerCase())}"><td><b>${c.nWorlds}</b></td><td>${esc(nm(c.main))}</td><td>${esc(nm(c.feeder))}</td><td>${c.worldsList.map(w=>`<span class="mono">${esc(w)}</span>`).join(', ')}</td><td style="text-align:center">${c.villages}</td></tr>`).join('');

  const mainRows=mains.slice(0,200).map(m=>`<tr data-s="${esc(nmS(m.main).toLowerCase())}"><td style="text-align:center"><b>${m.feeders}</b></td><td>${esc(nm(m.main))}</td><td class="mono">${m.worlds.join(', ')}</td><td style="text-align:center">${m.villages}</td></tr>`).join('');

  const html=`<!doctype html><html lang="de"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>DS Cross-Welt Push-Erkennung</title><style>${css}</style></head><body>
  <header><h1>&#9876; DS Cross-Welt Push-Erkennung</h1><p>Verdachtsfaelle fuer InnoGames &middot; ${esc(gen)}</p><p>Welten: ${scanned.map(esc).join(', ')||'-'}</p></header>
  <div class="wrap">
  <div class="disc"><b>&#9888; Verdacht, kein Beweis.</b> Basiert nur auf <b>oeffentlichen</b> Daten (<span class="mono">map/*.txt</span> + DS-Ultimate-Historie). Endgueltige Feststellung (IP/Geraet/Zahlung) nur durch InnoGames. <a href="methodik.html">Methodik &rarr;</a></div>
  <div class="stats"><div class="stat"><b>${cases.length}</b><span>Cross-Welt-Faelle</span></div><div class="stat"><b>${mains.length}</b><span>betroffene Mains</span></div><div class="stat"><b>${scanned.length}</b><span>Welten gescannt</span></div></div>
  <div class="filter"><input id="q" placeholder="Nach Spielername filtern ..." oninput="filt()"></div>
  <h2>Systematisch gepushte Mains</h2>
  <table id="tm"><thead><tr><th>Cross-Welt-Feeder</th><th>Main</th><th>Welten</th><th>Doerfer</th></tr></thead><tbody>${mainRows||'<tr><td colspan=4>keine</td></tr>'}</tbody></table>
  <h2>Cross-Welt-Faelle (mit Punkte-Graphen)</h2>
  <p style="color:#9b8c6a;font-size:13px">Dieselbe Feeder&rarr;Main-Beziehung ueber mehrere Welten. Pro Welt: geadelte Doerfer + Punkte-Kurve von Main und Feeder.</p>
  <div id="cc">${caseCards||'<p>keine Faelle</p>'}</div>
  ${restRows?`<h2>Weitere Faelle</h2><table id="tr"><thead><tr><th>Welten</th><th>Main</th><th>Feeder</th><th>in Welten</th><th>Doerfer</th></tr></thead><tbody>${restRows}</tbody></table>`:''}
  </div>
  <footer>DS Anti-Cheat &middot; nur oeffentliche Daten &middot; Verdacht kein Beweis &middot; nicht oeffentlich posten</footer>
  <script>function filt(){var q=document.getElementById('q').value.toLowerCase();['#tm tr','#tr tr','.case'].forEach(function(sel){document.querySelectorAll(sel).forEach(function(el){var s=el.getAttribute('data-s');if(s===null)return;el.style.display=(!q||s.indexOf(q)>=0)?'':'none';});});}</script>
  </body></html>`;
  fs.writeFileSync(path.join(OUT,'index.html'), html);

  const meth=`<!doctype html><html lang="de"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Methodik</title><style>${css}</style></head><body><header><h1>Methodik &amp; Grenzen</h1></header><div class="wrap">
  <h2>Datenquellen (oeffentlich)</h2><ul><li><span class="mono">map/player.txt, conquer.txt, kill_att.txt</span> — offizielle Welt-Exporte</li><li>DS-Ultimate <span class="mono">/api/{weltId}/player/{id}/history</span> — oeffentliche Punkte-Historie fuer die Graphen</li></ul>
  <p>Spieler-IDs sind <b>welt-uebergreifend gleich</b> (globale Accounts) — dadurch ist derselbe Account ueber Welten eindeutig zuordenbar.</p>
  <h2>Fall-Logik</h2><ol><li>Pro Welt: Feeder adelt <b>&ge;3 Doerfer einseitig</b> an <b>einen</b> Main (&ge;75%, keine Gegen-Adelung).</li><li><b>Krieg vs. Push:</b> kampf-inaktiver Feeder (niedrige ODA) &rarr; Push/Proxy.</li><li><b>Cross-Welt:</b> dieselbe Beziehung in mehreren Welten &rarr; praktisch kein Zufall.</li></ol>
  <h2>Grenzen</h2><ul><li><b>Verdacht, kein Beweis.</b> Einzelfaelle koennen Krieg/Uebergabe sein.</li><li>IP/Geraet/Zahlung kann nur InnoGames pruefen.</li></ul>
  <p><a href="index.html">&larr; zurueck</a></p></div></body></html>`;
  fs.writeFileSync(path.join(OUT,'methodik.html'), meth);

  console.log(`\n${C.b}${C.gold}=== Cross-Welt-Ergebnis ===${C.r}`);
  console.log(`Faelle (>=${CROSS_MIN} Welten): ${C.red}${C.b}${cases.length}${C.r} · Mains: ${C.yel}${mains.length}${C.r}`);
  console.log(`\n${C.b}Top 10 (mit Punkte-Kurve des Mains):${C.r}`);
  cases.slice(0,10).forEach(c=>{
    const col=c.nWorlds>=4?C.red:c.nWorlds>=3?C.yel:C.gray;
    const g=graphs[c.worldsList[c.worldsList.length-1]+'|'+c.main]||[];
    console.log(`  ${col}${C.b}${c.nWorlds}W${C.r} ${C.b}${nmS(c.feeder)}${C.r}${C.gray}--${c.villages}-->${C.r}${C.b}${nmS(c.main)}${C.r} ${C.gray}[${c.worldsList.join(',')}]${C.r}`);
    console.log(`       ${C.grn}${asciiSpark(g)}${C.r} ${C.gray}${nmS(c.main)}${C.r}`);
  });
  console.log(`\n${C.cyn}Website:${C.r} ${path.join(OUT,'index.html')}`);
})().catch(e=>{ console.error('Fehler:', e.message); process.exit(1); });
