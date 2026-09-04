"""Measure real sustained throughput at concurrency=CORES for every clean endpoint.
Request count per endpoint is bounded so heavy ops don't blow up wall-time. argv: ctr port cores."""
import os, sys, time, json
from concurrent.futures import ThreadPoolExecutor
sys.argv_backup = sys.argv
import stress  # reuse one(), catalog, fixtures

CORES = int(sys.argv[3]) if len(sys.argv) > 3 else 4
HERE = os.path.dirname(os.path.abspath(__file__))
CAT = {c["name"]: c for c in stress.CAT}
FULL = {m["name"]: m for m in json.load(open(os.path.join(HERE, "stress_full.json")))}
EXCLUDE = {"misc_scanner-effect", "convert_text-editor_pdf"}  # not prod-ready (per owner)

# clean endpoints only
clean = [m for m in FULL.values() if m["ok"] == m["reps"] and m["name"] not in EXCLUDE]


def probe(name):
    c = CAT[name]
    lat = FULL[name]["p50_s"] or 1.0
    # bound wall-time to ~25s/endpoint: N requests at c=CORES take ~N*lat/CORES
    n = max(8, min(40, int(25 * CORES / max(lat, 0.05))))
    t0 = time.perf_counter()
    ok = 0
    codes = []
    with ThreadPoolExecutor(max_workers=CORES) as ex:
        for f in [ex.submit(stress.one, c, 150) for _ in range(n)]:
            r = f.result()
            codes.append(r["code"])
            if r["ok"]:
                ok += 1
    dt = time.perf_counter() - t0
    return {"name": name, "n": n, "ok": ok, "rps_at_%dc" % CORES: round(ok / dt, 2) if dt > 0 else 0,
            "wall_s": round(dt, 1)}


def run():
    out = []
    print("[throughput] %d endpoints at concurrency=%d" % (len(clean), CORES), flush=True)
    for m in sorted(clean, key=lambda x: x["cpu_core_s"]):  # cheap first (fast feedback)
        try:
            r = probe(m["name"])
        except Exception as e:
            print("  ERR %s: %s" % (m["name"], e), flush=True)
            continue
        r["cpu_core_s"] = m["cpu_core_s"]
        r["p50_s"] = m["p50_s"]
        out.append(r)
        key = "rps_at_%dc" % CORES
        print("  %-40s n=%-3d rps=%6.2f (wall %ss)" % (r["name"][:40], r["n"], r[key], r["wall_s"]), flush=True)
        json.dump(out, open(os.path.join(HERE, "throughput.json"), "w"), indent=1)
    print("[throughput] done: %d endpoints" % len(out), flush=True)


if __name__ == "__main__":
    run()
