import {test} from 'node:test';
import assert from 'node:assert/strict';
import {empty,operate,trace,avgCost} from '../domain.mjs';
import {suggestLots} from '../planning.mjs';
function fixture(){
 const s=empty('Vento Fit'),sector=operate(s,'master',{collection:'sectors',name:'Cocina'});
 const supplier=operate(s,'master',{collection:'suppliers',name:'Drovandi'});
 const raw=operate(s,'master',{collection:'items',name:'Premezcla',kind:'raw',unit:'kg'});
 const box=operate(s,'master',{collection:'items',name:'Tortitas vainilla caja 150 g',kind:'product',unit:'u'});
 const postre=operate(s,'master',{collection:'items',name:'Postre',kind:'product',unit:'u'});
 const entry=operate(s,'purchase',{date:'2026-11-01',itemId:raw.id,supplierId:supplier.id,supplierLot:'P1',qty:5,unitCost:10,expiry:'2027-01-01'});
 const recipe=operate(s,'recipe',{itemId:box.id,sectorId:sector.id,yield:62,shelfLifeDays:30,components:[{itemId:raw.id,qty:1}]});
 const produced=operate(s,'produce',{date:'2026-11-01',lotCode:'TORT01',recipeId:recipe.id,batches:1,qty:62,allocations:[{lotId:entry.lotId,qty:1}]});
 const linked=operate(s,'linkPieces',{boxItemId:box.id,pieceName:'Tortita individual vainilla 50 g',unitsPerBox:3});
 return{s,sector,box,postre,entry,produced,pieceId:linked.itemId};
}
test('equivalencia solo configura catálogo y no abre cajas ni crea lotes',()=>{
 const{s,box,pieceId}=fixture();assert.equal(s.lots.length,2);assert.equal(s.productions.length,1);
 const before=JSON.stringify(s.lots),n=s.items.length;
 const r=operate(s,'linkPieces',{boxItemId:box.id,pieceItemId:pieceId,unitsPerBox:3});
 assert.equal(r.stockUnchanged,true);assert.equal(s.items.length,n);assert.equal(JSON.stringify(s.lots),before);
 assert.throws(()=>operate(s,'linkPieces',{boxItemId:box.id,pieceItemId:pieceId,unitsPerBox:4}));
 assert.throws(()=>operate(s,'unpack',{date:'2026-11-03',lotId:s.lots[1].id,boxes:1,unitsPerBox:3}),/Operación desconocida/);
});
test('postre consume 1,6 tortitas y descuenta 1,6/3 cajas del lote sin stock duplicado',()=>{
 const{s,sector,box,postre,entry,produced,pieceId}=fixture();
 const parentLot=s.lots.find(l=>l.id===produced.lotId),allLots=s.lots.length;
 const recipe=operate(s,'recipe',{itemId:postre.id,sectorId:sector.id,yield:1,shelfLifeDays:1,components:[{itemId:pieceId,qty:1.6}]});
 assert.ok(Math.abs(avgCost(s,pieceId)-avgCost(s,box.id)/3)<1e-10);
 const suggested=suggestLots(s,[{itemId:pieceId,qty:1.6}],'2026-11-03');
 assert.deepEqual(suggested.shortages,[]);assert.equal(suggested.allocations.length,1);
 assert.ok(Math.abs(suggested.allocations[0].qty-1.6/3)<1e-12);
 const before=parentLot.remaining;
 const result=operate(s,'produce',{date:'2026-11-03',lotCode:'POSTRE01',recipeId:recipe.id,batches:1,qty:1,allocations:suggested.allocations});
 assert.ok(Math.abs(parentLot.remaining-(before-1.6/3))<1e-10);
 assert.equal(s.lots.length,allLots+1);
 assert.equal(result.inputs[0].recipeItemId,pieceId);
 assert.equal(result.inputs[0].consumedQty,1.6);
 assert.equal(result.inputs[0].lotId,produced.lotId);
 const t=trace(s,result.lotId);
 assert.ok(t.ancestors.includes(entry.lotId));assert.ok(t.ancestors.includes(produced.lotId));assert.equal(t.incomplete,false);
 assert.ok(t.consumptions.some(c=>c.name==='Tortita individual vainilla 50 g'&&c.qty===1.6));
 assert.equal(s.productions.length,2);
});
test('protege lotes vencidos, equivalencia y aislamiento entre empresas',()=>{
 const{s,sector,box,postre,pieceId}=fixture(),other=empty('Otra empresa');
 const recipe=operate(s,'recipe',{itemId:postre.id,sectorId:sector.id,yield:1,components:[{itemId:pieceId,qty:2}]});
 const shortage=suggestLots(s,[{itemId:pieceId,qty:2}],'2027-01-02');assert.equal(shortage.shortages.length,1);
 const before=JSON.stringify(s);assert.throws(()=>operate(s,'produce',{date:'2026-11-05',recipeId:recipe.id,batches:1,qty:1,allocations:[]}));
 assert.equal(JSON.stringify(s),before);
 const old=JSON.stringify(other);operate(s,'linkPieces',{boxItemId:box.id,pieceItemId:pieceId,unitsPerBox:3});assert.equal(JSON.stringify(other),old);
});
