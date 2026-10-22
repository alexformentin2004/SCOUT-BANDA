/* Scout Personale v1.6 | gestione sicura archivio / set / partite */
(() => {
'use strict';
const KEY = 'volley-scout-personal-v1';
const $ = id => document.getElementById(id);
const TYPES = { reception:'Ricezione', serve:'Battuta', attack:'Attacco' };
const ICONS = { reception:'🛡️', serve:'🎯', attack:'⚡' };
const ORDER = ['#','+','/','-','='];
// Metric distances from the ideal setting point (6.2 m across, 1.2 m from our net).
// Classificazione automatica nascosta durante lo scout; visibile solo in Statistiche e Storico.
const REC_THRESHOLDS = {alta:[['#',1.2],['+',2.5],['/',4]],tesa:[['+',1.5],['/',3]],bassa:[['/',1.7]]};
const gradeClass=s=>({'#':'grade-hash','+':'grade-plus','/':'grade-slash','-':'grade-minus','=':'grade-equal'})[s]||'';
const OPTIONS = {
  reception:[['alta','Alta'],['tesa','Tesa'],['bassa','Bassa'],['errore','Errore o ace subito']],
  serve:[['ace','Ace'],['errore','Errore'],['ricevuta','Ricevuta'],['vincente','Vincente indiretta'],['insidiosa','Insidiosa']],
  attack:[['punto','Punto'],['errore','Errore'],['murato','Murato'],['difeso','Difeso'],['muro_toccato','Muro toccato']]
};
const NOTES = {
  reception:{'#':'Perfetta stimata: alta, vicino alla zona ideale','+':'Positiva stimata: arrivo vicino alla zona ideale','/':'Intermedia stimata: controllo non ideale','-':'Negativa stimata: bassa o molto staccata','=':'Errore: ace subito o ricezione oltre rete'},
  serve:{'#':'Ace diretto','+':'Battuta che crea difficoltà o punto indiretto','/':'Riservato a una correzione manuale','-':'Battuta ricevuta normalmente','=':'Errore di battuta'},
  attack:{'#':'Punto in attacco','+':'Riservato a una correzione manuale','/':'Palla giocabile dopo contatto con muro, oppure voto manuale','-':'Attacco difeso, valutazione provvisoria','=':'Errore o muro punto avversario (vedi esito)'}
};
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const pct=(n,d)=>d? (100*n/d).toFixed(1)+'%':'0,0%';
const idgen=()=>String(Date.now())+'-'+Math.random().toString(36).slice(2,8);
const today=()=>{const d=new Date();return [d.getFullYear(),String(d.getMonth()+1).padStart(2,'0'),String(d.getDate()).padStart(2,'0')].join('-')};
function emptyStore(){return {schema:2,active:null,matches:[]}}
function load(){try {const x=JSON.parse(localStorage.getItem(KEY));return x && Array.isArray(x.matches) ? x : emptyStore()}catch{return emptyStore()}}
let store=load(), currentType='', pts=[], pathDone=false, drawing=false, view='setup', editId=null, redoStack=[], confirming=null, archiveExpandedId=null;
function persist(){try{store.schema=2;localStorage.setItem(KEY,JSON.stringify(store))}catch(e){alert('Impossibile salvare sul dispositivo. Esporta immediatamente il backup JSON.')}}
function active(){return store.matches.find(m=>m.id===store.active)}
function records(m=active()){return (m?.records||[]).filter(r=>!r.deleted)}
function nameOutcome(r){return r.outcome==='errore_oltre_rete'?'Errore oltre rete':(OPTIONS[r.type]||[]).find(o=>o[0]===r.outcome)?.[1]||r.outcome}
function zone(p){if(!p)return '—';if(p.x<55 || p.x>305 || p.y<65 || p.y>485)return 'Fuori campo';const our=p.y>=275;const front=our?p.y<345:p.y>205;const col=p.x<138?0:p.x<222?1:2;return (our ? (front?['4','3','2']:['5','6','1']):(front?['2','3','4']:['1','6','5']))[col]}
function setterDistance(r){
  if(!r.end || !Number.isFinite(+r.end.x) || !Number.isFinite(+r.end.y))return null;
  // Dimensions in meters, relative to our net: our half 250px x 210px = 9m x 9m.
  const x=(+r.end.x-55)*9/250, depth=(+r.end.y-275)*9/210;
  return Math.hypot(x-6.2,depth-1.2);
}
function ratingAuto(r){
  if(r.type==='reception'){
    if(['errore','errore_oltre_rete'].includes(r.outcome) || (r.end && r.end.y<275))return {s:'=',why:'Ricezione classificata come errore; oltre rete = errore secondo la tua regola.'};
    const d=setterDistance(r);
    if(d===null)return {s:'/',why:'Manca la destinazione: assegnazione conservativa. Puoi correggere il simbolo.'};
    const bands=REC_THRESHOLDS[r.outcome];
    const s=bands?(bands.find(([,radius])=>d<=radius)?.[0]||'-'):'/';
    return {s,why:`Stima: ricezione ${nameOutcome(r).toLowerCase()}, arrivo a ${d.toFixed(1)} m dal bersaglio configurato vicino alla rete. Non è una misura della vera velocità della palla.`};
  }
  if(r.type==='serve'){
    const map={ace:'#',vincente:'+',insidiosa:'+',ricevuta:'-',errore:'='};
    return {s:map[r.outcome]||'/',why:r.outcome==='insidiosa'?'Ricezione avversaria staccata da rete, ma giocabile.':r.outcome==='vincente'?'Punto indiretto: classificazione positiva, non ace.':'Valutazione derivata dall’esito della battuta.'};
  }
  if(r.type==='attack'){
    // Conservative personalized 5-code mapping; KPI kill/block/error use raw outcome, not grade.
    const map={punto:'#',errore:'=',murato:'=',difeso:'-',muro_toccato:'/'};
    return {s:map[r.outcome]||'/',why:r.outcome==='murato'?'Muro punto avversario: conta come attacco murato nell’efficienza, distinto da errore tecnico.':r.outcome==='muro_toccato'?'Muro toccato e azione proseguita: valutazione intermedia, senza dedurre chi ha recuperato.':'Valutazione iniziale dall’esito; modificabile quando il pallone è stato difeso con difficoltà.'};
  }
  return {s:'/',why:'Valutazione non disponibile.'};
}
function rating(r){const auto=ratingAuto(r);return (ORDER.includes(r.symbolOverride))?{s:r.symbolOverride,why:'Voto corretto manualmente. Auto: '+auto.s+'. '+auto.why,manual:true}: {...auto,manual:false}}
function dataFor(m=active(),set='all'){
  const list=records(m).filter(r=>set==='all'||String(r.set)===String(set));
  const sections={};
  for(const type of Object.keys(TYPES)){
    const a=list.filter(r=>r.type===type),cnt={},sym=Object.fromEntries(ORDER.map(k=>[k,0])),zoneStart={},zoneEnd={};
    for(const r of a){cnt[r.outcome]=(cnt[r.outcome]||0)+1;sym[rating(r).s]++;const z1=r.startZone||zone(r.start),z2=r.endZone||zone(r.end);zoneStart[z1]=(zoneStart[z1]||0)+1;zoneEnd[z2]=(zoneEnd[z2]||0)+1}
    const n=a.length,k=key=>cnt[key]||0;
    const summary=type==='attack'?{main:[['Punti',k('punto')],['Punti / attacchi',pct(k('punto'),n)],['Efficienza',pct(k('punto')-k('errore')-k('murato'),n)],['Errori + muri punto',k('errore')+k('murato')]],detail:[['Muro toccato',k('muro_toccato')],['Attacchi difesi',k('difeso')],['Muri punto subiti',k('murato')],['Errori tecnici',k('errore')]]}:
      type==='serve'?{main:[['Ace',k('ace')],['Ace %',pct(k('ace'),n)],['Insidiose + vincenti indirette',pct(k('insidiosa')+k('vincente'),n)],['Errori %',pct(k('errore'),n)]],detail:[['Insidiose',k('insidiosa')],['Vincenti indirette',k('vincente')],['Ricevute normalmente',k('ricevuta')],['Errori',k('errore')]]}:
      {main:[['Perfette (#)',pct(sym['#'],n)],['Positive (# e +)',pct(sym['#']+sym['+'],n)],['Errori',k('errore')+k('errore_oltre_rete')],['Indice ricezione',n?((3*sym['#']+2*sym['+']+sym['/'])/n).toFixed(2)+' / 3':'—']],detail:[['Alta',k('alta')],['Tesa',k('tesa')],['Bassa',k('bassa')],['Errori oltre rete',k('errore_oltre_rete')],['Ace subiti / errori',k('errore')]]};
    sections[type]={type,n,actions:a,outcomes:cnt,symbols:sym,starts:zoneStart,ends:zoneEnd,summary};
  }
  return {sections,records:list,total:list.length};
}
function confirmAction(title,message,confirmLabel,fn,destructive=false){confirming=fn;$('confirmTitle').textContent=title;$('confirmMessage').textContent=message;$('confirmProceed').textContent=confirmLabel;$('confirmProceed').className=destructive?'bad':'primary';$('confirmOverlay').classList.remove('hidden')}
function dismissConfirm(){confirming=null;$('confirmOverlay').classList.add('hidden')}
$('confirmCancel').onclick=dismissConfirm;
$('confirmProceed').onclick=()=>{const fn=confirming;dismissConfirm();if(fn)fn()};
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&!$('confirmOverlay').classList.contains('hidden'))dismissConfirm()});
function switchView(v){view=v;for(const id of ['setup','home','drawing','result','analytics','history'])$(id).classList.toggle('hidden',id!==v);$('nav').classList.toggle('hidden',!active()||['setup','drawing','result'].includes(v));document.querySelectorAll('[data-tab]').forEach(b=>b.classList.toggle('active',b.dataset.tab===v));if(v==='home')renderHome();if(v==='analytics')renderAnalytics();if(v==='history')renderHistory();requestAnimationFrame(()=>window.scrollTo(0,0))}
function start(){const chosen=[['reception','enableReception'],['serve','enableServe'],['attack','enableAttack']].filter(([a,id])=>$(id).checked).map(a=>a[0]);if(!chosen.length)return alert('Seleziona almeno un fondamentale.');const m={id:idgen(),opponent:$('opponent').value.trim()||'Avversari',date:$('matchDate').value||today(),enabled:chosen,set:1,finished:false,records:[]};store.matches.unshift(m);store.active=m.id;redoStack=[];persist();switchView('home')}
function renderHome(){const m=active();if(!m){switchView('setup');return}$('matchLabel').textContent=m.opponent+' · '+m.date;$('setLabel').textContent='Set '+m.set;$('nextSet').disabled=!!m.finished;const r=records(m);$('quickStats').innerHTML=Object.keys(TYPES).map(t=>`<div class="stat"><strong>${r.filter(a=>a.type===t).length}</strong><small>${TYPES[t]}</small></div>`).join('');$('fundamentalButtons').replaceChildren();(m.enabled||Object.keys(TYPES)).forEach(t=>{const b=document.createElement('button');b.className='tile fundamental-'+t;b.innerHTML=`<span>${ICONS[t]}</span><b>${TYPES[t]}</b>`;b.disabled=!!m.finished;b.onclick=()=>enterDrawing(t);$('fundamentalButtons').append(b)});$('undoBtn').disabled=!r.length||m.finished;$('redoBtn').disabled=!redoStack.length||m.finished;$('endMatch').textContent=m.finished?'Riapri partita':'Termina partita';const last=r.at(-1);$('lastRecord').innerHTML=last?`Ultima: <b>${esc(TYPES[last.type])}</b> · ${esc(nameOutcome(last))} · Set ${last.set}`:'Nessuna azione registrata.'}
function setZones(){const specs=[['1',96,122],['6',180,122],['5',264,122],['2',96,236],['3',180,236],['4',264,236],['4',96,312],['3',180,312],['2',264,312],['5',96,427],['6',180,427],['1',264,427]];$('zones').replaceChildren();for(const [n,x,y]of specs){let el=document.createElementNS('http://www.w3.org/2000/svg','text');el.setAttribute('x',x);el.setAttribute('y',y);el.textContent=n;$('zones').append(el)}}
function enterDrawing(t){currentType=t;clearDrawing();$('drawingTitle').textContent=TYPES[t]+' · disegna la palla';$('drawingStatus').textContent='Trascina dalla partenza all’arrivo della palla.';switchView('drawing')}
function pointFromEvent(e){const rect=$('court').getBoundingClientRect();return{x:Math.max(0,Math.min(360,(e.clientX-rect.left)*360/rect.width)),y:Math.max(0,Math.min(590,(e.clientY-rect.top)*590/rect.height))}}
function clearDrawing(){pts=[];pathDone=false;$('rawPath').setAttribute('d','');$('drawPath').setAttribute('d','');$('startDot').setAttribute('visibility','hidden');$('endDot').setAttribute('visibility','hidden');$('zoneReadout').textContent='Nessuna traiettoria';$('outcomePanel').classList.add('hidden')}
function pathString(arr){return arr.map((p,i)=>(i?'L':'M')+p.x.toFixed(1)+' '+p.y.toFixed(1)).join(' ')}
function smooth(points){if(points.length<3)return points;const a=[points[0]];for(let i=1;i<points.length-1;i++)a.push({x:(points[i-1].x+2*points[i].x+points[i+1].x)/4,y:(points[i-1].y+2*points[i].y+points[i+1].y)/4});a.push(points.at(-1));return a.filter((p,i)=>i===0||i===a.length-1||i%3===0)}
function paint(){if(!pts.length)return;const norm=smooth(pts);$('rawPath').setAttribute('d',pathString(pts));$('drawPath').setAttribute('d',pathString(norm));for(const [id,p]of [['startDot',pts[0]],['endDot',pts.at(-1)]]){const el=$(id);el.setAttribute('cx',p.x);el.setAttribute('cy',p.y);el.setAttribute('visibility','visible')}}
$('court').addEventListener('pointerdown',e=>{if(pathDone)return;e.preventDefault();drawing=true;pts=[pointFromEvent(e)];$('court').setPointerCapture(e.pointerId);paint()});
$('court').addEventListener('pointermove',e=>{if(!drawing)return;e.preventDefault();const p=pointFromEvent(e),a=pts.at(-1);if(Math.hypot(p.x-a.x,p.y-a.y)>2){pts.push(p);paint()}});
function finish(e){if(!drawing)return;drawing=false;if(e){const p=pointFromEvent(e),last=pts.at(-1);if(last&&Math.hypot(p.x-last.x,p.y-last.y)>2)pts.push(p)}const a=pts[0],b=pts.at(-1);if(!a||!b||Math.hypot(a.x-b.x,a.y-b.y)<18){clearDrawing();$('drawingStatus').textContent='Gesto troppo corto, riprova.';return}paint();pathDone=true;$('zoneReadout').textContent=zone(a)+' → '+zone(b);$('drawingStatus').textContent='Traiettoria acquisita.';showOutcomes()}
$('court').addEventListener('pointerup',finish);
$('court').addEventListener('pointercancel',()=>{drawing=false;clearDrawing()});
$('redrawBtn').onclick=()=>{clearDrawing();$('drawingStatus').textContent='Disegna nuovamente la traiettoria.'};
$('backDrawing').onclick=()=>switchView('home');
function showOutcomes(){if(currentType==='reception'&&pts.at(-1)?.y<275){saveRecord('errore_oltre_rete');return}
  $('resultTitle').textContent=TYPES[currentType]+' · esito';$('resultContext').textContent='Da zona '+zone(pts[0])+' a zona '+zone(pts.at(-1))+'. Seleziona l’esito per salvare.';
  $('resultButtons').replaceChildren();
  for(const [val,name] of OPTIONS[currentType]){
    const b=document.createElement('button');
    b.className='outcome-btn kind-'+currentType+' outcome-'+val;
    b.textContent=name; // Solo dato osservabile. Mai anticipare il simbolo durante lo scout.
    b.onclick=()=>saveRecord(val);
    $('resultButtons').append(b);
  }
  switchView('result');
}
$('returnToCourt').onclick=()=>{clearDrawing();$('drawingStatus').textContent='Ridisegna la traiettoria.';switchView('drawing')};
$('cancelResult').onclick=()=>{clearDrawing();switchView('home')};
function saveRecord(outcome){const m=active();if(!m||m.finished||pts.length<2)return;const a=pts[0],b=pts.at(-1),round=p=>({x:+p.x.toFixed(2),y:+p.y.toFixed(2)});m.records.push({id:idgen(),type:currentType,set:m.set,outcome,start:round(a),end:round(b),startZone:zone(a),endZone:zone(b),raw:pts.map(round),normalized:smooth(pts).map(round),createdAt:new Date().toISOString(),deleted:false});redoStack=[];persist();switchView('home')}
$('startBtn').onclick=start;
$('newMatch').onclick=()=>{$('opponent').value='';$('matchDate').value=today();$('bootReady').textContent='✓ La partita precedente rimane salvata.';switchView('setup')};
$('nextSet').onclick=()=>{const m=active();if(!m||m.finished)return;confirmAction('Passare al set successivo?','I dati del set '+m.set+' rimarranno salvati.','Inizia set '+(m.set+1),()=>{m.set++;redoStack=[];persist();switchView('home')})};
$('endMatch').onclick=()=>{const m=active();if(!m)return;if(m.finished)confirmAction('Riaprire la partita?','Potrai inserire nuove azioni.','Riapri',()=>{m.finished=false;persist();switchView('home')});else confirmAction('Terminare la partita?','Le statistiche resteranno accessibili e potrai esportarle in PDF.','Termina partita',()=>{m.finished=true;persist();switchView('home')})};
$('undoBtn').onclick=()=>{const last=records().at(-1);if(!last)return;last.deleted=true;redoStack.push(last.id);persist();renderHome()};
$('redoBtn').onclick=()=>{const id=redoStack.pop(),r=active()?.records.find(x=>x.id===id);if(r){r.deleted=false;persist()}renderHome()};
function metric(content,label){return `<div class="stat"><strong>${esc(content)}</strong><small>${esc(label)}</small></div>`}
function distRows(sec){return ORDER.map(s=>{const n=sec.symbols[s],pro=sec.n?100*n/sec.n:0;return `<div class="grade-row"><span class="grade-symbol ${gradeClass(s)}">${s}</span><div class="grade-track"><div class="grade-fill ${gradeClass(s)}" style="width:${pro.toFixed(1)}%"></div></div><span class="grade-count">${n} · ${pct(n,sec.n)}</span></div>`}).join('')}
function zoneGrid(counts){const vals=['4','3','2','5','6','1'];const mx=Math.max(1,...Object.values(counts));return `<div class="zone-grid">${vals.map(z=>{const n=counts[z]||0,cl=n/mx>=.67?'hot':n/mx>=.33?'mid':'low';return `<div class="zone-cell ${cl}"><b>${z}</b><small>${n} azioni</small></div>`}).join('')}</div>`}
function summaryCards(sec){return `<div class="metric-grid">${sec.summary.main.map(([l,v])=>metric(v,l)).join('')}</div>`}
function setMatrix(r){const m=active();const sets=Array.from({length:m.set},(_,i)=>i+1);return `<div class="stat-section"><h3>Confronto tra set</h3><div class="score-timeline"><table class="set-table"><thead><tr><th>Set</th><th>Ric. positive</th><th>Ace</th><th>Att. punti</th><th>Eff. attacco</th></tr></thead><tbody>${sets.map(n=>{const d=dataFor(m,String(n)),re=d.sections.reception,se=d.sections.serve,at=d.sections.attack;return `<tr><td>${n}</td><td>${re.n?pct(re.symbols['#']+re.symbols['+'],re.n):'—'}</td><td>${se.outcomes.ace||0}</td><td>${at.outcomes.punto||0}</td><td>${at.n?pct((at.outcomes.punto||0)-(at.outcomes.errore||0)-(at.outcomes.murato||0),at.n):'—'}</td></tr>`}).join('')}</tbody></table></div></div>`}
function renderLegend(){return `<div class="sub"><b>Scala personalizzata, non codifica ufficiale DataVolley.</b> Sono cinque simboli, senza !. La posizione di alzata stimata è a circa 1,2 m dalla rete verso zona 2/3.</div>${Object.keys(TYPES).map(t=>`<p><b>${TYPES[t]}</b></p>${ORDER.map(s=>`<div class="kv"><span><span class="pill-grade">${s}</span> ${esc(NOTES[t][s])}</span></div>`).join('')}`).join('')}<p class="small">Ricezione: soglie indicative per Alta (1,2 / 2,5 / 4 m), Tesa (1,5 / 3 m) e Bassa (1,7 m). L’altezza è selezionata, non misurata. Attacco: Muro toccato = /, Difeso = -, Murato ed Errore = =; la statistica separa sempre le due cause. Battuta: Insidiosa e Vincente indiretta = +. Il voto può essere corretto per ogni azione nello storico.</p>`}
function historicalMatrix(){
  if(!store.matches.length)return '';
  const matches=store.matches.slice(0,12);
  return `<div class="stat-section"><h3>Confronto tra partite</h3><p class="small">Storico personale, fino alle ultime 12 partite salvate su questo dispositivo.</p><div class="score-timeline"><table class="set-table"><thead><tr><th>Partita</th><th>Azioni</th><th>Ric. positive</th><th>Att. eff.</th><th>Ace</th></tr></thead><tbody>${matches.map(m=>{
    const d=dataFor(m),re=d.sections.reception,at=d.sections.attack,se=d.sections.serve;
    const positive=re.n?pct(re.symbols['#']+re.symbols['+'],re.n):'—';
    const efficiency=at.n?pct((at.outcomes.punto||0)-(at.outcomes.errore||0)-(at.outcomes.murato||0),at.n):'—';
    return `<tr><td title="${esc(m.opponent)}">${esc(String(m.opponent).slice(0,16))}</td><td>${d.total}</td><td>${positive}</td><td>${efficiency}</td><td>${se.outcomes.ace||0}</td></tr>`;
  }).join('')}</tbody></table></div></div>`
}
function renderAnalytics(){const m=active();if(!m)return;const el=$('setFilter'),prev=el.value;el.innerHTML='<option value="all">Tutti i set</option>'+Array.from({length:m.set},(_,i)=>`<option value="${i+1}">Set ${i+1}</option>`).join('');el.value=Array.from(el.options).some(x=>x.value===prev)?prev:'all';drawAnalytics()}
function drawAnalytics(){const d=dataFor(active(),$('setFilter').value);let html=`<div class="stat-section"><h3>Panoramica</h3><div class="grid3">${metric(d.total,'Azioni totali')}${metric(records().filter(r=>ORDER.includes(r.symbolOverride)).length,'Voti corretti*')}${metric(active().set,'Set creati')}</div><p class="small">* Numero di voti corretti nell’intera partita. I simboli automatici delle ricezioni sono <b>stime</b> e non osservazioni certe.</p></div>`;
  for(const t of Object.keys(TYPES)){
    const sec=d.sections[t];html+=`<div class="stat-section"><h3>${TYPES[t]} <span class="under-title">· ${sec.n} azioni</span></h3>`;
    if(!sec.n){html+='<p class="sub">Nessuna azione registrata.</p></div>';continue}
    html+=summaryCards(sec)+'<h3>Distribuzione voti # + / - =</h3>'+distRows(sec)+'<h3 style="margin-top:20px">Esiti osservati</h3>';
    for(const [v,n] of Object.entries(sec.outcomes))html+=`<div class="kv"><span>${esc(nameOutcome({type:t,outcome:v}))}</span><b>${n} · ${pct(n,sec.n)}</b></div>`;
    const z=t==='reception'?sec.starts:sec.ends;html+=`<h3 style="margin-top:20px">${t==='reception'?'Zone di ricezione':'Zone di destinazione'}</h3>`+zoneGrid(z);
    if(z['Fuori campo'])html+=`<div class="small">Fuori campo: ${z['Fuori campo']} azioni.</div>`;
    if(t==='reception')html+='<p class="small">Indice ricezione 0–3: # = 3, + = 2, / = 1, - e = = 0. Indicatore personalizzato e orientativo.</p>';
    if(t==='attack')html+='<p class="small">Efficienza: (punti - errori - muri punto subiti) / attacchi. Il muro toccato ma rigiocato non è un errore.</p>';
    html+='</div>';
  }
  html+=setMatrix(d.records)+historicalMatrix();$('analyticsContent').innerHTML=html;
}
$('setFilter').onchange=drawAnalytics;
$('showLegend').onclick=()=>{$('legendContent').innerHTML=renderLegend();$('legendContent').classList.toggle('hidden');$('showLegend').textContent=$('legendContent').classList.contains('hidden')?'Vedi legenda e regole':'Nascondi legenda'};
function afterArchiveMutation(affectedMatchId){
  if(store.active===affectedMatchId)redoStack=[];
  if(!store.matches.some(m=>m.id===store.active)){store.active=store.matches[0]?.id||null;redoStack=[];}
  persist();
  if(active())switchView('history');else switchView('setup');
}
function resetSet(matchId,setNumber){
  const m=store.matches.find(x=>x.id===matchId);if(!m)return;
  const n=records(m).filter(a=>Number(a.set)===setNumber).length;
  confirmAction('Svuotare il set '+setNumber+'?',
    'Partita: '+m.opponent+'. Verranno eliminate '+n+' azioni dal set '+setNumber+'. Il set rimarrà nell’archivio, ma vuoto. La cancellazione è definitiva senza un backup JSON.',
    'Svuota set',()=>{
      const target=store.matches.find(x=>x.id===matchId);if(!target)return;
      target.records=(target.records||[]).filter(a=>Number(a.set)!==setNumber);
      afterArchiveMutation(matchId);
    },true);
}
function deleteSet(matchId,setNumber){
  const m=store.matches.find(x=>x.id===matchId);if(!m||Number(m.set)<=1)return;
  const n=records(m).filter(a=>Number(a.set)===setNumber).length;
  confirmAction('Eliminare il set '+setNumber+'?',
    'Partita: '+m.opponent+'. Il set '+setNumber+' e le sue '+n+' azioni saranno eliminati. I set successivi scaleranno di numero. La cancellazione è definitiva senza un backup JSON.',
    'Elimina set',()=>{
      const target=store.matches.find(x=>x.id===matchId);if(!target||Number(target.set)<=1)return;
      target.records=(target.records||[]).filter(a=>Number(a.set)!==setNumber);
      target.records.forEach(a=>{if(Number(a.set)>setNumber)a.set=Number(a.set)-1});
      target.set=Math.max(1,Number(target.set)-1);
      afterArchiveMutation(matchId);
    },true);
}
function resetMatch(matchId){
  const m=store.matches.find(x=>x.id===matchId);if(!m)return;
  const n=records(m).length;
  confirmAction('Resettare questa partita?',
    'Partita: '+m.opponent+' del '+m.date+'. Verranno eliminate tutte le '+n+' azioni e i set creati. La partita resterà disponibile come nuova (Set 1). Operazione definitiva senza backup JSON.',
    'Resetta partita',()=>{
      const target=store.matches.find(x=>x.id===matchId);if(!target)return;
      target.records=[];target.set=1;target.finished=false;
      afterArchiveMutation(matchId);
    },true);
}
function deleteMatch(matchId){
  const m=store.matches.find(x=>x.id===matchId);if(!m)return;
  confirmAction('Eliminare tutta la partita?',
    'Partita: '+m.opponent+' del '+m.date+'. Verranno eliminati definitivamente la partita, tutti i suoi set e '+records(m).length+' azioni. Per recuperare i dati servirà un backup JSON precedente.',
    'Elimina partita',()=>{
      store.matches=store.matches.filter(x=>x.id!==matchId);
      if(archiveExpandedId===matchId)archiveExpandedId=null;
      afterArchiveMutation(matchId);
    },true);
}
function archiveButton(label,className,fn,disabled=false){
  const b=document.createElement('button');b.type='button';b.textContent=label;b.className=className;b.disabled=disabled;b.onclick=fn;return b;
}
function renderHistory(){
  const mActive=active(),r=records(mActive).slice().reverse(),list=$('recordList');list.replaceChildren();
  if(!r.length)list.innerHTML='<p class="sub">Nessuna azione registrata in questa partita.</p>';
  for(const a of r){
    const d=document.createElement('div');d.className='record';const detail=document.createElement('div');detail.className='record-main';const sc=rating(a);
    detail.innerHTML=`<div class="record-title"><b>${esc(TYPES[a.type])}</b> · <span class="pill-grade ${gradeClass(sc.s)}" title="${sc.manual?'Corretto':'Automatico'}">${sc.s}</span> ${esc(nameOutcome(a))}</div><div class="record-meta">Set ${a.set} · ${esc(a.startZone||zone(a.start))} → ${esc(a.endZone||zone(a.end))} · ${sc.manual?'Voto corretto':'Auto'}</div>`;
    const b=archiveButton('Modifica','muted',()=>openEdit(a.id),!!mActive?.finished);d.append(detail,b);list.append(d);
  }
  const past=$('pastMatches');past.replaceChildren();
  if(!store.matches.length){past.innerHTML='<p class="sub">L’archivio è vuoto. Crea una nuova partita per iniziare.</p>';return}
  for(const m of store.matches){
    const card=document.createElement('div');card.className='archive-card'+(m.id===store.active?' current':'');
    const title=document.createElement('div');title.className='archive-name';title.textContent=m.opponent;
    const meta=document.createElement('div');meta.className='archive-meta';meta.textContent=m.date+' · '+records(m).length+' azioni · '+m.set+' set · '+(m.finished?'Terminata':'In corso')+(m.id===store.active?' · ATTIVA':'');
    const actions=document.createElement('div');actions.className='archive-tools';
    actions.append(
      archiveButton(m.id===store.active?'Partita attiva':'Apri partita','muted',()=>{store.active=m.id;redoStack=[];persist();switchView('home')},m.id===store.active),
      archiveButton(archiveExpandedId===m.id?'Chiudi gestione':'⚙ Gestisci','primary',()=>{archiveExpandedId=archiveExpandedId===m.id?null:m.id;renderHistory()})
    );
    card.append(title,meta,actions);
    if(archiveExpandedId===m.id){
      const details=document.createElement('div');details.className='archive-details';
      const tip=document.createElement('div');tip.className='archive-tip';tip.textContent='Svuota = elimina le azioni, ma mantiene il set. Elimina = rimuove il set e rinumera i successivi.';details.append(tip);
      const sets=Math.max(1,Number(m.set)||1);
      for(let n=1;n<=sets;n++){
        const row=document.createElement('div');row.className='archive-set';
        const header=document.createElement('div');header.className='archive-set-header';
        const label=document.createElement('strong');label.textContent='Set '+n;
        const count=document.createElement('span');count.className='archive-set-count';count.textContent=records(m).filter(a=>Number(a.set)===n).length+' azioni';
        header.append(label,count);
        const controls=document.createElement('div');controls.className='archive-set-tools';
        controls.append(
          archiveButton('↻ Svuota set','archive-warning',()=>resetSet(m.id,n)),
          archiveButton('🗑 Elimina set','archive-danger',()=>deleteSet(m.id,n),sets===1)
        );row.append(header,controls);details.append(row);
      }
      const all=document.createElement('div');all.className='archive-tools';
      all.append(
        archiveButton('↻ Resetta partita','archive-warning',()=>resetMatch(m.id)),
        archiveButton('🗑 Elimina partita','archive-danger',()=>deleteMatch(m.id))
      );details.append(all);
      const backup=document.createElement('p');backup.className='archive-backup-hint';backup.textContent='Consiglio: usa «Backup JSON» prima di cancellare. I dati eliminati non si recuperano con Annulla.';
      details.append(backup);card.append(details);
    }
    past.append(card);
  }
}
function openEdit(id){const a=active()?.records.find(x=>x.id===id);if(!a)return;editId=id;$('editSummary').textContent=`${TYPES[a.type]} · Set ${a.set} · ${a.startZone||zone(a.start)} → ${a.endZone||zone(a.end)}`;let opts=OPTIONS[a.type].slice();if(a.type==='reception')opts.push(['errore_oltre_rete','Errore oltre rete']);$('editOutcome').innerHTML=opts.map(([v,n])=>`<option value="${v}">${esc(n)}</option>`).join('');$('editOutcome').value=a.outcome;
  $('editSymbol').innerHTML='<option value="">Automatico (consigliato)</option>'+ORDER.map(s=>`<option value="${s}">${s} — ${esc(NOTES[a.type][s])}</option>`).join('');$('editSymbol').value=a.symbolOverride||'';
  function updatePreview(){const tmp={...a,outcome:$('editOutcome').value};const calc=ratingAuto(tmp);$('editAutoHint').textContent='Voto automatico: '+calc.s+' · '+calc.why}updatePreview();$('editOutcome').onchange=updatePreview;
  $('editDialog').showModal()}
