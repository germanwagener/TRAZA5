const VALID_SCOPES = new Set(['both', 'primary', 'secondary']);

function roundQuantity(value) {
  return Math.round((Number(value) + Number.EPSILON) * 1000) / 1000;
}

function positiveNumber(value, label) {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) {
    throw new Error(`${label} debe ser mayor que cero.`);
  }
  return number;
}

function splitOutputs(recipe, body) {
  const hasSecondary = Boolean(recipe.secondary_output_product_id);
  if (!hasSecondary) {
    return [{
      role: 'single',
      productId: Number(recipe.output_product_id),
      qty: positiveNumber(body.output_qty, 'La cantidad producida'),
      lotSuffix: ''
    }];
  }

  const primaryQty = positiveNumber(body.primary_output_qty, 'La cantidad del primer producto');
  const secondaryQty = positiveNumber(body.secondary_output_qty, 'La cantidad del segundo producto');
  return [
    {
      role: 'primary',
      productId: Number(recipe.output_product_id),
      qty: primaryQty,
      lotSuffix: '-1'
    },
    {
      role: 'secondary',
      productId: Number(recipe.secondary_output_product_id),
      qty: secondaryQty,
      lotSuffix: '-2'
    }
  ];
}

function allocateInput(quantity, scope, outputs) {
  const amount = roundQuantity(positiveNumber(quantity, 'La cantidad utilizada'));
  const normalizedScope = VALID_SCOPES.has(scope) ? scope : 'both';
  if (outputs.length === 1) return [{ outputIndex: 0, qty: amount }];
  if (normalizedScope === 'primary') return [{ outputIndex: 0, qty: amount }];
  if (normalizedScope === 'secondary') return [{ outputIndex: 1, qty: amount }];

  const total = outputs.reduce((sum, output) => sum + output.qty, 0);
  const primary = roundQuantity(amount * outputs[0].qty / total);
  const secondary = roundQuantity(amount - primary);
  return [
    { outputIndex: 0, qty: primary },
    { outputIndex: 1, qty: secondary }
  ];
}

function scaledRecipeItemQty(item, recipeOutputQty, outputs) {
  const nominal = positiveNumber(recipeOutputQty, 'El rendimiento nominal');
  const scope = VALID_SCOPES.has(item.output_scope) ? item.output_scope : 'both';
  const basis = scope === 'primary'
    ? outputs[0].qty
    : (scope === 'secondary' && outputs[1] ? outputs[1].qty : outputs.reduce((sum, output) => sum + output.qty, 0));
  return Number(item.qty) * basis / nominal;
}

module.exports = { allocateInput, roundQuantity, scaledRecipeItemQty, splitOutputs };
