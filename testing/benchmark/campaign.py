"""Per-config runner: cost battery (conc=1) + mixed concurrency knee. argv: ctr port cfg cpus ram_gb image."""
import os, sys, time, json, threading, subprocess, random
import requests
from concurrent.futures import ThreadPoolExecutor
import campaign_tools as CT

HERE = os.path.dirname(os.path.abspath(__file__))
FIXDIR = os.path.join(HERE, "fixtures")

CTR = sys.argv[1]
PORT = int(sys.argv[2])
CFG = sys.argv[3]
CPUS = float(sys.argv[4])
RAM_GB = float(sys.argv[5])
IMAGE = sys.argv[6] if len(sys.argv) > 6 else os.environ.get("BENCH_IMAGE", "stirlingtools/stirling-pdf:latest")
TOOLS = CT.tools(PORT)
FIX = CT.FIXTURES
MEMCACHE = {}
EVENTS = []  # container deaths / restarts recorded as findings


def alive():
    r = subprocess.run(["docker", "inspect", "-f", "{{.State.Running}}", CTR],
                       capture_output=True, text=True)
    return r.stdout.strip() == "true"


def http_ok():
    r = subprocess.run(["curl", "-s", "--max-time", "8", "-o", "/dev/null", "-w", "%{http_code}",
                        "http://localhost:%d/api/v1/info/status" % PORT], capture_output=True, text=True)
    return r.stdout.strip() == "200"


def restart(reason):
    # Docker Desktop (Windows) wedges the host port-proxy on rapid rm/run of the same port, so every
    # (re)start binds a FRESH host port and TOOLS is rebuilt to point at it.
    global PORT, TOOLS
    subprocess.run(["docker", "rm", "-f", CTR], capture_output=True)
    time.sleep(2)
    PORT += 1
    TOOLS = CT.tools(PORT)
    subprocess.run(["docker", "run", "-d", "--name", CTR, "--cpus", str(CPUS),
                    "--memory", "%dg" % int(RAM_GB), "--memory-swap", "%dg" % int(RAM_GB),
                    "-p", "%d:8080" % PORT, "-e", "DOCKER_ENABLE_SECURITY=false",
                    "-e", "SECURITY_ENABLELOGIN=false", "-e", "SYSTEM_MAXFILESIZE=2000", IMAGE],
                   capture_output=True)
    for _ in range(100):
        if http_ok():
            EVENTS.append({"event": "restart", "reason": reason, "new_port": PORT})
            print("    [restarted container on port %d: %s]" % (PORT, reason), flush=True)
            return True
        if not alive():
            time.sleep(2)
            continue
        time.sleep(3)
    EVENTS.append({"event": "restart_failed", "reason": reason})
    return False


def ensure_alive(reason):
    if http_ok():
        return True
    return restart(reason)


def _cat(path):
    r = subprocess.run(["docker", "exec", CTR, "cat", path], capture_output=True, text=True)
    return r.stdout.strip()


def mem_current():
    try:
        return int(_cat("/sys/fs/cgroup/memory.current"))
    except Exception:
        return 0


def cpu_usec():
    for line in _cat("/sys/fs/cgroup/cpu.stat").splitlines():
        if line.startswith("usage_usec"):
            return int(line.split()[1])
    return 0


def oom():
    for line in _cat("/sys/fs/cgroup/memory.events").splitlines():
        p = line.split()
        if len(p) == 2 and p[0] == "oom_kill":
            return int(p[1])
    return 0


class Sampler(threading.Thread):
    def __init__(self, iv=0.3):
        super().__init__(daemon=True)
        self.iv = iv
        self.stop = False
        self.anon_peak = 0
        self.cur_peak = 0

    def run(self):
        cmd = ("while true; do cat /sys/fs/cgroup/memory.current; "
               "grep -m1 '^anon ' /sys/fs/cgroup/memory.stat; sleep %s; done" % self.iv)
        p = subprocess.Popen(["docker", "exec", CTR, "sh", "-c", cmd],
                             stdout=subprocess.PIPE, text=True)
        self.proc = p
        for line in p.stdout:
            if self.stop:
                break
            line = line.strip()
            try:
                if line.startswith("anon "):
                    self.anon_peak = max(self.anon_peak, int(line.split()[1]))
                else:
                    self.cur_peak = max(self.cur_peak, int(line))
            except Exception:
                pass

    def halt(self):
        self.stop = True
        try:
            self.proc.kill()
        except Exception:
            pass


def fixture_payload(fixname):
    path = os.path.join(FIXDIR, FIX[fixname])
    size = os.path.getsize(path)
    if size <= 12 * 1024 * 1024:
        if fixname not in MEMCACHE:
            MEMCACHE[fixname] = open(path, "rb").read()
        return MEMCACHE[fixname], None, size
    return None, path, size


