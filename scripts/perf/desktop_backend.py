#!/usr/bin/env python3
"""Launch the desktop backend JAR, drive one multipart endpoint, and write JSON.

This is a comparison harness, not a benchmark suite. It isolates application
data, waits for the dynamic port, samples process-tree CPU/RSS, optionally asks
jcmd for heap counters and macOS footprint, then stops the backend through its
shutdown sentinel. Run with --help for the available workload and sampling
options.
"""

import argparse
import http.client
import json
import os
import shutil
import subprocess
import sys
import threading
import time
import platform
import uuid
from pathlib import Path


def sha256_file(path):
    try:
        out = subprocess.check_output(["sha256sum", path], text=True)
    except FileNotFoundError:
        out = subprocess.check_output(["shasum", "-a", "256", path], text=True)
    return out.split()[0]


def parse_ps_time(text):
    text = text.strip()
    if not text:
        return 0.0
    parts = text.split(":")
    try:
        if len(parts) == 2:
            return int(parts[0]) * 60 + float(parts[1])
        if len(parts) == 3:
            return int(parts[0]) * 3600 + int(parts[1]) * 60 + float(parts[2])
    except ValueError:
        pass
    return 0.0


def process_table():
    out = subprocess.check_output(["ps", "-axo", "pid=,ppid=,time=,rss="], text=True)
    rows = {}
    for line in out.splitlines():
        fields = line.split()
        if len(fields) < 4:
            continue
        try:
            rows[int(fields[0])] = (int(fields[1]), parse_ps_time(fields[2]), int(fields[3]))
        except ValueError:
            continue
    return rows


def tree_totals(root_pid):
    rows = process_table()
    children = {}
    for pid, (ppid, _, _) in rows.items():
        children.setdefault(ppid, []).append(pid)
    stack = [root_pid]
    pids = []
    while stack:
        pid = stack.pop()
        if pid not in rows:
            continue
        pids.append(pid)
        stack.extend(children.get(pid, []))
    return sum(rows[p][1] for p in pids), sum(rows[p][2] for p in pids), pids


class Server:
    def __init__(self, args):
        self.args = args
        self.root = Path(args.data_dir)
        shutil.rmtree(self.root, ignore_errors=True)
        for sub in ("config", "logs", "work"):
            (self.root / sub).mkdir(parents=True, exist_ok=True)
        self.stop_file = self.root / "work" / ".backend-stop"
        self.log = self.root / "stdout.log"
        self.proc = None
        self.port = None
        self.startup_seconds = None

    def start(self):
        java = self.args.java
        cmd = [
            java,
            "-Xmx2g",
            *self.args.flags,
            "-DBROWSER_OPEN=false",
            "-DSTIRLING_PDF_TAURI_MODE=true",
            "-Dlogging.file.name=stirling-pdf.log",
            "-Dserver.port=0",
            "-Dserver.forward-headers-strategy=none",
            "-Dsecurity.enableLogin=false",
            "-Dsecurity.csrfDisabled=true",
            "-Dlogging.file.path=" + str(self.root / "logs"),
            "-jar",
            self.args.jar,
        ]
        env = os.environ.copy()
        env.update(
            {
                "TAURI_PARENT_PID": "",
                "STIRLING_PDF_CONFIG_DIR": str(self.root / "config"),
                "STIRLING_PDF_LOG_DIR": str(self.root / "logs"),
                "STIRLING_PDF_WORK_DIR": str(self.root / "work"),
                "STIRLING_PDF_SHUTDOWN_FILE": str(self.stop_file),
            }
        )
        env.pop("JAVA_TOOL_OPTIONS", None)
        env.pop("_JAVA_OPTIONS", None)
        for item in self.args.env:
            key, _, value = item.partition("=")
            if value == "__UNSET__":
                env.pop(key, None)
                continue
            env[key] = value
        start = time.monotonic()
        log = open(self.log, "wb")
        self.proc = subprocess.Popen(cmd, cwd=self.root / "work", stdout=log, stderr=subprocess.STDOUT, env=env)
        deadline = start + self.args.startup_timeout
        while time.monotonic() < deadline:
            if self.proc.poll() is not None:
                raise RuntimeError("backend exited during startup; see " + str(self.log))
            try:
                text = self.log.read_text(errors="replace")
            except FileNotFoundError:
                text = ""
            marker = "running on port: "
            if marker in text:
                line = [entry for entry in text.splitlines() if marker in entry][-1]
                self.port = int(line.split(marker, 1)[1].split()[0])
                self.startup_seconds = time.monotonic() - start
                return
            time.sleep(0.1)
        raise RuntimeError("backend did not report a port within startup timeout")

    def stop(self):
        if self.proc is None:
            return
        try:
            self.stop_file.write_text("stop")
        except OSError:
            pass
        try:
            self.proc.wait(timeout=15)
        except subprocess.TimeoutExpired:
            self.proc.terminate()
            try:
                self.proc.wait(timeout=10)
            except subprocess.TimeoutExpired:
                self.proc.kill()
                self.proc.wait(timeout=10)


