export function configureDoughPacks(s){
 const find=name=>{const a=s.items.filter(i=>i.name===name&&!i.archived);if(a.length!==1)throw Error('Producto ambiguo: '+name);return a[0]};
 const emp=find('DISCOS PARA EMPANADAS'),tart=find('TAPAS PARA PASCUALINAS');
 const er=s.recipes.find(r=>r.itemId===emp.id),tr=s.recipes.find(r=>r.itemId===tart.id);
 if(er?.ventofitDirectPack&&tr?.ventofitDirectPack)return false;
 if(!er?.weightSplit?.directIngredients||!tr||er.secondaryItemId!==tart.id)throw Error('Revisar receta de masa unificada');
 const batchGrams=Number(er.weightSplit.nominalBatchGrams);
 if(!(batchGrams>0))throw Error('Rendimiento de masa inválido');
 const base=structuredClone(er.components);
 for(const [r,grams,pieces] of [[er,540,12],[tr,420,2]]){
  r.components=base.map(c=>({itemId:c.itemId,qty:Math.round(Number(c.qty)*grams/batchGrams*1e9)/1e9,scope:'both'}));
  r.yield=1;r.version=Number(r.version||0)+1;r.disabled=false;
  delete r.secondaryItemId;delete r.weightSplit;delete r.supersededBy;
  r.ventofitDirectPack={grams,pieces};
 }
 return true;
}
export function migrateDoughPacks(db){
 for(const c of db.prepare("SELECT id,state FROM companies WHERE lower(replace(trim(name),' ',''))='ventofit'").all()){
  const s=JSON.parse(c.state);
  if(configureDoughPacks(s)){
   db.prepare('UPDATE companies SET state=?,version=version+1 WHERE id=?').run(JSON.stringify(s),c.id);
   console.log('VENTOFIT_DIRECT_DOUGH_PACKS',JSON.stringify({empanadas:{pieces:12,grams:540},tartas:{pieces:2,grams:420},directIngredients:true}));
  }
 }
}