def one(toolname, fixname, timeout):
    url, fields, _tag = TOOLS[toolname]
    data, path, size = fixture_payload(fixname)
    fh = None
    t0 = time.perf_counter()
    try:
        if data is not None:
            payload = data
        else:
            fh = open(path, "rb")
            payload = fh
        files = {"fileInput": (FIX[fixname], payload, "application/pdf")}
        # (connect, read): a dead container fails the connect in 5s instead of a full read timeout
        r = requests.post(url, files=files, data=fields, timeout=(5, timeout))
        dt = time.perf_counter() - t0
        body = r.content
        return {"ok": r.status_code == 200, "code": r.status_code, "sec": dt, "out": len(body),
                "err": (body[:200].decode("utf8", "replace") if r.status_code != 200 else "")}
    except Exception as e:
        return {"ok": False, "code": -1, "sec": time.perf_counter() - t0, "out": 0,
                "err": "%s: %s" % (type(e).__name__, str(e)[:160])}
    finally:
        if fh:
            fh.close()


def cell(toolname, fixname, conc, total, timeout=180, settle=0.5):
    c0 = cpu_usec()
    o0 = oom()
    base = mem_current()
    s = Sampler()
    s.start()
    time.sleep(settle)
    t0 = time.perf_counter()
    res = []
    with ThreadPoolExecutor(max_workers=conc) as ex:
        futs = [ex.submit(one, toolname, fixname, timeout) for _ in range(total)]
        for f in futs:
            res.append(f.result())
    wall = time.perf_counter() - t0
    time.sleep(settle)
    s.halt()
    c1 = cpu_usec()
    o1 = oom()
    lat = sorted(r["sec"] for r in res if r["ok"])
    okn = len(lat)
    errs = {}
    for r in res:
        if not r["ok"]:
            k = "%s: %s" % (r["code"], r["err"][:120])
            errs[k] = errs.get(k, 0) + 1

    def pct(p):
        return round(lat[min(len(lat) - 1, int(len(lat) * p))], 3) if lat else None

    return {"cfg": CFG, "cpus": CPUS, "ram_gb": RAM_GB, "tool": toolname, "tag": TOOLS[toolname][2],
            "fixture": fixname, "conc": conc, "total": total, "ok": okn, "fail": total - okn,
            "wall_s": round(wall, 2), "rps": round(okn / wall, 3) if wall > 0 else 0,
            "p50": pct(.5), "p95": pct(.95), "max": round(lat[-1], 3) if lat else None,
            "anon_peak_mb": round(s.anon_peak / 2 ** 20), "cur_peak_mb": round(s.cur_peak / 2 ** 20),
            "anon_delta_mb": round((s.anon_peak - base) / 2 ** 20),
            "cpu_core_s": round((c1 - c0) / 1e6, 2),
            "cpu_util_pct": round(((c1 - c0) / 1e6) / wall / CPUS * 100, 1) if wall > 0 else 0,
            "oom_kill": o1 - o0, "errors": errs}


BATTERY = [
    ("basic-info", "text-100p"), ("get-info", "text-1000p"), ("pdf-to-text", "text-1000p"),
    ("pdf-to-text", "huge-3000p"), ("pdf-to-csv", "tables-50p"), ("pdf-to-markdown", "text-100p"),
    ("pdf-to-xml", "text-100p"),
    ("rotate", "text-1000p"), ("rotate", "huge-3000p"), ("remove-pages", "text-100p"),
    ("scale-pages", "text-100p"), ("crop", "text-100p"), ("multi-layout", "text-100p"),
    ("split-pages", "mixed-200p"), ("update-meta", "text-1000p"), ("add-page-nums", "text-1000p"),
    ("sanitize", "fat-3p-110mb"), ("add-password", "text-1000p"), ("watermark", "text-100p"),
    ("watermark", "text-1000p"), ("flatten", "form-20p"), ("remove-blanks", "scanned-5p"),
    ("decompress", "text-1000p"),
    ("extract-images", "many-imgs-30p"), ("extract-images", "fat-3p-110mb"),
    ("pdf-to-img", "text-100p"), ("pdf-to-img", "scanned-5p"),
    ("repair", "text-1000p"), ("compress", "text-100p"), ("compress", "fat-3p-110mb"),
    ("compress", "scanned-50p"), ("pdf-to-word", "text-100p"), ("pdf-to-pdfa", "text-100p"),
    ("pdf-to-pdfa", "text-1000p"), ("ocr", "scanned-5p"), ("ocr", "text-10p"),
]
HEAVY_SKIP_ON_SMALL = {("ocr", "scanned-5p"), ("extract-images", "fat-3p-110mb"),
                       ("compress", "fat-3p-110mb"), ("pdf-to-word", "text-100p")}

MIX = [(18, "rotate", "text-100p"), (12, "remove-pages", "text-100p"), (10, "compress", "text-100p"),
       (10, "pdf-to-text", "text-100p"), (8, "add-page-nums", "text-100p"), (8, "sanitize", "text-100p"),
       (7, "basic-info", "text-10p"), (6, "pdf-to-img", "text-10p"), (6, "update-meta", "text-100p"),
       (5, "pdf-to-word", "text-10p"), (4, "watermark", "text-100p"), (3, "pdf-to-pdfa", "text-10p"),
       (2, "rotate", "text-1000p"), (1, "ocr", "scanned-5p")]


