#!/usr/bin/env python3
"""Load generator for the multi-node stack: real PDF work through the nginx LB as many distinct users,
mixed sync/async so the Valkey backplane sees job, lock, rate-limit and cache traffic. Stdlib only."""

import json
import os
import random
import ssl
import sys
import threading
import time
import urllib.error
import urllib.request
import uuid
from collections import defaultdict
from concurrent.futures import ThreadPoolExecutor

BASE_URL = os.environ.get("BASE_URL", "http://nginx:8080").rstrip("/")
DURATION = int(os.environ.get("DURATION_SECONDS", "300"))
CONCURRENCY = int(os.environ.get("CONCURRENCY", "24"))
USER_COUNT = int(os.environ.get("USER_COUNT", "40"))
USER_PASSWORD = os.environ.get("USER_PASSWORD", "Password123!")
ADMIN_USER = os.environ.get("ADMIN_USER", "admin")
ADMIN_PASS = os.environ.get("ADMIN_PASS", "stirling")
ASYNC_RATIO = float(os.environ.get("ASYNC_RATIO", "0.35"))
RAMP_SECONDS = int(os.environ.get("RAMP_SECONDS", "20"))

SSL_CTX = ssl.create_default_context()
SSL_CTX.check_hostname = False
SSL_CTX.verify_mode = ssl.CERT_NONE

stop_at = 0.0
stats_lock = threading.Lock()
stats = defaultdict(lambda: {"ok": 0, "err": 0, "ms": 0.0, "bytes": 0})
nodes_seen = defaultdict(int)
errors = defaultdict(int)
job_stats = {"submitted": 0, "completed": 0, "failed": 0, "sticky_410": 0}


# ---------------------------------------------------------------- PDF corpus
def make_pdf(pages: int, filler_lines: int) -> bytes:
    """Build a valid multi-page PDF from raw syntax so the corpus needs no PDF library."""
    objs = []  # obj number -> body bytes, 1-indexed by position

    font_obj = 3 + pages * 2  # catalog=1, pages=2, then page/content pairs
    kids = " ".join(f"{3 + i * 2} 0 R" for i in range(pages))
    objs.append(b"<</Type/Catalog/Pages 2 0 R>>")
    objs.append(f"<</Type/Pages/Kids[{kids}]/Count {pages}>>".encode())

    for i in range(pages):
        content_num = 4 + i * 2
        objs.append(
            f"<</Type/Page/Parent 2 0 R/MediaBox[0 0 612 792]"
            f"/Contents {content_num} 0 R"
            f"/Resources<</Font<</F1 {font_obj} 0 R>>>>>>".encode()
        )
        lines = [b"BT /F1 14 Tf 54 740 Td (Stirling load-test page " + str(i + 1).encode() + b") Tj ET"]
        for n in range(filler_lines):
            y = 710 - (n * 18) % 640
            text = f"lorem ipsum dolor sit amet {uuid.uuid4().hex}"
            lines.append(f"BT /F1 9 Tf 54 {y} Td ({text}) Tj ET".encode())
        stream = b"\n".join(lines)
        objs.append(b"<</Length " + str(len(stream)).encode() + b">>stream\n" + stream + b"\nendstream")

    objs.append(b"<</Type/Font/Subtype/Type1/BaseFont/Helvetica>>")

    out = bytearray(b"%PDF-1.4\n%\xe2\xe3\xcf\xd3\n")
    offsets = []
    for idx, body in enumerate(objs, start=1):
        offsets.append(len(out))
        out += f"{idx} 0 obj".encode() + body + b"endobj\n"

    xref_at = len(out)
    out += f"xref\n0 {len(objs) + 1}\n".encode()
    out += b"0000000000 65535 f \n"
    for off in offsets:
        out += f"{off:010d} 00000 n \n".encode()
    out += f"trailer<</Size {len(objs) + 1}/Root 1 0 R>>\nstartxref\n{xref_at}\n%%EOF\n".encode()
    return bytes(out)


def build_corpus():
    print("==> Building PDF corpus...", flush=True)
    corpus = {
        "tiny": make_pdf(2, 6),
        "small": make_pdf(8, 14),
        "medium": make_pdf(30, 20),
        "large": make_pdf(80, 26),
    }
    for name, data in corpus.items():
        print(f"    {name:7s} {len(data) / 1024:8.1f} KB", flush=True)
    return corpus


# ---------------------------------------------------------------- HTTP plumbing
def encode_multipart(fields, files):
    """fields: dict of scalars. files: list of (fieldname, filename, bytes) - repeats allowed."""
    boundary = uuid.uuid4().hex
    body = bytearray()
    for key, value in fields.items():
        body += f"--{boundary}\r\n".encode()
        body += f'Content-Disposition: form-data; name="{key}"\r\n\r\n'.encode()
        body += f"{value}\r\n".encode()
    for key, filename, data in files:
        body += f"--{boundary}\r\n".encode()
        body += (
            f'Content-Disposition: form-data; name="{key}"; filename="{filename}"\r\n'
            f"Content-Type: application/pdf\r\n\r\n"
        ).encode()
        body += data + b"\r\n"
    body += f"--{boundary}--\r\n".encode()
    return bytes(body), f"multipart/form-data; boundary={boundary}"


