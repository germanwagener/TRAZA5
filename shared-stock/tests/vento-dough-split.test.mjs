import {test} from 'node:test';
import assert from 'node:assert/strict';
import {empty,operate,trace,recipeCost} from '../domain.mjs';
import {splitRequirements,weightSplitQuantities} from '../production-split.mjs';
import {configureVentoFitDoughSplit} from '../vento-dough-split.mjs';
function fixture(){
 const s=empty('Vento Fit'),sector=operate(s,'master',{collection:'sectors',name:'Cocina'}),supplier=operate(s,'master',{collection:'suppliers',name:'Proveedor'});
 const ingredients=[['Harina de almendras',50],['Margarina para repostería',10],['Gluten',.3],['Sal',.8],['Agua',1.5],['Sorbato de potasio',.05],['Propionato de calcio',.05]];
 const components=[],allocations=[];
 for(const [name,qty] of ingredients){
  const raw=operate(s,'master',{collection:'items',name,kind:'raw',unit:'kg'});
  const entry=operate(s,'purchase',{date:'2026-11-01',itemId:raw.id,supplierId:supplier.id,supplierLot:'MP-'+name,qty:qty*3+1,unitCost:10,expiry:'2027-05-01'});
  components.push({itemId:raw.id,qty});allocations.push({lotId:entry.lotId,qty});
 }
 const dough=operate(s,'master',{collection:'items',name:'MASA PARA DISCOS DE EMPANADA Y PASCUALINA',kind:'subproduct',unit:'kg'});
 const emp=operate(s,'master',{collection:'items',name:'DISCOS PARA EMPANADAS',kind:'product',unit:'u'});
 const tarta=operate(s,'master',{collection:'items',name:'TAPAS PARA PASCUALINAS',kind:'product',unit:'u'});
 const masa=operate(s,'recipe',{itemId:dough.id,sectorId:sector.id,yield:62.7,shelfLifeDays:30,components});
 const r1=operate(s,'recipe',{itemId:emp.id,sectorId:sector.id,yield:1,shelfLifeDays:30,components:[{itemId:dough.id,qty:.54}]});
 const r2=operate(s,'recipe',{itemId:tarta.id,sectorId:sector.id,yield:1,shelfLifeDays:30,components:[{itemId:dough.id,qty:.42}]});
 return {s,dough,emp,tarta,masa,r1,r2,components,allocations};
}
test('unifica los siete ingredientes directamente con dos salidas, sin tocar stock',()=>{
 const {s,dough,r1,r2,masa,components}=fixture(),priorLots=JSON.stringify(s.lots),priorProductions=JSON.stringify(s.productions);
 const out=configureVentoFitDoughSplit(s);
 assert.equal(out.changed,true);assert.equal(out.status.singleRecipe,true);assert.equal(out.status.ingredients,7);
 assert.equal(JSON.stringify(out.state.lots),priorLots);assert.equal(JSON.stringify(out.state.productions),priorProductions);
 const combined=out.state.recipes.find(r=>r.id===r1.id),oldDough=out.state.recipes.find(r=>r.id===masa.id),oldTarta=out.state.recipes.find(r=>r.id===r2.id);
 assert.equal(combined.weightSplit.directIngredients,true);
 assert.equal(combined.weightSplit.primaryGrams,540);assert.equal(combined.weightSplit.secondaryGrams,420);
 assert.equal(combined.secondaryItemId,s.items.find(i=>i.name==='TAPAS PARA PASCUALINAS').id);
 assert.deepEqual(combined.components.map(c=>c.itemId),components.map(c=>c.itemId));
 assert.ok(combined.components.every(c=>c.itemId!==dough.id));
 assert.equal(oldDough.disabled,true);assert.equal(oldTarta.disabled,true);
 assert.equal(out.state.items.find(i=>i.id===dough.id).archived,true);
 const again=configureVentoFitDoughSplit(out.state);assert.equal(again.changed,false);assert.equal(again.status.alreadyConfigured,true);
});
test('una elaboración consume una tirada de ingredientes y produce ambos paquetes sin lote de masa',()=>{
 const {s,dough,emp,tarta,r1,masa,allocations,components}=fixture();
 const out=configureVentoFitDoughSplit(s),st=out.state,recipe=st.recipes.find(r=>r.id===r1.id);
 const req=splitRequirements(recipe,1,50,30);
 assert.deepEqual(req.map(c=>c.required),components.map(c=>c.qty));
 assert.deepEqual([50*540,30*420],[27000,12600]);
 const initialLots=st.lots.length,initialProductions=st.productions.length;
 const result=operate(st,'produce',{date:'2026-11-03',lotCode:'UNI-01',recipeId:recipe.id,batches:1,primaryQty:50,secondaryQty:30,allocations});
 assert.equal(st.lots.length,initialLots+2);assert.equal(st.productions.length,initialProductions+2);
 assert.equal(st.lots.filter(l=>l.itemId===dough.id).length,0);
 const final=st.productions.filter(p=>p.productionGroup===result.productionGroup&&result.productionGroup);
 assert.equal(final.length,2);assert.deepEqual(final.map(p=>p.qty),[50,30]);
 assert.deepEqual(final.map(p=>p.itemId),[emp.id,tarta.id]);
 assert.ok(final.every(p=>p.inputs.length===7));assert.ok(final.every(p=>p.recipe.components.length===7));
 const consumption=final.reduce((sum,p)=>sum+p.inputs.reduce((n,i)=>n+i.qty,0),0);
 assert.ok(Math.abs(consumption-62.7)<1e-5);
 const massFirst=final[0].inputs.reduce((n,i)=>n+i.qty,0);
 const massSecond=final[1].inputs.reduce((n,i)=>n+i.qty,0);
 assert.ok(Math.abs(massFirst-62.7*27/39.6)<1e-5);assert.ok(Math.abs(massSecond-62.7*12.6/39.6)<1e-5);
 assert.ok(trace(st,final[0].lotId).ancestors.includes(allocations[0].lotId));
 assert.ok(trace(st,final[1].lotId).ancestors.includes(allocations[1].lotId));
 assert.ok(Math.abs(recipeCost(st,emp.id)-5.4)<1e-6);
 assert.ok(Math.abs(recipeCost(st,tarta.id)-4.2)<1e-6);
 assert.throws(()=>operate(st,'produce',{date:'2026-11-04',recipeId:masa.id,batches:1,qty:62.7,allocations}),/reemplaz/);
});
test('respetar tiradas completas de materias primas, límites y cantidades enteras',()=>{
 const {s,r1,components}=fixture(),st=configureVentoFitDoughSplit(s).state,r=st.recipes.find(x=>x.id===r1.id);
 assert.equal(splitRequirements(r,2,100,80)[0].required,components[0].qty*2);
 assert.equal(weightSplitQuantities(r,2,100,80).totalGrams,87600);
 assert.throws(()=>splitRequirements(r,1,100,30),/superan/);
 assert.throws(()=>splitRequirements(r,1,1.5,1),/enteros/);
 const before=JSON.stringify(st.lots);
 assert.throws(()=>operate(st,'produce',{date:'2026-11-03',lotCode:'BAD-01',recipeId:r.id,batches:1,primaryQty:120,secondaryQty:0,allocations:[]}),/superan/);
 assert.equal(JSON.stringify(st.lots),before);
});
test('si existe masa remanente en lotes, no bloquea ni altera stock histórico',()=>{
 const {s,dough}=fixture(),before=JSON.stringify(s);
 s.lots.push({id:'old-masa-lot',itemId:dough.id,qty:5,remaining:5,date:'2026-11-01'});
 const out=configureVentoFitDoughSplit(s);
 assert.equal(out.changed,false);assert.match(out.status.reason,/stock de masa/i);
 assert.equal(s.recipes.find(r=>r.itemId===dough.id).disabled,undefined);
 assert.notEqual(JSON.stringify(s),before);
});
test('las recetas divididas normales siguen funcionando igual',()=>{
 const recipe={secondaryItemId:'other',components:[{itemId:'raw',qty:5,scope:'both'}]};
 assert.equal(splitRequirements(recipe,2,4,6)[0].required,10);
});
