import argparse
import concurrent.futures
import io
import json
import mimetypes
import os
import pathlib
import subprocess
import tempfile
import time
import zipfile

import requests
from pypdf import PdfReader

REPO = pathlib.Path(__file__).resolve().parents[2]
FIX = REPO / "testing/cucumber/exampleFiles"
IMAGE = ""
OUT = pathlib.Path()
PREFIX = f"runtime-users-{os.getpid()}"
LITE = False
RESULTS = []


def docker(*args, check=True):
    p = subprocess.run(["docker", *map(str, args)], text=True, capture_output=True)
    if check and p.returncode:
        raise RuntimeError(p.stderr.strip() or p.stdout.strip())
    return p


def pdf_check(data):
    assert data.startswith(b"%PDF"), data[:150]
    r = PdfReader(io.BytesIO(data))
    assert len(r.pages) > 0
    return r


def run_case(mode, args, uid, gid, prepared=False, read_only=False):
    name = PREFIX + "-" + mode
    directory = OUT / mode
    directory.mkdir(exist_ok=True)
    record = {
        "mode": mode,
        "image": IMAGE,
        "expected_identity": f"{uid}:{gid}",
        "tests": [],
    }
    RESULTS.append(record)
    mounts = []
    volumes = []
    try:
        if prepared:
            for idx, path in enumerate(
                [
                    "/home/stirlingpdfuser",
                    "/configs",
                    "/logs",
                    "/customFiles",
                    "/pipeline",
                    "/storage",
                ]
            ):
                v = f"{name}-{idx}"
                docker("volume", "create", v)
                volumes.append(v)
                mounts += [
                    "--mount",
                    f"type=volume,source={v},target={path},volume-nocopy",
                ]
            docker(
                "run",
                "--rm",
                *mounts,
                "--entrypoint",
                "sh",
                IMAGE,
                "-c",
                (
                    f"chown -R {uid}:{gid} /home/stirlingpdfuser /configs /logs "
                    "/customFiles /pipeline /storage"
                ),
            )
            mounts += ["--tmpfs", f"/tmp:rw,exec,uid={uid},gid={gid},mode=1777"]
        if read_only:
            mounts += ["--read-only"]
        docker(
            "run",
            "-d",
            "--name",
            name,
            "--label",
            "codex-test=pr7680-runtime",
            "--memory",
            "2g",
            "-p",
            "127.0.0.1::8080",
            *args,
            *mounts,
            "-e",
            "SECURITY_ENABLELOGIN=false",
            "-e",
            "SECURITY_CSRFDISABLED=true",
            "-e",
            "SYSTEM_ENABLEANALYTICS=false",
            IMAGE,
        )
        port = json.loads(docker("inspect", name).stdout)[0]["NetworkSettings"][
            "Ports"
        ]["8080/tcp"][0]["HostPort"]
        base = "http://127.0.0.1:" + port

        def ready():
            nonlocal base
            current = json.loads(docker("inspect", name).stdout)[0]["NetworkSettings"][
                "Ports"
            ]["8080/tcp"][0]["HostPort"]
            base = "http://127.0.0.1:" + current
            deadline = time.monotonic() + 150
            while time.monotonic() < deadline:
                state = json.loads(docker("inspect", name).stdout)[0]["State"]
                if not state["Running"]:
                    raise RuntimeError("startup exit " + str(state["ExitCode"]))
                try:
                    response = requests.get(base + "/api/v1/info/status", timeout=3)
                    if response.status_code == 200 and "UP" in response.text:
                        return
                except requests.RequestException:
                    pass
                time.sleep(2)
            raise RuntimeError("startup timed out")

        ready()
        front = requests.get(base + "/", timeout=15)
        config = requests.get(base + "/api/v1/config/app-config", timeout=15)
        assert front.status_code == 200 and "<html" in front.text.lower()
        assert config.status_code == 200 and isinstance(config.json(), dict)
        record["tests"].append({"name": "frontend and app configuration", "pass": True})
        ps = docker("exec", name, "ps", "-eo", "pid,ppid,uid,gid,comm").stdout
        (directory / "processes.txt").write_text(ps)
        engines = [
            line.split()
            for line in ps.splitlines()[1:]
            if line.split()[-1] in ["java", "soffice.bin", "Xvfb"]
        ]
        assert ({"java"} if LITE else {"java", "Xvfb", "soffice.bin"}) <= {
            p[-1] for p in engines
        }, ps
        assert all(p[2:4] == [str(uid), str(gid)] for p in engines), engines
        record["tests"].append(
            {
                "name": "startup and runtime process identities",
                "pass": True,
                "processes": engines,
            }
        )

        def call(title, path, file=None, data=None, files=None, kind="pdf"):
            start = time.monotonic()
            try:
                uploads = files or [
                    (
                        "fileInput",
                        (
                            file.name,
                            file.read_bytes(),
                            mimetypes.guess_type(file.name)[0]
                            or "application/octet-stream",
                        ),
                    )
                ]
                response = requests.post(
                    base + path, files=uploads, data=data or {}, timeout=120
                )
                (directory / (title + ".bin")).write_bytes(response.content)
                assert response.status_code == 200, (
                    response.status_code,
                    response.text[:250],
                )
                if kind == "pdf":
                    pdf_check(response.content)
                elif kind == "zip":
                    assert zipfile.is_zipfile(io.BytesIO(response.content))
                record["tests"].append(
                    {
                        "name": title,
                        "pass": True,
                        "seconds": round(time.monotonic() - start, 2),
                        "bytes": len(response.content),
                    }
                )
                return response.content
            except Exception as e:
                record["tests"].append({"name": title, "pass": False, "error": str(e)})
            finally:
                print(mode, title, record["tests"][-1]["pass"], flush=True)

        pdf = REPO / "testing/test_pdf_1.pdf"
        for ext in [] if LITE else ["docx", "pptx", "odt", "odp", "rtf"]:
            call("office-" + ext, "/api/v1/convert/file/pdf", FIX / ("example." + ext))
        if not LITE:
            call(
                "flat-odf",
                "/api/v1/convert/file/pdf",
                FIX / "security_flat_inline.fodt",
            )
        if not LITE:
            call("html", "/api/v1/convert/html/pdf", FIX / "example.html")
        if not LITE:
            call("markdown", "/api/v1/convert/markdown/pdf", FIX / "example.md")
        call("rotate", "/api/v1/general/rotate-pdf", pdf, {"angle": "90"})
        call(
            "merge",
            "/api/v1/general/merge-pdfs",
            files=[
                ("fileInput", ("one.pdf", pdf.read_bytes())),
                ("fileInput", ("two.pdf", pdf.read_bytes())),
            ],
        )
        call(
            "compress",
            "/api/v1/misc/compress-pdf",
            FIX / "ghost3.pdf",
            {"optimizeLevel": "4"},
        )
        if not LITE:
            call(
                "ocr",
                "/api/v1/misc/ocr-pdf",
                pdf,
                {
                    "languages": "eng",
                    "ocrType": "force-ocr",
                    "ocrRenderType": "hocr",
                    "sidecar": "false",
                    "deskew": "false",
                    "clean": "false",
                    "cleanFinal": "false",
                },
            )
        if not LITE:
            call(
                "pdfa",
                "/api/v1/convert/pdf/pdfa",
                FIX / "pdfa2.pdf",
                {"outputFormat": "pdfa"},
            )
        if not LITE:
            call(
                "epub",
                "/api/v1/convert/pdf/epub",
                pdf,
                {"outputFormat": "EPUB", "detectChapters": "false"},
                kind="zip",
            )
        call("images", "/api/v1/convert/pdf/cbz", pdf, {"dpi": "72"}, kind="zip")

        def convert_one(i):
            r = requests.post(
                base + "/api/v1/convert/file/pdf",
                files={
                    "fileInput": ("example.docx", (FIX / "example.docx").read_bytes())
                },
                timeout=120,
            )
            assert r.status_code == 200, r.text[:200]
            pdf_check(r.content)

        if not LITE:
            try:
                with concurrent.futures.ThreadPoolExecutor(max_workers=3) as pool:
                    list(pool.map(convert_one, range(3)))
                record["tests"].append(
                    {"name": "three concurrent office conversions", "pass": True}
                )
            except Exception as e:
                record["tests"].append(
                    {
                        "name": "three concurrent office conversions",
                        "pass": False,
                        "error": str(e),
                    }
                )
        try:
            docker(
                "exec",
                "--user",
                f"{uid}:{gid}",
                name,
                "sh",
                "-c",
                (
                    "umask 077; printf persistence-ok "
                    "> /configs/runtime-test-sentinel; "
                    "test -s /configs/settings.yml"
                ),
            )
            before = docker(
                "exec", name, "stat", "-c", "%u:%g %a", "/configs/runtime-test-sentinel"
            ).stdout.strip()
            start = time.monotonic()
            docker("stop", "-t", "35", name)
            elapsed = time.monotonic() - start
            state = json.loads(docker("inspect", name).stdout)[0]["State"]
            assert state["ExitCode"] == 0, state
            logs = docker("logs", name).stdout + docker("logs", name).stderr
            assert "Job queue shutdown complete" in logs, logs[-1000:]
            record["tests"].append(
                {
                    "name": "graceful stop",
                    "pass": True,
                    "exit": state["ExitCode"],
                    "seconds": round(elapsed, 2),
                }
            )
            docker("start", name)
            ready()
            after = docker(
                "exec", name, "stat", "-c", "%u:%g %a", "/configs/runtime-test-sentinel"
            ).stdout.strip()
            assert before == after and after == f"{uid}:{gid} 600", (before, after)
            assert (
                docker("exec", name, "cat", "/configs/runtime-test-sentinel").stdout
                == "persistence-ok"
            )
            record["tests"].append(
                {"name": "restart and 0600 file persistence", "pass": True}
            )
            call(
                "rotate-after-restart",
                "/api/v1/general/rotate-pdf",
                pdf,
                {"angle": "90"},
            )
            if not LITE:
                call(
                    "office-after-restart",
                    "/api/v1/convert/file/pdf",
                    FIX / "example.docx",
                )
            restart_ps = docker("exec", name, "ps", "-eo", "uid,gid,comm").stdout
            if not LITE:
                assert "Xvfb" in restart_ps, restart_ps
            record["tests"].append({"name": "processes after restart", "pass": True})
        except Exception as e:
            record["tests"].append(
                {"name": "lifecycle", "pass": False, "error": str(e)}
            )
    except Exception as e:
        record["error"] = str(e)
        print(mode, "ERROR", e, flush=True)
    finally:
        logs = docker("logs", name, check=False)
        (directory / "container.log").write_text(logs.stdout + logs.stderr)
        docker("rm", "-f", name, check=False)
        for v in volumes:
            docker("volume", "rm", v, check=False)
        (OUT / "results.json").write_text(json.dumps(RESULTS, indent=2))
        print(
            mode,
            "COMPLETE",
            sum(t["pass"] for t in record["tests"]),
            "/",
            len(record["tests"]),
            record.get("error", ""),
            flush=True,
        )


