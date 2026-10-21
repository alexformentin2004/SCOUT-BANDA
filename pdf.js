/* Minimal, fully offline PDF report generator. No browser print preview or external network required. */
window.VolleyPdf = (()=>{
'use strict';
const W=595.28,H=841.89,M=43,R=W-43;
function latin(str){return String(str??'').replace(/→/g,'->').replace(/[–—−]/g,'-').replace(/≥/g,'>=').replace(/≤/g,'<=').replace(/’/g,"'").replace(/•/g,'-').replace(/×/g,'x').replace(/…/g,'...').replace(/€/g,'EUR').replace(/[\u0100-\uffff]/g,ch=>{let n=ch.normalize('NFD').replace(/[\u0300-\u036f]/g,'');return /^[\x20-\xff]$/.test(n)?n:'?'})}
function escapePdf(s){return latin(s).replace(/\\/g,'\\\\').replace(/\(/g,'\\(').replace(/\)/g,'\\)')}
function hex(rgb){return rgb.map(x=>(x/255).toFixed(3)).join(' ')}
const COLORS={ink:[20,42,68],blue:[38,113,185],teal:[20,133,111],muted:[104,123,145],line:[225,232,238],white:[255,255,255],soft:[242,247,251],light:[220,237,251],rose:[180,55,82]};
function bytes(s){const out=new Uint8Array(s.length);for(let i=0;i<s.length;i++)out[i]=s.charCodeAt(i)&255;return out}
function encodePdf(objects){const offsets=[0], parts=['%PDF-1.4\n%\xE2\xE3\xCF\xD3\n'];let total=bytes(parts[0]).length;
  for(let i=0;i<objects.length;i++){offsets.push(total);const o=`${i+1} 0 obj\n${objects[i]}\nendobj\n`;parts.push(o);total+=bytes(o).length}
  let xref=`xref\n0 ${objects.length+1}\n0000000000 65535 f \n`;for(let i=1;i<offsets.length;i++)xref+=String(offsets[i]).padStart(10,'0')+' 00000 n \n';xref+=`trailer\n<< /Root 1 0 R /Size ${objects.length+1} >>\nstartxref\n${total}\n%%EOF`;
  parts.push(xref);const output=new Uint8Array(total+bytes(xref).length);let p=0;for(const s of parts){const b=bytes(s);output.set(b,p);p+=b.length}return output;
}
function generate({match,report,filter,types,order,pct,rating,nameOutcome}){
  const pages=[];let pg=null,y=0;
  function page(){pg={commands:[]};pages.push(pg);y=72;rect(0,0,W,10,COLORS.ink);text(M,31,'SCOUT PERSONALE   /   REPORT PARTITA',10,true,COLORS.blue);rule(43,40,R,40,COLORS.line)}
  function text(x,top,content,size=10,bold=false,color=COLORS.ink){pg.commands.push(`${hex(color)} rg BT /${bold?'F2':'F1'} ${size} Tf 1 0 0 1 ${x.toFixed(1)} ${(H-top).toFixed(1)} Tm (${escapePdf(content)}) Tj ET`)}
  function rect(x,top,w,h,color){pg.commands.push(`${hex(color)} rg ${x.toFixed(1)} ${(H-top-h).toFixed(1)} ${w.toFixed(1)} ${h.toFixed(1)} re f`)}
  function rule(x1,top1,x2,top2,color=COLORS.line){pg.commands.push(`${hex(color)} RG 0.75 w ${x1.toFixed(1)} ${(H-top1).toFixed(1)} m ${x2.toFixed(1)} ${(H-top2).toFixed(1)} l S`)}
  function room(height){if(y+height>790)page()}
  function wrapWords(str,maxChars){const out=[];let s='';for(const w of latin(str).split(/\s+/)){if(s.length+w.length+1>maxChars){if(s)out.push(s);s=w}else s+=(s?' ':'')+w}if(s)out.push(s);return out}
  function paragraph(content,max=94,size=9){for(const line of wrapWords(content,max)){room(15);text(M,y,line,size,false,COLORS.muted);y+=13}}
  function title(content){room(35);text(M,y,content,15,true);y+=24;rule(M,y,R,y);y+=15}
  function sub(content){room(25);text(M,y,content,11,true,COLORS.blue);y+=18}
  function cols(rows){for(const [a,b]of rows){room(22);text(M+4,y,a,10);text(355,y,String(b),10,true);y+=18;rule(M,y-6,R,y-6)}}
  function grade(sec){sub('VALUTAZIONI  # + / - =');for(const s of order){room(24);const n=sec.symbols[s],f=sec.n?n/sec.n:0;text(M,y+1,s,12,true,COLORS.blue);rect(M+37,y-8,345,12,COLORS.soft);if(n)rect(M+37,y-8,345*f,12,s==='='?COLORS.rose:COLORS.blue);text(R-86,y+1,`${n}  |  ${pct(n,sec.n)}`,9,false,COLORS.muted);y+=24}}
  function kpis(sec){const c=sec.summary.main,cardW=(R-M-12)/2,cardH=57;for(let i=0;i<c.length;i++){const col=i%2,rr=Math.floor(i/2),top=y+rr*(cardH+9);room((rr+1)*(cardH+9));rect(M+col*(cardW+12),top,cardW,cardH,COLORS.soft);text(M+col*(cardW+12)+11,top+24,String(c[i][1]),18,true,COLORS.ink);const label=latin(c[i][0]);text(M+col*(cardW+12)+11,top+43,label.length>30?label.slice(0,29)+'...':label,8,false,COLORS.muted)}y+=2*(cardH+9)+7}
  function lines(sec){sub('ESITI OSSERVATI');const rows=Object.entries(sec.outcomes).sort((a,b)=>b[1]-a[1]);for(const [k,n]of rows){room(18);const nm=nameOutcome({type:sec.type,outcome:k});text(M+3,y,nm,9);text(R-98,y,`${n}  (${pct(n,sec.n)})`,9,true,COLORS.ink);y+=16;rule(M,y-6,R,y-6)}}
  function zones(sec){sub(sec.type==='reception'?'ZONE DI PARTENZA DELLA RICEZIONE':'ZONE DI ARRIVO DELLA PALLA');let cc=sec.type==='reception'?sec.starts:sec.ends;const zz=['4','3','2','5','6','1'];let mx=Math.max(1,...Object.values(cc));const cw=(R-M-12)/3;for(let i=0;i<6;i++){const top=y+Math.floor(i/3)*45,x=M+(i%3)*(cw+6),n=cc[zz[i]]||0;rect(x,top,cw,40,n/mx>=.67?COLORS.light:COLORS.soft);text(x+11,top+23,'Z'+zz[i],12,true);text(x+45,top+23,String(n)+' azioni',9,false,COLORS.muted)}y+=102;const other=cc['Fuori campo']||0;if(other){text(M,y-4,'Fuori campo: '+other,9,false,COLORS.muted);y+=11}}
  page();text(M,y,'Riepilogo partita',22,true);y+=31;
  paragraph('Avversari: '+match.opponent+'  |  Data: '+match.date+'  |  '+(filter==='all'?'Tutti i set':'Set '+filter)+'  |  '+report.total+' azioni',83,10);y+=14;
  text(M,y,'Totali',12,true,COLORS.blue);y+=23;
  const overall=Object.keys(types).map(k=>[types[k],report.sections[k].n]);cols([...overall,['Azioni registrate',report.total]]);y+=16;
  for(const k of ['reception','serve','attack']){
    const sec=report.sections[k];room(80);title(types[k]+'   -   '+sec.n+' azioni');if(!sec.n){paragraph('Nessuna azione scoutizzata.');y+=14;continue}
    kpis(sec);grade(sec);lines(sec);y+=12;zones(sec);y+=20;
  }
  if(filter==='all'){
    title('Confronto tra set');
    const header=['SET','RIC. +/#','ACE','ATT. PT','EFF. ATT.'];
    let x=[M+3,M+92,M+220,M+306,M+402];room(22);rect(M,y-14,R-M,26,COLORS.ink);header.forEach((v,i)=>text(x[i],y+3,v,9,true,COLORS.white));y+=28;
    for(let i=1;i<=match.set;i++){
      room(22);const v=report.records.filter(r=>r.set===i),rec=v.filter(r=>r.type==='reception'),ser=v.filter(r=>r.type==='serve'),atk=v.filter(r=>r.type==='attack');
      const pos=rec.filter(r=>['#','+'].includes(rating(r).s)).length,aces=ser.filter(r=>r.outcome==='ace').length,kills=atk.filter(r=>r.outcome==='punto').length,errs=atk.filter(r=>r.outcome==='errore'||r.outcome==='murato').length;
      [String(i),rec.length?pct(pos,rec.length):'-',String(aces),String(kills),atk.length?pct(kills-errs,atk.length):'-'].forEach((t,j)=>text(x[j],y,t,9,j===0));y+=22;rule(M,y-8,R,y-8)
    }y+=18;
  }
  // Keep the action log and methodology together when the current page is almost full.
  room(Math.min(560,165+report.records.length*20));
  title('Registro completo delle azioni');
  paragraph('Le azioni vengono riportate nell ordine in cui sono state registrate, comprese le valutazioni modificate manualmente.');y+=8;
  const colsLog=[M,M+40,M+135,M+209,M+275,M+395];
  function logHeader(){room(25);rect(M,y-14,R-M,26,COLORS.ink);['SET','FONDAMENTO','VOTO','DA','A','ESITO'].forEach((s,i)=>text(colsLog[i]+3,y+3,s,8,true,COLORS.white));y+=28}
  logHeader();
  for(const a of report.records){if(y+21>790){page();logHeader()}room(21);const t=types[a.type],from=a.startZone||'-',to=a.endZone||'-',isManual=rating(a).manual;const outcome=latin(nameOutcome(a));const str=[String(a.set),t,rating(a).s+(isManual?'*':''),from,to,outcome.length>24?outcome.slice(0,22)+'..':outcome];str.forEach((v,i)=>text(colsLog[i]+3,y,v,8,i===2));y+=20;rule(M,y-7,R,y-7)}
  y+=15;room(100);title('Note metodologiche');paragraph('Valutazioni su cinque simboli personalizzati (#, +, /, -, =). Non sono una trascrizione ufficiale DataVolley; non usano il simbolo !.');paragraph('Ricezione: il voto automatico e una stima basata su posizione finale e categoria Alta / Tesa / Bassa. Una ricezione direttamente oltre rete vale = secondo la regola concordata.');paragraph('Battuta: # ace; + insidiosa o vincente indiretta; - ricevuta normalmente; = errore. Attacco: # punto; / muro toccato con palla ancora in gioco; - difeso; = errore oppure muro punto avversario.');paragraph('Attacco efficienza = (punti - errori tecnici - muri punto subiti) / totale attacchi. I risultati reali sono ricavati dagli esiti registrati anche se il voto viene corretto.');paragraph('I simboli con asterisco nel registro sono stati modificati manualmente. Il PDF non modifica l archivio locale.');
  const total=pages.length;
  for(let i=0;i<total;i++){
    const p=pages[i],save=pg;pg=p;rule(M,807,R,807);text(M,823,'SCOUT PERSONALE  |  Report offline  |  '+match.date,8,false,COLORS.muted);text(R-54,823,`${i+1} / ${total}`,8,false,COLORS.muted);pg=save;
  }
  // Assemble a valid PDF with built-in fonts; stream lengths are byte lengths (WinAnsi text).
  const objects=[];const alloc=()=>{objects.push('');return objects.length};
  const cat=alloc(),pagesId=alloc(),font1=alloc(),font2=alloc();
  objects[font1-1]='<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>';
  objects[font2-1]='<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>';
  const ids=[];
  for(const p of pages){const content=p.commands.join('\n')+'\n',contentId=alloc(),pId=alloc();objects[contentId-1]=`<< /Length ${bytes(content).length} >>\nstream\n${content}endstream`;objects[pId-1]=`<< /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 ${W} ${H}] /Resources << /Font << /F1 ${font1} 0 R /F2 ${font2} 0 R >> >> /Contents ${contentId} 0 R >>`;ids.push(pId)}
  objects[pagesId-1]=`<< /Type /Pages /Kids [${ids.map(i=>i+' 0 R').join(' ')}] /Count ${ids.length} >>`;
  objects[cat-1]=`<< /Type /Catalog /Pages ${pagesId} 0 R >>`;
  return encodePdf(objects);
}
return {generate};
})();
