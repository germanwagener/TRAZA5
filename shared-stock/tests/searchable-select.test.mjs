import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const text=readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
function line(prefix){const l=text.split('\n').find(x=>x.startsWith(prefix));assert.ok(l,'No existe '+prefix);return l}
const source=[line('const alphabetical='),line('const searchText='),line('const pickerSearchText='),line('const pickerMatches=')].join('\n');
const ctx=vm.createContext({});
const helpers=vm.runInContext(source+';({alphabetical,pickerMatches})',ctx);
test('ordena materias primas y recetas sin distinguir tildes y mayúsculas',()=>{
 const raw=[{name:'Zanahoria'},{name:'Ácido cítrico'},{name:'Aceite de oliva'},{name:'almendras'}];
 raw.sort(helpers.alphabetical);assert.deepEqual(raw.map(x=>x.name),['Aceite de oliva','Ácido cítrico','almendras','Zanahoria']);
});
test('busca similitudes parciales y palabras múltiples sin limitar a una letra',()=>{
 assert.equal(helpers.pickerMatches('PREMEZCLA DE HARINA DE ALMENDRAS (kg)','harina almen'),true);
 assert.equal(helpers.pickerMatches('Ácido cítrico (g)','acido cit'),true);
 assert.equal(helpers.pickerMatches('Aceite de oliva extra virgen','oliva aceite'),true);
 assert.equal(helpers.pickerMatches('Sal fina (kg)','sal gruesa'),false);
});
test('los desplegables se guardan como IDs nativos y cubren ingresos, recetas y producción',()=>{
 for(const key of ['itemId','component','recipeId','supplierId'])assert.ok(text.includes("'"+key+"'"));
 assert.ok(text.includes('source.dispatchEvent(new Event(\'change\''));
 assert.ok(text.includes('name="${key}" data-picker-source'));
 assert.ok(!text.includes('list.sort((a,b)=>String(a.id)'));
});
