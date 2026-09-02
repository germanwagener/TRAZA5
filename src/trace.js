async function getNode(pool, type, id) {
  if (type === 'receipt') {
    const { rows } = await pool.query(`
      SELECT r.id,r.internal_lot,r.supplier_lot,r.qty,r.unit,r.received_at,r.expires_at,
             r.brand,r.unit_price,p.id product_id,p.name product,p.category,s.name supplier
      FROM receipts r JOIN products p ON p.id=r.product_id JOIN suppliers s ON s.id=r.supplier_id
      WHERE r.id=$1`, [id]);
    if (!rows[0]) return null;
    return { type, id, data: rows[0], children: [] };
  }
  const { rows } = await pool.query(`
    SELECT b.id,b.internal_lot,b.final_lot,b.qty,b.produced_at,b.status,
           p.id product_id,p.name product,p.category,s.name sector,r.name recipe,r.version recipe_version
    FROM batches b JOIN products p ON p.id=b.product_id JOIN sectors s ON s.id=b.sector_id JOIN recipes r ON r.id=b.recipe_id
    WHERE b.id=$1`, [id]);
  if (!rows[0]) return null;
  return { type, id, data: rows[0], children: [] };
}

async function backward(pool, type, id, seen = new Set()) {
  const key = `${type}:${id}`;
  if (seen.has(key)) return null;
  seen.add(key);
  const node = await getNode(pool, type, id);
  if (!node) return null;
  if (type === 'batch') {
    const { rows } = await pool.query('SELECT source_type,source_id,qty FROM batch_inputs WHERE batch_id=$1 ORDER BY id', [id]);
    for (const input of rows) {
      const child = await backward(pool, input.source_type, input.source_id, seen);
      if (child) {
        child.consumed_qty = input.qty;
        node.children.push(child);
      }
    }
  }
  return node;
}

async function forward(pool, type, id, seen = new Set()) {
  const key = `${type}:${id}`;
  if (seen.has(key)) return null;
  seen.add(key);
  const node = await getNode(pool, type, id);
  if (!node) return null;
  const { rows } = await pool.query(`
    SELECT b.id
    FROM batch_inputs bi JOIN batches b ON b.id=bi.batch_id
    WHERE bi.source_type=$1 AND bi.source_id=$2 ORDER BY b.produced_at`, [type, id]);
  for (const row of rows) {
    const child = await forward(pool, 'batch', row.id, seen);
    if (child) node.children.push(child);
  }
  return node;
}

module.exports = { backward, forward };
