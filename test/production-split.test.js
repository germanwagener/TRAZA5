const test = require('node:test');
const assert = require('node:assert/strict');
const { allocateInput, scaledRecipeItemQty, splitOutputs } = require('../src/production-split');

test('mantiene la elaboración normal con una única salida', () => {
  const outputs = splitOutputs({ output_product_id: 10 }, { output_qty: 25 });
  assert.deepEqual(outputs, [{ role: 'single', productId: 10, qty: 25, lotSuffix: '' }]);
});

test('crea las dos salidas de prepizza', () => {
  const outputs = splitOutputs(
    { output_product_id: 10, secondary_output_product_id: 11 },
    { primary_output_qty: 916, secondary_output_qty: 15 }
  );
  assert.equal(outputs[0].qty, 916);
  assert.equal(outputs[1].qty, 15);
  assert.equal(outputs[0].lotSuffix, '-1');
  assert.equal(outputs[1].lotSuffix, '-2');
});

test('reparte la masa común proporcionalmente entre ambos productos', () => {
  const outputs = splitOutputs(
    { output_product_id: 10, secondary_output_product_id: 11 },
    { primary_output_qty: 916, secondary_output_qty: 15 }
  );
  const allocations = allocateInput(26, 'both', outputs);
  assert.equal(allocations[0].qty, 25.581);
  assert.equal(allocations[1].qty, 0.419);
  assert.equal(allocations[0].qty + allocations[1].qty, 26);
});

test('asigna salsa solamente al primer producto', () => {
  const outputs = [{ qty: 100 }, { qty: 10 }];
  assert.deepEqual(allocateInput(4, 'primary', outputs), [{ outputIndex: 0, qty: 4 }]);
});

test('asigna cebolla solamente al segundo producto', () => {
  const outputs = [{ qty: 100 }, { qty: 10 }];
  assert.deepEqual(allocateInput(3, 'secondary', outputs), [{ outputIndex: 1, qty: 3 }]);
});

test('escala cada ingrediente según el producto al que corresponde', () => {
  const outputs = [{ qty: 90 }, { qty: 10 }];
  assert.equal(scaledRecipeItemQty({ qty: 20, output_scope: 'both' }, 100, outputs), 20);
  assert.equal(scaledRecipeItemQty({ qty: 5, output_scope: 'primary' }, 100, outputs), 4.5);
  assert.equal(scaledRecipeItemQty({ qty: 8, output_scope: 'secondary' }, 100, outputs), 0.8);
});

test('rechaza una producción dividida sin las dos cantidades', () => {
  assert.throws(
    () => splitOutputs(
      { output_product_id: 10, secondary_output_product_id: 11 },
      { primary_output_qty: 10, secondary_output_qty: 0 }
    ),
    /segundo producto/
  );
});
