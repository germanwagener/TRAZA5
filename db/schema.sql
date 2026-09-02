CREATE TABLE IF NOT EXISTS users (
  id BIGSERIAL PRIMARY KEY,
  username TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('admin','operator')),
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS sectors (
  id BIGSERIAL PRIMARY KEY,
  name TEXT UNIQUE NOT NULL,
  position INTEGER NOT NULL DEFAULT 1,
  active BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE TABLE IF NOT EXISTS suppliers (
  id BIGSERIAL PRIMARY KEY,
  name TEXT UNIQUE NOT NULL,
  tax_id TEXT DEFAULT '',
  contact TEXT DEFAULT '',
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS products (
  id BIGSERIAL PRIMARY KEY,
  code TEXT UNIQUE,
  name TEXT NOT NULL,
  category TEXT NOT NULL CHECK (category IN ('Materia prima','Subproducto','Producto intermedio','Producto terminado','Envase','Otro')),
  unit TEXT NOT NULL DEFAULT 'kg',
  default_brand TEXT DEFAULT '',
  shelf_life_days INTEGER NOT NULL DEFAULT 0,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS recipes (
  id BIGSERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  sector_id BIGINT NOT NULL REFERENCES sectors(id),
  output_product_id BIGINT NOT NULL REFERENCES products(id),
  output_qty NUMERIC(14,3) NOT NULL DEFAULT 1,
  version TEXT NOT NULL DEFAULT '1.0',
  notes TEXT DEFAULT '',
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(name, version)
);

CREATE TABLE IF NOT EXISTS recipe_items (
  id BIGSERIAL PRIMARY KEY,
  recipe_id BIGINT NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
  product_id BIGINT NOT NULL REFERENCES products(id),
  qty NUMERIC(14,3) NOT NULL CHECK(qty > 0),
  UNIQUE(recipe_id, product_id)
);

CREATE TABLE IF NOT EXISTS receipts (
  id BIGSERIAL PRIMARY KEY,
  supplier_id BIGINT NOT NULL REFERENCES suppliers(id),
  product_id BIGINT NOT NULL REFERENCES products(id),
  brand TEXT DEFAULT '',
  supplier_lot TEXT DEFAULT '',
  internal_lot TEXT UNIQUE NOT NULL,
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
  recipe_id BIGINT NOT NULL REFERENCES recipes(id),
  sector_id BIGINT NOT NULL REFERENCES sectors(id),
  product_id BIGINT NOT NULL REFERENCES products(id),
  internal_lot TEXT UNIQUE NOT NULL,
  final_lot TEXT UNIQUE,
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
  user_id BIGINT REFERENCES users(id),
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id BIGINT,
  details JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_receipts_internal_lot ON receipts(internal_lot);
CREATE INDEX IF NOT EXISTS idx_receipts_product ON receipts(product_id);
CREATE INDEX IF NOT EXISTS idx_batches_internal_lot ON batches(internal_lot);
CREATE INDEX IF NOT EXISTS idx_batches_final_lot ON batches(final_lot);
CREATE INDEX IF NOT EXISTS idx_batches_product ON batches(product_id);
CREATE INDEX IF NOT EXISTS idx_batch_inputs_source ON batch_inputs(source_type,source_id);
CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_log(created_at DESC);