def multipart(fields, file_field, file_path):
    boundary = "----stirlingperf" + uuid.uuid4().hex
    parts = []
    for key, value in fields.items():
        parts.append(f'--{boundary}\r\nContent-Disposition: form-data; name="{key}"\r\n\r\n{value}\r\n'.encode())
    data = Path(file_path).read_bytes()
    filename = Path(file_path).name
    suffix = Path(file_path).suffix.lower()
    content_type = {
        ".pdf": "application/pdf",
        ".jpg": "image/jpeg",
        ".jpeg": "image/jpeg",
        ".png": "image/png",
    }.get(suffix, "application/octet-stream")
    parts.append(
        f'--{boundary}\r\nContent-Disposition: form-data; name="{file_field}"; filename="{filename}"\r\n'
        f"Content-Type: {content_type}\r\n\r\n".encode()
        + data
        + b"\r\n"
    )
    parts.append(f"--{boundary}--\r\n".encode())
    return boundary, b"".join(parts)


def one_request(conn, endpoint, body, boundary, timeout):
    conn.timeout = timeout
    conn.request(
        "POST",
        endpoint,
        body=body,
        headers={"Content-Type": "multipart/form-data; boundary=" + boundary, "Content-Length": str(len(body))},
    )
    response = conn.getresponse()
    payload = response.read()
    return response.status, payload, response.getheader("Connection", "")


def physical_footprint(pid):
    if platform.system() != "Darwin":
        return None
    try:
        out = subprocess.check_output(["footprint", "-p", str(pid)], text=True, stderr=subprocess.STDOUT, timeout=20)
    except Exception as exc:
        return {"error": repr(exc)}
    for line in out.splitlines():
        if "Footprint:" in line:
            info = {"line": line.strip(), "raw": out.strip()}
            try:
                value = line.split("Footprint:", 1)[1].split("MB", 1)[0].strip()
                info["mb"] = float(value)
            except ValueError:
                pass
            return info
    return {"line": None, "raw": out.strip()[:2000]}


def heap_info(jcmd, pid):
    if not jcmd:
        return None
    try:
        out = subprocess.check_output([jcmd, str(pid), "GC.heap_info"], text=True, stderr=subprocess.STDOUT, timeout=20)
    except Exception as exc:
        return {"error": repr(exc)}
    info = {"raw": out.strip()}
    for line in out.splitlines():
        if "garbage-first heap" in line:
            info["line"] = line.strip()
            if "total" in line and "used" in line:
                try:
                    total = line.split("total", 1)[1].split("K", 1)[0].strip()
                    used = line.split("used", 1)[1].split("K", 1)[0].strip()
                    info["total_kb"] = int(total)
                    info["used_kb"] = int(used)
                except ValueError:
                    pass
    return info


