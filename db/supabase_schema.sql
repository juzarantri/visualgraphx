-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS vector;

-- ============================================
-- USER CHAT SESSIONS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS user_chats (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id text NOT NULL UNIQUE,
  chats jsonb NOT NULL DEFAULT '[]'::jsonb,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- ============================================
-- PRODUCTS TABLE (records)
-- ============================================
CREATE TABLE IF NOT EXISTS records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_ref text UNIQUE,
  title text,
  description text,
  price numeric,
  url text,
  image_url text,
  metadata jsonb DEFAULT '{}'::jsonb,
  faq jsonb DEFAULT '[]'::jsonb,
  technical_data text DEFAULT ''::text,
  embedding vector(1536),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- ============================================
-- PRODUCT FAQs TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS product_faqs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_ref text NOT NULL REFERENCES records(product_ref) ON DELETE CASCADE,
  question text NOT NULL,
  answer text NOT NULL,
  embedding vector(1536),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- ============================================
-- INDEXES
-- ============================================
CREATE INDEX IF NOT EXISTS idx_records_embedding ON records USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);
CREATE INDEX IF NOT EXISTS idx_faq_embedding ON product_faqs USING ivfflat (embedding vector_cosine_ops) WITH (lists = 50);
CREATE INDEX IF NOT EXISTS idx_faq_product_ref ON product_faqs(product_ref);

-- ============================================
-- TRIGGERS
-- ============================================
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

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

DROP TRIGGER IF EXISTS trg_faqs_updated_at ON product_faqs;
CREATE TRIGGER trg_faqs_updated_at
  BEFORE UPDATE ON product_faqs
  FOR EACH ROW
  EXECUTE PROCEDURE update_updated_at_column();

-- ============================================
-- SEARCH FUNCTIONS
-- ============================================

-- Enhanced Product Search
CREATE OR REPLACE FUNCTION match_records(
  query_embedding vector(1536), 
  match_count int DEFAULT 5
  -- similarity_threshold float DEFAULT 0.5,
  -- category_filter text DEFAULT NULL
)
RETURNS TABLE (
  id uuid,
  product_ref text,
  title text,
  description text,
  price numeric,
  url text,
  image_url text,
  metadata jsonb,
  technical_data text,
  similarity float
) 
LANGUAGE sql STABLE
AS $$
  SELECT 
    r.id,
    r.product_ref,
    r.title,
    r.description,
    r.price,
    r.url,
    r.image_url,
    r.metadata,
    r.technical_data,
    1 - (r.embedding <=> query_embedding) as similarity
  FROM records r
  -- WHERE r.embedding IS NOT NULL
    -- AND 1 - (r.embedding <=> query_embedding) > similarity_threshold
    -- AND (category_filter IS NULL OR r.metadata->>'category' = category_filter)
  ORDER BY r.embedding <=> query_embedding
  LIMIT match_count;
$$;

-- FAQ Search
CREATE OR REPLACE FUNCTION match_faqs(
  query_embedding vector(1536), 
  match_count int DEFAULT 5
  -- similarity_threshold float DEFAULT 0.5
)
RETURNS TABLE (
  id uuid,
  product_ref text,
  question text,
  answer text,
  similarity float
) 
LANGUAGE sql STABLE
AS $$
  SELECT
    f.id,
    f.product_ref,
    f.question,
    f.answer,
    (1 - (f.embedding <=> query_embedding)) AS similarity
  FROM product_faqs f
  WHERE f.embedding IS NOT NULL
    AND (1 - (f.embedding <=> query_embedding)) >= 0.5
  ORDER BY similarity DESC
  LIMIT match_count;
$$;
