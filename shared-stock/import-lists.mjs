import {operate} from './domain.mjs';
import {randomUUID} from 'node:crypto';
export const normalize=x=>String(x??'').normalize('NFD').replace(/\p{M}/gu,'').toLowerCase().replace(/[‐‑‒–—−]/g,'-').replace(/\s+/g,' ').trim();
const types={customers:{collection:'customers'},suppliers:{collection:'suppliers'},raw:{collection:'items',kind:'raw'},product:{collection:'items',kind:'product'}};
export function parseList(text,format) {
 if(typeof text!=='string'||text.length>1000000||text.includes('\0'))throw Error('Archivo inválido o demasiado grande.');
 if(format==='json'){
  let rows;try{rows=JSON.parse(text);}catch{throw Error('JSON inválido.');}
  if(!Array.isArray(rows))throw Error('JSON: se requiere una lista de nombres u objetos con name y unit.');
  return rows.map(r=>typeof r==='string'?{name:r}:{name:r?.name??r?.nombre??'',unit:r?.unit??r?.unidad??'',review:!!(r&&Object.keys(r).some(k=>!['name','nombre','unit','unidad'].includes(k)))});
 }
 if(!['txt','csv','tsv','pdf'].includes(format))throw Error('Formato no admitido.');
 const lines=text.replace(/^\uFEFF/,'').split(/\r?\n/).filter(x=>x.trim());
 if(format==='txt'||format==='pdf')return lines.map(name=>({name:name.trim(),review:format==='pdf'}));
 const delimiter=format==='tsv'?'\t':(lines[0]?.includes(';')?';':',');
 const split=line=>{const out=[];let value='',quoted=false;for(let i=0;i<line.length;i++){const c=line[i];if(c==='"'){if(quoted&&line[i+1]==='"'){value+='"';i++;}else quoted=!quoted;}else if(c===delimiter&&!quoted){out.push(value);value='';}else value+=c;}if(quoted)throw Error('CSV inválido: comillas sin cerrar.');out.push(value);return out;};
 let rows=lines.map(split);const header=rows[0]?.map(normalize)||[],hasHeader=['nombre','name'].includes(header[0]);
 const unitIndex=hasHeader?header.findIndex(x=>['unit','unidad'].includes(x)):1;
 if(hasHeader)rows=rows.slice(1);
 return rows.map(r=>({name:r[0]||'',unit:unitIndex>=0?r[unitIndex]||'':'',review:r.some((v,i)=>i!==0&&i!==unitIndex&&v.trim())}));
}
export function preview(state,type,input) {
 const spec=types[type];if(!spec)throw Error('Elegí clientes, proveedores, materias primas o productos.');
 if(!Array.isArray(input)||input.length<1||input.length>500)throw Error('La lista debe tener entre 1 y 500 filas.');
 const seen=new Set();
 return input.map((raw,index)=>{
  const name=typeof raw?.name==='string'?raw.name.trim():'',unit=typeof raw?.unit==='string'?raw.unit.trim():'',key=normalize(name);
  let error='';if(!name||name.length>200)error='Nombre obligatorio; máximo 200 caracteres.';
  const matches=state[spec.collection].filter(r=>normalize(r.name)===key);
  if(matches.some(r=>spec.kind&&r.kind!==spec.kind))error='Existe un artículo con este nombre y otro tipo.';
  const duplicate=matches.length>0||seen.has(key);seen.add(key);
  if(spec.kind&&!duplicate&&!['kg','g','l','ml','u','m','feta'].includes(unit))error='Falta una unidad válida.';
  const review=!!raw?.review;
  return{index,name,unit,review,error,duplicate,status:error?'error':duplicate?'duplicado':review?'revisar':'válido'};
 });
}
export function applyList(db,actor,selectedId,p) {
 if(actor.role!=='admin'||actor.username!=='juni')throw Error('Esta carga debe realizarse con la cuenta Juni.');
 if(!selectedId||p.companyId!==selectedId)throw Error('La empresa destino no coincide con la vista previa.');
 if(p.confirmed!==true)throw Error('Confirmá explícitamente la carga.');
 if(!/^[a-f0-9]{64}$/.test(p.fileHash||''))throw Error('Falta el resumen del archivo.');
 db.exec('BEGIN IMMEDIATE');
 try{
  const company=db.prepare('SELECT * FROM companies WHERE id=?').get(selectedId);
  if(!company||company.version!==p.version)throw Error('La empresa cambió. Volvé a revisar la vista previa.');
  const state=JSON.parse(company.state),rows=preview(state,p.type,p.rows),spec=types[p.type];
  if(rows.some(r=>r.error||r.review&&!r.duplicate))throw Error('Corregí los errores y marcá como revisadas todas las filas.');
  const operationId=randomUUID(),changes=[];
  for(const row of rows){if(row.duplicate)continue;const result=operate(state,'master',{collection:spec.collection,name:row.name,...(spec.kind?{kind:spec.kind,unit:row.unit}:{})});changes.push(result);}
  if(changes.length)db.prepare('UPDATE companies SET state=?,version=version+1 WHERE id=?').run(JSON.stringify(state),selectedId);
  const audit=(op,detail)=>db.prepare('INSERT INTO audit VALUES(?,?,?,?,?,?)').run(randomUUID(),new Date().toISOString(),actor.id,selectedId,op,JSON.stringify({operationId,...detail}));
  for(const change of changes)audit('admin_import_row',{collection:spec.collection,record:change});
  audit('admin_import_list',{type:p.type,fileHash:p.fileHash,created:changes.length,skipped:rows.length-changes.length});
  db.exec('COMMIT');return{created:changes.length,skipped:rows.length-changes.length,version:company.version+(changes.length?1:0)};
 }catch(e){db.exec('ROLLBACK');throw e;}
}