def percentile(values, pct):
    if not values:
        return None
    values = sorted(values)
    index = min(len(values) - 1, max(0, int(round((pct / 100.0) * len(values) + 0.5)) - 1))
    return values[index]


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--java", required=True)
    parser.add_argument("--jar", required=True)
    parser.add_argument("--label", required=True)
    parser.add_argument("--data-dir", required=True)
    parser.add_argument("--jcmd", default=None)
    parser.add_argument("--save-response", default=None, help="path for the first successful response body")
    parser.add_argument("--flags", default="[]", help="JSON array of JVM flags")
    parser.add_argument("--env", action="append", default=[])
    parser.add_argument("--endpoint", default="/api/v1/general/rotate-pdf")
    parser.add_argument("--file", default="testing/test_pdf_1.pdf")
    parser.add_argument("--file-field", default="fileInput")
    parser.add_argument("--fields", default='{"angle":"90"}')
    parser.add_argument("--duration", type=float, default=30.0)
    parser.add_argument("--requests", type=int, default=0, help="fixed request count instead of duration")
    parser.add_argument("--workers", type=int, default=4)
    parser.add_argument("--warmup", type=int, default=10)
    parser.add_argument("--startup-timeout", type=float, default=120.0)
    parser.add_argument("--request-timeout", type=float, default=120.0)
    parser.add_argument("--sample-interval", type=float, default=1.0)
    parser.add_argument("--idle-seconds", type=float, default=0.0)
    parser.add_argument("--idle-settle", type=float, default=10.0)
    parser.add_argument("--out", required=True)
    args = parser.parse_args()

    fields = json.loads(args.fields)
    args.flags = json.loads(args.flags)
    boundary, body = multipart(fields, args.file_field, args.file)
    server = Server(args)
    try:
        git_head = subprocess.check_output(["git", "rev-parse", "HEAD"], text=True, stderr=subprocess.DEVNULL).strip()
        git_dirty = bool(
            subprocess.check_output(["git", "status", "--porcelain"], text=True, stderr=subprocess.DEVNULL).strip()
        )
    except (OSError, subprocess.CalledProcessError):
        git_head = None
        git_dirty = None
    result = {
        "label": args.label,
        "java": args.java,
        "flags": args.flags,
        "env": args.env,
        "endpoint": args.endpoint,
        "file": str(Path(args.file).resolve()),
        "file_sha256": sha256_file(args.file),
        "workers": args.workers,
        "duration_seconds": args.duration,
        "requested": args.requests,
        "platform": platform.platform(),
        "machine": platform.machine(),
        "python": sys.version.split()[0],
        "git_head": git_head,
        "git_dirty": git_dirty,
        "started_at": time.strftime("%Y-%m-%dT%H:%M:%S%z"),
    }

    try:
        server.start()
        result["startup_seconds"] = server.startup_seconds
        result["port"] = server.port
        time.sleep(1)
        samples = []
        work = {
            "ok": 0,
            "failures": 0,
            "latencies": [],
            "bytes": 0,
            "saved": False,
            "errors": {},
        }
        lock = threading.Lock()
        deadline = time.monotonic() + args.duration
        claimed = [0]

        def claim():
            with lock:
                if args.requests and claimed[0] >= args.requests:
                    return False
                claimed[0] += 1
                return True

        def worker():
            local_latencies = []
            local_ok = 0
            local_fail = 0
            local_bytes = 0
            conn = http.client.HTTPConnection("127.0.0.1", server.port, timeout=args.request_timeout)
            while time.monotonic() < deadline and claim():
                started = time.monotonic()
                try:
                    status, payload, connection_header = one_request(
                        conn, args.endpoint, body, boundary, args.request_timeout
                    )
                    if status == 200:
                        local_ok += 1
                        local_bytes += len(payload)
                        if args.save_response:
                            with lock:
                                if not work["saved"]:
                                    Path(args.save_response).parent.mkdir(parents=True, exist_ok=True)
                                    Path(args.save_response).write_bytes(payload)
                                    work["saved"] = True
                    else:
                        local_fail += 1
                    if connection_header.lower() == "close":
                        conn.close()
                        conn = http.client.HTTPConnection("127.0.0.1", server.port, timeout=args.request_timeout)
                except Exception as exc:
                    key = type(exc).__name__ + ":" + str(exc)[:120]
                    with lock:
                        work["errors"][key] = work["errors"].get(key, 0) + 1
                    local_fail += 1
                    conn.close()
                    conn = http.client.HTTPConnection("127.0.0.1", server.port, timeout=args.request_timeout)
                local_latencies.append((time.monotonic() - started) * 1000.0)
            conn.close()
            with lock:
                work["ok"] += local_ok
                work["failures"] += local_fail
                work["bytes"] += local_bytes
                work["latencies"].extend(local_latencies)

        # Warmup before the timed window.
        warm_conn = http.client.HTTPConnection("127.0.0.1", server.port, timeout=args.request_timeout)
        for _ in range(args.warmup):
            try:
                one_request(warm_conn, args.endpoint, body, boundary, args.request_timeout)
            except Exception:
                warm_conn.close()
                warm_conn = http.client.HTTPConnection("127.0.0.1", server.port, timeout=args.request_timeout)
        warm_conn.close()

        heap_start = heap_info(args.jcmd, server.proc.pid)
        cpu0, rss0, _ = tree_totals(server.proc.pid)
        t0 = time.monotonic()
        threads = [threading.Thread(target=worker) for _ in range(args.workers)]
        for thread in threads:
            thread.start()
        while any(thread.is_alive() for thread in threads):
            cpu, rss, pids = tree_totals(server.proc.pid)
            samples.append(
                {
                    "t": round(time.monotonic() - t0, 3),
                    "cpu_seconds": round(cpu, 3),
                    "rss_kb": rss,
                    "processes": len(pids),
                }
            )
            time.sleep(args.sample_interval)
        for thread in threads:
            thread.join()
        elapsed = time.monotonic() - t0
        cpu1, rss1, _ = tree_totals(server.proc.pid)
        result["workload"] = {
            "elapsed_seconds": round(elapsed, 3),
            "ok": work["ok"],
            "failures": work["failures"],
            "errors": work.get("errors", {}),
            "rps": round(work["ok"] / elapsed, 3),
            "cpu_seconds": round(cpu1 - cpu0, 3),
            "cpu_per_request_ms": round((cpu1 - cpu0) * 1000.0 / work["ok"], 3) if work["ok"] else None,
            "rss_start_kb": rss0,
            "rss_end_kb": rss1,
            "heap_start": heap_start,
            "heap_end": heap_info(args.jcmd, server.proc.pid),
            "footprint_end": physical_footprint(server.proc.pid),
            "latency_ms": {
                "p50": percentile(work["latencies"], 50),
                "p95": percentile(work["latencies"], 95),
                "p99": percentile(work["latencies"], 99),
                "max": max(work["latencies"]) if work["latencies"] else None,
                "count": len(work["latencies"]),
            },
        }
        result["samples"] = samples

        # Post-workload memory at checkpoints, then optional idle CPU.
        checkpoints = []
        if args.idle_settle > 0:
            time.sleep(args.idle_settle)
        cpu_a, rss_a, _ = tree_totals(server.proc.pid)
        checkpoints.append(
            {
                "at_seconds": round(args.idle_settle, 1),
                "rss_kb": rss_a,
                "cpu_seconds": round(cpu_a, 3),
                "heap": heap_info(args.jcmd, server.proc.pid),
                "footprint": physical_footprint(server.proc.pid),
            }
        )
        if args.idle_seconds > 0:
            idle_cpu0, _, _ = tree_totals(server.proc.pid)
            idle_t0 = time.monotonic()
            idle_samples = []
            while time.monotonic() - idle_t0 < args.idle_seconds:
                time.sleep(args.sample_interval)
                cpu, rss, _ = tree_totals(server.proc.pid)
                idle_samples.append(
                    {"t": round(time.monotonic() - idle_t0, 3), "cpu_seconds": round(cpu - idle_cpu0, 3), "rss_kb": rss}
                )
            idle_cpu1, rss_b, _ = tree_totals(server.proc.pid)
            idle_elapsed = time.monotonic() - idle_t0
            checkpoints.append(
                {
                    "at_seconds": round(args.idle_settle + idle_elapsed, 1),
                    "rss_kb": rss_b,
                    "cpu_seconds": round(idle_cpu1, 3),
                    "heap": heap_info(args.jcmd, server.proc.pid),
                    "footprint": physical_footprint(server.proc.pid),
                }
            )
            result["idle"] = {
                "elapsed_seconds": round(idle_elapsed, 3),
                "cpu_seconds": round(idle_cpu1 - idle_cpu0, 3),
                "cpu_percent_one_core": round((idle_cpu1 - idle_cpu0) * 100.0 / idle_elapsed, 4),
                "rss_start_kb": rss_a,
                "rss_end_kb": rss_b,
                "samples": idle_samples,
            }
        result["post_workload"] = checkpoints
        result["ok"] = True
    except Exception as exc:
        result["ok"] = False
        result["error"] = repr(exc)
    finally:
        server.stop()
        result["finished_at"] = time.strftime("%Y-%m-%dT%H:%M:%S%z")
        Path(args.out).parent.mkdir(parents=True, exist_ok=True)
        Path(args.out).write_text(json.dumps(result, indent=2))
    print(json.dumps(result, indent=2))
    return 0 if result.get("ok") else 1


if __name__ == "__main__":
    sys.exit(main())
