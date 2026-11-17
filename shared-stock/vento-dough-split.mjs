const n=x=>String(x||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toUpperCase().replace(/[^A-Z0-9]/g,'');
const eq=(a,b)=>String(a)===String(b);
const near=(a,b)=>Math.abs(Number(a)-Number(b))<=1e-6;
const pending=reason=>({changed:false,status:{configured:false,reason}});
export function configureVentoFitDoughSplit(input){
 const state=structuredClone(input),find=name=>state.items.filter(i=>n(i.name)===name&&!i.archived);
 const [doughs,empanadas,tartas]=['MASAPARADISCOSDEEMPANADAYPASCUALINA','DISCOSPARAEMPANADAS','TAPASPARAPASCUALINAS'].map(find);
 if(doughs.length!==1||empanadas.length!==1||tartas.length!==1)return pending('No hay un único artículo activo para la masa, los discos o las tapas.');
 const [dough,emp,tarta]=[doughs[0],empanadas[0],tartas[0]],gramUnit=dough.unit==='kg'?1000:dough.unit==='g'?1:0;
 if(dough.kind!=='subproduct'||!gramUnit||emp.kind!=='product'||tarta.kind!=='product'||emp.unit!=='u'||tarta.unit!=='u')return pending('La masa debe medirse en kg o g y ambos productos terminados en unidades por paquete.');
 const recipeFor=item=>state.recipes.filter(r=>eq(r.itemId,item.id)),source=recipeFor(dough),pr=recipeFor(emp),sr=recipeFor(tarta);
 if(source.length!==1||pr.length!==1||sr.length!==1)return pending('No hay exactamente una receta vigente para cada una de las tres fichas.');
 const [masa,primary,secondary]=[source[0],pr[0],sr[0]];
 if(!near(masa.yield*gramUnit,62700))return pending('El rendimiento de masa difiere de 62,700 kg teóricos por tirada.');
 if(primary.weightSplit){
  const w=primary.weightSplit;
  if(eq(primary.secondaryItemId,tarta.id)&&eq(w.sourceItemId,dough.id)&&w.primaryGrams===540&&w.secondaryGrams===420&&w.nominalBatchGrams===62700&&w.gramsPerSourceUnit===gramUnit&&secondary.disabled===true){
   if(masa.massPackingRecipeId&&!eq(masa.massPackingRecipeId,primary.id))return pending('La receta de masa está vinculada a otro fraccionamiento.');
   if(!eq(masa.massPackingRecipeId,primary.id)){masa.massPackingRecipeId=primary.id;return{changed:true,state,status:{configured:true,directFromDough:true,source:dough.name,outputs:[emp.name,tarta.name],weightsGrams:[540,420],nominalBatchKg:62.7,stockUnchanged:true}}}
   return{changed:false,state,status:{configured:true,alreadyConfigured:true,directFromDough:true,source:dough.name,outputs:[emp.name,tarta.name],weightsGrams:[540,420],nominalBatchKg:62.7,stockUnchanged:true}};
  }
  return pending('Existe una configuración diferente; no fue reemplazada.');
 }
 if(primary.secondaryItemId||secondary.secondaryItemId||secondary.disabled)return pending('Una receta ya tiene otras salidas o está desactivada.');
 if(primary.components.length!==1||secondary.components.length!==1||!eq(primary.components[0].itemId,dough.id)||!eq(secondary.components[0].itemId,dough.id)||!near(primary.components[0].qty*gramUnit,540)||!near(secondary.components[0].qty*gramUnit,420)||!near(primary.yield,1)||!near(secondary.yield,1))return pending('Las recetas actuales no consumen respectivamente 540 g y 420 g de la misma masa por paquete.');
 if(primary.shelfLifeDays!==secondary.shelfLifeDays)return pending('Los productos tienen vidas útiles diferentes; verificar antes de dividirlos.');
 if(primary.sectorId!==secondary.sectorId)return pending('Las recetas tienen distintos sectores de elaboración; verificar antes de unificarlas.');
 primary.secondaryItemId=tarta.id;
 primary.weightSplit={sourceItemId:dough.id,primaryGrams:540,secondaryGrams:420,gramsPerSourceUnit:gramUnit,nominalBatchGrams:62700,primaryUnitsPerPack:12,secondaryUnitsPerPack:2};
 primary.components=[{itemId:dough.id,qty:540/gramUnit,scope:'both'}];
 primary.version=Number(primary.version||0)+1;
 secondary.disabled=true;
 secondary.supersededBy=primary.id;
 masa.massPackingRecipeId=primary.id;
 return{changed:true,state,status:{configured:true,directFromDough:true,source:dough.name,outputs:[emp.name,tarta.name],weightsGrams:[540,420],nominalBatchKg:62.7,stockUnchanged:true,oldProductionUnchanged:true,previousSeparateRecipeRetained:true}};
}
