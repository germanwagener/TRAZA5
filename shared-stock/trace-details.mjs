// Reconstruct provenance from recorded production inputs, never from today's recipe.
export function traceDetails(s,lotId){
 const lots=new Map(s.lots.map(l=>[l.id,l])),items=new Map(s.items.map(i=>[i.id,i]));
 if(!lots.has(lotId))throw Error('Registro no encontrado.');
 const productions=new Map(),children=new Map();
 for(const p of s.productions){const group=productions.get(p.lotId)||[];group.push(p);productions.set(p.lotId,group);for(const input of p.inputs||[]){const out=children.get(input.lotId)||new Set();out.add(p.lotId);children.set(input.lotId,out)}}
 const up=new Set(),down=new Set(),consumptions=[],warnings=[],checked=new Set();
 function warn(code,key,message){const id=code+':'+key;if(!checked.has(id)){checked.add(id);warnings.push({code,lotId:key,message})}}
 function describe(id){const l=lots.get(id),it=items.get(l?.itemId),purchase=s.purchases.find(p=>p.lotId===id),opening=s.adjustments.find(a=>a.opening&&a.lotId===id);return {id,itemId:l?.itemId,name:it?.name||'Ingrediente sin registro',kind:it?.kind,unit:it?.unit||'',code:l?.code||id,date:l?.date||'',expiry:l?.expiry||'',qty:l?.qty??null,remaining:l?.remaining??null,status:l?.status||'',sectorId:l?.sectorId,sector:s.sectors.find(x=>x.id===l?.sectorId)?.name||'',supplierId:purchase?.supplierId||opening?.supplierId||'',supplier:purchase?s.suppliers.find(x=>x.id===purchase.supplierId)?.name||'Proveedor sin registro':productions.has(id)?s.company:opening?'Saldo inicial':'Origen sin registrar',supplierLot:purchase?.supplierLot||opening?.supplierLot||'',manufactured:purchase?.manufactured||'',note:purchase?.note||opening?.note||'',source:purchase?'purchase':productions.has(id)?'production':opening?'opening':'unknown',missing:!l}}
 function backward(id,path=[]){
  if(path.includes(id)){warn('cycle',id,'Hay una referencia circular entre lotes. Revisá los registros de elaboración.');return}
  if(up.has(id))return;up.add(id);
  const node=describe(id);if(node.missing){warn('missing_lot',id,'Falta el registro del lote '+id+'.');return}
  if(node.source==='opening'||lots.get(id).incomplete)warn('opening',id,'El lote '+node.code+' proviene de un saldo inicial; su historial anterior no está registrado.');
  if(node.source==='unknown')warn('missing_origin',id,'No hay ingreso ni elaboración de origen para '+node.name+' · '+node.code+'.');
  const records=productions.get(id)||[];
  if(records.length>1)warn('duplicate_production',id,'Más de una elaboración apunta al lote '+node.code+'. Se muestran todos los consumos y debe revisarse esa asociación.');
  for(const p of records){
   const inputs=p.inputs||[],expected=p.recipe?.components;
   if(!inputs.length&&!(p.untrackedInputs||[]).length)warn('missing_inputs',id,'La elaboración de '+node.name+' · '+node.code+' no tiene consumos registrados.');
   if(!Array.isArray(expected)||!Number.isFinite(Number(p.batches)))warn('missing_snapshot',id,'No se puede comprobar la cobertura de ingredientes de '+node.code+': falta su receta histórica o la cantidad de recetas elaboradas.');
   else{
    const actual=new Map();for(const a of inputs){const key=lots.get(a.lotId)?.itemId||a.itemId;actual.set(key,(actual.get(key)||0)+Number(a.qty||0))}
    for(const a of p.untrackedInputs||[])actual.set(a.itemId,(actual.get(a.itemId)||0)+Number(a.qty||0));
    for(const c of expected){const required=Number(c.qty)*Number(p.batches),used=actual.get(c.itemId)||0;if(!Number.isFinite(required)||Math.abs(required-used)>1e-7*Math.max(1,required))warn('quantity_mismatch',id+':'+c.itemId,'En '+node.code+', '+(items.get(c.itemId)?.name||'un ingrediente')+' tiene '+used+' registrados frente a '+required+' previstos en la versión utilizada.');}
    for(const key of actual.keys())if(!expected.some(c=>c.itemId===key))warn('extra_input',id+':'+key,'En '+node.code+' hay un consumo que no figura en su receta histórica; se muestra el consumo registrado.');
   }
   inputs.forEach((a,index)=>{const child=describe(a.lotId);consumptions.push({id:p.id+':'+index,parentLotId:id,productionId:p.id,parentName:node.name,parentCode:node.code,productionDate:p.date,recipeVersion:p.recipe?.version??null,lotId:a.lotId,qty:Number(a.qty),...Object.fromEntries(Object.entries(child).filter(([key])=>key!=='id')),qty:Number(a.qty)});backward(a.lotId,[...path,id])});
  }
 }
 backward(lotId);
 const pending=[lotId];while(pending.length){const id=pending.pop();if(down.has(id))continue;down.add(id);for(const child of children.get(id)||[])pending.push(child)}
 const keys=new Set([...up,...down]);
 const dispatches=s.sales.flatMap(sale=>(sale.inputs||[]).filter(a=>down.has(a.lotId)).map((a,index)=>({saleId:sale.id,line:index,date:sale.date,customerId:sale.customerId,customer:s.customers.find(c=>c.id===sale.customerId)?.name||'Cliente sin registro',phone:s.customers.find(c=>c.id===sale.customerId)?.phone||'',contact:s.customers.find(c=>c.id===sale.customerId)?.contact||'',lotId:a.lotId,code:lots.get(a.lotId)?.code||a.lotId,itemId:lots.get(a.lotId)?.itemId||sale.itemId,qty:Number(a.qty),unit:items.get(lots.get(a.lotId)?.itemId)?.unit||''})));
 const original=(productions.get(lotId)||[])[0],current=s.recipes.find(r=>r.itemId===lots.get(lotId).itemId);
 const historicalOnly=original?.recipe?.components||[],currentOnly=(current?.components||[]).filter(c=>!historicalOnly.some(h=>h.itemId===c.itemId)).map(c=>items.get(c.itemId)?.name||c.itemId);
 return {lotId,root:describe(lotId),ancestors:[...up],descendants:[...down],nodes:[...keys].map(describe),consumptions,dispatches,warnings,
  recipeComparison:original?{historicalVersion:original.recipe?.version??null,currentVersion:current?.version??null,currentOnly,changed:!!current&&(current.version!==original.recipe?.version||JSON.stringify(current.components)!==JSON.stringify(original.recipe?.components))}:null,
  dispatchedQty:dispatches.filter(x=>x.lotId===lotId).reduce((sum,x)=>sum+x.qty,0),
  lots:s.lots.filter(x=>keys.has(x.id)),purchases:s.purchases.filter(x=>up.has(x.lotId)),productions:s.productions.filter(x=>keys.has(x.lotId)),sales:s.sales.filter(x=>(x.inputs||[]).some(a=>down.has(a.lotId))),transfers:s.transfers.filter(x=>keys.has(x.lotId)),losses:s.adjustments.filter(x=>x.loss&&keys.has(x.lotId)),incomplete:warnings.length>0};
}
