-- =====================================================================
-- Provisional + final rows for h2_material_balance.
-- Run AFTER supabase_migration.sql and supabase_spike_filter.sql.
-- TEST ON A COPY OF THE TABLE FIRST.
--
--   is_final = false : live value pushed right away (may still change)
--   is_final = true  : settled value pushed ~30 min later; overwrites the
--                      provisional row with the same snapshot_time
--
-- Rules enforced here:
--   * a provisional push can never overwrite a final row
--   * the spike-repair trigger only repairs provisional rows, never final ones
--   * existing rows become is_final = true (they are what you have today)
-- =====================================================================

-- 1. new column (existing rows -> true)
ALTER TABLE public.h2_material_balance
  ADD COLUMN IF NOT EXISTS is_final boolean NOT NULL DEFAULT true;
ALTER TABLE public.h2_material_balance_raw
  ADD COLUMN IF NOT EXISTS is_final boolean;

-- 2. raw log: copy by column NAME so added columns can never misalign it
CREATE OR REPLACE FUNCTION public.h2_log_raw() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF pg_trigger_depth() > 1 THEN RETURN NEW; END IF;   -- ignore our own repair updates
  INSERT INTO public.h2_material_balance_raw
    SELECT r.* FROM jsonb_populate_record(
      NULL::public.h2_material_balance_raw,
      to_jsonb(NEW) || jsonb_build_object('received_at', now())) r;
  RETURN NEW;
END $$;

-- 3. guard: provisional never overwrites final
CREATE OR REPLACE FUNCTION public.h2_guard_final() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.is_final AND NOT NEW.is_final THEN
    RETURN NULL;                                        -- skip the update silently
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS h2_guard_final_trg ON public.h2_material_balance;
CREATE TRIGGER h2_guard_final_trg BEFORE UPDATE ON public.h2_material_balance
  FOR EACH ROW EXECUTE FUNCTION public.h2_guard_final();

-- 4. repair trigger: only touch provisional rows
CREATE OR REPLACE FUNCTION public.h2_repair_spikes() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  cols text[] := ARRAY[
    'total_generation','total_consumption','difference','gen_hgu3','gen_psa2','gen_msq','gen_hgu1','gen_hgu4','gen_hgu2_syn_gas',
    'con_hgu3','con_vgo','con_dhdt1','con_dhds','con_dhdt2','con_isom','con_sru','con_hgu4','con_lab','con_ghc','con_hgu1','con_nba',
    'header_pressure_dhdt1','ghc_fg_opening','ghc_flare_opening'
  ];
  c text; p1 jsonb; p2 jsonb; nw jsonb := to_jsonb(NEW);
  p1id bigint; a numeric; b numeric; d numeric; med numeric; scale numeric;
  prm record := public.h2_spike_params();
BEGIN
  IF pg_trigger_depth() > 1 THEN RETURN NULL; END IF;

  SELECT id, to_jsonb(t) INTO p1id, p1 FROM public.h2_material_balance t
   WHERE snapshot_time < NEW.snapshot_time ORDER BY snapshot_time DESC LIMIT 1;
  IF p1 IS NULL OR (p1->>'is_final')::boolean THEN RETURN NULL; END IF;   -- never repair final rows
  SELECT to_jsonb(t) INTO p2 FROM public.h2_material_balance t
   WHERE snapshot_time < (p1->>'snapshot_time')::timestamptz ORDER BY snapshot_time DESC LIMIT 1;
  IF p2 IS NULL THEN RETURN NULL; END IF;

  FOREACH c IN ARRAY cols LOOP
    IF p1->>c IS NULL OR p2->>c IS NULL OR nw->>c IS NULL THEN CONTINUE; END IF;
    d := (p1->>c)::numeric;  a := (p2->>c)::numeric;  b := (nw->>c)::numeric;
    scale := greatest(abs(a), abs(b), prm.abs_floor);
    IF abs(a - b) <= prm.agree_ratio * scale
       AND abs(d - a) > prm.spike_ratio * scale
       AND abs(d - b) > prm.spike_ratio * scale THEN
      med := public.m3(a, d, b);
      EXECUTE format('UPDATE public.h2_material_balance SET %I = $1 WHERE id = $2', c) USING med, p1id;
    END IF;
  END LOOP;
  RETURN NULL;
END $$;

