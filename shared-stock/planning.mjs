import {positive,get,needsLot} from './domain.mjs';
const validDate=d=>{if(!/^\d{4}-\d{2}-\d{2}$/.test(d)||Number.isNaN(Date.parse(d))||new Date(d).toISOString().slice(0,10)!==d)throw Error('Fecha inválida.');return d};
export function suggestLots(s,requirements,date,sector){
 validDate(date);const allocations=[],shortages=[];
 const totals=new Map();for(const r of requirements){const it=get(s.items,r.itemId);positive(r.qty);if(!needsLot(it))continue;totals.set(r.itemId,(totals.get(r.itemId)||0)+positive(r.qty));}
 for(const [itemId,qty] of totals){let pending=qty;
  const lots=s.lots.filter(l=>l.itemId===itemId&&l.remaining>0&&l.status==='LIBERADO'&&l.date<=date&&(!l.expiry||l.expiry>=date)).sort((a,b)=>a.date.localeCompare(b.date)||(a.expiry||'9999').localeCompare(b.expiry||'9999')||a.code.localeCompare(b.code));
  for(const l of lots){if(pending<=1e-8)break;const n=Math.min(l.remaining,pending);allocations.push({lotId:l.id,qty:n});pending-=n;}
  if(pending>1e-8)shortages.push({itemId,qty:pending});
 }return{allocations,shortages};
}
export function forecast(s,date){
 validDate(date);const end=Date.parse(date),start=end-29*86400000;
 const events=[...s.productions,...s.sales].filter(x=>Date.parse(x.date)>=start&&Date.parse(x.date)<=end);
 return s.items.filter(i=>!i.archived&&needsLot(i)).map(i=>{
  const usage=events.map(e=>({date:e.date,qty:e.inputs.filter(a=>a.itemId===i.id).reduce((n,a)=>n+a.qty,0)})).filter(x=>x.qty>0);
  const days=new Set(usage.map(x=>x.date)).size;
  const first=s.lots.filter(l=>l.itemId===i.id&&l.date<=date).map(l=>Date.parse(l.date)).sort((a,b)=>a-b)[0];
  const observedDays=first===undefined?0:Math.min(30,Math.floor((end-first)/86400000)+1);
  const stock=s.lots.filter(l=>l.itemId===i.id&&l.date<=date&&l.status==='LIBERADO'&&(!l.expiry||l.expiry>=date)).reduce((n,l)=>n+l.remaining,0);
  const enough=observedDays>=7&&days>=3,average=enough?usage.reduce((n,e)=>n+e.qty,0)/observedDays:null;
  return{itemId:i.id,stock,observedDays,consumptionDays:days,dailyAverage:average,coverageDays:average?Math.floor(stock/average):null,suggestedQty:average?Math.max(0,Math.ceil((average*7-stock)*1000)/1000):null};
 });
}
