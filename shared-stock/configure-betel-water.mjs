import {randomUUID,createHash} from 'node:crypto';
import {createBackupStore} from './backups.mjs';
const companyId='7ef25e57-b73f-462e-a757-8e4640867969';
const operation='betel_mains_water_configured';
export function configureBetelWater(db,createBackup){
 const company=db.prepare('SELECT * FROM companies WHERE id=?').get(companyId);
 if(!company)throw Error('No se encontró la empresa Betel esperada.');
 if(db.prepare('SELECT id FROM audit WHERE company_id=? AND operation=?').get(companyId,operation))return {changed:false,companyId};
 const before=JSON.parse(company.state),state=structuredClone(before),water=state.items.find(i=>i.id==='traza5-item-4');
 if(company.name.toLowerCase()!=='pizzas betel'||!water||water.name.toLowerCase()!=='agua'||water.kind!=='raw'||water.unit!=='l'||water.presentationName!=='red')throw Error('La configuración de agua de Betel requiere revisión.');
 const backup=createBackup();
 if(!backup?.name)throw Error('Falta respaldo confirmado.');
 water.supplyMode='mains';
 const check=structuredClone(state);if(before.items.find(i=>i.id===water.id).supplyMode===undefined)delete check.items.find(i=>i.id===water.id).supplyMode;else check.items.find(i=>i.id===water.id).supplyMode=before.items.find(i=>i.id===water.id).supplyMode;
 if(JSON.stringify(check)!==JSON.stringify(before))throw Error('La configuración alteró otros datos.');
 db.exec('BEGIN IMMEDIATE');
 try{
  const updated=db.prepare('UPDATE companies SET state=?,version=version+1 WHERE id=? AND version=?').run(JSON.stringify(state),companyId,company.version);
  if(updated.changes!==1)throw Error('La empresa cambió durante el respaldo.');
  const detail={itemId:water.id,supplyMode:'mains',reason:'Agua de red sin stock por lote, confirmado por el usuario',backup:backup.name,beforeHash:createHash('sha256').update(company.state).digest('hex'),onlyWaterConfigurationChanged:true};
  db.prepare('INSERT INTO audit VALUES(?,?,?,?,?,?)').run(randomUUID(),new Date().toISOString(),'system',companyId,operation,JSON.stringify(detail));
  db.exec('COMMIT');return {changed:true,companyId,...detail};
 }catch(e){db.exec('ROLLBACK');throw e}
}
export function configureProductionWater(db){
 const backups=createBackupStore(db,'/data/backups');
 return configureBetelWater(db,()=>backups.create('antes-agua-red'));
}
