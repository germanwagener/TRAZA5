(()=>{
 'use strict';
 const ready=new WeakSet(),MIN=48;
 const read=key=>{try{return JSON.parse(localStorage.getItem(key))}catch{return null}};
 const write=(key,value)=>{try{localStorage.setItem(key,JSON.stringify(value))}catch{}};
 function enhance(table){
  if(ready.has(table)||!table.tHead?.rows[0]||!table.closest('.table-wrap'))return;
  ready.add(table);
  const wrap=table.closest('.table-wrap'),heads=[...table.tHead.rows[0].cells],labels=heads.map(h=>h.textContent.trim()),count=heads.length;
  if(!count)return;
  const key='traza-columns-v1:'+JSON.stringify(labels),saved=read(key);
  let order=Array.from({length:count},(_,i)=>i),widths=[],manual=false;
  if(saved&&Array.isArray(saved.order)&&saved.order.length===count&&new Set(saved.order).size===count&&saved.order.every(i=>Number.isInteger(i)&&i>=0&&i<count))order=saved.order;
  if(saved&&Array.isArray(saved.widths)&&saved.widths.length===count&&saved.widths.every(w=>Number.isFinite(w)&&w>=MIN&&w<=3000)){widths=saved.widths;manual=true;}
  const group=document.createElement('colgroup'),cols=heads.map(()=>document.createElement('col'));
  cols.forEach(c=>group.append(c));table.prepend(group);table.classList.add('adjustable-table');
  const tools=document.createElement('div');tools.className='table-layout-tools no-print';
  const fit=document.createElement('button');fit.type='button';fit.className='secondary';fit.textContent='Ajustar al ancho';
  const reset=document.createElement('button');reset.type='button';reset.className='secondary';reset.textContent='Restablecer columnas';
  const hint=document.createElement('span');hint.textContent='Arrastrá el borde para cambiar el ancho o el tirador para mover una columna.';
  tools.append(fit,reset,hint);
  const top=document.createElement('div');top.className='table-scroll-top no-print';top.tabIndex=0;top.setAttribute('role','region');top.setAttribute('aria-label','Desplazamiento horizontal de la tabla');
  const track=document.createElement('div');top.append(track);wrap.before(tools,top);
  const persist=()=>write(key,{order,widths:manual?widths:null});
  const sync=()=>{if(!table.isConnected)return;top.style.width=wrap.clientWidth+'px';track.style.width=Math.max(table.scrollWidth,wrap.clientWidth)+'px';top.scrollLeft=wrap.scrollLeft;};
  top.addEventListener('scroll',()=>{if(Math.abs(wrap.scrollLeft-top.scrollLeft)>1)wrap.scrollLeft=top.scrollLeft});
  wrap.addEventListener('scroll',()=>{if(Math.abs(top.scrollLeft-wrap.scrollLeft)>1)top.scrollLeft=wrap.scrollLeft});
  function applyWidths(){cols.forEach((c,i)=>c.style.width=widths[i]+'px');table.style.width=widths.reduce((a,b)=>a+b,0)+'px';requestAnimationFrame(sync);}
  function fitWidth(){const available=Math.max(MIN*count,wrap.clientWidth),weights=labels.map(s=>/nombre|producto|artículo|ingrediente|domicilio|observaci|component|detalle/i.test(s)?2:/código|unidad|estado|cantidad|versión/i.test(s)?.8:1),sum=weights.reduce((a,b)=>a+b,0),spare=available-MIN*count;widths=weights.map(w=>MIN+spare*w/sum);applyWidths();}
  function applyOrder(){for(const row of table.rows){if(row.cells.length!==count)continue;const cells=[...row.cells];if(!cells.every(c=>c.dataset.layoutColumn!==undefined))cells.forEach((c,i)=>c.dataset.layoutColumn=i);const indexed=new Map(cells.map(c=>[Number(c.dataset.layoutColumn),c]));order.forEach(i=>row.append(indexed.get(i)));}order.forEach(i=>group.append(cols[i]));}
  function move(from,to){const at=order.indexOf(from),target=order.indexOf(to);if(at<0||target<0||at===target)return;order.splice(at,1);order.splice(target,0,from);applyOrder();persist();}
  let dragged=null;
  heads.forEach((head,i)=>{
   const grip=document.createElement('button');grip.type='button';grip.className='column-grip no-print';grip.draggable=true;grip.setAttribute('aria-label','Mover columna '+labels[i]);grip.title='Arrastrar para mover. Alt + flechas para mover con teclado.';
   grip.addEventListener('dragstart',e=>{dragged=i;e.dataTransfer.effectAllowed='move';e.dataTransfer.setData('text/plain',String(i));head.classList.add('column-dragging')});
   grip.addEventListener('dragend',()=>{dragged=null;heads.forEach(h=>h.classList.remove('column-dragging','column-drop'))});
   head.addEventListener('dragover',e=>{if(dragged===null)return;e.preventDefault();e.dataTransfer.dropEffect='move';head.classList.add('column-drop')});
   head.addEventListener('dragleave',()=>head.classList.remove('column-drop'));
   head.addEventListener('drop',e=>{if(dragged===null)return;e.preventDefault();move(dragged,i);heads.forEach(h=>h.classList.remove('column-drop'))});
   grip.addEventListener('keydown',e=>{if(!e.altKey||!['ArrowLeft','ArrowRight'].includes(e.key))return;e.preventDefault();const next=order.indexOf(i)+(e.key==='ArrowRight'?1:-1);if(next>=0&&next<count){move(i,order[next]);grip.focus()}});
   const handle=document.createElement('span');handle.className='column-resizer no-print';handle.tabIndex=0;handle.setAttribute('role','separator');handle.setAttribute('aria-orientation','vertical');handle.setAttribute('aria-label','Ancho de '+labels[i]);handle.title='Arrastrá para ajustar el ancho';
   handle.addEventListener('pointerdown',e=>{if(e.button!==0)return;e.preventDefault();e.stopPropagation();handle.setPointerCapture(e.pointerId);manual=true;const start=e.clientX,initial=widths[i];document.body.classList.add('resizing-columns');const update=ev=>{widths[i]=Math.max(MIN,Math.min(3000,initial+ev.clientX-start));applyWidths()};const end=()=>{handle.removeEventListener('pointermove',update);handle.removeEventListener('pointerup',end);handle.removeEventListener('pointercancel',end);document.body.classList.remove('resizing-columns');persist()};handle.addEventListener('pointermove',update);handle.addEventListener('pointerup',end);handle.addEventListener('pointercancel',end)});
   handle.addEventListener('keydown',e=>{if(!['ArrowLeft','ArrowRight'].includes(e.key))return;e.preventDefault();manual=true;widths[i]=Math.max(MIN,Math.min(3000,widths[i]+(e.key==='ArrowRight'?10:-10)));applyWidths();persist()});
   head.prepend(grip);head.append(handle);
  });
  fit.onclick=()=>{manual=false;fitWidth();persist()};
  reset.onclick=()=>{manual=false;order=Array.from({length:count},(_,i)=>i);applyOrder();fitWidth();persist()};
  applyOrder();if(manual)applyWidths();else fitWidth();
  const observer=new ResizeObserver(()=>{if(!table.isConnected){observer.disconnect();return}if(!manual)fitWidth();else sync()});observer.observe(wrap);
 }
 function scan(){document.querySelectorAll('.table-wrap table').forEach(enhance)}
 new MutationObserver(scan).observe(document.body,{childList:true,subtree:true});scan();
})();
