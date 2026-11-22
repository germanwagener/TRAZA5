export function migrateVentofitBizcochitos(db) {
 const updated=[];
 for(const company of db.prepare("SELECT id,state FROM companies WHERE lower(replace(trim(name),' ',''))='ventofit'").all()){
  const s=JSON.parse(company.state);
  const item=s.items.find(i=>i.name==='BIZCOCHITOS');
  const recipe=item&&s.recipes.find(r=>r.itemId===item.id);
  if(!recipe||recipe.ventofitPortion150g)continue;
  const total=Number(recipe.yield);
  if(!(total>0)||item.unit!=='kg')throw Error('Bizcochitos: receta base incompatible con porciones de 150 g');
  recipe.components=recipe.components.map(c=>({...c,qty:Math.round(Number(c.qty)*.15/total*1e6)/1e6}));
  recipe.yield=1;recipe.version=Number(recipe.version||0)+1;recipe.ventofitPortion150g=true;
  for(const lot of s.lots.filter(l=>l.itemId===item.id)){
   lot.qty=Number(lot.qty)/.15;lot.remaining=Number(lot.remaining)/.15;lot.unitCost=Number(lot.unitCost||0)*.15;
  }
  item.unit='u';item.kind='product';
  const pack=s.items.find(i=>i.name==='BIZCOCHITOS CAJA 150 G');
  if(pack){s.recipes=s.recipes.filter(r=>r.itemId!==pack.id);pack.archived=true;}
  db.prepare('UPDATE companies SET state=?,version=version+1 WHERE id=?').run(JSON.stringify(s),company.id);
  updated.push(item.name);
 }
 return updated;
}
