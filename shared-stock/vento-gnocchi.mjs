// Conservar las dos variedades de ñoquis separadas; cada producto terminado
// consume directamente sus propias materias primas, sin lote intermedio de masa.
const normalized=value=>String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleUpperCase().replace(/[^A-Z0-9]/g,'');
const same=(a,b)=>String(a)===String(b);
const close=(a,b)=>Math.abs(Number(a)-Number(b))<=1e-8;
const specs=[
 {flavor:'naturales',finished:'ÑOQUIS NATURALES',mass:'MASA DE ÑOQUIS NATURALES',ingredients:[['Harina de almendras',15],['Huevo en polvo',2],['Sal',.5]]},
 {flavor:'espinaca',finished:'ÑOQUIS ESPINACA',mass:'MASA DE ÑOQUIS DE ESPINACA',ingredients:[['Harina de almendras',15],['Huevo en polvo',2],['Sal',.5],['Espinaca en escamas',2]]}
];
export function configureVentoFitGnocchi(source){
 const state=structuredClone(source),outcomes=[];let changed=false;
 const find=name=>state.items.filter(i=>normalized(i.name)===normalized(name)&&!i.archived);
 for(const spec of specs){
  const products=find(spec.finished),masses=state.items.filter(i=>normalized(i.name)===normalized(spec.mass));
  if(products.length!==1||masses.length!==1){outcomes.push({flavor:spec.flavor,status:'pendiente',reason:'Artículo de producto final o masa ausente/ambiguo'});continue}
  const product=products[0],mass=masses[0],pr=state.recipes.filter(r=>same(r.itemId,product.id)),mr=state.recipes.filter(r=>same(r.itemId,mass.id));
  if(pr.length!==1||mr.length!==1){outcomes.push({flavor:spec.flavor,status:'pendiente',reason:'Se esperaba exactamente una receta de cada tipo'});continue}
  const finished=pr[0],dough=mr[0],already=finished.directGnocchi;
  if(already){
   const correct=already.massItemId===mass.id&&already.packWeightGrams===500&&already.declaredPacksPerBatch===60&&dough.disabled===true&&!finished.disabled&&finished.components.every(c=>!same(c.itemId,mass.id));
   outcomes.push({flavor:spec.flavor,status:correct?'configurada':'pendiente',reason:correct?undefined:'La receta previamente unificada difiere de lo esperado',packagesPerBatch:correct?60:undefined});
   continue;
  }
  if(product.kind!=='product'||product.unit!=='u'||mass.kind!=='subproduct'||mass.unit!=='kg'||mass.archived||product.resale||finished.disabled||dough.disabled||finished.secondaryItemId||dough.secondaryItemId){
   outcomes.push({flavor:spec.flavor,status:'pendiente',reason:'Tipo, unidad o configuración incompatible'});continue;
  }
  if(!close(dough.yield,30)||!close(finished.yield,1)||finished.components.length!==1||!same(finished.components[0].itemId,mass.id)||!close(finished.components[0].qty,.5)||finished.sectorId!==dough.sectorId||finished.shelfLifeDays!==dough.shelfLifeDays){
   outcomes.push({flavor:spec.flavor,status:'pendiente',reason:'No coinciden los rendimientos, el sector, la vida útil o los 500 g de masa por porción'});continue;
  }
  if(state.lots.some(l=>same(l.itemId,mass.id)&&Number(l.remaining)>1e-8)){
   outcomes.push({flavor:spec.flavor,status:'pendiente',reason:'La masa tiene stock disponible; no se debe desactivar todavía'});continue;
  }
  const extraConsumers=state.recipes.filter(r=>r.id!==finished.id&&r.id!==dough.id&&!r.disabled&&(r.components||[]).some(c=>same(c.itemId,mass.id)));
  if(extraConsumers.length){outcomes.push({flavor:spec.flavor,status:'pendiente',reason:'Otras recetas activas consumen esta masa'});continue}
  const observed=dough.components.map(c=>{const item=state.items.find(i=>same(i.id,c.itemId));return{name:item?.name,unit:item?.unit,qty:Number(c.qty),archived:item?.archived}});
  const expected=spec.ingredients.map(([name,qty])=>({name,qty}));
  if(observed.length!==expected.length||expected.some(x=>observed.filter(y=>normalized(y.name)===normalized(x.name)&&y.unit==='kg'&&!y.archived&&close(y.qty,x.qty)).length!==1)){
   outcomes.push({flavor:spec.flavor,status:'pendiente',reason:'Los ingredientes o las cantidades no coinciden con la receta madre'});continue;
  }
  // Importante: la suma teórica de insumos no alcanza los 30 kg declarados.
  // Conservamos la fórmula exacta y registramos la diferencia para revisión.
  const ingredientSumKg=dough.components.reduce((sum,c)=>sum+Number(c.qty),0),nominalKg=60*.5;
  finished.components=dough.components.map(c=>({itemId:c.itemId,qty:Number(c.qty),scope:'both'}));
  finished.yield=60;finished.version=Number(finished.version||0)+1;
  finished.directGnocchi={massItemId:mass.id,packWeightGrams:500,declaredPacksPerBatch:60};
  dough.disabled=true;dough.supersededBy=finished.id;
  mass.archived=true;
  changed=true;
  outcomes.push({flavor:spec.flavor,status:'configurada',directIngredients:true,ingredients:finished.components.length,packagesPerBatch:60,gramsPerPack:500,ingredientSumKg,declaredOutputKg:nominalKg,massDifferenceKg:Math.round((nominalKg-ingredientSumKg)*1000)/1000,stockUnchanged:true});
 }
 return{changed,state,outcomes};
}
