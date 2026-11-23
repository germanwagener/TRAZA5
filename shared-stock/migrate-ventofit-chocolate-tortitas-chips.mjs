export function addChocolateTortitasChips(s){
 const product=s.items.find(i=>!i.archived&&i.name==='TORTITAS DE CHOCOLATE CAJA X3 150 G');
 const chips=s.items.find(i=>!i.archived&&i.name==='Chips de baño de repostería');
 const recipe=product&&s.recipes.find(r=>r.itemId===product.id&&!r.disabled);
 if(!recipe||!chips||chips.unit!=='kg'||Number(recipe.yield)!==1)throw Error('Revisar receta de tortitas de chocolate y unidad de chips');
 if(recipe.ventofitChocolateTortitasChips20g)return false;
 const component=recipe.components.find(c=>c.itemId===chips.id);
 if(component)component.qty=.02;else recipe.components.push({itemId:chips.id,qty:.02,scope:'both'});
 recipe.version=Number(recipe.version||0)+1;recipe.ventofitChocolateTortitasChips20g=true;
 return true;
}
export function migrateChocolateTortitasChips(db){
 for(const c of db.prepare("SELECT id,state FROM companies WHERE lower(replace(trim(name),' ',''))='ventofit'").all()){
  const s=JSON.parse(c.state);
  if(addChocolateTortitasChips(s)){
   db.prepare('UPDATE companies SET state=?,version=version+1 WHERE id=?').run(JSON.stringify(s),c.id);
   console.log('VENTOFIT_CHOCOLATE_TORTITAS_CHIPS_20G');
  }
 }
}
