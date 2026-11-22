const same=(a,b)=>String(a)===String(b);
const round=n=>Math.round(n*1e9)/1e9;
export function configureVentofitPortions(s){
 const changes=[];
 const portions=[
  ['PREPIZZA DE ALMENDRAS','PREPIZZA DE ALMENDRAS 300 G',.3],
  ['PANQUEQUES DULCES','PANQUEQUES DULCES CAJA X12 240 G',.24],
  ['PANQUEQUES SALADOS','PANQUEQUES SALADOS CAJA X12 240 G',.24],
  ['CANELONES DE POLLO','CANELONES DE POLLO CAJA X3 300 G',.3],
  ['CANELONES DE VERDURA','CANELONES DE VERDURA CAJA X3 300 G',.3],
  ['PAN PARA PAN RALLADO','PAN RALLADO 500 G',.5],
  ['BUDÍN DE CHOCOLATE Y NUEZ',null,2.5],
  ['BUDÍN DE DULCE DE LECHE Y FRUTOS SECOS',null,2.5],
  ['BUDÍN DE LIMÓN CON GLASÉ',null,2.5],
  ['BUDÍN DE PISTACHO Y CHOCOLATE BLANCO',null,2.5],
  ['BUDÍN MARMOLADO CON PASTA DE MANÍ',null,2.5],
  ['COOKIES CON CHIPS DE CHOCOLATE',null,.15],
  ['COOKIES DE CACAO Y MANÍ',null,.15],
  ['COOKIES DE LIMÓN Y COCO',null,.15],
  ['PEPAS DE CACAO Y FRUTOS ROJOS',null,.15],
  ['PEPAS DE VAINILLA Y DULCE DE LECHE',null,.15],
  ['PEPAS DE VAINILLA Y MEMBRILLO',null,.15],
  ['CRACKERS SABOR ORÉGANO',null,.2],
  ['CRACKERS SABOR PIZZA',null,.2],
  ['CRACKERS SALADAS',null,.2],
  ['GRANOLA COMÚN',null,.32],
  ['GRANOLA CON ARÁNDANOS',null,.32],
  ['PAN DE HARINA DE ALMENDRAS',null,.4]
 ];
 for(const [baseName,packName,kg] of portions){
  const base=s.items.find(i=>i.name===baseName),pack=s.items.find(i=>i.name===packName);
  const r=base&&s.recipes.find(r=>same(r.itemId,base.id)&&!r.disabled);
  if(!r||r.ventofitDirectPortion)continue;
  if(base.unit!=='kg'||!(Number(r.yield)>0))throw Error('Porción incompatible: '+baseName);
  const oldYield=Number(r.yield);
  r.components=r.components.map(c=>({...c,qty:round(Number(c.qty)*kg/oldYield)}));
  r.yield=1;r.version=Number(r.version||0)+1;r.ventofitDirectPortion={kg};
  // Consumers expressed in kilograms now consume equivalent portions.
  for(const other of s.recipes)if(other!==r)for(const c of other.components||[])if(same(c.itemId,base.id))c.qty=round(Number(c.qty)/kg);
  for(const l of s.lots.filter(l=>same(l.itemId,base.id))){l.qty=round(Number(l.qty)/kg);l.remaining=round(Number(l.remaining)/kg);l.unitCost=Number(l.unitCost||0)*kg;}
  base.unit='u';base.kind='product';
  if(pack){s.recipes=s.recipes.filter(x=>!same(x.itemId,pack.id));pack.archived=true;}
  if(baseName==='PAN PARA PAN RALLADO')base.name='PAN RALLADO 500 G';
  changes.push(base.name);
 }
 const names=['FIDEOS CINTA 500 G','FIDEOS MOSTACHOLES 500 G','ÑOQUIS ESPINACA','ÑOQUIS NATURALES','KESITAS',
 'TORTITAS DE CHOCOLATE CAJA X3 150 G','TORTITAS DE COCO CAJA X3 150 G','TORTITAS DE FRUTOS ROJOS CAJA X3 150 G','TORTITAS DE QUESO CAJA X3 150 G','TORTITAS DE VAINILLA CAJA X3 150 G'];
 for(const name of names){
  const i=s.items.find(i=>i.name===name&&!i.archived),r=i&&s.recipes.find(r=>same(r.itemId,i.id)&&!r.disabled);
  if(!r||r.ventofitSingleOutput)continue;
  const total=Number(r.yield);if(i.unit!=='u'||!(total>0))throw Error('Unidad incompatible: '+name);
  r.components=r.components.map(c=>({...c,qty:round(Number(c.qty)/total)}));
  r.yield=1;r.version=Number(r.version||0)+1;r.ventofitSingleOutput=true;
  changes.push(name);
 }
 return changes;
}
export function migrateVentofitPortions(db){
 const results=[];
 for(const company of db.prepare("SELECT id,state FROM companies WHERE lower(replace(trim(name),' ',''))='ventofit'").all()){
  const s=JSON.parse(company.state),changes=configureVentofitPortions(s);
  if(changes.length)db.prepare('UPDATE companies SET state=?,version=version+1 WHERE id=?').run(JSON.stringify(s),company.id);
  results.push(...changes);
 }
 return results;
}
