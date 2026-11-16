import {test} from 'node:test';
import assert from 'node:assert/strict';
import {empty,operate} from '../domain.mjs';
import {configureVentoFitTortitas,varieties} from '../vento-tortitas.mjs';
function company(){
 const s=empty('Vento Fit');
 const sector=operate(s,'master',{collection:'sectors',name:'Cocina'});
 const raw=operate(s,'master',{collection:'items',name:'Premezcla Almendras Neutra',kind:'raw',unit:'kg'});
 for(let i=0;i<varieties.length;i++){
  const product=operate(s,'master',{collection:'items',name:varieties[i].box,kind:'product',unit:'u'});
  operate(s,'recipe',{itemId:product.id,sectorId:sector.id,yield:[62,62,77,68,68][i],shelfLifeDays:30,components:[{itemId:raw.id,qty:4}]});
 }
 s.lots.push({id:'existing-lot',itemId:s.items[1].id,remaining:50,qty:50,code:'TV001'});
 return s;
}
test('configura 5 equivalencias en Vento Fit sin modificar stock ni recetas',()=>{
 const input=company(),beforeLots=JSON.stringify(input.lots),beforeRecipes=JSON.stringify(input.recipes);
 const configured=configureVentoFitTortitas(input);
 assert.equal(configured.changes.length,5);
 assert.equal(configured.outcomes.filter(x=>x.status==='configurada').length,5);
 assert.equal(configured.state.items.filter(i=>i.convertedFromItemId).length,5);
 assert.deepEqual(configured.state.items.filter(i=>i.convertedFromItemId).map(i=>i.unitsPerBox),[3,3,3,3,3]);
 assert.equal(JSON.stringify(configured.state.lots),beforeLots);
 assert.equal(JSON.stringify(configured.state.recipes),beforeRecipes);
 assert.equal(JSON.stringify(input.lots),beforeLots);
 const again=configureVentoFitTortitas(configured.state);
 assert.equal(again.changed,false);assert.equal(again.changes.length,0);
 assert.equal(again.state.items.length,configured.state.items.length);
});
test('no crea productos si falta una receta o hay un nombre ambiguo',()=>{
 const s=company(),last=varieties[4];
 s.recipes=s.recipes.filter(r=>s.items.find(i=>i.id===r.itemId)?.name!==last.box);
 const previousLot=JSON.stringify(s.lots),r=configureVentoFitTortitas(s);
 assert.equal(r.outcomes.find(x=>x.flavor==='queso').status,'pendiente');
 assert.equal(JSON.stringify(r.state.lots),previousLot);
 assert.equal(r.state.items.filter(i=>i.convertedFromItemId).length,4);
});
