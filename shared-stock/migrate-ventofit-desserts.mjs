import {randomUUID} from 'node:crypto';
const norm=x=>String(x).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toUpperCase().trim();
export function configureDesserts(s){
 const find=name=>{const a=s.items.filter(i=>!i.archived&&norm(i.name)===norm(name));if(a.length!==1)throw Error('Materia prima o subproducto ambiguo: '+name);return a[0]};
 const existing=s.recipes.filter(r=>r.ventofitDessert200g);
 if(existing.length===9)return [];
 const raw=name=>{if(s.items.some(i=>!i.archived&&norm(i.name)===norm(name)))return; s.items.push({id:randomUUID(),name,kind:'raw',unit:'kg',archived:false,brand:'',rnpa:'',supplierIds:[]})};
 raw('Crema de leche');raw('Esencia de café');
 const q='Queso crema',c='Crema de leche',g='Glutadiet',e='Eritritol',v='Esencia de Vainilla',h='Huevo en polvo',a='Agua',gel='Gelatina sin sabor',ddl='Dulce de leche repostero dietético de contenido glucídico reducido';
 const base=[[q,4000],[c,4000],[g,200],[e,20],[v,200],[h,150],[a,300]];
 const creams={
  base,
  limon:[[q,4000],[c,4000],[g,200],[e,20],['Esencia de limón',35],[h,150],[a,300]],
  tiramisu:[...base,['Esencia de café',40]],
  chocolate:[[q,1000],[c,1000],['Baño de repostería semiamargo sin azúcar agregada',400],['Cacao amargo en polvo',100],[g,50],[e,80],[v,50],[gel,20],[a,100],[h,150],[a,300]],
  dulce:[[q,1000],[c,1000],[ddl,600],[g,25],[e,80],[v,50],[gel,20],[a,100],[h,150],[a,300]],
  pistacho:[...base,['PASTA DE PISTACHO',4000]],
  chocotorta:[[q,4000],[c,4000],[ddl,8000],[h,150],[a,300]],
  mani:[[q,2000],[c,2000],['PASTA DE MANI TOSTADO',4000],[v,200],[g,200],[e,20],[h,75],[a,150]]
 };
 const specs=[['CHEESECAKE','base','CHOCOLATE'],['OREO','base','CHOCOLATE'],['LIMÓN','limon','VAINILLA'],['TIRAMISÚ','tiramisu','VAINILLA'],['MOUSSE DE CHOCOLATE','chocolate','CHOCOLATE'],['MOUSSE DE DULCE DE LECHE','dulce','VAINILLA'],['PISTACHO','pistacho','VAINILLA'],['CHOCOTORTA','chocotorta','CHOCOLATE'],['MANÍ','mani','VAINILLA']];
 const sector=s.sectors.find(x=>!x.archived&&norm(x.name)==='COCINA');if(!sector)throw Error('Falta sector cocina');
 const changes=[];
 for(const [flavor,key,cake] of specs){
  const name='POSTRE '+flavor+' 200 G';let product=s.items.find(i=>!i.archived&&i.name===name);
  let recipe=product&&s.recipes.find(r=>r.itemId===product.id&&!r.disabled);
  if(recipe?.ventofitDessert200g)continue;
  if(recipe)throw Error('Ya existe receta sin verificar: '+name);
  const formula=creams[key],total=formula.reduce((n,[,grams])=>n+grams,0),merged=new Map();
  for(const [ingredient,grams] of formula){
   const it=find(ingredient);let qty=grams/total*.12;
   if(it.unit==='g')qty*=1000;
   else if(it.unit==='u'&&ingredient===v&&Number(it.presentationContent)===5&&it.presentationContentUnit==='l')qty/=5;
   else if(!['kg','l'].includes(it.unit))throw Error('Falta equivalencia de peso: '+ingredient);
   merged.set(it.id,(merged.get(it.id)||0)+qty);
  }
  const tortita=find('TORTITA INDIVIDUAL DE '+cake+' 50 G');
  if(tortita.unit!=='u'||!tortita.convertedFromItemId||Number(tortita.unitsPerBox)!==3)throw Error('Revisar equivalencia de tortita '+cake);
  merged.set(tortita.id,1.6); // 80 g expressed against the existing 50 g piece; consumes 80/150 of a box.
  if(!product){product={id:randomUUID(),name,kind:'product',unit:'u',archived:false,brand:'',rnpa:'',salePrice:0,wholesalePrice:0};s.items.push(product)}
  recipe={id:randomUUID(),itemId:product.id,sectorId:sector.id,yield:1,shelfLifeDays:null,version:1,components:[...merged].map(([itemId,qty])=>({itemId,qty:Math.round(qty*1e9)/1e9,scope:'both'})),ventofitDessert200g:{creamGrams:120,cakeGrams:80,cakeFlavor:cake,formulaGrams:total}};
  s.recipes.push(recipe);changes.push(name);
 }
 return changes;
}
export function migrateDesserts(db){
 for(const c of db.prepare("SELECT id,state FROM companies WHERE lower(replace(trim(name),' ',''))='ventofit'").all()){
  const s=JSON.parse(c.state),changes=configureDesserts(s);
  if(changes.length){db.prepare('UPDATE companies SET state=?,version=version+1 WHERE id=?').run(JSON.stringify(s),c.id);console.log('VENTOFIT_DESSERTS_200G',JSON.stringify(changes));}
 }
}
