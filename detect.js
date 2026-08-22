#!/usr/bin/env node
// ============================================================
// DS Anti-Cheat — Push-/Multiaccount-Erkennung aus OEFFENTLICHEN Weltdaten
// Nutzt nur die offiziellen map/*.txt-Exporte. Keine Server-Interna.
// Zweck: Verdachtsmuster zum Melden an InnoGames. Verdacht, kein Beweis.
// ============================================================
'use strict';
const fs = require('fs');
const path = require('path');

const BANNER = [
  ' ____   ___  _   _  ____ ______ _ _ _',
  '| __ ) / _ \\| \\ | |/ ___|__  (_) | | | __ _',
  '|  _ \\| | | |  \\| | |  _  / /| | | | |/ _` |',
  '| |_) | |_| | |\\  | |_| |/ /_| | | | | (_| |',
  '|____/ \\___/|_| \\_|\\____/____|_|_|_|_|\\__,_|',
  '           B O N G Zilla  -  Anti-Cheat'
].join('\n');

const WORLD = process.argv[2] || 'de256';
const BASE = `https://${WORLD}.die-staemme.de/map`;
const OUT = path.join(__dirname, 'reports');

// --- Farben (nur im echten Terminal) ---
const TTY = process.stdout.isTTY;
const C = TTY ? { r:'\x1b[0m',b:'\x1b[1m',red:'\x1b[91m',yel:'\x1b[93m',grn:'\x1b[92m',cyn:'\x1b[96m',gray:'\x1b[90m',gold:'\x1b[38;5;214m',mag:'\x1b[95m' }
             : { r:'',b:'',red:'',yel:'',grn:'',cyn:'',gray:'',gold:'',mag:'' };
const sev = s => s>=35?C.red : s>=20?C.yel : C.gray;

const MIN_FLOW = Number(process.env.MIN_FLOW || 3);
const MAX_REV  = Number(process.env.MAX_REV  || 0);
const CONC     = Number(process.env.CONC     || 0.75);
const ODA_MULE = Number(process.env.ODA_MULE || 20000);
const DAYS     = Number(process.env.DAYS || 0);
const BURST_WIN= 3600; // Sekunden-Fenster fuer "Adel-Burst"

function dec(s){ try { return decodeURIComponent(s.replace(/\+/g,' ')); } catch(e){ return s; } }
async function get(file){ const r=await fetch(`${BASE}/${file}`); if(!r.ok) throw new Error(`${file}: HTTP ${r.status}`); return await r.text(); }
function esc(s){ return String(s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c])); }
function parsePlayers(txt){ const m={}; txt.split('\n').forEach(l=>{ if(!l.trim())return; const [id,name,ally,v,p,r]=l.split(','); m[id]={id,name:dec(name||''),ally,villages:+v||0,points:+p||0,rank:+r||0}; }); return m; }
function parseConquers(txt){ const o=[]; txt.split('\n').forEach(l=>{ if(!l.trim())return; const [village,ts,nw,old]=l.split(','); o.push({village,ts:+ts||0,nw,old}); }); return o; }
function parseKills(txt){ const m={}; txt.split('\n').forEach(l=>{ if(!l.trim())return; const [,id,k]=l.split(','); if(id)m[id]=+k||0; }); return m; }
function unionFind(){ const p={}; function find(x){ if(p[x]===undefined)p[x]=x; while(p[x]!==x){p[x]=p[p[x]];x=p[x];} return x; } return {find,join:(a,b)=>{p[find(a)]=find(b);}}; }
function maxInWindow(sorted,win){ let best=1,j=0; for(let i=0;i<sorted.length;i++){ while(sorted[i]-sorted[j]>win)j++; best=Math.max(best,i-j+1); } return best; }

function loadGrowth(){
  // optionale Wachstumsanalyse aus frueheren Snapshots
  const dir = path.join(OUT,'snapshots');
  if(!fs.existsSync(dir)) return null;
  const files = fs.readdirSync(dir).filter(f=>f.startsWith(`player-${WORLD}-`)).sort();
  if(files.length<2) return null;
  const first = parsePlayers(fs.readFileSync(path.join(dir,files[0]),'utf8'));
  const dFirst = files[0].slice(-14,-4), dLast = files[files.length-1].slice(-14,-4);
  const days = Math.max(1,(Date.parse(dLast)-Date.parse(dFirst))/86400000);
  return { first, days };
}

