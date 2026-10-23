import {empty,operate} from '../../domain.mjs';
export function scenario(){
 const s=empty('Prueba de trazabilidad completa'),run=(op,p)=>operate(s,op,p);
 const sector=run('master',{collection:'sectors',name:'Panadería'}),starter=run('master',{collection:'sectors',name:'Fermentación'});
 const supA=run('master',{collection:'suppliers',name:'Molino A'}),supB=run('master',{collection:'suppliers',name:'Proveedor B'}),customer=run('master',{collection:'customers',name:'Cliente de prueba'});
 const raw=Object.fromEntries(['Harina','Agua','Levadura','Aceite','Almendra'].map(name=>[name,run('master',{collection:'items',name,kind:'raw',unit:'kg'})]));
 const buy=(i,supplier,code,sectorId)=>run('purchase',{date:'2026-09-10',itemId:i.id,supplierId:supplier.id,supplierLot:code,sectorId,qty:50,unitCost:10,expiry:'2026-12-30',manufactured:'2026-09-01'});
 const a=buy(raw.Harina,supA,'HAR-A',starter.id),b=buy(raw.Harina,supB,'HAR-B',starter.id),water=buy(raw.Agua,supB,'AGUA',starter.id),yeast=buy(raw.Levadura,supB,'LEV',sector.id),oil=buy(raw.Aceite,supB,'ACE',sector.id),almond=buy(raw.Almendra,supB,'ALM',sector.id);
 const sub=run('recipe',{name:'Masa madre',kind:'subproduct',unit:'kg',sectorId:starter.id,yield:4,shelfLifeDays:5,components:[{itemId:raw.Harina.id,qty:3},{itemId:raw.Agua.id,qty:1}]});
 const sp=run('produce',{date:'2026-09-11',recipeId:sub.id,batches:1,qty:4,lotCode:'MM-001',allocations:[{lotId:a.lotId,qty:2},{lotId:b.lotId,qty:1},{lotId:water.lotId,qty:1}]});
 // Simulate transfers saved by the previous release; new transfers are disabled.
 for(const lotId of [a.lotId,b.lotId,sp.lotId]){const l=s.lots.find(x=>x.id===lotId);s.transfers.push({id:'historical-'+lotId,date:'2026-09-11',lotId,qty:l.remaining,from:l.sectorId,to:sector.id});l.sectorId=sector.id;}
 const recipe=run('recipe',{name:'Pan completo',kind:'product',unit:'u',sectorId:sector.id,yield:10,shelfLifeDays:7,components:[{itemId:raw.Harina.id,qty:2},{itemId:raw.Levadura.id,qty:.2},{itemId:raw.Aceite.id,qty:.5},{itemId:raw.Almendra.id,qty:1},{itemId:sub.itemId,qty:2}]});
 const production=run('produce',{date:'2026-09-11',recipeId:recipe.id,batches:1,qty:10,lotCode:'PAN-001',allocations:[{lotId:a.lotId,qty:1},{lotId:b.lotId,qty:1},{lotId:yeast.lotId,qty:.2},{lotId:oil.lotId,qty:.5},{lotId:almond.lotId,qty:1},{lotId:sp.lotId,qty:2}]});
 run('sale',{date:'2026-09-11',customerId:customer.id,itemId:recipe.itemId,unitPrice:100,allocations:[{lotId:production.lotId,qty:3}]});
 run('loss',{date:'2026-09-11',lotId:production.lotId,qty:1,reason:'Control de calidad'});
 return {s,raw,a,b,water,recipe,production,sp,customer,sector,starter};
}
