#!/usr/bin/env node
// ============================================================
// DS Anti-Cheat — CROSS-WELT Push-Erkennung
// Findet dieselbe Main<-Feeder-Beziehung ueber MEHRERE Welten (globale IDs).
// Wiederholung ueber Welten ist praktisch nie Zufall -> starkes Push-Signal.
// Erzeugt eine professionelle Beweis-Website (site/) fuer die Meldung an InnoGames.
// Nur oeffentliche map/*.txt-Daten. Verdacht, kein Beweis.
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

// Welten: aus argv, sonst Standardbereich
let WORLDS = process.argv.slice(2).filter(a=>/^\w+\d+$/.test(a));
if(!WORLDS.length){ WORLDS=[]; for(let i=245;i<=259;i++) WORLDS.push('de'+i); }
const CROSS_MIN = Number(process.env.CROSS_MIN || 2); // ab so vielen Welten gilt es als Fall
const OUT = path.join(__dirname,'site');
function esc(s){ return String(s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c])); }

(async function main(){
  console.log('\n'+C.gold+C.b+BANNER+C.r+'\n');
  console.log(`Scanne ${C.b}${WORLDS.length}${C.r} Welten: ${WORLDS.join(', ')}\n`);

  const names={};              // globale id -> name (aus irgendeiner Welt)
  const points={};             // id -> hoechste bekannte Punktzahl
  const rel={};                // "main<feeder" -> {main,feeder,worlds:Set,villages,mule:bool,deleted:int,perWorld:[]}
  const scanned=[];

  for(const w of WORLDS){
    process.stdout.write(`  ${w} ... `);
    let data;
    try { data = await loadWorld(w); }
    catch(e){ console.log(C.gray+'nicht erreichbar'+C.r); continue; }
    scanned.push(w);
    for(const id in data.players){ names[id]=data.players[id].name; const p=data.players[id].points; if(!points[id]||p>points[id])points[id]=p; }
    const pairs = pushPairs(data);
    pairs.forEach(p=>{
      const k=p.mainId+'<'+p.feederId;
      const e = rel[k] ||= { main:p.mainId, feeder:p.feederId, worlds:new Set(), villages:0, mule:true, deleted:0, perWorld:[] };
      e.worlds.add(w); e.villages+=p.count; if(!p.mule)e.mule=false; if(p.deleted)e.deleted++;
      e.perWorld.push({ world:w, villages:p.count, oda:p.odaB, conc:Math.round(p.conc*100), deleted:p.deleted });
    });
    console.log(C.grn+`ok`+C.r+C.gray+` (${pairs.length} Push-Paare)`+C.r);
  }

  // Cross-Welt-Faelle: Beziehung in >= CROSS_MIN Welten
  const cases = Object.values(rel).filter(e=>e.worlds.size>=CROSS_MIN)
    .map(e=>({ ...e, worldsList:[...e.worlds].sort(), nWorlds:e.worlds.size,
               score: e.worlds.size*100 + e.villages + (e.mule?50:0) }))
    .sort((a,b)=> b.nWorlds-a.nWorlds || b.villages-a.villages);

  // Pro Main: wie viele verschiedene Cross-Welt-Feeder
  const byMain={};
  cases.forEach(c=>{ (byMain[c.main] ||= []).push(c); });
  const mains = Object.keys(byMain).map(m=>{
    const list=byMain[m]; const allW=new Set(); list.forEach(c=>c.worldsList.forEach(w=>allW.add(w)));
    return { main:m, feeders:list.length, worlds:[...allW].sort(), villages:list.reduce((t,c)=>t+c.villages,0),
             score:list.length*100 + allW.size*20 };
  }).sort((a,b)=> b.feeders-a.feeders || b.villages-a.villages);

  const nm=id=>(names[id]||'[geloescht]')+` (#${id})`;
  const nmShort=id=>names[id]||('#'+id);

  // --- Website erzeugen ---
  fs.mkdirSync(OUT,{recursive:true});
  const gen=new Date().toISOString();
  const data = { generated:gen, worldsScanned:scanned, crossMin:CROSS_MIN,
    cases:cases.slice(0,500).map(c=>({main:nm(c.main),feeder:nm(c.feeder),worlds:c.worldsList,nWorlds:c.nWorlds,villages:c.villages,feederKampfInaktiv:c.mule,feederDeletedInWorlds:c.deleted,score:c.score,perWorld:c.perWorld})),
    mains: mains.slice(0,200).map(m=>({main:nm(m.main),crossWorldFeeders:m.feeders,worlds:m.worlds,villages:m.villages})) };
  fs.writeFileSync(path.join(OUT,'data.json'), JSON.stringify(data,null,2));

  const css=`*{box-sizing:border-box}body{font:15px/1.6 -apple-system,Segoe UI,Roboto,sans-serif;margin:0;background:#12100c;color:#e9e2d0}
  header{background:linear-gradient(180deg,#1c1710,#12100c);border-bottom:2px solid #9b7a1a;padding:28px 20px;text-align:center}
  header h1{margin:0 0 6px;color:#c9a84c;font-size:26px;letter-spacing:1px}
  header p{margin:2px 0;color:#9b8c6a;font-size:14px}
  .wrap{max-width:1200px;margin:0 auto;padding:20px}
  .disc{background:#2a1c0c;border:1px solid #7a5010;border-radius:8px;padding:12px 16px;margin:18px 0;color:#e8c86a;font-size:14px}
  .stats{display:flex;gap:14px;flex-wrap:wrap;margin:18px 0}
  .stat{background:#1c1710;border:1px solid #3a2f18;border-radius:10px;padding:14px 20px;flex:1;min-width:150px}
  .stat b{display:block;font-size:28px;color:#c9a84c}.stat span{color:#9b8c6a;font-size:13px}
  h2{color:#c9a84c;border-bottom:1px solid #3a2f18;padding-bottom:6px;margin-top:34px}
  table{border-collapse:collapse;width:100%;font-size:13px;margin:12px 0}
  th,td{border:1px solid #2f2717;padding:7px 10px;text-align:left}th{background:#221b10;color:#c9a84c;position:sticky;top:0}
  tr:nth-child(even){background:#18140d}
  .wc{display:inline-block;background:#3d2606;color:#e8c86a;border:1px solid #8b6914;border-radius:4px;padding:1px 6px;font-size:11px;margin:1px}
  .hot{color:#ff6b6b;font-weight:bold}.warm{color:#e8c86a}.badge{background:#7a1010;color:#fff;border-radius:4px;padding:1px 7px;font-size:11px;font-weight:bold}
  a{color:#c9a84c}.mono{font-family:monospace}
  footer{text-align:center;color:#6a5f45;padding:30px;font-size:12px}
  .filter{margin:10px 0}.filter input{background:#12100c;border:1px solid #3a2f18;color:#e9e2d0;padding:8px 12px;border-radius:6px;width:280px;font-size:14px}`;

  const caseRows = data.cases.map(c=>{
    const wc = c.worlds.map(w=>`<span class="wc">${esc(w)}</span>`).join('');
    const sev = c.nWorlds>=4?'hot':c.nWorlds>=3?'warm':'';
    const flag = c.feederKampfInaktiv?'<span class="badge">kampf-inaktiv</span>':'<span style="color:#888">kriegsaehnlich</span>';
    const del = c.feederDeletedInWorlds?` · <span class="hot">${c.feederDeletedInWorlds}× geloescht</span>`:'';
    return `<tr data-s="${esc((c.main+' '+c.feeder).toLowerCase())}"><td class="${sev}"><b>${c.nWorlds}</b></td><td>${esc(c.main)}</td><td>${esc(c.feeder)}</td><td>${wc}</td><td style="text-align:center">${c.villages}</td><td>${flag}${del}</td></tr>`;
  }).join('');

  const mainRows = data.mains.map(m=>`<tr data-s="${esc(m.main.toLowerCase())}"><td style="text-align:center"><b>${m.crossWorldFeeders}</b></td><td>${esc(m.main)}</td><td>${m.worlds.map(w=>`<span class="wc">${esc(w)}</span>`).join('')}</td><td style="text-align:center">${m.villages}</td></tr>`).join('');

  const html=`<!doctype html><html lang="de"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>DS Cross-Welt Push-Erkennung</title><style>${css}</style></head><body>
  <header><h1>&#9876; DS Cross-Welt Push-Erkennung</h1>
  <p>Verdachtsfaelle fuer InnoGames &middot; erstellt ${esc(gen)}</p>
  <p>Welten gescannt: ${scanned.map(esc).join(', ')||'-'}</p></header>
  <div class="wrap">
  <div class="disc"><b>&#9888; Verdacht, kein Beweis.</b> Diese Auswertung basiert ausschliesslich auf <b>oeffentlichen</b> Weltdaten (offizielle <span class="mono">map/*.txt</span>-Exporte). Sie zeigt <b>auffaellige Muster zur Pruefung</b> &mdash; die endgueltige Feststellung (IP, Geraet, Zahlung) kann nur InnoGames treffen. <a href="methodik.html">Methodik &amp; Grenzen &rarr;</a></div>
  <div class="stats">
    <div class="stat"><b>${data.cases.length}</b><span>Cross-Welt-Faelle (&ge;${CROSS_MIN} Welten)</span></div>
    <div class="stat"><b>${data.mains.length}</b><span>betroffene Mains</span></div>
    <div class="stat"><b>${scanned.length}</b><span>Welten gescannt</span></div>
  </div>
  <div class="filter"><input id="q" placeholder="Nach Spielername filtern ..." oninput="filt()"></div>
  <h2>Systematisch gepushte Mains</h2>
  <table><thead><tr><th>Cross-Welt-Feeder</th><th>Main</th><th>Welten</th><th>Doerfer</th></tr></thead><tbody id="tm">${mainRows||'<tr><td colspan=4>keine</td></tr>'}</tbody></table>
  <h2>Cross-Welt Feeder&rarr;Main-Beziehungen</h2>
  <p style="color:#9b8c6a;font-size:13px">Dieselbe Beziehung ueber mehrere Welten = praktisch kein Zufall. Sortiert nach Anzahl Welten.</p>
  <table><thead><tr><th>Welten</th><th>Main (bekommt)</th><th>Feeder (gibt)</th><th>in Welten</th><th>Doerfer</th><th>Bewertung</th></tr></thead><tbody id="tc">${caseRows||'<tr><td colspan=6>keine</td></tr>'}</tbody></table>
  </div>
  <footer>DS Anti-Cheat &middot; nur oeffentliche Daten &middot; Verdacht kein Beweis</footer>
  <script>function filt(){var q=document.getElementById('q').value.toLowerCase();['tm','tc'].forEach(function(id){document.querySelectorAll('#'+id+' tr').forEach(function(tr){var s=tr.getAttribute('data-s')||'';tr.style.display=(!q||s.indexOf(q)>=0)?'':'none';});});}</script>
  </body></html>`;
  fs.writeFileSync(path.join(OUT,'index.html'), html);

  const meth=`<!doctype html><html lang="de"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Methodik</title><style>${css}</style></head><body>
  <header><h1>Methodik &amp; Grenzen</h1></header><div class="wrap">
  <h2>Datenquellen (100% oeffentlich)</h2><ul>
  <li><span class="mono">map/player.txt</span> &mdash; Spieler, Punkte, Stamm</li>
  <li><span class="mono">map/conquer.txt</span> &mdash; Adelungen: Dorf, Zeit, neuer/alter Besitzer</li>
  <li><span class="mono">map/kill_att.txt</span> &mdash; ODA (Angriffs-Aktivitaet)</li></ul>
  <p>Spieler-IDs sind <b>welt-uebergreifend gleich</b> (globale Accounts) &mdash; dadurch ist die Zuordnung derselben Person ueber Welten eindeutig.</p>
  <h2>Wie ein Fall entsteht</h2>
  <ol><li>Pro Welt: Feeder, der <b>&ge;3 Doerfer einseitig</b> an <b>einen</b> Main adelt (&ge;75% seiner Verluste), <b>ohne Gegen-Adelung</b>.</li>
  <li><b>Krieg vs. Push:</b> Ist der Feeder <b>kampf-inaktiv</b> (niedrige ODA), spricht das fuer Push/Proxy statt Krieg.</li>
  <li><b>Cross-Welt:</b> Tritt dieselbe Main&larr;Feeder-Beziehung in <b>mehreren Welten</b> auf, ist Zufall praktisch ausgeschlossen &mdash; das ist das staerkste Signal.</li></ol>
  <h2>Grenzen (ehrlich)</h2>
  <ul><li><b>Verdacht, kein Beweis.</b> Einmalige einseitige Adelungen koennen auch Krieg/Account-Uebergabe sein.</li>
  <li>Der endgueltige Nachweis (IP, Geraete-Fingerprint, Zahlung) ist <b>nur InnoGames</b> moeglich. Dieses Tool liefert die oeffentlich sichtbare Priorisierung: „wo genau hinschauen".</li>
  <li>Namen/IDs stammen aus oeffentlichen Exporten; es werden keine privaten Daten verarbeitet.</li></ul>
  <p><a href="index.html">&larr; zurueck</a></p></div></body></html>`;
  fs.writeFileSync(path.join(OUT,'methodik.html'), meth);

  console.log(`\n${C.b}${C.gold}=== Cross-Welt-Ergebnis ===${C.r}`);
  console.log(`Faelle (>=${CROSS_MIN} Welten): ${C.red}${C.b}${cases.length}${C.r} · betroffene Mains: ${C.yel}${mains.length}${C.r}`);
  console.log(`\n${C.b}Top 10 Cross-Welt-Faelle:${C.r}`);
  cases.slice(0,10).forEach(c=>{
    const col=c.nWorlds>=4?C.red:c.nWorlds>=3?C.yel:C.gray;
    console.log(`  ${col}${C.b}${c.nWorlds} Welten${C.r}  ${C.b}${nmShort(c.feeder)}${C.r} ${C.gray}--${c.villages} Doerfer-->${C.r} ${C.b}${nmShort(c.main)}${C.r} ${C.gray}[${c.worldsList.join(',')}]${C.r}`);
  });
  console.log(`\n${C.cyn}Website:${C.r} ${path.join(OUT,'index.html')}`);
})().catch(e=>{ console.error('Fehler:', e.message); process.exit(1); });
