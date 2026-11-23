const n=x=>String(x||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toUpperCase().replace(/[^A-Z0-9]/g,'');
const eq=(a,b)=>String(a)===String(b);
const near=(a,b)=>Math.abs(Number(a)-Number(b))<=1e-6;
const pending=reason=>({changed:false,status:{configured:false,reason}});
export function configureVentoFitDoughSplit(input){
 const state=structuredClone(input),lookup=name=>state.items.filter(i=>n(i.name)===name&&!i.archived);
 const [doughs,empanadas,tartas]=['MASAPARADISCOSDEEMPANADAYPASCUALINA','DISCOSPARAEMPANADAS','TAPASPARAPASCUALINAS'].map(lookup);
 // Si la masa histórica quedó archivada después de un despliegue, buscarla por ID en la receta final.
 const primaryProduct=empanadas.length===1?empanadas[0]:null,secondaryProduct=tartas.length===1?tartas[0]:null;
 const primaryRecipe=primaryProduct?state.recipes.filter(r=>eq(r.itemId,primaryProduct.id)):[],secondaryRecipe=secondaryProduct?state.recipes.filter(r=>eq(r.itemId,secondaryProduct.id)):[];
 if(primaryRecipe[0]?.ventofitDirectPack&&secondaryRecipe[0]?.ventofitDirectPack)return {changed:false,state,status:{configured:true,separateDirectPacks:true}};
 if(primaryRecipe.length===1&&secondaryRecipe.length===1&&primaryRecipe[0].weightSplit?.directIngredients===true){
  const primary=primaryRecipe[0],second=secondaryRecipe[0],w=primary.weightSplit;
  const historicalDough=state.items.find(i=>eq(i.id,w.sourceItemId));
  const historicalRecipe=historicalDough?state.recipes.find(r=>eq(r.itemId,historicalDough.id)):null;
  if(!eq(primary.secondaryItemId,secondaryProduct.id)||!second.disabled||!historicalRecipe?.disabled||w.primaryGrams!==540||w.secondaryGrams!==420||w.nominalBatchGrams!==62700||primary.components.some(c=>eq(c.itemId,w.sourceItemId)))return pending('Las salidas unificadas no coinciden con los datos originales; se requiere revisión.');
  return{changed:false,state,status:{configured:true,alreadyConfigured:true,singleRecipe:true,source:historicalDough?.name,outputs:[primaryProduct.name,secondaryProduct.name],weightsGrams:[540,420],nominalBatchKg:62.7,stockUnchanged:true}};
 }
 if(doughs.length!==1||!primaryProduct||!secondaryProduct)return pending('No se encuentra exactamente una masa y las dos presentaciones finales.');
 const dough=doughs[0],emp=primaryProduct,tarta=secondaryProduct,gramUnit=dough.unit==='kg'?1000:dough.unit==='g'?1:0;
 if(dough.kind!=='subproduct'||!gramUnit||emp.kind!=='product'||tarta.kind!=='product'||emp.unit!=='u'||tarta.unit!=='u')return pending('La masa debe medirse en kg o g y las presentaciones en paquetes (u).');
 const source=state.recipes.filter(r=>eq(r.itemId,dough.id));
 if(source.length!==1||primaryRecipe.length!==1||secondaryRecipe.length!==1)return pending('No hay una receta única para la masa y para cada presentación.');
 const masa=source[0],primary=primaryRecipe[0],secondary=secondaryRecipe[0],w=primary.weightSplit;
 if(masa.disabled)return pending('La receta histórica de masa ya se encuentra desactivada sin una salida directa configurada.');
 if(!near(Number(masa.yield)*gramUnit,62700)||!Array.isArray(masa.components)||!masa.components.length||masa.components.some(c=>eq(c.itemId,dough.id)))return pending('El rendimiento o los ingredientes de la masa difieren de la receta madre de 62,700 kg.');
 if(primary.secondaryItemId&&!eq(primary.secondaryItemId,tarta.id))return pending('La receta de discos está vinculada a otro segundo producto.');
 if(primary.secondaryItemId&&(!w||w.directIngredients||!eq(w.sourceItemId,dough.id)||w.primaryGrams!==540||w.secondaryGrams!==420||w.nominalBatchGrams!==62700))return pending('La división existente de discos y tartas no coincide con la esperada.');
 if(secondary.secondaryItemId)return pending('La receta de tarta ya tiene otra salida vinculada.');
 if(primary.components.length!==1||secondary.components.length!==1||!eq(primary.components[0].itemId,dough.id)||!eq(secondary.components[0].itemId,dough.id)||!near(primary.components[0].qty*gramUnit,540)||!near(secondary.components[0].qty*gramUnit,420))return pending('Los empaques no consumen la misma masa con 540 g y 420 g por paquete.');
 if(!near(primary.yield,1)||!near(secondary.yield,1)||primary.shelfLifeDays!==secondary.shelfLifeDays||primary.sectorId!==secondary.sectorId)return pending('Las recetas finales difieren en rendimiento, sector o vida útil; no se modificaron.');
 const others=state.recipes.filter(r=>![masa.id,primary.id,secondary.id].some(id=>eq(id,r.id))&&!r.disabled&&(r.components||[]).some(c=>eq(c.itemId,dough.id)));
 if(others.length)return pending('Existen otras recetas activas que consumen la masa: no se desactivó para evitar interrumpirlas.');
 if(state.lots.some(l=>eq(l.itemId,dough.id)&&Number(l.remaining)>1e-8))return pending('Todavía existe stock de masa sin fraccionar. Resolverlo antes de unificar para no perder su disponibilidad.');
 // Una única receta nueva (la ficha de empanadas existente): los siete ingredientes van directamente a las dos salidas.
 primary.components=masa.components.map(c=>({itemId:c.itemId,qty:Number(c.qty),scope:'both'}));
 primary.secondaryItemId=tarta.id;
 primary.weightSplit={directIngredients:true,sourceItemId:dough.id,primaryGrams:540,secondaryGrams:420,gramsPerSourceUnit:gramUnit,nominalBatchGrams:62700,primaryUnitsPerPack:12,secondaryUnitsPerPack:2};
 primary.version=Number(primary.version||0)+1;
 secondary.disabled=true;secondary.supersededBy=primary.id;
 masa.disabled=true;masa.supersededBy=primary.id;delete masa.massPackingRecipeId;
 if(!state.lots.some(l=>eq(l.itemId,dough.id)))dough.archived=true;
 return{changed:true,state,status:{configured:true,singleRecipe:true,source:dough.name,outputs:[emp.name,tarta.name],ingredients:primary.components.length,weightsGrams:[540,420],nominalBatchKg:62.7,stockUnchanged:true,oldProductionUnchanged:true,previousRecipesRetained:true}};
}
