export function migrateVentofitBars(db) {
 const results=[];
 for(const company of db.prepare("SELECT id,state FROM companies WHERE lower(replace(trim(name),' ',''))='ventofit'").all()){
  const s=JSON.parse(company.state); let changed=false;
  for(const flavor of ['ARÁNDANOS','CHOCOLATE','PISTACHOS']){
   const name='BARRITAS DE '+flavor;
   const item=s.items.find(i=>i.name===name), recipe=item&&s.recipes.find(r=>r.itemId===item.id);
   if(!recipe||recipe.ventofitIndividualBar)continue;
   const total=Number(recipe.yield);
   if(!(total>0)||item.unit!=='kg')continue;
   // Existing kilogram lots and historical recipes retain their original meaning.
   for(const lot of s.lots.filter(l=>l.itemId===item.id)){lot.qty=Number(lot.qty)/.045;lot.remaining=Number(lot.remaining)/.045;lot.unitCost=Number(lot.unitCost||0)*.045;}
   recipe.components=recipe.components.map(c=>({...c,qty:Math.round(Number(c.qty)*.045/total*1e6)/1e6}));
   recipe.yield=1;recipe.version=Number(recipe.version||0)+1;recipe.ventofitIndividualBar=true;
   item.unit='u';item.kind='product';
   const box=s.items.find(i=>i.name===name+' CAJA X12 540 G');
   if(box){s.recipes=s.recipes.filter(r=>r.itemId!==box.id);box.archived=true;}
   changed=true;results.push(name);
  }
  if(changed)db.prepare('UPDATE companies SET state=?,version=version+1 WHERE id=?').run(JSON.stringify(s),company.id);
 }
 return results;
}
