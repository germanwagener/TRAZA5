import {test} from 'node:test';
import assert from 'node:assert/strict';
import {empty,operate,trace} from '../domain.mjs';
function fixture(){
 const s=empty('Vento Fit'),sector=operate(s,'master',{collection:'sectors',name:'Cocina'});
 const supplier=operate(s,'master',{collection:'suppliers',name:'Drovandi'});
 const raw=operate(s,'master',{collection:'items',name:'Premezcla',kind:'raw',unit:'kg'});
 const box=operate(s,'master',{collection:'items',name:'Tortitas vainilla caja 150 g',kind:'product',unit:'u'});
 const dessert=operate(s,'master',{collection:'items',name:'Postre',kind:'product',unit:'u'});
 const entry=operate(s,'purchase',{date:'2026-11-01',itemId:raw.id,supplierId:supplier.id,supplierLot:'PM1',qty:5,unitCost:10,expiry:'2027-01-01'});
 const recipe=operate(s,'recipe',{itemId:box.id,sectorId:sector.id,yield:62,shelfLifeDays:30,components:[{itemId:raw.id,qty:1}]});
 const boxes=operate(s,'produce',{date:'2026-11-01',lotCode:'TORT1',recipeId:recipe.id,batches:1,qty:62,allocations:[{lotId:entry.lotId,qty:1}]});
 return{s,sector,box,dessert,entry,boxes};
}
test('apertura 2 cajas produce 6 piezas y se traza al postre sin duplicar stock',()=>{
 const{s,sector,box,dessert,entry,boxes}=fixture(),history=structuredClone(s.purchases),original=s.lots.find(l=>l.id===boxes.lotId);
 const opened=operate(s,'unpack',{date:'2026-11-03',lotId:boxes.lotId,boxes:2,unitsPerBox:3,targetName:'Tortita individual vainilla'});
 const pieces=s.lots.find(l=>l.id===opened.lotId);
 assert.equal(original.remaining,60);assert.equal(pieces.remaining,6);
 assert.equal(pieces.expiry,original.expiry);assert.equal(pieces.expiry,'2026-12-01');
 assert.equal(opened.inputs[0].qty,2);assert.equal(opened.inputs[0].lotId,original.id);
 assert.equal(s.items.find(i=>i.id===opened.itemId).convertedFromItemId,box.id);
 assert.ok(Math.abs(opened.qty*opened.unitCost-2*original.unitCost)<1e-8);
 assert.deepEqual(s.purchases,history);assert.equal(trace(s,pieces.id).incomplete,false);
 const recipe=operate(s,'recipe',{itemId:dessert.id,sectorId:sector.id,yield:1,components:[{itemId:opened.itemId,qty:2}]});
 const postre=operate(s,'produce',{date:'2026-11-03',lotCode:'POSTRE1',recipeId:recipe.id,batches:1,qty:1,allocations:[{lotId:pieces.id,qty:2}]});
 assert.equal(pieces.remaining,4);
 const traced=trace(s,postre.lotId);
 assert.ok(traced.ancestors.includes(entry.lotId));assert.ok(traced.ancestors.includes(boxes.lotId));assert.ok(traced.ancestors.includes(pieces.id));assert.equal(traced.incomplete,false);
});
test('no duplica subproductos ni permite conversiones inválidas',()=>{
 const{s,boxes}=fixture();
 const first=operate(s,'unpack',{date:'2026-11-03',lotId:boxes.lotId,boxes:1,unitsPerBox:3,targetName:'Tortita individual vainilla'});
 const n=s.items.length;
 assert.equal(operate(s,'unpack',{date:'2026-11-04',lotId:boxes.lotId,boxes:1,unitsPerBox:3}).itemId,first.itemId);
 assert.equal(s.items.length,n);
 for(const bad of [{boxes:1000},{boxes:1.5},{boxes:0},{unitsPerBox:4},{date:'2027-01-01'}]){
  const before=JSON.stringify(s);
  assert.throws(()=>operate(s,'unpack',{date:'2026-11-05',lotId:boxes.lotId,boxes:1,unitsPerBox:3,...bad}));
  assert.equal(JSON.stringify(s),before);
 }
});
