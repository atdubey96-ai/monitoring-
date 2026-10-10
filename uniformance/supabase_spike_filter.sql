-- =====================================================================
-- Server-side spike protection for h2_material_balance (no Excel change).
-- Run in the Supabase SQL editor. TEST ON A COPY OF THE TABLE FIRST.
--
--   Part 0  helper functions
--   Part 1  raw log table  h2_material_balance_raw  (every row exactly as Excel pushed it)
--   Part 2  repair trigger (option A): when a new row arrives, a lone spike in the
--           PREVIOUS row (far from both neighbours, while the neighbours agree with
--           each other) is replaced by the median. The newest row is never altered,
--           so the latest point can show a spike for one push cycle.
--   Part 3  view h2_material_balance_clean (option B): median-of-3 on top of the table
--
-- Tuning: spike_ratio (default 0.25 = 25 %) and agree_ratio (default 0.05 = 5 %) in
--         public.h2_spike_params(), and abs_floor (default 1) for near-zero values.
-- =====================================================================

-- ---------- Part 0: helpers ----------
CREATE OR REPLACE FUNCTION public.h2_spike_params(OUT spike_ratio numeric, OUT agree_ratio numeric, OUT abs_floor numeric)
LANGUAGE sql IMMUTABLE AS $$ SELECT 0.25::numeric, 0.05::numeric, 1::numeric $$;

-- median of three, tolerant of NULLs (NULL neighbour -> use the middle value)
CREATE OR REPLACE FUNCTION public.m3(a numeric, b numeric, c numeric)
RETURNS numeric LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE WHEN b IS NULL THEN NULL ELSE
    greatest(least(coalesce(a,b), b), least(greatest(coalesce(a,b), b), coalesce(c,b)))
  END $$;

-- ---------- Part 1: raw log ----------
CREATE TABLE IF NOT EXISTS public.h2_material_balance_raw (LIKE public.h2_material_balance);
ALTER TABLE public.h2_material_balance_raw ADD COLUMN IF NOT EXISTS received_at timestamptz DEFAULT now();
ALTER TABLE public.h2_material_balance_raw ENABLE ROW LEVEL SECURITY;  -- no policy = not readable via API

CREATE OR REPLACE FUNCTION public.h2_log_raw() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF pg_trigger_depth() > 1 THEN RETURN NEW; END IF;   -- ignore our own repair updates
  INSERT INTO public.h2_material_balance_raw SELECT NEW.*;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS h2_log_raw_trg ON public.h2_material_balance;
CREATE TRIGGER h2_log_raw_trg BEFORE INSERT OR UPDATE ON public.h2_material_balance
  FOR EACH ROW EXECUTE FUNCTION public.h2_log_raw();

-- ---------- Part 2: repair trigger (option A) ----------
CREATE OR REPLACE FUNCTION public.h2_repair_spikes() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  cols text[] := ARRAY[
    'total_generation',
    'total_consumption',
    'difference',
    'gen_hgu3',
    'gen_psa2',
    'gen_msq',
    'gen_hgu1',
    'gen_hgu4',
    'gen_hgu2_syn_gas',
    'con_hgu3',
    'con_vgo',
    'con_dhdt1',
    'con_dhds',
    'con_dhdt2',
    'con_isom',
    'con_sru',
    'con_hgu4',
    'con_lab',
    'con_ghc',
    'con_hgu1',
    'con_nba',
    'header_pressure_dhdt1',
    'ghc_fg_opening',
    'ghc_flare_opening'
  ];
  c text; p1 jsonb; p2 jsonb; nw jsonb := to_jsonb(NEW);
  p1id bigint; a numeric; b numeric; d numeric; med numeric; scale numeric;
  prm record := public.h2_spike_params();
BEGIN
  IF pg_trigger_depth() > 1 THEN RETURN NULL; END IF;     -- our own UPDATEs below

  SELECT id, to_jsonb(t) INTO p1id, p1 FROM public.h2_material_balance t
   WHERE snapshot_time < NEW.snapshot_time ORDER BY snapshot_time DESC LIMIT 1;
  IF p1 IS NULL THEN RETURN NULL; END IF;
  SELECT to_jsonb(t) INTO p2 FROM public.h2_material_balance t
   WHERE snapshot_time < (p1->>'snapshot_time')::timestamptz ORDER BY snapshot_time DESC LIMIT 1;
  IF p2 IS NULL THEN RETURN NULL; END IF;

  FOREACH c IN ARRAY cols LOOP
    IF p1->>c IS NULL OR p2->>c IS NULL OR nw->>c IS NULL THEN CONTINUE; END IF;
    d := (p1->>c)::numeric;  a := (p2->>c)::numeric;  b := (nw->>c)::numeric;
    scale := greatest(abs(a), abs(b), prm.abs_floor);
    IF abs(a - b) <= prm.agree_ratio * scale                      -- neighbours agree
       AND abs(d - a) > prm.spike_ratio * scale                    -- middle row is far from both
       AND abs(d - b) > prm.spike_ratio * scale THEN
      med := public.m3(a, d, b);
      EXECUTE format('UPDATE public.h2_material_balance SET %I = $1 WHERE id = $2', c) USING med, p1id;
    END IF;
  END LOOP;
  RETURN NULL;
