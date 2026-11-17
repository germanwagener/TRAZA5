const scopes=new Set(['both','primary','secondary']);
export const outputScope=value=>scopes.has(value)?value:'both';
const positive=(value,label)=>{const number=Number(value);if(!Number.isFinite(number)||number<=0)throw Error(label+' debe ser mayor que cero.');return number};
const rounded=value=>Math.round((Number(value)+Number.EPSILON)*1e6)/1e6;
function splitQuantities(primaryQty,secondaryQty){
 const primary=Number(primaryQty??0),secondary=Number(secondaryQty??0);
 if(!Number.isFinite(primary)||!Number.isFinite(secondary)||primary<0||secondary<0)throw Error('Las cantidades producidas deben ser cero o mayores.');
 if(primary+secondary<=0)throw Error('Indicá una cantidad mayor a cero en al menos uno de los productos.');
 return {primary,secondary,total:primary+secondary};
}


export function weightSplitQuantities(recipe,batches,primaryQty,secondaryQty){
 const w=recipe.weightSplit;
 if(!w)return null;
 if(!recipe.secondaryItemId||!Array.isArray(recipe.components)||!recipe.components.length||(!w.directIngredients&&(recipe.components.length!==1||String(recipe.components[0].itemId)!==String(w.sourceItemId))))throw Error('La receta de discos y tartas no tiene las materias primas configuradas correctamente.');
 const {primary,secondary}=splitQuantities(primaryQty,secondaryQty);
 if(!Number.isInteger(primary)||!Number.isInteger(secondary))throw Error('Los discos y las tapas se registran en paquetes enteros.');
 if(![w.primaryGrams,w.secondaryGrams,w.nominalBatchGrams,w.gramsPerSourceUnit].every(x=>Number.isFinite(Number(x))&&Number(x)>0))throw Error('La equivalencia de pesos de los paquetes es inválida.');
 const primaryGrams=primary*Number(w.primaryGrams),secondaryGrams=secondary*Number(w.secondaryGrams),totalGrams=primaryGrams+secondaryGrams,limitGrams=positive(batches,'Cantidad de tiradas')*Number(w.nominalBatchGrams);
 if(totalGrams>limitGrams+0.000001)throw Error('Los paquetes superan la masa disponible por tirada ('+(limitGrams/1000).toLocaleString('es-AR')+' kg). Aumentá las tiradas o corregí las cantidades.');
 return{primary,secondary,primaryGrams,secondaryGrams,totalGrams,limitGrams,sourceRequired:rounded(totalGrams/Number(w.gramsPerSourceUnit))};
}

export function productionOutputs(recipe,data){
 if(!recipe.secondaryItemId)return[{role:'single',itemId:recipe.itemId,qty:positive(data.qty,'La cantidad producida'),suffix:''}];
 const {primary,secondary}=splitQuantities(data.primaryQty,data.secondaryQty);
 return[{role:'primary',itemId:recipe.itemId,qty:primary,suffix:'-1'},{role:'secondary',itemId:recipe.secondaryItemId,qty:secondary,suffix:'-2'}].filter(output=>output.qty>0);
}

export function splitRequirements(recipe,batches,primaryQty=0,secondaryQty=0){
 const count=positive(batches,'La cantidad de recetas');
 if(!recipe.secondaryItemId)return recipe.components.map(component=>({...component,scope:'both',required:rounded(Number(component.qty)*count)}));
 const {primary,secondary,total}=splitQuantities(primaryQty,secondaryQty);
 if(recipe.weightSplit){const mass=weightSplitQuantities(recipe,count,primary,secondary);return recipe.components.map(component=>({...component,scope:'both',required:rounded(recipe.weightSplit.directIngredients?Number(component.qty)*count:mass.sourceRequired)}));}
 return recipe.components.map(component=>{const scope=outputScope(component.scope),share=scope==='primary'?primary/total:scope==='secondary'?secondary/total:1;return{...component,scope,required:rounded(Number(component.qty)*count*share)}}).filter(component=>component.required>0);
}

export function allocateProductionInputs(inputs,recipe,outputs){
 if(outputs.length===1)return[inputs.map(input=>({...input}))];
 const masses=recipe.weightSplit?{primaryGrams:Number(outputs[0].qty)*Number(recipe.weightSplit.primaryGrams),secondaryGrams:Number(outputs[1].qty)*Number(recipe.weightSplit.secondaryGrams),totalGrams:Number(outputs[0].qty)*Number(recipe.weightSplit.primaryGrams)+Number(outputs[1].qty)*Number(recipe.weightSplit.secondaryGrams)}:null;
 const total=masses?masses.totalGrams:outputs[0].qty+outputs[1].qty,primaryShare=masses?masses.primaryGrams/total:outputs[0].qty/total,result=[[],[]],byItem=new Map(recipe.components.map(component=>[component.itemId,outputScope(component.scope)]));
 for(const input of inputs){const scope=byItem.get(input.recipeItemId||input.itemId)||'both';if(scope==='primary'){result[0].push({...input});continue}if(scope==='secondary'){result[1].push({...input});continue}
  const first=rounded(Number(input.qty)*primaryShare),second=rounded(Number(input.qty)-first);if(first>0)result[0].push({...input,qty:first,...(input.consumedQty!==undefined?{consumedQty:rounded(input.consumedQty*first/input.qty)}:{})});if(second>0)result[1].push({...input,qty:second,...(input.consumedQty!==undefined?{consumedQty:rounded(input.consumedQty*second/input.qty)}:{})});
 }
 return result;
}
