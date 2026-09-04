"""Boot each (cpu,ram) config, run campaign.py against it, tear down. Image via BENCH_IMAGE env."""
import subprocess, sys, time, json, os

HERE = os.path.dirname(os.path.abspath(__file__))
IMAGE = os.environ.get("BENCH_IMAGE", "stirlingtools/stirling-pdf:latest")
CTR = "spdf-camp"
PORT_BASE = 8100  # each config gets its own 20-port band so restart port-rotation never collides

# (label, cpus, ram_gb). RAM sweep at 4cpu; CPU sweep at 8gb. Shared: c4_r8g == part of both.
CONFIGS = [
    ("c4_r2g", 4, 2),
    ("c4_r4g", 4, 4),
    ("c1_r8g", 1, 8),
    ("c2_r8g", 2, 8),
    ("c4_r8g", 4, 8),
    ("c8_r8g", 8, 8),
]


def sh(args, **kw):
    return subprocess.run(args, capture_output=True, text=True, **kw)


def boot(cpus, ram_gb, port):
    sh(["docker", "rm", "-f", CTR])
    time.sleep(2)
    sh(["docker", "run", "-d", "--name", CTR,
        "--cpus", str(cpus), "--memory", "%dg" % ram_gb, "--memory-swap", "%dg" % ram_gb,
        "-p", "%d:8080" % port,
        "-e", "DOCKER_ENABLE_SECURITY=false", "-e", "SECURITY_ENABLELOGIN=false",
        "-e", "SYSTEM_MAXFILESIZE=2000", IMAGE])
    # wait for health (generous: AOT cache regen on small cpu is slow). Every curl is bounded so a
    # non-responsive-but-up container can never hang the whole run (the bug that wasted the first run).
    for _ in range(120):
        r = sh(["curl", "-s", "--max-time", "8", "-o", "/dev/null", "-w", "%{http_code}",
                "http://localhost:%d/api/v1/info/status" % port])
        if r.stdout.strip() == "200":
            return True
        st = sh(["docker", "inspect", "-f", "{{.State.Status}}", CTR]).stdout.strip()
        if st != "running":
            return False
        time.sleep(3)
    return False


def dyn_mem(label):
    logs = sh(["docker", "logs", CTR]).stdout + sh(["docker", "logs", CTR]).stderr
    for line in logs.splitlines():
        if "Dynamic memory" in line:
            return line.split("Dynamic memory:")[-1].strip()
    return "?"


def main():
    summary = []
    for i, (label, cpus, ram) in enumerate(CONFIGS):
        port = PORT_BASE + i * 20
        print("\n========== %s (cpus=%s ram=%sGB port=%d) ==========" % (label, cpus, ram, port), flush=True)
        if not boot(cpus, ram, port):
            print("  BOOT FAILED for %s" % label, flush=True)
            print(sh(["docker", "logs", "--tail", "20", CTR]).stdout[-2000:], flush=True)
            summary.append({"config": label, "boot": "FAILED"})
            json.dump(summary, open(os.path.join(HERE, "campaign_summary.json"), "w"), indent=1)
            continue
        heap = dyn_mem(label)
        print("  booted. heap policy: %s" % heap, flush=True)
        rc = subprocess.run([sys.executable, os.path.join(HERE, "campaign.py"),
                             CTR, str(port), label, str(cpus), str(ram), IMAGE])
        summary.append({"config": label, "cpus": cpus, "ram_gb": ram, "heap_policy": heap,
                        "rc": rc.returncode})
        json.dump(summary, open(os.path.join(HERE, "campaign_summary.json"), "w"), indent=1)
    sh(["docker", "rm", "-f", CTR])
    print("\nCAMPAIGN COMPLETE. configs run: %d" % len(summary), flush=True)


if __name__ == "__main__":
    main()