END $$;

DROP TRIGGER IF EXISTS h2_repair_spikes_trg ON public.h2_material_balance;
CREATE TRIGGER h2_repair_spikes_trg AFTER INSERT OR UPDATE ON public.h2_material_balance
  FOR EACH ROW EXECUTE FUNCTION public.h2_repair_spikes();

-- ---------- Part 3: clean view (option B) ----------
CREATE OR REPLACE VIEW public.h2_material_balance_clean AS
SELECT
  id, snapshot_time,
  public.m3(lag(total_generation) OVER w, total_generation, lead(total_generation) OVER w) AS total_generation,
  public.m3(lag(total_consumption) OVER w, total_consumption, lead(total_consumption) OVER w) AS total_consumption,
  public.m3(lag(difference) OVER w, difference, lead(difference) OVER w) AS difference,
  public.m3(lag(gen_hgu3) OVER w, gen_hgu3, lead(gen_hgu3) OVER w) AS gen_hgu3,
  public.m3(lag(gen_psa2) OVER w, gen_psa2, lead(gen_psa2) OVER w) AS gen_psa2,
  public.m3(lag(gen_msq) OVER w, gen_msq, lead(gen_msq) OVER w) AS gen_msq,
  public.m3(lag(gen_hgu1) OVER w, gen_hgu1, lead(gen_hgu1) OVER w) AS gen_hgu1,
  public.m3(lag(gen_hgu4) OVER w, gen_hgu4, lead(gen_hgu4) OVER w) AS gen_hgu4,
  public.m3(lag(gen_hgu2_syn_gas) OVER w, gen_hgu2_syn_gas, lead(gen_hgu2_syn_gas) OVER w) AS gen_hgu2_syn_gas,
  public.m3(lag(con_hgu3) OVER w, con_hgu3, lead(con_hgu3) OVER w) AS con_hgu3,
  public.m3(lag(con_vgo) OVER w, con_vgo, lead(con_vgo) OVER w) AS con_vgo,
  public.m3(lag(con_dhdt1) OVER w, con_dhdt1, lead(con_dhdt1) OVER w) AS con_dhdt1,
  public.m3(lag(con_dhds) OVER w, con_dhds, lead(con_dhds) OVER w) AS con_dhds,
  public.m3(lag(con_dhdt2) OVER w, con_dhdt2, lead(con_dhdt2) OVER w) AS con_dhdt2,
  public.m3(lag(con_isom) OVER w, con_isom, lead(con_isom) OVER w) AS con_isom,
  public.m3(lag(con_sru) OVER w, con_sru, lead(con_sru) OVER w) AS con_sru,
  public.m3(lag(con_hgu4) OVER w, con_hgu4, lead(con_hgu4) OVER w) AS con_hgu4,
  public.m3(lag(con_lab) OVER w, con_lab, lead(con_lab) OVER w) AS con_lab,
  public.m3(lag(con_ghc) OVER w, con_ghc, lead(con_ghc) OVER w) AS con_ghc,
  public.m3(lag(con_hgu1) OVER w, con_hgu1, lead(con_hgu1) OVER w) AS con_hgu1,
  public.m3(lag(con_nba) OVER w, con_nba, lead(con_nba) OVER w) AS con_nba,
  public.m3(lag(header_pressure_dhdt1) OVER w, header_pressure_dhdt1, lead(header_pressure_dhdt1) OVER w) AS header_pressure_dhdt1,
  public.m3(lag(ghc_fg_opening) OVER w, ghc_fg_opening, lead(ghc_fg_opening) OVER w) AS ghc_fg_opening,
  public.m3(lag(ghc_flare_opening) OVER w, ghc_flare_opening, lead(ghc_flare_opening) OVER w) AS ghc_flare_opening,
  pushed_at
FROM public.h2_material_balance
WINDOW w AS (ORDER BY snapshot_time);

GRANT SELECT ON public.h2_material_balance_clean TO anon, authenticated;