$('saveEdit').onclick=()=>{const a=active()?.records.find(r=>r.id===editId);if(a){a.outcome=$('editOutcome').value;const o=$('editSymbol').value;if(ORDER.includes(o))a.symbolOverride=o;else delete a.symbolOverride;persist();renderHistory()}$('editDialog').close()};
$('deleteEdit').onclick=()=>{const id=editId;$('editDialog').close();confirmAction('Eliminare questa azione?','La registrazione non comparirà nelle statistiche.','Elimina',()=>{const a=active()?.records.find(r=>r.id===id);if(a){a.deleted=true;persist();renderHistory()}})};
$('closeEdit').onclick=()=>$('editDialog').close();
function downloadBlob(blob,name){const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),30000)}
function pdfExport(scope){const m=active();if(!m)return alert('Non ci sono partite da esportare.');try{if(!window.VolleyPdf)throw new Error('Modulo PDF non disponibile');const filter=scope||'all',report=dataFor(m,filter);const file=window.VolleyPdf.generate({match:m,report,filter,types:TYPES,options:OPTIONS,order:ORDER,pct,rating,nameOutcome});const label=String(m.opponent).normalize('NFKD').replace(/[^a-zA-Z0-9_-]/g,'-').replace(/-+/g,'-').slice(0,40)||'partita';downloadBlob(new Blob([file],{type:'application/pdf'}),'scout-'+label+'-'+m.date+(filter==='all'?'':'-set-'+filter)+'.pdf')}catch(e){console.error(e);alert('Errore nell’esportazione PDF: '+e.message)}}
$('exportPdf').onclick=()=>pdfExport($('setFilter').value);
$('exportPdfSettings').onclick=()=>{if(!active())return alert('Nessuna partita salvata.');$('settings').close();pdfExport('all')};
$('settingsBtn').onclick=()=>$('settings').showModal();$('closeSettings').onclick=()=>$('settings').close();
$('exportBtn').onclick=()=>downloadBlob(new Blob([JSON.stringify(store,null,2)],{type:'application/json'}),'scout-volley-backup-'+today()+'.json');
$('archiveBackup').onclick=()=> $('exportBtn').click();
$('importBtn').onclick=()=>$('importFile').click();
$('importFile').onchange=async e=>{const f=e.target.files?.[0];if(!f)return;try{const x=JSON.parse(await f.text());if(!Array.isArray(x.matches))throw new Error('invalid JSON');$('settings').close();confirmAction('Importare il backup?','L’archivio importato sostituirà tutte le partite su questo dispositivo.','Importa',()=>{store=x;redoStack=[];persist();switchView(active()?'home':'setup')})}catch{alert('Questo file non è un backup JSON valido.')}e.target.value=''};
document.querySelectorAll('[data-tab]').forEach(b=>b.onclick=()=>switchView(b.dataset.tab));
setZones();$('matchDate').value=today();if(active())switchView('home');else switchView('setup');$('startBtn').disabled=false;$('bootWarning').classList.add('hidden');$('bootReady').classList.remove('hidden');
if('serviceWorker' in navigator && /^https?:/.test(location.protocol))navigator.serviceWorker.register('./sw.js').catch(()=>{});
})();
