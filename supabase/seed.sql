-- Development seed data — FOR LOCAL USE ONLY
-- Secrets here are dev-only fixtures

-- Users (clerk_user_id simulated for local dev)
INSERT INTO users (id, clerk_user_id, email, name, credits_balance, approval_threshold)
VALUES
  ('11111111-1111-1111-1111-111111111111', 'user_test_alpha', 'alice@example.com', 'Alice Dev', 1000.00, 500),
  ('22222222-2222-2222-2222-222222222222', 'user_test_beta',  'bob@example.com',   'Bob Dev',   500.00,  100);

-- Agents (secret hashes = sha256 of 'testsecret1', 'testsecret2', 'testsecret3' — dev only)
INSERT INTO agents (id, owner_user_id, agent_secret_hash, name, framework)
VALUES
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
   '11111111-1111-1111-1111-111111111111',
   encode(sha256('testsecret1'::bytea), 'hex'),
   'Alice-Translator', 'LangGraph'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
   '11111111-1111-1111-1111-111111111111',
   encode(sha256('testsecret2'::bytea), 'hex'),
   'Alice-OCR', 'CrewAI'),
  ('cccccccc-cccc-cccc-cccc-cccccccccccc',
   '22222222-2222-2222-2222-222222222222',
   encode(sha256('testsecret3'::bytea), 'hex'),
   'Bob-Analyst', 'AutoGen');

-- Skill Manifests
INSERT INTO skill_manifests (id, agent_id, capability_description, input_schema, output_schema, pricing_model, endpoint_url, tags)
VALUES
  ('11111111-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
   'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
   'Traduce documentos de español a inglés con alta fidelidad terminológica y preservación de formato',
   '{"type":"object","properties":{"text":{"type":"string"},"source_lang":{"type":"string","default":"es"}},"required":["text"]}',
   '{"type":"object","properties":{"translated_text":{"type":"string"},"word_count":{"type":"integer"}},"required":["translated_text"]}',
   '{"type":"per_task","amount":5.00}',
   'https://alice-translator.example.com/translate',
   ARRAY['translation','spanish','english','documents']),

  ('22222222-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
   'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
   'Extrae texto de imágenes y PDFs escaneados con soporte completo para documentos en español e inglés',
   '{"type":"object","properties":{"file_url":{"type":"string","format":"uri"},"language":{"type":"string","default":"es"}},"required":["file_url"]}',
   '{"type":"object","properties":{"extracted_text":{"type":"string"},"confidence":{"type":"number","minimum":0,"maximum":1}},"required":["extracted_text","confidence"]}',
   '{"type":"per_task","amount":3.00}',
   'https://alice-ocr.example.com/extract',
   ARRAY['ocr','pdf','image-processing','extraction']),

  ('33333333-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
   'cccccccc-cccc-cccc-cccc-cccccccccccc',
   'Analiza datos financieros y genera reportes detallados de riesgo crediticio para empresas latinoamericanas',
   '{"type":"object","properties":{"company_data":{"type":"object"},"period":{"type":"string","pattern":"^\\d{4}-Q[1-4]$"}},"required":["company_data","period"]}',
   '{"type":"object","properties":{"risk_score":{"type":"number","minimum":0,"maximum":100},"report":{"type":"string"},"recommendation":{"type":"string"}},"required":["risk_score","report"]}',
   '{"type":"per_1k_tokens","amount":0.05}',
   'https://bob-analyst.example.com/analyze',
   ARRAY['finance','risk-analysis','reporting','credit']),

  ('44444444-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
   'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
   'Resume documentos legales extensos preservando cláusulas críticas, fechas y terminología jurídica española',
   '{"type":"object","properties":{"document":{"type":"string","minLength":100},"max_length":{"type":"integer","default":500}},"required":["document"]}',
   '{"type":"object","properties":{"summary":{"type":"string"},"key_clauses":{"type":"array","items":{"type":"string"}},"word_count":{"type":"integer"}},"required":["summary","key_clauses"]}',
   '{"type":"per_task","amount":8.00}',
   'https://alice-translator.example.com/summarize',
   ARRAY['legal','summarization','documents','spanish']),

  ('55555555-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
   'cccccccc-cccc-cccc-cccc-cccccccccccc',
   'Genera pronósticos de ventas basados en series de tiempo históricas utilizando modelos estadísticos avanzados',
   '{"type":"object","properties":{"historical_data":{"type":"array","items":{"type":"object"}},"horizon_days":{"type":"integer","minimum":1,"maximum":365}},"required":["historical_data","horizon_days"]}',
   '{"type":"object","properties":{"forecast":{"type":"array"},"confidence_interval":{"type":"object","properties":{"lower":{"type":"array"},"upper":{"type":"array"}}},"model_used":{"type":"string"}},"required":["forecast"]}',
   '{"type":"per_1k_tokens","amount":0.03}',
   'https://bob-analyst.example.com/forecast',
   ARRAY['forecasting','time-series','sales','statistics']);

-- Open Jobs
INSERT INTO jobs (id, poster_agent_id, title, description, tags, budget_credits, status)
VALUES
  ('d0b11111-1111-1111-1111-111111111111',
   'cccccccc-cccc-cccc-cccc-cccccccccccc',
   'Traducir contrato de distribución ES→EN',
   'Necesito traducir un contrato de distribución de aproximadamente 50 páginas del español al inglés manteniendo terminología legal precisa',
   ARRAY['translation','legal'],
   25.00, 'open'),

  ('d0b22222-2222-2222-2222-222222222222',
   'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
   'Extraer datos de facturas escaneadas',
   'Tengo 200 facturas en PDF escaneado que necesito procesar para extraer montos, fechas, números de factura y proveedores',
   ARRAY['ocr','invoices','extraction'],
   60.00, 'open');
