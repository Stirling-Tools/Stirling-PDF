"""Per-endpoint stress: single-request cost (latency, CPU core-s, RAM) for every runnable endpoint.
argv: ctr port cpus mode[smoke|full] [fixture_override]. Derives max throughput = cpus / cpu_core_s."""
import os, sys, time, json, threading, subprocess, statistics
import requests
from concurrent.futures import ThreadPoolExecutor

HERE = os.path.dirname(os.path.abspath(__file__))
FIXDIR = os.path.join(HERE, "fixtures")
CTR = sys.argv[1]
PORT = int(sys.argv[2])
CPUS = float(sys.argv[3])
MODE = sys.argv[4] if len(sys.argv) > 4 else "smoke"
CAT = json.load(open(os.path.join(HERE, "catalog.json")))
BASE = "http://localhost:%d" % PORT
MEMCACHE = {}


def _cat(path):
    return subprocess.run(["docker", "exec", CTR, "cat", path], capture_output=True, text=True).stdout.strip()


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
    def __init__(self, iv=0.25):
        super().__init__(daemon=True)
        self.iv = iv
        self.stop = False
        self.anon_peak = 0
        self.cur_peak = 0

    def run(self):
        cmd = ("while true; do cat /sys/fs/cgroup/memory.current; grep -m1 '^anon ' "
               "/sys/fs/cgroup/memory.stat; sleep %s; done" % self.iv)
        p = subprocess.Popen(["docker", "exec", CTR, "sh", "-c", cmd], stdout=subprocess.PIPE, text=True)
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


CTYPE = {".pdf": "application/pdf", ".png": "image/png", ".jpg": "image/jpeg",
         ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
         ".md": "text/markdown", ".html": "text/html", ".svg": "image/svg+xml",
         ".zip": "application/zip", ".csv": "text/csv"}


def ctype_for(fx):
    ext = os.path.splitext(fx)[1].lower()
    return CTYPE.get(ext, "application/octet-stream")


def payload(fx):
    path = os.path.join(FIXDIR, fx)
    size = os.path.getsize(path)
    if size <= 12 * 1024 * 1024:
        if fx not in MEMCACHE:
            MEMCACHE[fx] = open(path, "rb").read()
        return MEMCACHE[fx], None
    return None, path


def one(c, timeout):
    url = BASE + c["endpoint"]
    data, path = payload(c["fixture"])
    fh = None
    t0 = time.perf_counter()
    try:
        content = data if data is not None else (fh := open(path, "rb")).read()
        ct = ctype_for(c["fixture"])
        files = [(c["file_field"], (c["fixture"], content, ct))]
        if c["multi"]:
            files.append((c["file_field"], (c["fixture"], content, ct)))
        # extra file fields (e.g. overlay/add-image second file)
        for ef in c.get("extra_files", []):
            ed, ep = payload(ef["fixture"])
            ec = ed if ed is not None else open(os.path.join(FIXDIR, ef["fixture"]), "rb").read()
            files.append((ef["field"], (ef["fixture"], ec, ctype_for(ef["fixture"]))))
        r = requests.post(url, files=files, data=c["params"], timeout=(5, timeout))
        dt = time.perf_counter() - t0
        body = r.content
        # 204 (No Content) is a valid success for filters / empty-result converters
        good = r.status_code in (200, 204)
        return {"ok": good, "code": r.status_code, "sec": dt, "out": len(body),
                "err": (body[:220].decode("utf8", "replace") if not good else "")}
    except Exception as e:
        return {"ok": False, "code": -1, "sec": time.perf_counter() - t0, "out": 0,
                "err": "%s: %s" % (type(e).__name__, str(e)[:180])}
    finally:
        if fh:
            fh.close()


def measure(c, reps, timeout):
    c0 = cpu_usec()
    o0 = oom()
    base = mem_current()
    s = Sampler()
    s.start()
    time.sleep(0.35)
    lat = []
    codes = []
    err = ""
    for _ in range(reps):
        r = one(c, timeout)
        codes.append(r["code"])
        if r["ok"]:
            lat.append(r["sec"])
        else:
            err = r["err"]
    time.sleep(0.35)
    s.halt()
    c1 = cpu_usec()
    o1 = oom()
    okn = len(lat)
    cpu_total = (c1 - c0) / 1e6
    cpu_per = cpu_total / max(1, reps)
    p50 = round(statistics.median(lat), 3) if lat else None
    # max throughput on CPUS cores, CPU-bound: cores / cpu_core_s_per_request
    max_rps = round(CPUS / cpu_per, 2) if cpu_per > 0.05 and okn else None
    return {
        "name": c["name"], "endpoint": c["endpoint"], "group": c["group"],
        "fixture": c["fixture"], "input_kind": c["input_kind"], "multi": c["multi"],
        "ok": okn, "reps": reps, "codes": codes, "err": err[:200],
        "p50_s": p50, "cpu_core_s": round(cpu_per, 2), "cpu_total_s": round(cpu_total, 2),
        "anon_delta_mb": round((s.anon_peak - base) / 2 ** 20),
        "peak_mb": round(s.cur_peak / 2 ** 20),
        "est_max_rps": max_rps, "oom_kill": o1 - o0,
    }


def run():
    runnable = [c for c in CAT if not c["skip"]]
    reps = 2 if MODE == "smoke" else 3
    out = []
    print("[stress %s] %d endpoints, %d reps, %.0f cores" % (MODE, len(runnable), reps, CPUS), flush=True)
    for c in runnable:
        try:
            m = measure(c, reps, timeout=150)
        except Exception as e:
            print("  ERR %s: %s" % (c["name"], e), flush=True)
            continue
        out.append(m)
        st = "OK " if m["ok"] == reps else ("F%d" % (reps - m["ok"]))
        extra = "" if m["ok"] else (" codes=%s %s" % (m["codes"], m["err"][:90]))
        print("  %s %-40s p50=%7ss cpu=%6.2f anon+%5dMB rps~%s%s"
              % (st, m["name"][:40], m["p50_s"], m["cpu_core_s"], m["anon_delta_mb"],
                 m["est_max_rps"], extra), flush=True)
        json.dump(out, open(os.path.join(HERE, "stress_%s.json" % MODE), "w"), indent=1)
    ok = [m for m in out if m["ok"] == reps]
    print("\n[stress %s] done: %d/%d fully OK" % (MODE, len(ok), len(out)), flush=True)
    json.dump(out, open(os.path.join(HERE, "stress_%s.json" % MODE), "w"), indent=1)


if __name__ == "__main__":
    run()
