import {test} from 'node:test';
import assert from 'node:assert/strict';
import {empty,operate,trace,recipeCost} from '../domain.mjs';
import {configureVentoFitGnocchi} from '../vento-gnocchi.mjs';
function fixture(){
 const s=empty('Vento Fit'),sector=operate(s,'master',{collection:'sectors',name:'cocina'}),supplier=operate(s,'master',{collection:'suppliers',name:'Proveedor'});
 const materials={};for(const [name,qty] of [['Harina de almendras',15],['Huevo en polvo',2],['Sal',.5],['Espinaca en escamas',2]]){
  const it=operate(s,'master',{collection:'items',name,kind:'raw',unit:'kg'});
  const receipt=operate(s,'purchase',{date:'2026-11-15',itemId:it.id,supplierId:supplier.id,supplierLot:'LOTE-'+name,qty:qty*4,unitCost:10,expiry:'2027-04-15'});
  materials[name]={it,lotId:receipt.lotId,qty};
 }
 const variants=[];
 for(const [flavor,massName,productName,ingredients] of [
  ['naturales','MASA DE ÑOQUIS NATURALES','ÑOQUIS NATURALES',[['Harina de almendras',15],['Huevo en polvo',2],['Sal',.5]]],
  ['espinaca','MASA DE ÑOQUIS DE ESPINACA','ÑOQUIS ESPINACA',[['Harina de almendras',15],['Huevo en polvo',2],['Sal',.5],['Espinaca en escamas',2]]]
 ]){
  const mass=operate(s,'master',{collection:'items',name:massName,kind:'subproduct',unit:'kg'});
  const final=operate(s,'master',{collection:'items',name:productName,kind:'product',unit:'u'});
  const components=ingredients.map(([name,qty])=>({itemId:materials[name].it.id,qty}));
  const mr=operate(s,'recipe',{itemId:mass.id,sectorId:sector.id,yield:30,shelfLifeDays:30,components});
  const fr=operate(s,'recipe',{itemId:final.id,sectorId:sector.id,yield:1,shelfLifeDays:30,components:[{itemId:mass.id,qty:.5}]});
  variants.push({flavor,mass,final,mr,fr,ingredients});
 }
 return{s,variants,materials};
}
test('convierte las dos variedades en dos recetas independientes directas sin modificar lotes',()=>{
 const {s,variants}=fixture(),beforeLots=JSON.stringify(s.lots),beforeProductions=JSON.stringify(s.productions),beforeItems=JSON.stringify(s.items);
 const result=configureVentoFitGnocchi(s);assert.equal(result.changed,true);
 assert.deepEqual(result.outcomes.map(o=>o.status),['configurada','configurada']);
 assert.equal(JSON.stringify(result.state.lots),beforeLots);assert.equal(JSON.stringify(result.state.productions),beforeProductions);
 for(const v of variants){
  const fr=result.state.recipes.find(r=>r.id===v.fr.id),mr=result.state.recipes.find(r=>r.id===v.mr.id);
  assert.equal(fr.yield,60);assert.equal(fr.directGnocchi.packWeightGrams,500);
  assert.deepEqual(fr.components.map(c=>c.itemId),v.mr.components.map(c=>c.itemId));
  assert.ok(fr.components.every(c=>c.itemId!==v.mass.id));
  assert.equal(mr.disabled,true);assert.equal(result.state.items.find(i=>i.id===v.mass.id).archived,true);
 }
 assert.equal(result.outcomes[0].ingredientSumKg,17.5);assert.equal(result.outcomes[1].ingredientSumKg,19.5);
 assert.equal(result.outcomes[0].massDifferenceKg,12.5);assert.equal(result.outcomes[1].massDifferenceKg,10.5);
 assert.equal(configureVentoFitGnocchi(result.state).changed,false);
});
test('cada variedad produce porciones 500 g descontando SOLO sus ingredientes y dejando trazabilidad',()=>{
 const {s,variants,materials}=fixture(),st=configureVentoFitGnocchi(s).state;
 for(const v of variants){
  const fr=st.recipes.find(r=>r.id===v.fr.id),before=st.productions.length;
  const alloc=v.ingredients.map(([name,qty])=>({lotId:materials[name].lotId,qty}));
  const produced=operate(st,'produce',{date:'2026-11-17',lotCode:'NOQ-'+v.flavor,recipeId:fr.id,batches:1,qty:60,allocations:alloc});
  assert.equal(st.productions.length,before+1);assert.equal(produced.qty,60);assert.equal(produced.inputs.length,v.ingredients.length);
  assert.equal(st.lots.filter(l=>l.itemId===v.mass.id).length,0);
  assert.ok(trace(st,produced.lotId).ancestors.includes(alloc[0].lotId));
  assert.throws(()=>operate(st,'produce',{date:'2026-11-18',recipeId:v.mr.id,batches:1,qty:30,allocations:[]}),/reemplaz/);
  const cost=recipeCost(st,v.final.id);assert.ok(Math.abs(cost-v.ingredients.reduce((s,[,q])=>s+q*10,0)/60)<1e-6);
 }
 assert.equal(st.productions.filter(p=>variants.some(v=>p.itemId===v.final.id)).length,2);
});
test('si hay stock de masa previo, omite esa variedad y protege el inventario',()=>{
 const {s,variants}=fixture(),natural=variants[0];s.lots.push({id:'OLD-MASS',itemId:natural.mass.id,remaining:1,qty:1,date:'2026-11-01'});
 const result=configureVentoFitGnocchi(s);
 assert.equal(result.outcomes.find(x=>x.flavor==='naturales').status,'pendiente');
 assert.equal(result.outcomes.find(x=>x.flavor==='espinaca').status,'configurada');
 assert.equal(result.state.lots.find(x=>x.id==='OLD-MASS').remaining,1);
 assert.equal(result.state.recipes.find(x=>x.id===natural.mr.id).disabled,undefined);
});
