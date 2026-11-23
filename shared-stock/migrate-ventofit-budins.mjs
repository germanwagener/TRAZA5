const norm=x=>String(x).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toUpperCase().trim();
const round=x=>Math.round(x*1e9)/1e9;
export function configureBudins(s){
 const find=name=>{const a=s.items.filter(i=>!i.archived&&norm(i.name)===norm(name));if(a.length!==1)throw Error('Ingrediente/producto ambiguo: '+name);return a[0]};
 const semi='Baño de repostería semiamargo sin azúcar agregada',white='Baño de repostería fantasía dietético blanco aromatizado con etilvainilla';
 const specs=[
 ['BUDÍN DE CHOCOLATE Y NUEZ',[['PREMEZCLA ALMENDRAS CHOCOLATE',4]],[[semi,.02],['Nueces mariposas',.005]],false],
 ['BUDÍN DE LIMÓN CON GLASÉ',[['PREMEZCLA ALMENDRAS VAINILLA',4]],[['Esencia de limón',.03]],false],
 ['BUDÍN DE DULCE DE LECHE Y FRUTOS SECOS',[['PREMEZCLA ALMENDRAS VAINILLA',4]],[[semi,.02]],true],
 ['BUDÍN DE PISTACHO Y CHOCOLATE BLANCO',[['PREMEZCLA ALMENDRAS VAINILLA',4]],[[white,.02],['Pistacho',.015]],false],
 ['BUDÍN MARMOLADO CON PASTA DE MANÍ',[['PREMEZCLA ALMENDRAS VAINILLA',2],['PREMEZCLA ALMENDRAS CHOCOLATE',2]],[['PASTA DE MANI TOSTADO',.06],['Maní repelado tostado sin sal',.015]],false]
 ];
 const common=[['Leche',2],['Agua',2.3],['Manteca',.4],['Queso crema',.5],['Propionato de calcio',.035],['Sorbato de potasio',.015],['Esencia de Vainilla',.06]];
 const changes=[];
 for(const [name,premix,toppings,granola] of specs){
  const item=find(name),recipe=s.recipes.find(r=>r.itemId===item.id&&!r.disabled);
  if(!recipe)throw Error('Falta receta de '+name);
  if(recipe.ventofitBudin200g)continue;
  const components=[...premix,...common].map(([n,q])=>({itemId:find(n).id,qty:q*.2/9.31,scope:'both'}));
  for(const [n,q] of toppings)components.push({itemId:find(n).id,qty:q,scope:'both'});
  if(granola){
   const g=find('GRANOLA COMÚN'),gr=s.recipes.find(r=>r.itemId===g.id&&!r.disabled);
   const kgPerYield=g.unit==='kg'?Number(gr?.yield):Number(gr?.ventofitDirectPortion?.kg)*Number(gr?.yield);
   if(!(kgPerYield>0))throw Error('Granola común sin equivalencia de peso');
   for(const c of gr.components)components.push({...c,qty:Number(c.qty)*.04/kgPerYield});
  }
  const merged=new Map();for(const c of components)merged.set(c.itemId,(merged.get(c.itemId)||0)+c.qty);
  recipe.components=[...merged].map(([itemId,qty])=>({itemId,qty:round(qty),scope:'both'}));
  recipe.yield=1;recipe.version=Number(recipe.version||0)+1;recipe.ventofitBudin200g=true;
  recipe.ventofitDirectPortion={kg:.2+toppings.reduce((n,t)=>n+t[1],0)+(granola?.04:0)};
  item.unit='u';item.kind='product';
  if(granola)item.name='BUDÍN DE FRUTOS SECOS';
  changes.push({name:item.name,baseKg:.2,totalKg:recipe.ventofitDirectPortion.kg});
 }
 return changes;
}
export function migrateBudins(db){
 for(const c of db.prepare("SELECT id,state FROM companies WHERE lower(replace(trim(name),' ',''))='ventofit'").all()){
  const s=JSON.parse(c.state);
  // Renamed variety is already migrated on subsequent restarts.
  const renamed=s.items.find(i=>i.name==='BUDÍN DE FRUTOS SECOS');
  if(renamed&&s.recipes.find(r=>r.itemId===renamed.id)?.ventofitBudin200g)continue;
  const changes=configureBudins(s);
  if(changes.length){db.prepare('UPDATE companies SET state=?,version=version+1 WHERE id=?').run(JSON.stringify(s),c.id);console.log('VENTOFIT_BUDINS_200G',JSON.stringify(changes));}
 }
}
