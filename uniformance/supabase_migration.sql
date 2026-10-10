-- Run once in the Supabase SQL editor (project mozuuowwdfyqqvpiyetk).
-- Makes h2_material_balance idempotent per snapshot_time so a later,
-- settled push OVERWRITES an earlier one instead of adding a spike row.

-- 1. Remove existing duplicate snapshot_time rows (keeps the newest id).
--    Check first:  SELECT snapshot_time, count(*) FROM h2_material_balance GROUP BY 1 HAVING count(*) > 1;
DELETE FROM h2_material_balance a
USING h2_material_balance b
WHERE a.snapshot_time = b.snapshot_time
  AND a.id < b.id;

-- 2. One row per snapshot_time.
CREATE UNIQUE INDEX IF NOT EXISTS h2_material_balance_snapshot_time_uq
  ON h2_material_balance (snapshot_time);

-- 3. Only if Row Level Security is ON and the macro uses the anon key:
--    an upsert needs UPDATE permission as well as INSERT.
-- CREATE POLICY "anon update h2_material_balance" ON h2_material_balance
--   FOR UPDATE TO anon USING (true) WITH CHECK (true);
