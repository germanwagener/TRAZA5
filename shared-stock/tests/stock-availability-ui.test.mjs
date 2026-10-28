import {test} from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const source=readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
test('producción distingue saldo disponible de consumo 0 y explica exclusiones',()=>{
 const ctx=vm.createContext({console,clearTimeout(){},setTimeout(){},document:{querySelector:s=>s==='[name=date]'?{value:'2026-10-28'}:{},querySelectorAll:()=>[],addEventListener(){}}});
 vm.runInContext(source.slice(0,source.lastIndexOf('(async()=>')),ctx);
 vm.runInContext("state={items:[{id:'flour',name:'Harina',kind:'raw',unit:'kg'},{id:'water',name:'Agua',kind:'raw',unit:'l',supplyMode:'mains'}],lots:[{id:'a',itemId:'flour',remaining:50,status:'LIBERADO',date:'2026-10-01',expiry:'2027-01-01',sectorId:'archived'},{id:'b',itemId:'flour',remaining:10,status:'LIBERADO',date:'2026-10-01',expiry:'2026-10-15'},{id:'c',itemId:'flour',remaining:20,status:'BLOQUEADO',date:'2026-10-01'},{id:'d',itemId:'flour',remaining:30,status:'LIBERADO',date:'2026-10-29'}]}",ctx);
 const html=vm.runInContext("lotInputs(['flour','water'])",ctx);
 assert.match(html,/Stock disponible/);assert.match(html,/Vencido: 10 kg/);assert.match(html,/Bloqueado o rechazado: 20 kg/);assert.match(html,/Ingreso posterior.*30 kg/);assert.match(html,/Agua de red · sin control por lote/);assert.match(html,/Cantidad a consumir/);assert.match(html,/data-lot="a"/);assert.doesNotMatch(html,/data-lot="[bcd]"/);assert.equal(vm.runInContext("stockAvailability('flour','2026-10-28').available",ctx),50);
});