-- 5. clean view: expose is_final (appended last so CREATE OR REPLACE is allowed).
--    Final rows pass through untouched; only provisional rows get the median-of-3.
CREATE OR REPLACE VIEW public.h2_material_balance_clean AS
SELECT
  id, snapshot_time,
  CASE WHEN is_final THEN total_generation ELSE public.m3(lag(total_generation) OVER w, total_generation, lead(total_generation) OVER w) END AS total_generation,
  CASE WHEN is_final THEN total_consumption ELSE public.m3(lag(total_consumption) OVER w, total_consumption, lead(total_consumption) OVER w) END AS total_consumption,
  CASE WHEN is_final THEN difference ELSE public.m3(lag(difference) OVER w, difference, lead(difference) OVER w) END AS difference,
  CASE WHEN is_final THEN gen_hgu3 ELSE public.m3(lag(gen_hgu3) OVER w, gen_hgu3, lead(gen_hgu3) OVER w) END AS gen_hgu3,
  CASE WHEN is_final THEN gen_psa2 ELSE public.m3(lag(gen_psa2) OVER w, gen_psa2, lead(gen_psa2) OVER w) END AS gen_psa2,
  CASE WHEN is_final THEN gen_msq ELSE public.m3(lag(gen_msq) OVER w, gen_msq, lead(gen_msq) OVER w) END AS gen_msq,
  CASE WHEN is_final THEN gen_hgu1 ELSE public.m3(lag(gen_hgu1) OVER w, gen_hgu1, lead(gen_hgu1) OVER w) END AS gen_hgu1,
  CASE WHEN is_final THEN gen_hgu4 ELSE public.m3(lag(gen_hgu4) OVER w, gen_hgu4, lead(gen_hgu4) OVER w) END AS gen_hgu4,
  CASE WHEN is_final THEN gen_hgu2_syn_gas ELSE public.m3(lag(gen_hgu2_syn_gas) OVER w, gen_hgu2_syn_gas, lead(gen_hgu2_syn_gas) OVER w) END AS gen_hgu2_syn_gas,
  CASE WHEN is_final THEN con_hgu3 ELSE public.m3(lag(con_hgu3) OVER w, con_hgu3, lead(con_hgu3) OVER w) END AS con_hgu3,
  CASE WHEN is_final THEN con_vgo ELSE public.m3(lag(con_vgo) OVER w, con_vgo, lead(con_vgo) OVER w) END AS con_vgo,
  CASE WHEN is_final THEN con_dhdt1 ELSE public.m3(lag(con_dhdt1) OVER w, con_dhdt1, lead(con_dhdt1) OVER w) END AS con_dhdt1,
  CASE WHEN is_final THEN con_dhds ELSE public.m3(lag(con_dhds) OVER w, con_dhds, lead(con_dhds) OVER w) END AS con_dhds,
  CASE WHEN is_final THEN con_dhdt2 ELSE public.m3(lag(con_dhdt2) OVER w, con_dhdt2, lead(con_dhdt2) OVER w) END AS con_dhdt2,
  CASE WHEN is_final THEN con_isom ELSE public.m3(lag(con_isom) OVER w, con_isom, lead(con_isom) OVER w) END AS con_isom,
  CASE WHEN is_final THEN con_sru ELSE public.m3(lag(con_sru) OVER w, con_sru, lead(con_sru) OVER w) END AS con_sru,
  CASE WHEN is_final THEN con_hgu4 ELSE public.m3(lag(con_hgu4) OVER w, con_hgu4, lead(con_hgu4) OVER w) END AS con_hgu4,
  CASE WHEN is_final THEN con_lab ELSE public.m3(lag(con_lab) OVER w, con_lab, lead(con_lab) OVER w) END AS con_lab,
  CASE WHEN is_final THEN con_ghc ELSE public.m3(lag(con_ghc) OVER w, con_ghc, lead(con_ghc) OVER w) END AS con_ghc,
  CASE WHEN is_final THEN con_hgu1 ELSE public.m3(lag(con_hgu1) OVER w, con_hgu1, lead(con_hgu1) OVER w) END AS con_hgu1,
  CASE WHEN is_final THEN con_nba ELSE public.m3(lag(con_nba) OVER w, con_nba, lead(con_nba) OVER w) END AS con_nba,
  CASE WHEN is_final THEN header_pressure_dhdt1 ELSE public.m3(lag(header_pressure_dhdt1) OVER w, header_pressure_dhdt1, lead(header_pressure_dhdt1) OVER w) END AS header_pressure_dhdt1,
  CASE WHEN is_final THEN ghc_fg_opening ELSE public.m3(lag(ghc_fg_opening) OVER w, ghc_fg_opening, lead(ghc_fg_opening) OVER w) END AS ghc_fg_opening,
  CASE WHEN is_final THEN ghc_flare_opening ELSE public.m3(lag(ghc_flare_opening) OVER w, ghc_flare_opening, lead(ghc_flare_opening) OVER w) END AS ghc_flare_opening,
  pushed_at,
  is_final
FROM public.h2_material_balance
WINDOW w AS (ORDER BY snapshot_time);

GRANT SELECT ON public.h2_material_balance_clean TO anon, authenticated;
