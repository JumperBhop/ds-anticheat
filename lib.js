'use strict';
// Gemeinsames Analyse-Modul: eine Welt laden + Push-Paare (Feeder->Main) berechnen.
// Nutzt nur oeffentliche map/*.txt-Exporte.

const DEF = { MIN_FLOW:3, MAX_REV:0, CONC:0.75, ODA_MULE:20000 };

function dec(s){ try { return decodeURIComponent(String(s).replace(/\+/g,' ')); } catch(e){ return s; } }

async function getTxt(url){ const r = await fetch(url); if(!r.ok) throw new Error(`${url}: HTTP ${r.status}`); return await r.text(); }

function parsePlayers(txt){ const m={}; txt.split('\n').forEach(l=>{ if(!l.trim())return; const [id,name,ally,v,p,r]=l.split(','); m[id]={id,name:dec(name),ally,villages:+v||0,points:+p||0,rank:+r||0}; }); return m; }
function parseConquers(txt){ const o=[]; txt.split('\n').forEach(l=>{ if(!l.trim())return; const [village,ts,nw,old]=l.split(','); o.push({village,ts:+ts||0,nw,old}); }); return o; }
function parseKills(txt){ const m={}; txt.split('\n').forEach(l=>{ if(!l.trim())return; const [,id,k]=l.split(','); if(id)m[id]=+k||0; }); return m; }
function parseVillages(txt){ const m={}; txt.split('\n').forEach(l=>{ if(!l.trim())return; const p=l.split(','); if(p[0])m[p[0]]={name:dec(p[1]||''),x:+p[2]||0,y:+p[3]||0}; }); return m; }

async function loadWorld(world){
  const base = `https://${world}.die-staemme.de/map`;
  const [p,c,a,v] = await Promise.all([ getTxt(`${base}/player.txt`), getTxt(`${base}/conquer.txt`), getTxt(`${base}/kill_att.txt`).catch(()=> ''), getTxt(`${base}/village.txt`).catch(()=> '') ]);
  return { world, players:parsePlayers(p), conquers:parseConquers(c), oda:parseKills(a), villages:parseVillages(v) };
}

// Liefert verdaechtige Feeder->Main-Paare einer Welt (mit IDs, damit cross-welt matchbar)
function pushPairs(data, opts={}){
  const o = Object.assign({}, DEF, opts);
  const { players, conquers, oda } = data;
  const real = conquers.filter(c=>c.old&&c.old!=='0'&&c.nw&&c.nw!=='0'&&c.nw!==c.old);
  const gained={};
  real.forEach(c=>{ (gained[c.nw] ||= {})[c.old]=(gained[c.nw][c.old]||0)+1; });
  const lostBy={};
  for(const A in gained) for(const B in gained[A]){ (lostBy[B] ||= {})[A]=gained[A][B]; }
  const out=[];
  for(const B in lostBy){
    const map=lostBy[B]; let topA=null,topC=0,total=0;
    for(const A in map){ total+=map[A]; if(map[A]>topC){topC=map[A];topA=A;} }
    if(topC<o.MIN_FLOW) continue;
    const reverse=(gained[B]&&gained[B][topA])||0; if(reverse>o.MAX_REV) continue;
    const conc=topC/total; if(conc<o.CONC) continue;
    const odaB=oda[B]||0;
    out.push({ world:data.world, mainId:topA, feederId:B, count:topC, conc, odaB, mule:odaB<o.ODA_MULE, deleted:!players[B] });
  }
  return out;
}

module.exports = { DEF, loadWorld, pushPairs, dec };
