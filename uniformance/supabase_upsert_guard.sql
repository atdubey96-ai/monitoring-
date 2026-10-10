-- =====================================================================
-- Upsert guard for h2_material_balance. Run AFTER supabase_provisional_final.sql.
--
-- Why: the table only lets the public role INSERT and SELECT (RLS). Excel's upsert
-- (INSERT ... ON CONFLICT DO UPDATE) needs UPDATE. Instead of opening UPDATE to
-- everyone who has the anon key, a SECURITY DEFINER trigger absorbs duplicate
-- snapshot_time inserts itself, so no UPDATE policy is needed.
--
--  1. h2_a_classify_legacy_trg : rows whose snapshot_time is not on the 2-minute grid
--     (from an old-style 5-minute pusher that is still running somewhere) are stored as
--     provisional (is_final = false), so spikes in them are repaired and shown as "live".
--  2. h2_zz_absorb_dup_trg     : an INSERT for an existing snapshot_time updates that row
--     (final overwrites provisional; a provisional never overwrites a final) and skips the insert.
-- =====================================================================

CREATE OR REPLACE FUNCTION public.h2_classify_legacy() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF (extract(epoch FROM NEW.snapshot_time))::bigint % 120 <> 0 THEN
    NEW.is_final := false;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS h2_a_classify_legacy_trg ON public.h2_material_balance;
CREATE TRIGGER h2_a_classify_legacy_trg BEFORE INSERT ON public.h2_material_balance
  FOR EACH ROW EXECUTE FUNCTION public.h2_classify_legacy();

CREATE OR REPLACE FUNCTION public.h2_absorb_duplicate() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE ex_final boolean;
BEGIN
  SELECT is_final INTO ex_final FROM public.h2_material_balance WHERE snapshot_time = NEW.snapshot_time LIMIT 1;
  IF NOT FOUND THEN
    RETURN NEW;                                   -- new timestamp: normal insert
  END IF;
  IF ex_final AND NOT NEW.is_final THEN
    RETURN NULL;                                  -- provisional never overwrites final
  END IF;
  UPDATE public.h2_material_balance SET
        total_generation = NEW.total_generation,
        total_consumption = NEW.total_consumption,
        difference = NEW.difference,
        gen_hgu3 = NEW.gen_hgu3,
        gen_psa2 = NEW.gen_psa2,
        gen_msq = NEW.gen_msq,
        gen_hgu1 = NEW.gen_hgu1,
        gen_hgu4 = NEW.gen_hgu4,
        gen_hgu2_syn_gas = NEW.gen_hgu2_syn_gas,
        con_hgu3 = NEW.con_hgu3,
        con_vgo = NEW.con_vgo,
        con_dhdt1 = NEW.con_dhdt1,
        con_dhds = NEW.con_dhds,
        con_dhdt2 = NEW.con_dhdt2,
        con_isom = NEW.con_isom,
        con_sru = NEW.con_sru,
        con_hgu4 = NEW.con_hgu4,
        con_lab = NEW.con_lab,
        con_ghc = NEW.con_ghc,
        con_hgu1 = NEW.con_hgu1,
        con_nba = NEW.con_nba,
        header_pressure_dhdt1 = NEW.header_pressure_dhdt1,
        ghc_fg_opening = NEW.ghc_fg_opening,
        ghc_flare_opening = NEW.ghc_flare_opening,
        pushed_at = NEW.pushed_at,
        is_final = NEW.is_final
   WHERE snapshot_time = NEW.snapshot_time;
  RETURN NULL;                                    -- duplicate absorbed, no second row
END $$;

DROP TRIGGER IF EXISTS h2_zz_absorb_dup_trg ON public.h2_material_balance;
CREATE TRIGGER h2_zz_absorb_dup_trg BEFORE INSERT ON public.h2_material_balance
  FOR EACH ROW EXECUTE FUNCTION public.h2_absorb_duplicate();
