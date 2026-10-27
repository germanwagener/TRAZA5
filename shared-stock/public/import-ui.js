const escapeHtml=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export async function openImport({companyId,companyName,api,refresh}) {
 const dialog=document.createElement('dialog');dialog.style.cssText='width:min(1100px,95vw);max-height:90vh;overflow:auto';
 dialog.innerHTML='<form method="dialog"><button style="float:right">Cancelar y cerrar</button></form><h2>Cargar archivo con Juni</h2><p><strong>Empresa destino: '+escapeHtml(companyName)+'</strong></p><p>Para elegir otra empresa, cancelá y elegí Editar en esa empresa. Esta pantalla solo importa nombres y unidades; no importa stock, precios, códigos, recetas ni otros atributos.</p><label>Tipo de lista <select id="import-type"><option value="customers">Clientes</option><option value="suppliers">Proveedores</option><option value="raw">Materias primas</option><option value="product">Productos terminados</option></select></label><p>PDF con texto, TXT (un nombre por línea), CSV/TSV (nombre, unidad) o JSON (lista de nombres u objetos con name y unit). Máximo 500 filas y 4 MB. Los PDF escaneados requieren transcripción; cada fila extraída de PDF debe revisarse.</p><input id="import-file" type="file" accept=".pdf,.txt,.csv,.tsv,.json"><button id="import-extract" type="button">Extraer y ver vista previa</button><p id="import-message" role="status"></p><section id="import-preview"></section>';
 document.body.append(dialog);dialog.showModal();let rows=[],version=null,fileHash='',type='';
 dialog.addEventListener('close',()=>dialog.remove());
 const q=s=>dialog.querySelector(s),message=t=>q('#import-message').textContent=t;
 const readRows=()=>Array.from(dialog.querySelectorAll('[data-import-row]')).map(tr=>({name:tr.querySelector('[data-name]').value,unit:tr.querySelector('[data-unit]').value,review:!tr.querySelector('[data-reviewed]').checked}));
 function draw(result){
  rows=result.rows;version=result.version;
  const errorCount=rows.filter(r=>r.error).length,duplicates=rows.filter(r=>r.duplicate).length,reviewCount=rows.filter(r=>r.review&&!r.duplicate).length;
  q('#import-preview').innerHTML='<h3>Vista previa editable · '+escapeHtml(result.companyName)+'</h3><p>'+rows.length+' filas · '+errorCount+' errores · '+duplicates+' duplicados que se omitirán · '+reviewCount+' pendientes de revisión.</p><p>Los duplicados se comparan por nombre sin distinguir mayúsculas, acentos o espacios repetidos. No se modifican registros existentes. No se conserva el archivo; la auditoría guarda su hash y los cambios.</p><div style="overflow:auto;max-height:45vh"><table><thead><tr><th>Nombre</th><th>Unidad (artículos)</th><th>Revisada</th><th>Estado</th><th></th></tr></thead><tbody>'+rows.map(r=>'<tr data-import-row><td><input data-name maxlength="200" value="'+escapeHtml(r.name)+'"></td><td><select data-unit>'+['','kg','g','l','ml','u','m','feta'].map(u=>'<option value="'+u+'" '+(r.unit===u?'selected':'')+'>'+escapeHtml(u||'Elegir')+'</option>').join('')+'</select></td><td><input data-reviewed type="checkbox" '+(!r.review?'checked':'')+'></td><td>'+escapeHtml(r.error||r.status)+'</td><td><button data-remove type="button">Quitar</button></td></tr>').join('')+'</tbody></table></div><button id="import-validate" type="button">Validar cambios</button><label><input id="import-confirm" type="checkbox"> Confirmo aplicar esta lista en '+escapeHtml(result.companyName)+'</label><button id="import-apply" type="button" disabled>Aplicar carga confirmada</button><button id="import-cancel" type="button">Cancelar sin guardar</button>';
  let valid=!errorCount&&!reviewCount;
  const update=()=>{q('#import-apply').disabled=!valid||!q('#import-confirm').checked;};
  dialog.querySelectorAll('[data-import-row] input,[data-import-row] select').forEach(el=>el.onchange=()=>{valid=false;update();message('Validá los cambios antes de confirmar.');});
  dialog.querySelectorAll('[data-remove]').forEach(el=>el.onclick=()=>{el.closest('tr').remove();valid=false;update();});
  q('#import-confirm').onchange=update;
  q('#import-cancel').onclick=()=>dialog.close();
  q('#import-validate').onclick=async()=>{try{const checked=await api('import/preview',{companyId,type,rows:readRows()});if(dialog.isConnected)draw(checked);}catch(e){message(e.message);}};
  q('#import-apply').onclick=async()=>{
   if(!valid||!q('#import-confirm').checked)return;
   q('#import-apply').disabled=true;
   try{const result=await api('import/apply',{companyId,type,rows:readRows(),version,fileHash,confirmed:true});dialog.close();await refresh();alert('Carga completada: '+result.created+' registros nuevos; '+result.skipped+' duplicados omitidos.');}
   catch(e){message(e.message);valid=false;update();}
  };
 }
 q('#import-type').onchange=()=>{q('#import-preview').innerHTML='';version=null;message('Volvé a extraer la lista con el nuevo tipo.');};
 q('#import-file').onchange=()=>{q('#import-preview').innerHTML='';version=null;};
 q('#import-extract').onclick=async()=>{
  const button=q('#import-extract');button.disabled=true;q('#import-preview').innerHTML='';
  try{
   const file=q('#import-file').files[0];if(!file||file.size>4*1024*1024)throw Error('Elegí un archivo válido de hasta 4 MB.');
   const format=file.name.split('.').pop().toLowerCase();if(!['pdf','txt','csv','tsv','json'].includes(format))throw Error('Formato no admitido.');
   const data=await file.arrayBuffer();fileHash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',data))).map(b=>b.toString(16).padStart(2,'0')).join('');
   let text;
   if(format==='pdf'){
    if(new TextDecoder().decode(data.slice(0,5))!=='%PDF-')throw Error('El archivo no es un PDF válido.');
    message('Extrayendo texto del PDF en este navegador…');
    const pdfjs=await import('/pdfjs/pdf.mjs');pdfjs.GlobalWorkerOptions.workerSrc='/pdfjs/pdf.worker.mjs';
    const task=pdfjs.getDocument({data:new Uint8Array(data),isEvalSupported:false,disableFontFace:true,useWorkerFetch:false});
    const pdf=await task.promise;
    try{if(pdf.numPages>50)throw Error('El PDF supera las 50 páginas.');const lines=[];for(let n=1;n<=pdf.numPages;n++){const content=await(await pdf.getPage(n)).getTextContent();let line='',lastY=null;for(const item of content.items){if(!('str' in item))continue;const y=item.transform?.[5];if(lastY!==null&&Math.abs(y-lastY)>3&&line.trim()){lines.push(line.trim());line='';}line+=(line?' ':'')+item.str;lastY=y;if(item.hasEOL){if(line.trim())lines.push(line.trim());line='';lastY=null;}}if(line.trim())lines.push(line.trim());}text=lines.join('\n');if(!text.trim())throw Error('El PDF no contiene texto extraíble. Transcribí la lista a TXT o CSV.');}finally{await task.destroy();}
   }else text=new TextDecoder('utf-8',{fatal:true}).decode(data);
   type=q('#import-type').value;const result=await api('import/preview',{companyId,type,text,format});
   if(dialog.isConnected){draw(result);message('Nada se guardó. Revisá filas, unidades, errores y duplicados antes de confirmar.');}
  }catch(e){message(e.message||'No se pudo leer el archivo.');}finally{button.disabled=false;}
 };
}
