#!/usr/bin/env python3
"""Run the H2 SQL files against Supabase through the Management API (HTTPS only).

Needs env vars:  SUPABASE_ACCESS_TOKEN   (Supabase > Account > Access Tokens)
Optional:        SUPABASE_PROJECT_REF    (default mozuuowwdfyqqvpiyetk)
Usage:           python3 automation/apply_supabase.py [--dry-run] [--verify-only]
Steps: backup table -> migration -> spike filter -> provisional/final -> verification queries.
"""
import json, os, sys, urllib.request, urllib.error

REF = os.environ.get("SUPABASE_PROJECT_REF", "mozuuowwdfyqqvpiyetk")
TOKEN = os.environ.get("SUPABASE_ACCESS_TOKEN", "")
HERE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "uniformance")
FILES = ["supabase_spike_filter.sql", "supabase_provisional_final.sql", "supabase_upsert_guard.sql"]
BACKUP = "CREATE TABLE IF NOT EXISTS public.h2_material_balance_backup_20261010 AS TABLE public.h2_material_balance;"
VERIFY = [
    "select is_final, count(*) from public.h2_material_balance group by 1 order by 1",
    "select count(*) as raw_rows from public.h2_material_balance_raw",
    "select tgname from pg_trigger where tgrelid = 'public.h2_material_balance'::regclass and not tgisinternal order by 1",
    "select snapshot_time, is_final, total_generation from public.h2_material_balance order by snapshot_time desc limit 5",
]

def run(sql, dry):
    if dry:
        print("  [dry-run] %d chars of SQL" % len(sql)); return []
    req = urllib.request.Request(
        "https://api.supabase.com/v1/projects/%s/database/query" % REF,
        data=json.dumps({"query": sql}).encode(), method="POST",
        headers={"Authorization": "Bearer " + TOKEN, "Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=120) as r:
            return json.loads(r.read() or b"[]")
    except urllib.error.HTTPError as e:
        sys.exit("FAILED (%s): %s" % (e.code, e.read().decode()[:800]))

def main():
    dry, verify_only = "--dry-run" in sys.argv, "--verify-only" in sys.argv
    if not dry and not TOKEN:
        sys.exit("SUPABASE_ACCESS_TOKEN is not set")
    if not verify_only:
        print("1) backup table"); run(BACKUP, dry)
        for i, f in enumerate(FILES, 2):
            print("%d) %s" % (i, f))
            run(open(os.path.join(HERE, f)).read(), dry)
            print("   ok")
    print("verification")
    for q in VERIFY:
        print(" ", q); print("   ->", json.dumps(run(q, dry))[:600])

if __name__ == "__main__":
    main()
