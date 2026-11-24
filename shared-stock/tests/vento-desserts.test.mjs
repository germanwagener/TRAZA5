import {test} from 'node:test';
import assert from 'node:assert/strict';
import {configureDesserts} from '../migrate-ventofit-desserts.mjs';
test('nine individual desserts, correct cream weight, cake mapping and no duplicates',()=>{
 const names=['Queso crema','Glutadiet','Eritritol','Esencia de Vainilla','Huevo en polvo','Agua','Esencia de limón','Gelatina sin sabor','Dulce de leche repostero dietético de contenido glucídico reducido','Baño de repostería semiamargo sin azúcar agregada','Cacao amargo en polvo','PASTA DE PISTACHO','PASTA DE MANI TOSTADO'];
 const s={items:names.map((name,id)=>({id:String(id),name,unit:'kg',kind:'raw'})),recipes:[],sectors:[{id:'c',name:'cocina'}]};
 const v=s.items.find(i=>i.name==='Esencia de Vainilla');Object.assign(v,{unit:'u',presentationContent:5,presentationContentUnit:'l'});
 for(const flavor of ['CHOCOLATE','VAINILLA'])s.items.push({id:flavor,name:'TORTITA INDIVIDUAL DE '+flavor+' 50 G',unit:'u',convertedFromItemId:'box-'+flavor,unitsPerBox:3});
 assert.equal(configureDesserts(s).length,9);
 assert.equal(s.recipes.length,9);
 for(const r of s.recipes){
  assert.equal(r.yield,1);
  const cake=r.components.find(c=>['CHOCOLATE','VAINILLA'].includes(c.itemId));assert.equal(cake.qty,1.6);
  const kg=r.components.filter(c=>c!==cake).reduce((sum,c)=>sum+c.qty*(c.itemId===v.id?5:1),0);assert.ok(Math.abs(kg-.12)<1e-8);
 }
 const cheese=s.items.find(i=>i.name==='POSTRE CHEESECAKE 200 G');assert.ok(s.recipes.find(r=>r.itemId===cheese.id).components.some(c=>c.itemId==='CHOCOLATE'));
 assert.equal(configureDesserts(s).length,0);
 assert.equal(s.items.some(i=>/FRUTOS ROJOS/.test(i.name)),false);
});
