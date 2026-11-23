export function configurePrepizzaSauce(s){
 const item=s.items.find(i=>!i.archived&&i.name==='PREPIZZA DE ALMENDRAS');
 const r=item&&s.recipes.find(r=>r.itemId===item.id&&!r.disabled);
 if(!r)throw Error('Falta receta de prepizza');
 if(r.ventofitPrepizza240plus60)return false;
 const sauces=r.components.filter(c=>/^salsa lista/i.test(s.items.find(i=>i.id===c.itemId)?.name||''));
 if(sauces.length!==1)throw Error('Salsa lista ausente o ambigua');
 const sauce=s.items.find(i=>i.id===sauces[0].itemId);
 if(sauce.unit!=='kg'){
  if(s.lots.some(l=>l.itemId===sauce.id)||s.purchases.some(p=>p.itemId===sauce.id))throw Error('Revisar conversión de lotes de salsa');
  sauce.unit='kg';sauce.presentationContentUnit='kg';
 }
 const dough=r.components.filter(c=>c.itemId!==sauce.id),total=dough.reduce((n,c)=>n+Number(c.qty),0);
 if(!(total>0))throw Error('Masa inválida');
 r.components=[...dough.map(c=>({...c,qty:Math.round(Number(c.qty)*.24/total*1e9)/1e9})),{itemId:sauce.id,qty:.06,scope:'both'}];
 r.yield=1;r.version=Number(r.version||0)+1;r.ventofitPrepizza240plus60=true;
 r.ventofitDirectPortion={kg:.3};return true;
}
export function migratePrepizzaSauce(db){
 for(const c of db.prepare("SELECT id,state FROM companies WHERE lower(replace(trim(name),' ',''))='ventofit'").all()){
  const s=JSON.parse(c.state);if(configurePrepizzaSauce(s)){
   db.prepare('UPDATE companies SET state=?,version=version+1 WHERE id=?').run(JSON.stringify(s),c.id);
   console.log('VENTOFIT_PREPIZZA_240G_MASA_60G_SALSA');
  }
 }
}
