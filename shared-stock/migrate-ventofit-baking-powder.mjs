export function configureBakingPowder(s){
 const matches=s.items.filter(i=>String(i.name).toLocaleLowerCase('es').trim()==='polvo de hornear'&&!i.archived);
 if(matches.length!==1)throw Error('Se esperaba una sola materia prima Polvo de hornear');
 const item=matches[0];if(item.ventofitBag3kg)return null;
 if(!['u','kg'].includes(item.unit))throw Error('Unidad inesperada de polvo de hornear');
 const before=s.lots.filter(l=>String(l.itemId)===String(item.id)).map(l=>({id:l.id,qty:l.qty,remaining:l.remaining,unitCost:l.unitCost}));
 if(item.unit==='u')for(const l of s.lots.filter(l=>String(l.itemId)===String(item.id))){
  l.qty=Number(l.qty)*3;l.remaining=Number(l.remaining)*3;l.unitCost=Number(l.unitCost||0)/3;
 }
 // Recipe quantities were entered as kilograms; their numerical values stay the same.
 Object.assign(item,{unit:'kg',presentationName:'Bolsa',presentationContent:3,presentationContentUnit:'kg',ventofitBag3kg:true});
 return {itemId:item.id,previousLots:before,stockKg:s.lots.filter(l=>String(l.itemId)===String(item.id)).reduce((n,l)=>n+Number(l.remaining),0)};
}
export function migrateBakingPowder(db){
 for(const c of db.prepare("SELECT id,state FROM companies WHERE lower(replace(trim(name),' ',''))='ventofit'").all()){
  const s=JSON.parse(c.state),result=configureBakingPowder(s);if(!result)continue;
  db.prepare('UPDATE companies SET state=?,version=version+1 WHERE id=?').run(JSON.stringify(s),c.id);
  db.prepare('INSERT INTO audit VALUES(?,?,?,?,?,?)').run(crypto.randomUUID(),new Date().toISOString(),'system',c.id,'baking_powder_stock_kg',JSON.stringify(result));
  console.log('VENTOFIT_BAKING_POWDER_KG',JSON.stringify(result));
 }
}
