import {randomUUID} from 'node:crypto';
import {avgCost} from './domain.mjs';
import {createBackupStore} from './backups.mjs';
const companyId='7ef25e57-b73f-462e-a757-8e4640867969';
const canonicalId='traza5-item-18',duplicateId='9eae1ebe-80b5-4638-8558-3378ba11769b';
const operation='betel_cheese_merged';
export function mergeBetelCheese(db,createBackup){
 if(db.prepare('SELECT id FROM audit WHERE company_id=? AND operation=?').get(companyId,operation))return {changed:false,companyId};
 const company=db.prepare('SELECT * FROM companies WHERE id=?').get(companyId);
 if(!company||company.name.toLowerCase()!=='pizzas betel')throw Error('Empresa Betel incompatible para unificar queso.');
 const state=JSON.parse(company.state),canonical=state.items.find(i=>i.id===canonicalId),duplicate=state.items.find(i=>i.id===duplicateId);
 for(const it of [canonical,duplicate])if(!it||it.name.toLowerCase()!=='queso muzzarella'||it.kind!=='raw'||it.unit!=='kg')throw Error('Los dos quesos requieren revisión antes de unificarse.');
 if(state.recipes.some(r=>r.components?.some(c=>c.itemId===canonicalId)&&r.components?.some(c=>c.itemId===duplicateId)))throw Error('Una receta contiene ambos quesos; requiere revisar la suma antes de unificar.');
 const collections=['lots','purchases','productions','trials','sales','adjustments','transfers','recipes'];
 const withoutMaterialRefs=value=>JSON.stringify(value,(key,val)=>['itemId','secondaryItemId'].includes(key)?null:val);
 const retained=Object.fromEntries(collections.map(key=>[key,withoutMaterialRefs(state[key])]));
 const backup=createBackup();if(!backup?.name)throw Error('Falta respaldo confirmado para unificar queso.');
 const balance=id=>state.lots.filter(l=>l.itemId===id&&l.remaining>0).reduce((sum,l)=>sum+Number(l.remaining),0);
 const oldQty=balance(canonicalId),newQty=balance(duplicateId),combinedCost=oldQty+newQty?(oldQty*avgCost(state,canonicalId)+newQty*avgCost(state,duplicateId))/(oldQty+newQty):0;
 const references=[];
 function remap(node,path=[]){if(!node||typeof node!=='object')return;for(const [key,value] of Object.entries(node)){if(['itemId','secondaryItemId'].includes(key)&&value===duplicateId){references.push({path:[...path,key],before:value,after:canonicalId});node[key]=canonicalId}else if(typeof value==='object')remap(value,[...path,key]);}}
 remap(state);
 duplicate.archived=true;duplicate.mergedInto=canonicalId;
 canonical.supplierIds=[...new Set([...(canonical.supplierIds||[canonical.supplierId]),...(duplicate.supplierIds||[duplicate.supplierId])].filter(Boolean))];
 state.averages??={};state.averages[canonicalId]=combinedCost;
 for(const key of collections)if(withoutMaterialRefs(state[key])!==retained[key])throw Error('La unificación alteró registros de '+key+'.');
 // Keep every record, lot code, quantity, price, status and origin. Only material references are joined.
 db.exec('BEGIN IMMEDIATE');
 try{
  const result=db.prepare('UPDATE companies SET state=?,version=version+1 WHERE id=? AND version=?').run(JSON.stringify(state),companyId,company.version);
  if(result.changes!==1)throw Error('La empresa cambió durante el respaldo del queso.');
  const detail={canonicalId,duplicateId,backup:backup.name,previousCanonicalQty:oldQty,previousDuplicateQty:newQty,combinedQty:oldQty+newQty,combinedAverageCost:combinedCost,references,reason:'El usuario confirmó que ambos quesos son el mismo artículo y pidió combinarlos',allRecordsRetained:true};
  db.prepare('INSERT INTO audit VALUES(?,?,?,?,?,?)').run(randomUUID(),new Date().toISOString(),'system',companyId,operation,JSON.stringify(detail));
  db.exec('COMMIT');return {changed:true,companyId,...detail};
 }catch(e){db.exec('ROLLBACK');throw e}
}
export function mergeProductionCheese(db){const backups=createBackupStore(db,'/data/backups');return mergeBetelCheese(db,()=>backups.create('antes-unificar-queso'));}