def request(method, path, token=None, body=None, content_type=None, timeout=180):
    url = path if path.startswith("http") else BASE_URL + path
    req = urllib.request.Request(url, data=body, method=method)
    if token:
        req.add_header("Authorization", f"Bearer {token}")
    if content_type:
        req.add_header("Content-Type", content_type)
    try:
        with urllib.request.urlopen(req, timeout=timeout, context=SSL_CTX) as resp:
            return resp.status, resp.read(), dict(resp.headers)
    except urllib.error.HTTPError as exc:
        return exc.code, exc.read(), dict(exc.headers)
    except Exception as exc:  # connection reset, timeout, DNS
        return 0, str(exc).encode(), {}


def record(op, status, elapsed_ms, size, headers):
    with stats_lock:
        entry = stats[op]
        if 200 <= status < 300:
            entry["ok"] += 1
            entry["bytes"] += size
        else:
            entry["err"] += 1
            errors[f"{op} -> {status}"] += 1
        entry["ms"] += elapsed_ms
        served = headers.get("X-Served-By")
        if served:
            nodes_seen[served] += 1


# ---------------------------------------------------------------- auth
def login(username, password):
    body = json.dumps({"username": username, "password": password}).encode()
    status, data, _ = request("POST", "/api/v1/auth/login", body=body, content_type="application/json")
    if status != 200:
        return None
    try:
        return json.loads(data).get("session", {}).get("access_token") or json.loads(data).get("access_token")
    except Exception:
        return None


def collect_tokens():
    print("==> Logging in...", flush=True)
    tokens = []
    admin = login(ADMIN_USER, ADMIN_PASS)
    if admin:
        tokens.append(("admin", admin))
    for i in range(1, USER_COUNT + 1):
        user = f"user{i:02d}@stirling.test"
        tok = login(user, USER_PASSWORD)
        if tok:
            tokens.append((user, tok))
    print(f"    {len(tokens)} authenticated principals", flush=True)
    return tokens


# ---------------------------------------------------------------- workload
def op_rotate(corpus):
    return "/api/v1/general/rotate-pdf", {"angle": random.choice([90, 180, 270])}, [
        ("fileInput", "load.pdf", corpus[random.choice(["tiny", "small", "medium"])])
    ]


def op_merge(corpus):
    files = [("fileInput", f"m{i}.pdf", corpus[random.choice(["tiny", "small"])]) for i in range(random.randint(2, 4))]
    return "/api/v1/general/merge-pdfs", {"sortType": "orderProvided"}, files


def op_compress(corpus):
    return "/api/v1/misc/compress-pdf", {"optimizeLevel": random.choice([1, 2, 3])}, [
        ("fileInput", "compress.pdf", corpus[random.choice(["medium", "large"])])
    ]


def op_remove_pages(corpus):
    return "/api/v1/general/remove-pages", {"pageNumbers": "1,3"}, [
        ("fileInput", "rm.pdf", corpus[random.choice(["small", "medium"])])
    ]


def op_split(corpus):
    return "/api/v1/general/split-pages", {"pageNumbers": "2,4"}, [
        ("fileInput", "split.pdf", corpus[random.choice(["small", "medium"])])
    ]


def op_page_numbers(corpus):
    return "/api/v1/misc/add-page-numbers", {
        "customMargin": "medium",
        "position": 8,
        "startingNumber": 1,
        "pagesToNumber": "all",
        "customText": "{n} of {total}",
    }, [("fileInput", "num.pdf", corpus[random.choice(["small", "medium"])])]


def op_flatten(corpus):
    return "/api/v1/misc/flatten", {"flattenOnlyForms": "false"}, [
        ("fileInput", "flat.pdf", corpus[random.choice(["tiny", "small"])])
    ]


def op_metadata(corpus):
    return "/api/v1/misc/update-metadata", {
        "deleteAll": "false",
        "author": "load-test",
        "title": f"run-{uuid.uuid4().hex[:8]}",
    }, [("fileInput", "meta.pdf", corpus[random.choice(["tiny", "small"])])]


# (weight, name, builder) - heavier tools are rarer so throughput stays high.
WORKLOAD = [
    (22, "rotate", op_rotate),
    (14, "merge", op_merge),
    (10, "compress", op_compress),
    (14, "remove-pages", op_remove_pages),
    (12, "split-pages", op_split),
    (12, "add-page-numbers", op_page_numbers),
    (8, "flatten", op_flatten),
    (8, "update-metadata", op_metadata),
]
WEIGHTS = [w for w, _, _ in WORKLOAD]


def poll_job(job_id, token, deadline):
    """Poll until the job completes. A 410 means we hit a non-owner node; retry re-routes us."""
    while time.time() < deadline:
        status, data, _ = request("GET", f"/api/v1/general/job/{job_id}", token=token, timeout=30)
        if status == 410:
            with stats_lock:
                job_stats["sticky_410"] += 1
            time.sleep(0.3)
            continue
        if status != 200:
            return False
        try:
            payload = json.loads(data)
        except Exception:
            return False
        result = payload.get("jobResult", payload)
        if result.get("complete"):
            return result.get("error") is None
        time.sleep(0.4)
    return False