(async function main(){
  console.log('\n'+C.gold+C.b+BANNER+C.r+'\n');
  console.log(C.cyn+`[Welt ${WORLD}]`+C.r+' lade oeffentliche Daten ...');
  const [pTxt,cTxt,aTxt,dTxt] = await Promise.all([get('player.txt'),get('conquer.txt'),get('kill_att.txt'),get('kill_def.txt').catch(()=> '')]);
  const players=parsePlayers(pTxt), oda=parseKills(aTxt), odd=parseKills(dTxt);
  let conquers=parseConquers(cTxt);
  console.log(`  ${C.b}${Object.keys(players).length}${C.r} Spieler, ${C.b}${conquers.length}${C.r} Adelungen`);
  if(DAYS>0){ const cut=Math.floor(Date.now()/1000)-DAYS*86400; conquers=conquers.filter(c=>c.ts>=cut); console.log(`  Zeitfilter ${DAYS}d -> ${conquers.length} Adelungen`); }

  const real = conquers.filter(c=>c.old&&c.old!=='0'&&c.nw&&c.nw!=='0'&&c.nw!==c.old);
  const gained={}, tsByPair={};
  real.forEach(c=>{ (gained[c.nw] ||= {})[c.old]=(gained[c.nw][c.old]||0)+1; (tsByPair[c.nw+'|'+c.old] ||= []).push(c.ts); });

  const lostBy={};
  for(const A in gained) for(const B in gained[A]){ (lostBy[B] ||= {})[A]=gained[A][B]; }

  const growth = loadGrowth();
  const gRate = id => { if(!growth||!growth.first[id]||!players[id]) return null; return Math.round((players[id].points-growth.first[id].points)/growth.days); };

  // --- Feeder->Main-Paare mit Signalen ---
  const pairs=[];
  for(const B in lostBy){
    const map=lostBy[B]; let topA=null,topC=0,total=0;
    for(const A in map){ total+=map[A]; if(map[A]>topC){topC=map[A];topA=A;} }
    if(topC<MIN_FLOW) continue;
    const reverse=(gained[B]&&gained[B][topA])||0; if(reverse>MAX_REV) continue;
    const conc=topC/total; if(conc<CONC) continue;
    const odaB=oda[B]||0, mule=odaB<ODA_MULE, deleted=!players[B];
    const ts=(tsByPair[topA+'|'+B]||[]).slice().sort((a,b)=>a-b);
    const burst=maxInWindow(ts,BURST_WIN);
    const spanD=ts.length>1?Math.round((ts[ts.length-1]-ts[0])/86400*10)/10:0;
    const score=Math.round((topC*conc*(mule?2:1)+(deleted?2:0)+(burst>=3?2:0))*10)/10;
    pairs.push({beneficiary:topA,feeder:B,count:topC,total,conc,reverse,odaB,oddB:odd[B]||0,mule,deleted,burst,spanD,score});
  }
  pairs.sort((a,b)=>b.score-a.score);

  // --- Aggregation pro MAIN (das ueberzeugendste Signal fuer Inno) ---
  const byMain={};
  pairs.forEach(p=>{ (byMain[p.beneficiary] ||= []).push(p); });
  const mains = Object.keys(byMain).map(A=>{
    const list=byMain[A];
    const muleFeeders=list.filter(p=>p.mule);
    const deletedFeeders=list.filter(p=>p.deleted);
    const fedTotal=list.reduce((t,p)=>t+p.count,0);
    const reasons=[];
    if(muleFeeders.length>=2) reasons.push(`${muleFeeders.length} kampf-inaktive Feeder`);
    if(deletedFeeders.length>=1) reasons.push(`${deletedFeeders.length} Feeder-Account(s) geloescht`);
    if(list.some(p=>p.burst>=3)) reasons.push('Adel-Burst (mehrere Doerfer in <1h)');
    if(list.some(p=>p.conc>=0.99)) reasons.push('Feeder gab 100% an diesen Main');
    const g=gRate(A); if(g!=null&&g>0) reasons.push(`Wachstum ~${g.toLocaleString('de-DE')} Pkt/Tag`);
    const mScore=Math.round((list.reduce((t,p)=>t+p.score,0)+muleFeeders.length*3)*10)/10;
    return { id:A, feeders:list.length, muleFeeders:muleFeeders.length, deletedFeeders:deletedFeeders.length, fedTotal, reasons, score:mScore };
  }).filter(m=>m.muleFeeders>=1).sort((a,b)=>b.score-a.score);

  const nm=id=>(players[id]?players[id].name:'[geloescht]')+` (#${id})`;
  const pts=id=>players[id]?players[id].points:0;

  fs.mkdirSync(OUT,{recursive:true});
  const stamp=new Date().toISOString().slice(0,10);
  const report={ world:WORLD, generated:new Date().toISOString(),
    method:'Mains, die von mehreren kampf-inaktiven Accounts einseitig gefuettert werden (Push/Multiacc). Trennung von Krieg via ODA. Zusatzsignale: geloeschte Feeder, Adel-Bursts, Wachstum.',
    thresholds:{MIN_FLOW,MAX_REV,CONC,ODA_MULE,DAYS},
    topMains:mains.slice(0,150).map(m=>({main:nm(m.id),points:pts(m.id),muleFeeders:m.muleFeeders,feedersTotal:m.feeders,deletedFeeders:m.deletedFeeders,villagesReceived:m.fedTotal,score:m.score,reasons:m.reasons})),
    suspiciousPairs:pairs.slice(0,300).map(p=>({beneficiary:nm(p.beneficiary),feeder:nm(p.feeder),villagesFed:p.count,concentration:Math.round(p.conc*100)+'%',feederODA:p.odaB,feederKampfInaktiv:p.mule,feederGeloescht:p.deleted,burst1h:p.burst,spanTage:p.spanD,score:p.score}))
  };
  fs.writeFileSync(path.join(OUT,`report-${WORLD}-${stamp}.json`),JSON.stringify(report,null,2));

  const mainRows=report.topMains.map(m=>`<tr><td>${m.score}</td><td>${esc(m.main)}</td><td>${m.points.toLocaleString('de-DE')}</td><td style="text-align:center">${m.muleFeeders}</td><td style="text-align:center">${m.deletedFeeders}</td><td style="text-align:center">${m.villagesReceived}</td><td>${m.reasons.map(esc).join('; ')}</td></tr>`).join('');
  const pairRows=report.suspiciousPairs.map(p=>{ const f=p.feederKampfInaktiv?'<b style="color:#a00">Mule-Verdacht</b>':'<span style="color:#888">kriegsaehnlich</span>'; const del=p.feederGeloescht?' · <span style="color:#a00">geloescht</span>':''; return `<tr><td>${p.score}</td><td>${esc(p.beneficiary)}</td><td>${esc(p.feeder)}</td><td style="text-align:center">${p.villagesFed}</td><td style="text-align:center">${p.concentration}</td><td style="text-align:center">${p.feederODA.toLocaleString('de-DE')}</td><td style="text-align:center">${p.burst1h}</td><td>${f}${del}</td></tr>`; }).join('');
  const html=`<!doctype html><meta charset="utf-8"><title>DS Anti-Cheat ${WORLD}</title>`+
    `<style>body{font:14px/1.5 sans-serif;max-width:1150px;margin:20px auto;padding:0 12px}table{border-collapse:collapse;width:100%;margin-bottom:24px}td,th{border:1px solid #ccc;padding:5px 8px;font-size:13px}th{background:#eee;text-align:left}h1,h2{color:#7a1010}pre{background:#111;color:#c9a84c;padding:12px;border-radius:6px;overflow:auto;font-size:12px;line-height:1.2}code{background:#eee;padding:1px 4px}</style>`+
    `<pre>${esc(BANNER)}</pre>`+
    `<h1>DS Anti-Cheat — ${WORLD}</h1><p>Erstellt: ${report.generated}</p>`+
    `<p><b>Methode:</b> ${esc(report.method)}</p>`+
    `<p><b>Verdacht, kein Beweis.</b> Die IP-/Geraete-/Zahlungs-Ebene kann nur InnoGames pruefen — dies ist die oeffentlich sichtbare Vorstufe, nach Score priorisiert.</p>`+
    `<h2>Top verdaechtige Mains (${report.topMains.length})</h2>`+
    `<table><tr><th>Score</th><th>Main</th><th>Punkte</th><th>Mule-Feeder</th><th>Feeder geloescht</th><th>Doerfer erhalten</th><th>Gruende</th></tr>${mainRows}</table>`+
    `<h2>Verdaechtige Feeder-Paare (Top ${report.suspiciousPairs.length})</h2>`+
    `<table><tr><th>Score</th><th>Main</th><th>Feeder</th><th>Doerfer</th><th>Konz.</th><th>Feeder-ODA</th><th>Burst/1h</th><th>Bewertung</th></tr>${pairRows}</table>`;
  fs.writeFileSync(path.join(OUT,`report-${WORLD}-${stamp}.html`),html);

  fs.mkdirSync(path.join(OUT,'snapshots'),{recursive:true});
  fs.writeFileSync(path.join(OUT,'snapshots',`player-${WORLD}-${stamp}.txt`),pTxt);

  console.log(`\n${C.b}${C.gold}=== Ergebnis ===${C.r}`);
  console.log(`Verdaechtige Mains: ${C.red}${C.b}${mains.length}${C.r} · verdaechtige Paare: ${C.yel}${pairs.length}${C.r}${growth?` · ${C.grn}Wachstum aktiv (${Math.round(growth.days)}d)${C.r}`:` · ${C.gray}(Wachstum: noch keine Historie)${C.r}`}`);
  console.log(`\n${C.b}Top 10 verdaechtige Mains:${C.r}`);
  report.topMains.slice(0,10).forEach(m=>{
    console.log(`  ${sev(m.score)}${C.b}[${m.score}]${C.r} ${C.b}${m.main}${C.r} ${C.gray}<-${C.r} ${C.red}${m.muleFeeders} Mule-Feeder${C.r}, ${C.yel}${m.villagesReceived} Doerfer${C.r}`);
    if(m.reasons.length) console.log(`      ${C.gray}${m.reasons.join(' · ')}${C.r}`);
  });
  console.log(`\n${C.cyn}Reports:${C.r} ${OUT}`);
})().catch(e=>{ console.error('Fehler:', e.message); process.exit(1); });
