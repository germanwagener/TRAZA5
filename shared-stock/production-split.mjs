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

export function productionOutputs(recipe,data){
 if(!recipe.secondaryItemId)return[{role:'single',itemId:recipe.itemId,qty:positive(data.qty,'La cantidad producida'),suffix:''}];
 const {primary,secondary}=splitQuantities(data.primaryQty,data.secondaryQty);
 return[{role:'primary',itemId:recipe.itemId,qty:primary,suffix:'-1'},{role:'secondary',itemId:recipe.secondaryItemId,qty:secondary,suffix:'-2'}].filter(output=>output.qty>0);
}

export function splitRequirements(recipe,batches,primaryQty=0,secondaryQty=0){
 const count=positive(batches,'La cantidad de recetas');
 if(!recipe.secondaryItemId)return recipe.components.map(component=>({...component,scope:'both',required:rounded(Number(component.qty)*count)}));
 const {primary,secondary,total}=splitQuantities(primaryQty,secondaryQty);
 return recipe.components.map(component=>{const scope=outputScope(component.scope),share=scope==='primary'?primary/total:scope==='secondary'?secondary/total:1;return{...component,scope,required:rounded(Number(component.qty)*count*share)}}).filter(component=>component.required>0);
}

export function allocateProductionInputs(inputs,recipe,outputs){
 if(outputs.length===1)return[inputs.map(input=>({...input}))];
 const total=outputs[0].qty+outputs[1].qty,result=[[],[]],byItem=new Map(recipe.components.map(component=>[component.itemId,outputScope(component.scope)]));
 for(const input of inputs){const scope=byItem.get(input.itemId)||'both';if(scope==='primary'){result[0].push({...input});continue}if(scope==='secondary'){result[1].push({...input});continue}
  const first=rounded(Number(input.qty)*outputs[0].qty/total),second=rounded(Number(input.qty)-first);if(first>0)result[0].push({...input,qty:first});if(second>0)result[1].push({...input,qty:second});
 }
 return result;
}
