import {test} from 'node:test';
import assert from 'node:assert/strict';
import {empty,operate} from '../domain.mjs';
function scenario(name='Betel'){
 const s=empty(name);s.items=[{id:1,name:'Prepizza',kind:'subproduct',unit:'u'},{id:2,name:'Harina',kind:'raw',unit:'kg'},{id:3,name:'Fugazza',kind:'subproduct',unit:'u'}];s.sectors=[{id:7,name:'Elaboración',archived:true},{id:8,name:'Otro',archived:true},{id:9,name:'Activo'}];
 s.recipes=[{id:'original',itemId:1,secondaryItemId:3,sectorId:7,yield:34,shelfLifeDays:5,components:[{itemId:2,qty:9,scope:'both'}],version:5}];s.productions=[{id:'history',recipe:structuredClone(s.recipes[0])}];s.lots=[{id:'lot',itemId:1,remaining:10,unitCost:1}];return s;
}
for(const company of ['Betel','Otra empresa'])for(const sectorId of ['7','',undefined])test(company+' conserva sector actual archivado '+String(sectorId),()=>{
 const s=scenario(company),history=JSON.stringify({productions:s.productions,lots:s.lots}),sectors=JSON.stringify(s.sectors);
 const r=operate(s,'recipe',{name:'Prepizza',kind:'subproduct',unit:'u',itemId:'1',secondaryItemId:'3',sectorId,yield:35,shelfLifeDays:5,components:[{itemId:'2',qty:9,scope:'both'}]});
 assert.equal(r.id,'original');assert.equal(r.version,6);assert.equal(r.sectorId,7);assert.equal(r.yield,35);assert.equal(s.recipes.length,1);assert.equal(JSON.stringify({productions:s.productions,lots:s.lots}),history);assert.equal(JSON.stringify(s.sectors),sectors);
});
test('no asigna otro sector archivado',()=>assert.throws(()=>operate(scenario(),'recipe',{itemId:1,sectorId:8,yield:34,components:[{itemId:2,qty:9}]}),/archivado/));
test('sector inexistente tiene mensaje claro',()=>assert.throws(()=>operate(scenario(),'recipe',{itemId:1,sectorId:404,yield:34,components:[{itemId:2,qty:9}]}),/sector de elaboración válido/));
test('receta nueva requiere sector activo',()=>{const s=scenario();s.recipes=[];assert.throws(()=>operate(s,'recipe',{itemId:1,sectorId:7,yield:34,components:[{itemId:2,qty:9}]}),/archivado/)});
test('permite elegir sector activo',()=>{const s=scenario();const r=operate(s,'recipe',{itemId:1,secondaryItemId:3,sectorId:9,yield:34,components:[{itemId:2,qty:9}]});assert.equal(r.sectorId,9);assert.equal(r.id,'original')});