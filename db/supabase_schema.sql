CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS vector;

-- user_chats table
CREATE TABLE IF NOT EXISTS user_chats (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id text NOT NULL UNIQUE,
  chats jsonb NOT NULL DEFAULT '[]'::jsonb,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- records table (embedding dimension fixed at 1536)
CREATE TABLE IF NOT EXISTS records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_ref text UNIQUE,
  title text,
  description text,
  price numeric,
  url text,
  image_url text,
  metadata jsonb DEFAULT '{}'::jsonb,
  technical_data text DEFAULT ''::text,
  embedding vector(1536),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- shared trigger function to update `updated_at`
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- attach triggers
DROP TRIGGER IF EXISTS trg_user_chats_updated_at ON user_chats;
CREATE TRIGGER trg_user_chats_updated_at
  BEFORE UPDATE ON user_chats
  FOR EACH ROW
  EXECUTE PROCEDURE update_updated_at_column();

DROP TRIGGER IF EXISTS trg_records_updated_at ON records;
CREATE TRIGGER trg_records_updated_at
  BEFORE UPDATE ON records
  FOR EACH ROW
  EXECUTE PROCEDURE update_updated_at_column();

-- make sure existing databases get the new column (safe: only run if table exists)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_tables WHERE schemaname NOT IN ('pg_catalog', 'information_schema') AND tablename = 'records'
  ) THEN
    ALTER TABLE records
      ADD COLUMN IF NOT EXISTS technical_data text DEFAULT ''::text;
  END IF;
END
$$;

-- vector index for records.embedding
CREATE INDEX IF NOT EXISTS idx_records_embedding ON records USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);

