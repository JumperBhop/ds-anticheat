#!/usr/bin/env node
// ============================================================
// DS Anti-Cheat — Push-/Proxy-Erkennung aus OEFFENTLICHEN Weltdaten
// Nutzt nur die offiziellen Datei-Exporte (map/*.txt). Keine Server-Interna,
// keine privaten Daten. Zweck: verdaechtige Feeder-/Multiaccount-Muster
// markieren, damit sie an InnoGames gemeldet werden koennen.
//
// Kernidee: Ein "Mule"/Proxy adelt seine Doerfer einseitig an EINEN Main,
// ist dabei aber kampf-inaktiv (niedrige ODA). Ein normales Kriegsopfer
// verliert zwar auch einseitig Doerfer, hat aber hohe ODA (hat gekaempft).
// Genau daran unterscheiden wir Push von Krieg.
// ============================================================
'use strict';
const fs = require('fs');
const path = require('path');

const WORLD = process.argv[2] || 'de256';
const BASE = `https://${WORLD}.die-staemme.de/map`;
const OUT = path.join(__dirname, 'reports');

// --- Schwellen (konservativ; per ENV anpassbar) ---
const MIN_FLOW  = Number(process.env.MIN_FLOW  || 3);     // min. einseitig geadelte Doerfer
const MAX_REV   = Number(process.env.MAX_REV   || 0);     // erlaubte Gegen-Adelungen
const CONC      = Number(process.env.CONC      || 0.75);  // Anteil der Verluste an EINEN Main
const ODA_MULE  = Number(process.env.ODA_MULE  || 20000); // darunter gilt Feeder als kampf-inaktiv
const DAYS      = Number(process.env.DAYS || 0);          // 0 = alle, sonst nur letzte N Tage

function dec(s){ try { return decodeURIComponent(s.replace(/\+/g,' ')); } catch(e){ return s; } }
async function get(file){ const r = await fetch(`${BASE}/${file}`); if(!r.ok) throw new Error(`${file}: HTTP ${r.status}`); return await r.text(); }
function esc(s){ return String(s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c])); }

function parsePlayers(txt){ const m={}; txt.split('\n').forEach(l=>{ if(!l.trim())return; const [id,name,ally,v,p,r]=l.split(','); m[id]={id,name:dec(name||''),ally,villages:+v||0,points:+p||0,rank:+r||0}; }); return m; }
function parseConquers(txt){ const o=[]; txt.split('\n').forEach(l=>{ if(!l.trim())return; const [village,ts,nw,old]=l.split(','); o.push({village,ts:+ts||0,nw,old}); }); return o; }
function parseKills(txt){ const m={}; txt.split('\n').forEach(l=>{ if(!l.trim())return; const [,id,k]=l.split(','); if(id)m[id]=+k||0; }); return m; }

function unionFind(){ const p={}; function find(x){ if(p[x]===undefined)p[x]=x; while(p[x]!==x){p[x]=p[p[x]];x=p[x];} return x; } function join(a,b){ p[find(a)]=find(b); } return {find,join}; }

