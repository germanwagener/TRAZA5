CREATE TABLE IF NOT EXISTS clients (
  id BIGSERIAL PRIMARY KEY,
  name TEXT UNIQUE NOT NULL,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS users (
  id BIGSERIAL PRIMARY KEY,
  username TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('superadmin','admin','operator')),
  client_id BIGINT REFERENCES clients(id),
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS sectors (
  id BIGSERIAL PRIMARY KEY,
  client_id BIGINT NOT NULL REFERENCES clients(id),
  name TEXT NOT NULL,
  position INTEGER NOT NULL DEFAULT 1,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  UNIQUE(client_id,name)
);

CREATE TABLE IF NOT EXISTS suppliers (
  id BIGSERIAL PRIMARY KEY,
  client_id BIGINT NOT NULL REFERENCES clients(id),
  name TEXT NOT NULL,
  tax_id TEXT DEFAULT '',
  contact TEXT DEFAULT '',
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(client_id,name)
);

CREATE TABLE IF NOT EXISTS products (
  id BIGSERIAL PRIMARY KEY,
  client_id BIGINT NOT NULL REFERENCES clients(id),
  code TEXT,
  name TEXT NOT NULL,
  category TEXT NOT NULL CHECK (category IN ('Materia prima','Subproducto','Producto intermedio','Producto terminado','Envase','Otro')),
  unit TEXT NOT NULL DEFAULT 'kg',
  default_brand TEXT DEFAULT '',
  shelf_life_days INTEGER NOT NULL DEFAULT 0,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS product_suppliers (
  id BIGSERIAL PRIMARY KEY,
  client_id BIGINT NOT NULL REFERENCES clients(id),
  product_id BIGINT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  supplier_id BIGINT NOT NULL REFERENCES suppliers(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(product_id,supplier_id)
);

CREATE TABLE IF NOT EXISTS recipes (
  id BIGSERIAL PRIMARY KEY,
  client_id BIGINT NOT NULL REFERENCES clients(id),
  name TEXT NOT NULL,
  sector_id BIGINT NOT NULL REFERENCES sectors(id),
  output_product_id BIGINT NOT NULL REFERENCES products(id),
  output_qty NUMERIC(14,3) NOT NULL DEFAULT 1,
  version TEXT NOT NULL DEFAULT '1.0',
  notes TEXT DEFAULT '',
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(client_id,name,version)
);

CREATE TABLE IF NOT EXISTS recipe_items (
  id BIGSERIAL PRIMARY KEY,
  recipe_id BIGINT NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
  product_id BIGINT NOT NULL REFERENCES products(id),
  qty NUMERIC(14,3) NOT NULL CHECK(qty > 0),
  UNIQUE(recipe_id,product_id)
);

CREATE TABLE IF NOT EXISTS receipts (
  id BIGSERIAL PRIMARY KEY,
  client_id BIGINT NOT NULL REFERENCES clients(id),
  supplier_id BIGINT NOT NULL REFERENCES suppliers(id),
  product_id BIGINT NOT NULL REFERENCES products(id),
  brand TEXT DEFAULT '',
  supplier_lot TEXT DEFAULT '',
  internal_lot TEXT NOT NULL,
  qty NUMERIC(14,3) NOT NULL CHECK(qty > 0),
  unit TEXT NOT NULL,
  unit_price NUMERIC(14,2) NOT NULL DEFAULT 0,
  received_at DATE NOT NULL,
  expires_at DATE,
  notes TEXT DEFAULT '',
  created_by BIGINT NOT NULL REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS batches (
  id BIGSERIAL PRIMARY KEY,
  client_id BIGINT NOT NULL REFERENCES clients(id),
  recipe_id BIGINT NOT NULL REFERENCES recipes(id),
  sector_id BIGINT NOT NULL REFERENCES sectors(id),
  product_id BIGINT NOT NULL REFERENCES products(id),
  internal_lot TEXT NOT NULL,
  final_lot TEXT,
  qty NUMERIC(14,3) NOT NULL CHECK(qty > 0),
  produced_at TIMESTAMPTZ NOT NULL,
  status TEXT NOT NULL DEFAULT 'LIBERADO' CHECK(status IN ('LIBERADO','BLOQUEADO','RECHAZADO')),
  notes TEXT DEFAULT '',
  created_by BIGINT NOT NULL REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS batch_inputs (
  id BIGSERIAL PRIMARY KEY,
  batch_id BIGINT NOT NULL REFERENCES batches(id) ON DELETE CASCADE,
  source_type TEXT NOT NULL CHECK(source_type IN ('receipt','batch')),
  source_id BIGINT NOT NULL,
  product_id BIGINT NOT NULL REFERENCES products(id),
  qty NUMERIC(14,3) NOT NULL CHECK(qty > 0)
);

CREATE TABLE IF NOT EXISTS audit_log (
  id BIGSERIAL PRIMARY KEY,
  client_id BIGINT REFERENCES clients(id),
  user_id BIGINT REFERENCES users(id),
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id BIGINT,
  details JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Migración automática de la primera versión de TRAZA5.
ALTER TABLE users ADD COLUMN IF NOT EXISTS client_id BIGINT REFERENCES clients(id);
ALTER TABLE sectors ADD COLUMN IF NOT EXISTS client_id BIGINT REFERENCES clients(id);
ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS client_id BIGINT REFERENCES clients(id);
ALTER TABLE products ADD COLUMN IF NOT EXISTS client_id BIGINT REFERENCES clients(id);
ALTER TABLE recipes ADD COLUMN IF NOT EXISTS client_id BIGINT REFERENCES clients(id);
ALTER TABLE receipts ADD COLUMN IF NOT EXISTS client_id BIGINT REFERENCES clients(id);
ALTER TABLE batches ADD COLUMN IF NOT EXISTS client_id BIGINT REFERENCES clients(id);
ALTER TABLE audit_log ADD COLUMN IF NOT EXISTS client_id BIGINT REFERENCES clients(id);

INSERT INTO clients(name)
SELECT 'Consultora en Alimentos'
WHERE NOT EXISTS (SELECT 1 FROM clients);

ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;
UPDATE users
SET role='superadmin', client_id=NULL
WHERE role='admin' AND client_id IS NULL;
ALTER TABLE users
  ADD CONSTRAINT users_role_check CHECK(role IN ('superadmin','admin','operator'));

UPDATE users
SET client_id=(SELECT id FROM clients ORDER BY id LIMIT 1)
WHERE role<>'superadmin' AND client_id IS NULL;
UPDATE sectors
SET client_id=(SELECT id FROM clients ORDER BY id LIMIT 1)
WHERE client_id IS NULL;
UPDATE suppliers
SET client_id=(SELECT id FROM clients ORDER BY id LIMIT 1)
WHERE client_id IS NULL;
UPDATE products
SET client_id=(SELECT id FROM clients ORDER BY id LIMIT 1)
WHERE client_id IS NULL;
UPDATE recipes
SET client_id=(SELECT id FROM clients ORDER BY id LIMIT 1)
WHERE client_id IS NULL;
UPDATE receipts
SET client_id=(SELECT id FROM clients ORDER BY id LIMIT 1)
WHERE client_id IS NULL;
UPDATE batches
SET client_id=(SELECT id FROM clients ORDER BY id LIMIT 1)
WHERE client_id IS NULL;

INSERT INTO product_suppliers(client_id,product_id,supplier_id)
SELECT DISTINCT r.client_id,r.product_id,r.supplier_id
FROM receipts r
WHERE r.client_id IS NOT NULL
ON CONFLICT(product_id,supplier_id) DO NOTHING;

ALTER TABLE sectors ALTER COLUMN client_id SET NOT NULL;
ALTER TABLE suppliers ALTER COLUMN client_id SET NOT NULL;
ALTER TABLE products ALTER COLUMN client_id SET NOT NULL;
ALTER TABLE recipes ALTER COLUMN client_id SET NOT NULL;
ALTER TABLE receipts ALTER COLUMN client_id SET NOT NULL;
ALTER TABLE batches ALTER COLUMN client_id SET NOT NULL;

ALTER TABLE sectors DROP CONSTRAINT IF EXISTS sectors_name_key;
ALTER TABLE suppliers DROP CONSTRAINT IF EXISTS suppliers_name_key;
ALTER TABLE products DROP CONSTRAINT IF EXISTS products_code_key;
ALTER TABLE recipes DROP CONSTRAINT IF EXISTS recipes_name_version_key;
ALTER TABLE receipts DROP CONSTRAINT IF EXISTS receipts_internal_lot_key;
ALTER TABLE batches DROP CONSTRAINT IF EXISTS batches_internal_lot_key;
ALTER TABLE batches DROP CONSTRAINT IF EXISTS batches_final_lot_key;

CREATE UNIQUE INDEX IF NOT EXISTS uq_sectors_client_name ON sectors(client_id,name);
CREATE UNIQUE INDEX IF NOT EXISTS uq_suppliers_client_name ON suppliers(client_id,name);
CREATE UNIQUE INDEX IF NOT EXISTS uq_products_client_code ON products(client_id,code) WHERE code IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_recipes_client_version ON recipes(client_id,name,version);
CREATE UNIQUE INDEX IF NOT EXISTS uq_receipts_client_internal_lot ON receipts(client_id,internal_lot);
CREATE UNIQUE INDEX IF NOT EXISTS uq_batches_client_internal_lot ON batches(client_id,internal_lot);
CREATE UNIQUE INDEX IF NOT EXISTS uq_batches_client_final_lot ON batches(client_id,final_lot) WHERE final_lot IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_users_client ON users(client_id);
CREATE INDEX IF NOT EXISTS idx_sectors_client ON sectors(client_id,active,position);
CREATE INDEX IF NOT EXISTS idx_suppliers_client ON suppliers(client_id,active,name);
CREATE INDEX IF NOT EXISTS idx_products_client ON products(client_id,active,name);
CREATE INDEX IF NOT EXISTS idx_product_suppliers_client_product ON product_suppliers(client_id,product_id);
CREATE INDEX IF NOT EXISTS idx_product_suppliers_client_supplier ON product_suppliers(client_id,supplier_id);
CREATE INDEX IF NOT EXISTS idx_recipes_client ON recipes(client_id,active,name);
CREATE INDEX IF NOT EXISTS idx_receipts_client_lot ON receipts(client_id,internal_lot);
CREATE INDEX IF NOT EXISTS idx_receipts_client_product ON receipts(client_id,product_id);
CREATE INDEX IF NOT EXISTS idx_batches_client_lot ON batches(client_id,internal_lot);
CREATE INDEX IF NOT EXISTS idx_batches_client_final_lot ON batches(client_id,final_lot);
CREATE INDEX IF NOT EXISTS idx_batches_client_product ON batches(client_id,product_id);
CREATE INDEX IF NOT EXISTS idx_batch_inputs_source ON batch_inputs(source_type,source_id);
CREATE INDEX IF NOT EXISTS idx_audit_client_created ON audit_log(client_id,created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_log(created_at DESC);