MODES = {
    "default": ([], 1000, 1000, False, False),
    "root": (["-e", "PUID=0", "-e", "PGID=0"], 0, 0, False, False),
    "mapped": (
        [
            "-e",
            "PUID=1002",
            "-e",
            "PGID=1003",
            "--cap-drop=ALL",
            "--cap-add=CHOWN",
            "--cap-add=DAC_OVERRIDE",
            "--cap-add=FOWNER",
            "--cap-add=KILL",
            "--cap-add=SETGID",
            "--cap-add=SETUID",
            "--security-opt=no-new-privileges:true",
        ],
        1002,
        1003,
        False,
        False,
    ),
    "direct1000": (
        [
            "--user",
            "1000:1000",
            "--cap-drop=ALL",
            "--security-opt=no-new-privileges:true",
        ],
        1000,
        1000,
        False,
        False,
    ),
    "direct12345": (
        [
            "--user",
            "12345:12346",
            "--cap-drop=ALL",
            "--security-opt=no-new-privileges:true",
        ],
        12345,
        12346,
        True,
        False,
    ),
    "readonly": (
        [
            "--user",
            "12345:12346",
            "--cap-drop=ALL",
            "--security-opt=no-new-privileges:true",
        ],
        12345,
        12346,
        True,
        True,
    ),
}
if __name__ == "__main__":
    parser = argparse.ArgumentParser(
        description="Test Docker runtime identities, conversions and lifecycle."
    )
    parser.add_argument("--image", required=True)
    parser.add_argument("--output", default=None)
    parser.add_argument(
        "--lite", action="store_true", help="Only test tools included in ultra-lite"
    )
    parser.add_argument("modes", nargs="*", help="Modes: " + ", ".join(MODES))
    opts = parser.parse_args()
    if any(mode not in MODES for mode in opts.modes):
        parser.error("Unknown mode; choose from " + ", ".join(MODES))
    IMAGE = opts.image
    LITE = opts.lite
    OUT = pathlib.Path(
        opts.output or tempfile.mkdtemp(prefix="stirling-runtime-tests-")
    )
    OUT.mkdir(parents=True, exist_ok=True)
    for mode in opts.modes or MODES:
        run_case(mode, *MODES[mode])
    print("Results:", OUT / "results.json")
    raise SystemExit(
        int(
            any(
                r.get("error") or any(not t["pass"] for t in r["tests"])
                for r in RESULTS
            )
        )
    )
