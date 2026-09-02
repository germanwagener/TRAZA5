async function getNode(pool, clientId, type, id) {
  if (type === 'receipt') {
    const { rows } = await pool.query(`
      SELECT r.id,r.internal_lot,r.supplier_lot,r.qty,r.unit,r.received_at,r.expires_at,
             r.brand,r.unit_price,p.id product_id,p.name product,p.category,s.name supplier
      FROM receipts r
      JOIN products p ON p.id=r.product_id AND p.client_id=r.client_id
      JOIN suppliers s ON s.id=r.supplier_id AND s.client_id=r.client_id
      WHERE r.id=$1 AND r.client_id=$2`, [id, clientId]);
    if (!rows[0]) return null;
    return { type, id, data: rows[0], children: [] };
  }
  const { rows } = await pool.query(`
    SELECT b.id,b.internal_lot,b.final_lot,b.qty,b.produced_at,b.status,
           p.id product_id,p.name product,p.category,s.name sector,r.name recipe,r.version recipe_version
    FROM batches b
    JOIN products p ON p.id=b.product_id AND p.client_id=b.client_id
    JOIN sectors s ON s.id=b.sector_id AND s.client_id=b.client_id
    JOIN recipes r ON r.id=b.recipe_id AND r.client_id=b.client_id
    WHERE b.id=$1 AND b.client_id=$2`, [id, clientId]);
  if (!rows[0]) return null;
  return { type, id, data: rows[0], children: [] };
}

async function backward(pool, clientId, type, id, seen = new Set()) {
  const key = `${type}:${id}`;
  if (seen.has(key)) return null;
  seen.add(key);
  const node = await getNode(pool, clientId, type, id);
  if (!node) return null;
  if (type === 'batch') {
    const { rows } = await pool.query(
      `SELECT bi.source_type,bi.source_id,bi.qty
       FROM batch_inputs bi
       JOIN batches b ON b.id=bi.batch_id
       WHERE bi.batch_id=$1 AND b.client_id=$2
       ORDER BY bi.id`,
      [id, clientId]
    );
    for (const input of rows) {
      const child = await backward(pool, clientId, input.source_type, input.source_id, seen);
      if (child) {
        child.consumed_qty = input.qty;
        node.children.push(child);
      }
    }
  }
  return node;
}

async function forward(pool, clientId, type, id, seen = new Set()) {
  const key = `${type}:${id}`;
  if (seen.has(key)) return null;
  seen.add(key);
  const node = await getNode(pool, clientId, type, id);
  if (!node) return null;
  const { rows } = await pool.query(`
    SELECT b.id
    FROM batch_inputs bi
    JOIN batches b ON b.id=bi.batch_id
    WHERE bi.source_type=$1 AND bi.source_id=$2 AND b.client_id=$3
    ORDER BY b.produced_at`, [type, id, clientId]);
  for (const row of rows) {
    const child = await forward(pool, clientId, 'batch', row.id, seen);
    if (child) node.children.push(child);
  }
  return node;
}

module.exports = { backward, forward };
