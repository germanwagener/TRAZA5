export function configureCreamCheese(s){
 const matches=s.items.filter(i=>String(i.name).toLocaleLowerCase('es').trim()==='queso crema'&&!i.archived);
 if(matches.length!==1)throw Error('Se esperaba una sola materia prima Queso crema');
 const item=matches[0];if(item.ventofitCreamCheese4kg)return null;
 if(!['u','kg'].includes(item.unit))throw Error('Unidad inesperada de queso crema');
 const before=s.lots.filter(l=>String(l.itemId)===String(item.id)).map(l=>({id:l.id,qty:l.qty,remaining:l.remaining,unitCost:l.unitCost}));
 if(item.unit==='u')for(const l of s.lots.filter(l=>String(l.itemId)===String(item.id))){
  l.qty=Number(l.qty)*4;l.remaining=Number(l.remaining)*4;l.unitCost=Number(l.unitCost||0)/4;
 }
 // Formula quantities already represent kilograms of ingredient.
 Object.assign(item,{unit:'kg',presentationName:'Envase',presentationContent:4,presentationContentUnit:'kg',ventofitCreamCheese4kg:true});
 return {itemId:item.id,previousLots:before,stockKg:s.lots.filter(l=>String(l.itemId)===String(item.id)).reduce((n,l)=>n+Number(l.remaining),0)};
}
export function migrateCreamCheese(db){
 for(const c of db.prepare("SELECT id,state FROM companies WHERE lower(replace(trim(name),' ',''))='ventofit'").all()){
  const s=JSON.parse(c.state),result=configureCreamCheese(s);if(!result)continue;
  db.prepare('UPDATE companies SET state=?,version=version+1 WHERE id=?').run(JSON.stringify(s),c.id);
  db.prepare('INSERT INTO audit VALUES(?,?,?,?,?,?)').run(crypto.randomUUID(),new Date().toISOString(),'system',c.id,'cream_cheese_stock_kg',JSON.stringify(result));
  console.log('VENTOFIT_CREAM_CHEESE_KG',JSON.stringify(result));
 }
}