def save(out):
    json.dump(out, open(os.path.join(HERE, "camp_%s.json" % CFG), "w"), indent=1)


def run():
    out = {"config": CFG, "cpus": CPUS, "ram_gb": RAM_GB, "battery": [], "mixed": [], "events": EVENTS}
    restarts = 0
    MAX_RESTARTS = 5
    print("[%s] battery (%d cells)" % (CFG, len(BATTERY)), flush=True)
    for tool, fx in BATTERY:
        if not ensure_alive("before %s/%s" % (tool, fx)):
            print("  container down, cannot recover; aborting battery", flush=True)
            break
        try:
            r = cell(tool, fx, 1, 2, timeout=180, settle=0.4)
        except Exception as e:
            print("  ERR %s/%s: %s" % (tool, fx, e), flush=True)
            continue
        # Container death during a cell = the op crashed the JVM at this resource level (a finding).
        if not alive():
            r["container_died"] = True
            EVENTS.append({"event": "died", "tool": tool, "fixture": fx, "cfg": CFG})
            print("  CRASH %-15s %-13s -> container died (OOM/JVM exit at %sGB)" % (tool, fx, RAM_GB), flush=True)
            out["battery"].append(r)
            save(out)
            restarts += 1
            if restarts > MAX_RESTARTS or not restart("after crash on %s/%s" % (tool, fx)):
                print("  too many restarts; aborting battery", flush=True)
                break
            continue
        out["battery"].append(r)
        st = "OK " if r["fail"] == 0 else "F%d" % r["fail"]
        print("  %s %-15s %-13s p50=%7ss cpu=%6.1f anon+%4dMB peak=%dMB oom=%d %s"
              % (st, tool, fx, r["p50"], r["cpu_core_s"], r["anon_delta_mb"], r["cur_peak_mb"],
                 r["oom_kill"], list(r["errors"].keys())[:1]), flush=True)
        save(out)

    pool = []
    for w, t, f in MIX:
        pool += [(t, f)] * w
    rng = random.Random(42)
    print("[%s] mixed ramp" % CFG, flush=True)
    for conc in [1, 2, 4, 8, 16, 32]:
        if not ensure_alive("before mixed c=%d" % conc):
            print("  container down; aborting mixed ramp", flush=True)
            break
        total = max(conc * 3, 45)
        c0 = cpu_usec()
        o0 = oom()
        base = mem_current()
        s = Sampler()
        s.start()
        time.sleep(0.6)
        t0 = time.perf_counter()
        res = []
        plan = [pool[rng.randrange(len(pool))] for _ in range(total)]
        with ThreadPoolExecutor(max_workers=conc) as ex:
            futs = [ex.submit(one, t, f, 180) for t, f in plan]
            for fu in futs:
                res.append(fu.result())
        wall = time.perf_counter() - t0
        time.sleep(0.6)
        s.halt()
        c1 = cpu_usec()
        o1 = oom()
        lat = sorted(r["sec"] for r in res if r["ok"])
        errs = {}
        for r in res:
            if not r["ok"]:
                k = "%s: %s" % (r["code"], r["err"][:90])
                errs[k] = errs.get(k, 0) + 1

        def pct(p):
            return round(lat[min(len(lat) - 1, int(len(lat) * p))], 3) if lat else None

        m = {"cfg": CFG, "conc": conc, "total": total, "ok": len(lat), "fail": total - len(lat),
             "rps": round(len(lat) / wall, 3) if wall > 0 else 0, "p50": pct(.5), "p95": pct(.95),
             "p99": pct(.99), "anon_peak_mb": round(s.anon_peak / 2 ** 20),
             "cur_peak_mb": round(s.cur_peak / 2 ** 20),
             "cpu_util_pct": round(((c1 - c0) / 1e6) / wall / CPUS * 100, 1) if wall > 0 else 0,
             "oom_kill": o1 - o0, "errors": errs}
        died = not alive()
        if died:
            m["container_died"] = True
            EVENTS.append({"event": "died", "tool": "mixed", "fixture": "c=%d" % conc, "cfg": CFG})
        out["mixed"].append(m)
        print("  c=%-3d rps=%6.2f p50=%ss p95=%ss fail=%d peak=%dMB cpu=%s%% oom=%d%s %s"
              % (conc, m["rps"], m["p50"], m["p95"], m["fail"], m["cur_peak_mb"],
                 m["cpu_util_pct"], m["oom_kill"], " DIED" if died else "", list(m["errors"].items())[:1]), flush=True)
        save(out)
        if died or m["fail"] / m["total"] > 0.3 or m["oom_kill"] > 0:
            print("  -> stop ramp", flush=True)
            break
    out["events"] = EVENTS
    save(out)
    print("[%s] done: %d battery + %d mixed" % (CFG, len(out["battery"]), len(out["mixed"])), flush=True)


if __name__ == "__main__":
    run()
