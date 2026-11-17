import {test} from 'node:test';
import assert from 'node:assert/strict';
import {empty,operate,trace} from '../domain.mjs';
import {splitRequirements,weightSplitQuantities} from '../production-split.mjs';
import {configureVentoFitDoughSplit} from '../vento-dough-split.mjs';
function fixture(){
 const s=empty('Vento Fit'),sector=operate(s,'master',{collection:'sectors',name:'Cocina'}),supplier=operate(s,'master',{collection:'suppliers',name:'Proveedor'});
 const raw=operate(s,'master',{collection:'items',name:'Harina de almendras',kind:'raw',unit:'kg'});
 const dough=operate(s,'master',{collection:'items',name:'MASA PARA DISCOS DE EMPANADA Y PASCUALINA',kind:'subproduct',unit:'kg'});
 const emp=operate(s,'master',{collection:'items',name:'DISCOS PARA EMPANADAS',kind:'product',unit:'u'});
 const tarta=operate(s,'master',{collection:'items',name:'TAPAS PARA PASCUALINAS',kind:'product',unit:'u'});
 const entry=operate(s,'purchase',{date:'2026-11-01',itemId:raw.id,supplierId:supplier.id,supplierLot:'HAR01',qty:100,unitCost:10,expiry:'2027-05-01'});
 const rm=operate(s,'recipe',{itemId:dough.id,sectorId:sector.id,yield:62.7,shelfLifeDays:30,components:[{itemId:raw.id,qty:62.7}]});
 const produced=operate(s,'produce',{date:'2026-11-01',lotCode:'MASA01',recipeId:rm.id,batches:1,qty:62.7,allocations:[{lotId:entry.lotId,qty:62.7}]});
 const r1=operate(s,'recipe',{itemId:emp.id,sectorId:sector.id,yield:1,shelfLifeDays:30,components:[{itemId:dough.id,qty:.54}]});
 const r2=operate(s,'recipe',{itemId:tarta.id,sectorId:sector.id,yield:1,shelfLifeDays:30,components:[{itemId:dough.id,qty:.42}]});
 return {s,dough,emp,tarta,produced,entry,r1,r2};
}
test('unifica receta de discos y tartas sin crear lotes ni cambiar movimientos',()=>{
 const {s,r1,r2,dough}=fixture(),beforeLots=JSON.stringify(s.lots),beforeProductions=JSON.stringify(s.productions);
 const out=configureVentoFitDoughSplit(s);assert.equal(out.changed,true);
 assert.equal(JSON.stringify(out.state.lots),beforeLots);
 assert.equal(JSON.stringify(out.state.productions),beforeProductions);
 const merged=out.state.recipes.find(r=>r.id===r1.id),old=out.state.recipes.find(r=>r.id===r2.id);
 assert.equal(merged.weightSplit.primaryGrams,540);assert.equal(merged.weightSplit.secondaryGrams,420);assert.equal(merged.weightSplit.nominalBatchGrams,62700);
 assert.equal(merged.components[0].itemId,dough.id);assert.equal(old.disabled,true);
 const next=configureVentoFitDoughSplit(out.state);assert.equal(next.changed,false);assert.equal(next.status.alreadyConfigured,true);
});
test('50 paquetes de empanadas y 30 de tarta consumen 39,6 kg y dejan 23,1 kg',()=>{
 const {s,produced,entry,r1,r2,emp,tarta}=fixture(),out=configureVentoFitDoughSplit(s),state=out.state;
 const recipe=state.recipes.find(x=>x.id===r1.id),req=splitRequirements(recipe,1,50,30);
 assert.equal(req[0].required,39.6);
 const before=state.lots.find(x=>x.id===produced.lotId).remaining;
 const p=operate(state,'produce',{date:'2026-11-02',lotCode:'PQT-001',recipeId:recipe.id,batches:1,primaryQty:50,secondaryQty:30,allocations:[{lotId:produced.lotId,qty:39.6}]});
 const lot=state.lots.find(x=>x.id===produced.lotId);
 assert.ok(Math.abs(lot.remaining-(before-39.6))<1e-6);
 assert.ok(Math.abs(lot.remaining-23.1)<1e-6);
 const outputs=state.productions.filter(x=>x.productionGroup===p.productionGroup&&p.productionGroup);
 assert.equal(outputs.length,2);
 assert.deepEqual(outputs.map(x=>x.qty),[50,30]);
 assert.deepEqual(outputs.map(x=>x.itemId),[emp.id,tarta.id]);
 assert.deepEqual(outputs.map(x=>x.inputs[0].qty),[27,12.6]);
 assert.equal(outputs[0].unitCost,outputs[0].inputs[0].qty*outputs[0].inputs[0].unitCost/50);
 assert.equal(outputs[1].unitCost,outputs[1].inputs[0].qty*outputs[1].inputs[0].unitCost/30);
 assert.ok(trace(state,outputs[0].lotId).ancestors.includes(entry.lotId));
 assert.ok(trace(state,outputs[1].lotId).ancestors.includes(produced.lotId));
 assert.throws(()=>operate(state,'produce',{date:'2026-11-02',recipeId:r2.id,batches:1,qty:1,allocations:[]}),/reemplaz/);
});
test('no admite superar los 62,7 kg por tirada ni paquetes fraccionados',()=>{
 const {s,r1,produced}=fixture(),st=configureVentoFitDoughSplit(s).state,r=st.recipes.find(x=>x.id===r1.id);
 assert.throws(()=>splitRequirements(r,1,100,30),/superan/);
 assert.throws(()=>splitRequirements(r,1,1.5,1),/enteros/);
 const before=st.lots.find(x=>x.id===produced.lotId).remaining;
 assert.throws(()=>operate(st,'produce',{date:'2026-11-02',lotCode:'BAD-1',recipeId:r.id,batches:1,primaryQty:120,secondaryQty:0,allocations:[{lotId:produced.lotId,qty:62.7}]}),/superan/);
 assert.equal(st.lots.find(x=>x.id===produced.lotId).remaining,before);
});
test('las recetas divididas ordinarias mantienen el reparto original',()=>{
 const recipe={secondaryItemId:'B',components:[{itemId:'A',qty:5,scope:'both'}]};
 assert.equal(splitRequirements(recipe,2,4,6)[0].required,10);
});
