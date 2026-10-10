-- Run once in the Supabase SQL editor (project mozuuowwdfyqqvpiyetk).
-- Makes h2_material_balance idempotent per snapshot_time so a later,
-- settled push OVERWRITES an earlier one instead of adding a spike row.

-- 1. Remove existing duplicate snapshot_time rows (keeps the newest id).
--    Check first:  SELECT snapshot_time, count(*) FROM h2_material_balance GROUP BY 1 HAVING count(*) > 1;
DELETE FROM public.h2_material_balance
WHERE id IN (
  SELECT id FROM (
    SELECT id, row_number() OVER (PARTITION BY snapshot_time ORDER BY id DESC) AS rn
    FROM public.h2_material_balance
  ) ranked
  WHERE rn > 1
);

-- 2. One row per snapshot_time.
CREATE UNIQUE INDEX IF NOT EXISTS h2_material_balance_snapshot_time_uq
  ON public.h2_material_balance (snapshot_time);

-- (No UPDATE policy is needed: supabase_upsert_guard.sql handles duplicates with a trigger.)
