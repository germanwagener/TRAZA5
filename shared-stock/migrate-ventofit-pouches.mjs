const PUCHES = [
  ['PREMEZCLA DE HARINA DE ALMENDRAS PARA PANQUEQUE DE VAINILLA 450 G', 'PREMEZCLA ALMENDRAS VAINILLA'],
  ['PREMEZCLA DE HARINA DE ALMENDRAS PARA PANQUEQUE SABOR CHOCOLATE 450 G', 'PREMEZCLA ALMENDRAS CHOCOLATE'],
  ['PREMEZCLA DE HARINA DE ALMENDRAS PARA PANQUEQUE SABOR NEUTRO 450 G', 'PREMEZCLA ALMENDRAS NEUTRA'],
  ['PREMEZCLA DE HARINA DE AVENA PARA PANQUEQUES SABOR VAINILLA 450 G', 'PREMEZCLA AVENA VAINILLA'],
  ['PREMEZCLA DE HARINA DE AVENA PARA PANQUEQUES SABOR CHOCOLATE 450 G', 'PREMEZCLA AVENA CHOCOLATE'],
  ['PREMEZCLA DE HARINA DE AVENA PARA PANQUEQUES SABOR NEUTRO 450 G', 'PREMEZCLA AVENA NEUTRA'],
  ['PREMEZCLA DE HARINA DE ARROZ PARA PANQUEQUES SABOR VAINILLA 450 G', 'PREMEZCLA ARROZ VAINILLA'],
  ['PREMEZCLA DE HARINA DE ARROZ PARA PANQUEQUES SABOR CHOCOLATE 450 G', 'PREMEZCLA ARROZ CHOCOLATE'],
  ['PREMEZCLA DE HARINA DE ARROZ PARA PANQUEQUES SABOR NEUTRO 450 G', 'PREMEZCLA ARROZ NEUTRA']
];

const TARGET_KG = 0.45;
const normalize = value => String(value || '').trim().replace(/\s+/g, ' ').toLocaleLowerCase('es-AR');
const same = (left, right) => String(left) === String(right);
const roundKg = value => Math.round((Number(value) + Number.EPSILON) * 1000) / 1000;

export function migrateVentofitPouchRecipes(db) {
  const companies = db.prepare(
    "SELECT id,name,state FROM companies WHERE lower(replace(trim(name),' ',''))='ventofit'"
  ).all();
  const result = { companies: companies.length, updated: [], skipped: [] };

  for (const company of companies) {
    const state = JSON.parse(company.state);
    const items = Array.isArray(state.items) ? state.items : [];
    const recipes = Array.isArray(state.recipes) ? state.recipes : [];
    let changed = false;

    for (const [pouchName, kitchenName] of PUCHES) {
      const pouchItem = items.find(item => !item.archived && normalize(item.name) === normalize(pouchName));
      const kitchenItem = items.find(item => !item.archived && normalize(item.name) === normalize(kitchenName));
      const pouchRecipe = pouchItem && recipes.find(recipe => !recipe.archived && same(recipe.itemId, pouchItem.id));
      const kitchenRecipe = kitchenItem && recipes.find(recipe => !recipe.archived && same(recipe.itemId, kitchenItem.id));

      if (!pouchItem || !kitchenItem || !pouchRecipe || !kitchenRecipe) {
        result.skipped.push({ company: company.name, pouchName, reason: 'No se encontró el producto o la receta base.' });
        continue;
      }
      if (pouchRecipe.ventofitPouchRawPremix === true) continue;

      const currentComponents = Array.isArray(pouchRecipe.components) ? pouchRecipe.components : [];
      const stillConsumesKitchenPremix = currentComponents.length === 1 && same(currentComponents[0].itemId, kitchenItem.id);
      if (!stillConsumesKitchenPremix) {
        result.skipped.push({ company: company.name, pouchName, reason: 'La receta ya no consume directamente la premezcla de cocina.' });
        continue;
      }

      const baseYield = Number(kitchenRecipe.yield);
      const baseComponents = Array.isArray(kitchenRecipe.components) ? kitchenRecipe.components : [];
      if (!(baseYield > 0) || baseComponents.length === 0) {
        result.skipped.push({ company: company.name, pouchName, reason: 'La receta base no tiene rendimiento o componentes válidos.' });
        continue;
      }

      const factor = TARGET_KG / baseYield;
      const components = baseComponents
        .map(component => ({ itemId: component.itemId, qty: roundKg(Number(component.qty) * factor), scope: 'both' }))
        .filter(component => component.qty > 0);

      pouchRecipe.components = components;
      pouchRecipe.version = Number(pouchRecipe.version || 0) + 1;
      pouchRecipe.ventofitPouchRawPremix = true;
      pouchRecipe.ventofitPouchSource = kitchenItem.id;
      pouchRecipe.ventofitPouchTargetKg = TARGET_KG;
      changed = true;
      result.updated.push({ company: company.name, pouchName, kitchenName, baseYield, factor, components });
    }

    if (changed) {
      db.prepare('UPDATE companies SET state=?,version=version+1 WHERE id=?')
        .run(JSON.stringify(state), company.id);
    }
  }

  return result;
}