def worker(worker_id, corpus, tokens):
    rng = random.Random(worker_id * 7919)
    # Stagger startup so all workers do not slam the LB in the same instant.
    time.sleep(rng.uniform(0, RAMP_SECONDS))
    while time.time() < stop_at:
        _, token = rng.choice(tokens)
        _, name, builder = rng.choices(WORKLOAD, weights=WEIGHTS, k=1)[0]
        path, fields, files = builder(corpus)
        use_async = rng.random() < ASYNC_RATIO
        if use_async:
            path += "?async=true"
        body, content_type = encode_multipart(fields, files)

        started = time.time()
        status, data, headers = request("POST", path, token=token, body=body, content_type=content_type)
        elapsed = (time.time() - started) * 1000
        label = f"{name}{' (async)' if use_async else ''}"
        record(label, status, elapsed, len(data), headers)

        if use_async and 200 <= status < 300:
            try:
                job_id = json.loads(data).get("jobId")
            except Exception:
                job_id = None
            if job_id:
                with stats_lock:
                    job_stats["submitted"] += 1
                if poll_job(job_id, token, time.time() + 240):
                    with stats_lock:
                        job_stats["completed"] += 1
                else:
                    with stats_lock:
                        job_stats["failed"] += 1

        # Cheap reads between jobs: extra request volume and node-registry reads.
        if rng.random() < 0.3:
            s, d, h = request("GET", "/api/v1/info/status", token=token, timeout=20)
            record("info/status", s, 0, len(d), h)


def progress_printer():
    last = 0
    while time.time() < stop_at:
        time.sleep(15)
        with stats_lock:
            total = sum(v["ok"] + v["err"] for v in stats.values())
            ok = sum(v["ok"] for v in stats.values())
            mb = sum(v["bytes"] for v in stats.values()) / 1024 / 1024
            jobs = dict(job_stats)
        remaining = max(0, int(stop_at - time.time()))
        rate = (total - last) / 15.0
        last = total
        print(
            f"    [{remaining:4d}s left] {total:6d} reqs  {ok:6d} ok  {rate:5.1f} req/s  "
            f"{mb:7.1f} MB down  async {jobs['completed']}/{jobs['submitted']}",
            flush=True,
        )


def report():
    print("\n" + "=" * 78)
    print(" LOAD TEST SUMMARY")
    print("=" * 78)
    print(f"{'operation':24s} {'ok':>7s} {'err':>6s} {'avg ms':>9s} {'MB down':>9s}")
    print("-" * 78)
    total_ok = total_err = 0
    for op in sorted(stats):
        entry = stats[op]
        calls = entry["ok"] + entry["err"]
        avg = entry["ms"] / calls if calls else 0
        total_ok += entry["ok"]
        total_err += entry["err"]
        print(
            f"{op:24s} {entry['ok']:7d} {entry['err']:6d} {avg:9.0f} {entry['bytes'] / 1024 / 1024:9.1f}"
        )
    print("-" * 78)
    print(f"{'TOTAL':24s} {total_ok:7d} {total_err:6d}")

    print("\n Load-balancer spread (X-Served-By):")
    for node, count in sorted(nodes_seen.items(), key=lambda kv: -kv[1]):
        print(f"   {node:24s} {count:7d} responses")

    print("\n Async jobs (these are the Valkey JobStore writes):")
    print(f"   submitted {job_stats['submitted']}   completed {job_stats['completed']}"
          f"   failed {job_stats['failed']}   cross-node 410 re-routes {job_stats['sticky_410']}")

    if errors:
        print("\n Top errors:")
        for key, count in sorted(errors.items(), key=lambda kv: -kv[1])[:15]:
            print(f"   {count:6d}  {key}")
    print("=" * 78, flush=True)


def wait_for_app():
    print(f"==> Waiting for {BASE_URL} ...", flush=True)
    for _ in range(120):
        status, _, _ = request("GET", "/api/v1/info/status", timeout=10)
        if status == 200:
            print("    app is up", flush=True)
            return True
        time.sleep(2)
    return False


def main():
    global stop_at
    if not wait_for_app():
        print("app never came up", file=sys.stderr)
        return 1

    corpus = build_corpus()
    tokens = collect_tokens()
    if not tokens:
        print("no logins succeeded - cannot generate authenticated load", file=sys.stderr)
        return 1

    stop_at = time.time() + DURATION
    print(
        f"\n==> Driving load for {DURATION}s: {CONCURRENCY} workers, "
        f"{len(tokens)} users, {int(ASYNC_RATIO * 100)}% async\n",
        flush=True,
    )
    ticker = threading.Thread(target=progress_printer, daemon=True)
    ticker.start()
    with ThreadPoolExecutor(max_workers=CONCURRENCY) as pool:
        for i in range(CONCURRENCY):
            pool.submit(worker, i, corpus, tokens)
    report()
    return 0


if __name__ == "__main__":
    sys.exit(main())