(async function main(){
  console.log(`[DS Anti-Cheat] Welt ${WORLD} — lade oeffentliche Daten ...`);
  const [pTxt,cTxt,aTxt] = await Promise.all([get('player.txt'), get('conquer.txt'), get('kill_att.txt')]);
  const players = parsePlayers(pTxt);
  const oda = parseKills(aTxt);
  let conquers = parseConquers(cTxt);
  console.log(`  ${Object.keys(players).length} Spieler, ${conquers.length} Adelungen, ODA fuer ${Object.keys(oda).length} Spieler`);

  if(DAYS>0){ const cut=Math.floor(Date.now()/1000)-DAYS*86400; conquers=conquers.filter(c=>c.ts>=cut); console.log(`  gefiltert auf letzte ${DAYS} Tage: ${conquers.length} Adelungen`); }

  const real = conquers.filter(c=>c.old && c.old!=='0' && c.nw && c.nw!=='0' && c.nw!==c.old);

  // gained[A][B] = wie oft A ein Dorf von B genommen hat
  const gained = {};
  real.forEach(c=>{ (gained[c.nw] ||= {})[c.old] = (gained[c.nw][c.old]||0)+1; });

  // Pro Feeder B: gesamte Verluste, Haupt-Beguenstigter, Konzentration
  const lostBy = {}; // B -> {A:count}
  for(const A in gained) for(const B in gained[A]){ (lostBy[B] ||= {})[A] = gained[A][B]; }

  const pairs = [];
  for(const B in lostBy){
    const map = lostBy[B];
    let topA=null, topC=0, total=0;
    for(const A in map){ total+=map[A]; if(map[A]>topC){topC=map[A]; topA=A;} }
    if(topC < MIN_FLOW) continue;
    const reverse = (gained[B] && gained[B][topA]) || 0;
    if(reverse > MAX_REV) continue;
    const conc = topC/total;
    if(conc < CONC) continue;
    const odaB = oda[B]||0;
    const mule = odaB < ODA_MULE;                 // kampf-inaktiv => Push-Verdacht
    // Score: einseitige Doerfer * Konzentration, verdoppelt wenn Feeder kaum kaempft
    const score = Math.round(topC * conc * (mule?2:1) * 10)/10;
    pairs.push({ beneficiary:topA, feeder:B, count:topC, total, conc, reverse, odaB, mule, score });
  }
  pairs.sort((x,y)=>y.score-x.score);

  // Cluster nur aus den (nach Filter) verdaechtigen Paaren
  const uf = unionFind();
  pairs.forEach(p=>uf.join(p.beneficiary,p.feeder));
  const clusters={};
  pairs.forEach(p=>[p.beneficiary,p.feeder].forEach(id=>{ const r=uf.find(id); (clusters[r] ||= new Set()).add(id); }));

  const nm = id => (players[id]?players[id].name:'??')+` (#${id})`;
  const pts = id => players[id]?players[id].points:0;

  fs.mkdirSync(OUT,{recursive:true});
  const stamp = new Date().toISOString().slice(0,10);
  const report = {
    world:WORLD, generated:new Date().toISOString(),
    method:'Einseitige, konzentrierte Adelungen an EINEN Main + Feeder kampf-inaktiv (niedrige ODA). Trennt Push/Multiacc von normalem Krieg.',
    thresholds:{MIN_FLOW,MAX_REV,CONC,ODA_MULE,DAYS},
    suspiciousPairs: pairs.slice(0,300).map(p=>({
      beneficiary:nm(p.beneficiary), beneficiaryPoints:pts(p.beneficiary),
      feeder:nm(p.feeder), feederPoints:pts(p.feeder),
      villagesFed:p.count, concentration:Math.round(p.conc*100)+'%',
      feederODA:p.odaB, feederKampfInaktiv:p.mule, score:p.score
    })),
    clusters: Object.values(clusters).filter(s=>s.size>=2).map(s=>{ const ids=[...s].sort((a,b)=>pts(b)-pts(a)); return {size:ids.length,totalPoints:ids.reduce((t,i)=>t+pts(i),0),members:ids.map(nm)}; }).sort((a,b)=>b.size-a.size)
  };
  fs.writeFileSync(path.join(OUT,`report-${WORLD}-${stamp}.json`), JSON.stringify(report,null,2));

  const rows = report.suspiciousPairs.map(p=>{
    const flag = p.feederKampfInaktiv ? '<span style="color:#a00;font-weight:bold">Mule-Verdacht</span>' : '<span style="color:#888">kriegsaehnlich</span>';
    return `<tr><td>${p.score}</td><td>${esc(p.beneficiary)}</td><td>${p.beneficiaryPoints.toLocaleString('de-DE')}</td>`+
      `<td>${esc(p.feeder)}</td><td>${p.feederPoints.toLocaleString('de-DE')}</td>`+
      `<td style="text-align:center">${p.villagesFed}</td><td style="text-align:center">${p.concentration}</td>`+
      `<td style="text-align:center">${p.feederODA.toLocaleString('de-DE')}</td><td>${flag}</td></tr>`;
  }).join('');
  const cl = report.clusters.map(c=>`<li><b>${c.size} Accounts</b> (${c.totalPoints.toLocaleString('de-DE')} Pkt): ${c.members.map(esc).join(' · ')}</li>`).join('');
  const html = `<!doctype html><meta charset="utf-8"><title>DS Anti-Cheat ${WORLD}</title>`+
    `<style>body{font:14px/1.5 sans-serif;max-width:1100px;margin:24px auto;padding:0 12px}table{border-collapse:collapse;width:100%}td,th{border:1px solid #ccc;padding:5px 8px;font-size:13px}th{background:#eee;text-align:left}h1,h2{color:#7a1010}code{background:#eee;padding:1px 4px}</style>`+
    `<h1>DS Anti-Cheat — ${WORLD}</h1>`+
    `<p>Erstellt: ${report.generated}</p>`+
    `<p><b>Methode:</b> ${esc(report.method)} Schwellen: ${MIN_FLOW}+ Doerfer, Konzentration ≥${Math.round(CONC*100)}%, Gegenrichtung ≤${MAX_REV}, „kampf-inaktiv" = ODA &lt; ${ODA_MULE.toLocaleString('de-DE')}.</p>`+
    `<p><b>Wichtig:</b> Das sind <i>Verdachtsmuster</i> zur Pruefung/Meldung, kein Beweis. „Mule-Verdacht" = Feeder gibt einseitig an einen Main ab UND kaempft kaum — typisch fuer Push/Proxy. „kriegsaehnlich" = koennte normaler Krieg sein.</p>`+
    `<h2>Verdaechtige Cluster (${report.clusters.length})</h2><ul>${cl||'<li>keine</li>'}</ul>`+
    `<h2>Verdaechtige Feeder-Paare (Top ${report.suspiciousPairs.length})</h2>`+
    `<table><tr><th>Score</th><th>Beguenstigter</th><th>Pkt</th><th>Feeder</th><th>Pkt</th><th>Doerfer</th><th>Konz.</th><th>Feeder-ODA</th><th>Bewertung</th></tr>${rows}</table>`;
  fs.writeFileSync(path.join(OUT,`report-${WORLD}-${stamp}.html`), html);

  fs.mkdirSync(path.join(OUT,'snapshots'),{recursive:true});
  fs.writeFileSync(path.join(OUT,'snapshots',`player-${WORLD}-${stamp}.txt`), pTxt);

  const mules = pairs.filter(p=>p.mule);
  console.log(`\n=== Ergebnis ===`);
  console.log(`Verdaechtige Paare gesamt: ${pairs.length}  (davon Mule-Verdacht: ${mules.length}, kriegsaehnlich: ${pairs.length-mules.length})`);
  console.log(`Cluster (>=2): ${report.clusters.length}`);
  console.log(`\nTop 10 Mule-Verdacht (Feeder kaempft kaum, adelt einseitig einen Main):`);
  mules.slice(0,10).forEach(p=>console.log(`  ${nm(p.feeder)} ODA=${p.odaB}  --${p.count} Doerfer (${Math.round(p.conc*100)}%)-->  ${nm(p.beneficiary)}`));
  console.log(`\nReports: ${OUT}`);
})().catch(e=>{ console.error('Fehler:', e.message); process.exit(1); });
