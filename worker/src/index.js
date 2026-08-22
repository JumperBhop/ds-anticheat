// DS Anti-Cheat Dashboard — gehostet, Token-geschuetzt.
// GET /?s=TOKEN        -> Dashboard (Daten aus KV server-seitig injiziert)
// POST /upload?key=... -> neue Analyse-Daten hochladen (vom lokalen crossworld.js)
// Nur oeffentliche Spieldaten werden verarbeitet. Verdacht, kein Beweis.

function page(body, status){ return new Response(body,{status:status||200,headers:{'content-type':'text/html; charset=utf-8','cache-control':'no-store'}}); }

const DASH = `<!doctype html><html lang="de"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>DS Anti-Cheat</title>
<style>
*{box-sizing:border-box}body{font:15px/1.6 -apple-system,Segoe UI,Roboto,sans-serif;margin:0;background:#12100c;color:#e9e2d0}
header{background:linear-gradient(180deg,#1c1710,#12100c);border-bottom:2px solid #9b7a1a;padding:26px 20px;text-align:center}
header h1{margin:0 0 6px;color:#c9a84c;font-size:26px}header p{margin:2px 0;color:#9b8c6a;font-size:14px}
.wrap{max-width:1150px;margin:0 auto;padding:20px}
.disc{background:#2a1c0c;border:1px solid #7a5010;border-radius:8px;padding:12px 16px;margin:18px 0;color:#e8c86a;font-size:14px}
.stats{display:flex;gap:14px;flex-wrap:wrap;margin:18px 0}.stat{background:#1c1710;border:1px solid #3a2f18;border-radius:10px;padding:14px 20px;flex:1;min-width:150px}
.stat b{display:block;font-size:28px;color:#c9a84c}.stat span{color:#9b8c6a;font-size:13px}
h2{color:#c9a84c;border-bottom:1px solid #3a2f18;padding-bottom:6px;margin-top:34px}
input.q{background:#12100c;border:1px solid #3a2f18;color:#e9e2d0;padding:9px 12px;border-radius:6px;width:320px;font-size:14px;margin:8px 0}
table{border-collapse:collapse;width:100%;font-size:13px;margin:6px 0}th,td{border:1px solid #2f2717;padding:6px 9px;text-align:left}th{background:#221b10;color:#c9a84c}
.case{background:#181309;border:1px solid #3a2f18;border-radius:10px;padding:14px 16px;margin:14px 0}
.case h3{margin:0 0 4px;font-size:16px}.case .meta{color:#9b8c6a;font-size:13px;margin-bottom:10px}
.badge{background:#7a1010;color:#fff;border-radius:4px;padding:1px 8px;font-size:11px;font-weight:bold}
.nworld{display:inline-block;background:#c9a84c;color:#1a1409;border-radius:5px;padding:2px 9px;font-weight:bold;font-size:13px;margin-right:8px}
.gr{display:flex;gap:22px;flex-wrap:wrap;margin-top:10px}.grbox{background:#12100c;border:1px solid #2f2717;border-radius:8px;padding:8px 12px}.grbox b{color:#c9a84c;font-size:13px}
.mono{font-family:monospace}footer{text-align:center;color:#6a5f45;padding:30px;font-size:12px}a{color:#c9a84c}
</style></head><body>
<header><h1>&#9876; DS Anti-Cheat — Cross-Welt Push-Erkennung</h1><p id="sub"></p></header>
<div class="wrap">
<div class="disc"><b>&#9888; Verdacht, kein Beweis.</b> Basiert ausschliesslich auf <b>oeffentlichen</b> Spieldaten (offizielle <span class="mono">map/*.txt</span>-Exporte + DS-Ultimate-Punktehistorie). Die endgueltige Feststellung (IP, Geraet, Zahlung) kann nur InnoGames treffen. Diese Seite priorisiert, <i>wo sich ein genauer Blick lohnt</i>.</div>
<div class="stats" id="stats"></div>
<input class="q" id="q" placeholder="Nach Spielername filtern ..." oninput="filt()">
<h2>Verdaechtige pro Welt</h2>
<div style="margin:8px 0"><label style="color:#9b8c6a;font-size:14px">Welt:&nbsp;</label>
<select id="wsel" onchange="renderWorld()" style="background:#12100c;color:#e9e2d0;border:1px solid #3a2f18;border-radius:6px;padding:8px 10px;font-size:14px"></select>
<label style="color:#9b8c6a;font-size:13px;margin-left:16px"><input type="checkbox" id="onlyproxy" onchange="renderWorld()"> nur Mains mit geloeschten Feedern</label></div>
<div id="wtab"></div>
<h2>Systematisch gepushte Mains (Cross-Welt)</h2><div id="mains"></div>
<h2>Cross-Welt-Faelle (mit Punkte-Kurven)</h2>
<p style="color:#9b8c6a;font-size:13px">Dieselbe Feeder&rarr;Main-Beziehung ueber mehrere Welten = praktisch kein Zufall. Pro Welt: geadelte Doerfer + Punktekurve von Main &amp; Feeder.</p>
<div id="cases"></div>
</div>
<footer>DS Anti-Cheat &middot; nur oeffentliche Daten &middot; Verdacht kein Beweis</footer>
<script>
var D=window.__DATA__;
function esc(s){return String(s).replace(/[&<>"]/g,function(c){return{'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c];});}
function spark(series){ if(!series||series.length<2)return '<span style="color:#6a5f45;font-size:11px">keine Historie</span>';
  var w=200,h=44,ys=series.map(function(p){return p.points;}),mn=Math.min.apply(0,ys),mx=Math.max.apply(0,ys),rng=(mx-mn)||1;
  var pts=series.map(function(p,i){var x=(i/(series.length-1))*(w-6)+3,y=h-3-((p.points-mn)/rng)*(h-8);return x.toFixed(1)+','+y.toFixed(1);}).join(' ');
  var col=(ys[ys.length-1]-ys[0])>0?'#5cb85c':'#c9a84c';
  return '<svg width="'+w+'" height="'+h+'" viewBox="0 0 '+w+' '+h+'"><polyline fill="none" stroke="'+col+'" stroke-width="1.6" points="'+pts+'"/></svg>'+
    ' <span style="font-size:11px;color:#9b8c6a">'+Math.round(mn/1000)+'K&rarr;'+Math.round(mx/1000)+'K</span>';
}
function render(){
  if(!D){document.getElementById('sub').textContent='Noch keine Daten hochgeladen.';return;}
  document.getElementById('sub').innerHTML='Stand: '+esc(D.generated)+' &middot; Welten: '+ (D.worldsScanned||[]).map(esc).join(', ');
  document.getElementById('stats').innerHTML=
    '<div class="stat"><b>'+(D.cases||[]).length+'</b><span>Cross-Welt-Faelle</span></div>'+
    '<div class="stat"><b>'+(D.mains||[]).length+'</b><span>betroffene Mains</span></div>'+
    '<div class="stat"><b>'+(D.worldsScanned||[]).length+'</b><span>Welten gescannt</span></div>';
  document.getElementById('mains').innerHTML='<table><thead><tr><th>Cross-Welt-Feeder</th><th>Main</th><th>Welten</th><th>Doerfer</th></tr></thead><tbody>'+
    (D.mains||[]).map(function(m){return '<tr data-s="'+esc(m.main.toLowerCase())+'"><td style="text-align:center"><b>'+m.crossWorldFeeders+'</b></td><td>'+esc(m.main)+'</td><td class="mono">'+m.worlds.join(', ')+'</td><td style="text-align:center">'+m.villages+'</td></tr>';}).join('')+'</tbody></table>';
  document.getElementById('cases').innerHTML=(D.cases||[]).map(function(c){
    var rows=(c.perWorld||[]).slice().sort(function(a,b){return a.world.localeCompare(b.world);}).map(function(pw){return '<tr><td class="mono">'+esc(pw.world)+'</td><td style="text-align:center"><b>'+pw.villages+'</b></td><td style="text-align:center">'+(pw.oda||0).toLocaleString('de-DE')+'</td><td>'+(pw.deleted?'<span class="badge">geloescht</span>':'')+'</td></tr>';}).join('');
    var gr=(c.worlds||[]).map(function(w){var g=(c.graphs&&c.graphs[w])||{};return '<div class="grbox"><b>'+esc(w)+'</b><br><span style="color:#9b8c6a;font-size:12px">Main:</span><br>'+spark(g.main)+'<br><span style="color:#9b8c6a;font-size:12px">Feeder:</span><br>'+spark(g.feeder)+'</div>';}).join('');
    return '<div class="case" data-s="'+esc((c.main+' '+c.feeder).toLowerCase())+'"><h3><span class="nworld">'+c.worlds.length+' Welten</span>'+esc(c.feeder)+' <span style="color:#9b8c6a">adelt</span> '+esc(c.main)+'</h3>'+
      '<div class="meta">'+c.villages+' Doerfer gesamt &middot; Feeder '+(c.feederKampfInaktiv?'<span class="badge">kampf-inaktiv</span>':'<span style="color:#888">kriegsaehnlich</span>')+'</div>'+
      '<table><thead><tr><th>Welt</th><th>Doerfer geadelt</th><th>Feeder-ODA</th><th></th></tr></thead><tbody>'+rows+'</tbody></table>'+
      '<div class="gr">'+gr+'</div></div>';
  }).join('')||'<p style="color:#9b8c6a">Keine Cross-Welt-Faelle in den aktuellen Daten.</p>';
}
function renderWorld(){
  var pw=D&&D.perWorldMains||{}; var w=document.getElementById('wsel').value; var onlyDel=document.getElementById('onlyproxy').checked;
  var arr=(pw[w]||[]).filter(function(m){return !onlyDel||m.nDel>0;});
  var html=arr.map(function(m){
    var fr=m.feeders.map(function(f){
      var del=f.deleted?' <span class="badge">geloescht</span>':'';
      return '<tr data-s="'+esc((f.name+' '+m.main).toLowerCase())+'"><td><b>'+esc(f.name)+'</b> <span style="color:#9b8c6a">feedet</span> <b>'+esc(m.main)+'</b></td><td style="text-align:center">'+f.villages.length+'</td><td class="mono" style="font-size:12px">'+f.villages.map(esc).join(', ')+'</td><td style="text-align:center">'+(f.oda||0).toLocaleString('de-DE')+del+'</td></tr>';
    }).join('');
    return '<div class="case" data-s="'+esc(m.main.toLowerCase())+'"><h3>'+esc(m.main)+' <span style="color:#9b8c6a;font-size:13px">(ODA '+(m.mainOda||0).toLocaleString('de-DE')+')</span></h3>'+
      '<div class="meta">breit gepusht: <b>'+m.susVillages+' Doerfer</b> von <b>'+m.susFeeders+' verdaechtigen Accounts</b>'+(m.nDel?' &middot; <span class="badge">'+m.nDel+' geloescht</span>':'')+'</div>'+
      '<table><thead><tr><th>Wer feedet wen</th><th>Doerfer</th><th>Koordinaten der Doerfer</th><th>Feeder-ODA</th></tr></thead><tbody>'+fr+'</tbody></table></div>';
  }).join('');
  document.getElementById('wtab').innerHTML='<p style="color:#9b8c6a;font-size:13px">'+arr.length+' verdaechtige Mains in '+esc(w)+' (bekommen Doerfer von kampf-inaktiven/geloeschten Accounts).</p>'+(html||'<p>keine</p>');
  filt();
}
function filt(){var q=document.getElementById('q').value.toLowerCase();['#mains tr','.case','#wtab tr','#wtab .case'].forEach(function(sel){document.querySelectorAll(sel).forEach(function(el){var s=el.getAttribute('data-s');if(s===null)return;el.style.display=(!q||s.indexOf(q)>=0)?'':'none';});});}
render();
(function(){var pw=D&&D.perWorldMains||{};var ks=Object.keys(pw);var sel=document.getElementById('wsel');if(sel&&ks.length){sel.innerHTML=ks.map(function(w){return '<option value="'+esc(w)+'">'+esc(w)+' ('+pw[w].length+' Mains)</option>';}).join('');renderWorld();}})();
</script></body></html>`;

export default {
  async fetch(request, env){
    const url = new URL(request.url);
    const p = url.pathname;

    if(p==='/upload' && request.method==='POST'){
      if(!env.UPLOAD_KEY || url.searchParams.get('key')!==env.UPLOAD_KEY) return new Response('forbidden',{status:403});
      const body = await request.text();
      try{ JSON.parse(body); }catch(e){ return new Response('invalid json',{status:400}); }
      await env.AC.put('data', body);
      return new Response('ok');
    }

    if(p==='/' || p==='/dashboard'){
      if(!env.DASH_TOKEN || url.searchParams.get('s')!==env.DASH_TOKEN)
        return page('<body style="font-family:sans-serif;background:#12100c;color:#e9e2d0;text-align:center;padding:60px"><h2>Zugriff nur mit gueltigem Link</h2></body>',403);
      const data = await env.AC.get('data');
      return page(DASH.replace('window.__DATA__', data ? data : 'null'));
    }

    return new Response('not found',{status:404});
  }
};
