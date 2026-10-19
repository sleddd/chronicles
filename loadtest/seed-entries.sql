-- Bulk-loads realistic encrypted entries into every tenant schema (incompressible
-- random bytes, like real AES-GCM ciphertext). Mix: 1 in 20 users heavy (3,000
-- entries ≈ 2+ years of meals/doses/check-ins), 5 in 20 medium (1,000), the rest light (150).
DO $$
DECLARE r record; n int;
BEGIN
  FOR r IN SELECT tenant_schema_name AS s, COALESCE(substring(username from '^lt(\d+)$')::int, 1) AS i FROM public.accounts ORDER BY id LOOP
    n := CASE WHEN r.i % 20 = 0 THEN 3000 WHEN r.i % 20 <= 5 THEN 1000 ELSE 150 END;
    EXECUTE format($q$INSERT INTO %I.posts (content_encrypted, content_iv, metadata_encrypted, metadata_iv, is_encrypted, created_at, updated_at)
      SELECT gen_random_bytes(1024) || gen_random_bytes(192), gen_random_bytes(12), gen_random_bytes(416), gen_random_bytes(12), TRUE, t, t
      FROM (SELECT now() - (random() * interval '730 days') AS t FROM generate_series(1, %s)) g$q$, r.s, n);
  END LOOP;
END $$;
