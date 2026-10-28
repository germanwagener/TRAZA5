import {test} from 'node:test';
import assert from 'node:assert/strict';
import {empty,operate,trace} from '../domain.mjs';
import {suggestLots} from '../planning.mjs';
for(const archived of [false,true])test('producción usa stock compartido con sector histórico archivado='+archived+' sin alterar historia ni otra empresa',()=>{
 const s=empty('Empresa A'),other=empty('Empresa B'),otherBefore=structuredClone(other);
 const depot=operate(s,'master',{collection:'sectors',name:'Depósito'}),kitchen=operate(s,'master',{collection:'sectors',name:'Cocina'});
 const supplier=operate(s,'master',{collection:'suppliers',name:'Proveedor'});
 const ingredient=operate(s,'master',{collection:'items',name:'Mozzarella',kind:'raw',unit:'kg'});
 const recipe=operate(s,'recipe',{name:'Pizza',kind:'product',unit:'u',sectorId:kitchen.id,yield:2,components:[{itemId:ingredient.id,qty:3}]});
 kitchen.archived=archived;
 const sectorsBefore=structuredClone(s.sectors);
 const received=operate(s,'purchase',{date:'2026-10-01',itemId:ingredient.id,supplierId:supplier.id,supplierLot:'PROV-1',qty:5,unitCost:10,expiry:'2026-11-01'});
 assert.equal(s.lots[0].sectorId,'');
 // Represent existing records: these fields and past transfers must survive unchanged.
 s.lots[0].sectorId=depot.id;s.transfers.push({id:'old',lotId:received.lotId,from:'',to:depot.id,qty:5});
 const history=structuredClone(s.transfers),purchases=structuredClone(s.purchases),lotCode=s.lots[0].code;
 const result=suggestLots(s,[{itemId:ingredient.id,qty:3}],'2026-10-02',kitchen.id);
 assert.deepEqual(result.shortages,[]);
 const produced=operate(s,'produce',{date:'2026-10-02',recipeId:recipe.id,batches:1,qty:2,expiry:'2026-10-10',allocations:result.allocations});
 assert.equal(s.lots[0].remaining,2);assert.equal(s.lots[0].code,lotCode);assert.equal(s.lots[0].sectorId,depot.id);
 assert.equal(produced.inputs[0].lotId,received.lotId);assert.ok(trace(s,received.lotId).descendants.includes(produced.lotId));
 assert.deepEqual(s.transfers,history);assert.deepEqual(s.purchases,purchases);assert.deepEqual(other,otherBefore);
 assert.deepEqual(s.sectors,sectorsBefore);
 const before=structuredClone(s);assert.throws(()=>operate(s,'transfer',{date:'2026-10-03',lotId:received.lotId,sectorId:kitchen.id}),/stock compartido/);assert.deepEqual(s,before);
});
test('stock compartido sigue excluyendo lotes bloqueados, vencidos o futuros',()=>{
 const s=empty('A');s.items=[{id:'i'}];s.lots=[{id:'a',itemId:'i',remaining:1,status:'BLOQUEADO',date:'2026-10-01'},{id:'b',itemId:'i',remaining:1,status:'LIBERADO',date:'2026-10-01',expiry:'2026-10-02'},{id:'c',itemId:'i',remaining:1,status:'LIBERADO',date:'2026-10-20'}];
 assert.deepEqual(suggestLots(s,[{itemId:'i',qty:1}],'2026-10-19').allocations,[]);
});
