"""Run the shipped Compose deployment with real LibreOffice and both client libc families."""

import argparse
import json
import os
import shutil
import subprocess
import tempfile
import uuid
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
COMPOSE = ROOT / "docker/embedded/compose/docker-compose-isolated-office.yml"


def run(*args, capture=False, **kwargs):
    result = subprocess.run(
        args,
        cwd=ROOT,
        check=True,
        text=True,
        stdout=subprocess.PIPE if capture else None,
        **kwargs,
    )
    return result.stdout.strip() if capture else None


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--worker-image", default="stirling-unoserver-isolated:local")
    parser.add_argument("--app-image", default="stirlingtools/stirling-pdf:latest")
    parser.add_argument("--skip-build", action="store_true")
    options = parser.parse_args()
    project = "office-test-" + uuid.uuid4().hex[:10]
    env = dict(
        os.environ, STIRLING_IMAGE=options.app_image, STIRLING_PORT="127.0.0.1:0"
    )
    if not options.skip_build:
        run(
            "docker",
            "build",
            "-t",
            options.worker_image,
            "-f",
            "docker/unoserver/Dockerfile",
            ".",
        )
    override = {
        "services": {
            "office-worker": {"image": options.worker_image},
            "uno-bridge": {"image": options.worker_image},
            "stirling-pdf": {"environment": {"SECURITY_ENABLELOGIN": "false"}},
        }
    }
    with tempfile.TemporaryDirectory(prefix="office-isolation-") as directory:
        client_context = Path(directory) / "client"
        fixtures = client_context / "fixtures"
        fixtures.mkdir(parents=True)
        shutil.copy(ROOT / "testing/office-isolation/client.py", client_context)
        for name in (
            "example.docx",
            "example.odt",
            "example.pptx",
            "example.rtf",
            "tables.pdf",
        ):
            shutil.copy(ROOT / "testing/cucumber/exampleFiles" / name, fixtures)
        for name in ("sample.doc", "sample.xlsx"):
            shutil.copy(
                ROOT / "frontend/editor/src/core/tests/test-fixtures" / name, fixtures
            )
        override_path = Path(directory) / "override.json"
        override_path.write_text(json.dumps(override), encoding="utf-8")
        compose = [
            "docker",
            "compose",
            "-p",
            project,
            "-f",
            str(COMPOSE),
            "-f",
            str(override_path),
        ]
        try:
            run(*compose, "config", "--quiet", env=env)
            run(
                *compose,
                "up",
                "-d",
                "--no-build",
                "--wait",
                "--wait-timeout",
                "300",
                env=env,
            )
            worker = run(*compose, "ps", "-q", "office-worker", capture=True, env=env)
            app = run(*compose, "ps", "-q", "stirling-pdf", capture=True, env=env)
            details = json.loads(run("docker", "inspect", worker, capture=True))[0]
            assert details["HostConfig"]["NetworkMode"] == "none"
            assert details["HostConfig"]["ReadonlyRootfs"]
            assert details["HostConfig"]["CapDrop"] == ["ALL"]
            assert "no-new-privileges:true" in details["HostConfig"]["SecurityOpt"]
            volumes = [m for m in details["Mounts"] if m["Type"] != "tmpfs"]
            assert [(m["Type"], m["Destination"]) for m in volumes] == [
                ("volume", "/run/unoserver")
            ]
            run(
                "docker",
                "exec",
                app,
                "sh",
                "-c",
                "printf app-secret > /configs/office-isolation-secret",
            )
            run(
                "docker",
                "exec",
                worker,
                "python3",
                "-c",
                """
import errno, pathlib, socket
assert not pathlib.Path('/configs/office-isolation-secret').exists()
for family, address in [(socket.AF_INET, ('198.51.100.1', 80)),
                        (socket.AF_INET6, ('2001:db8::1', 80, 0, 0))]:
    for kind in [socket.SOCK_STREAM, socket.SOCK_DGRAM]:
        with socket.socket(family, kind) as connection:
            connection.settimeout(2)
            try:
                connection.connect(address)
                connection.send(b'isolation probe')
            except OSError as error:
                assert error.errno == errno.ENETUNREACH, error
                continue
            raise AssertionError((family, kind, 'outbound access succeeded'))
print('PASS app file isolation and IPv4/IPv6 TCP/UDP isolation')
""",
            )
            clients = []
            for distro, base in [("alpine", "alpine:3.22"), ("ubuntu", "ubuntu:24.04")]:
                image = f"office-isolation-client:{distro}"
                run(
                    "docker",
                    "build",
                    "-f",
                    str(ROOT / "testing/office-isolation/Dockerfile"),
                    "--build-arg",
                    f"CLIENT_IMAGE={base}",
                    "-t",
                    image,
                    str(client_context),
                )
                command = [
                    "docker",
                    "run",
                    "--rm",
                    "--read-only",
                    "--cap-drop=ALL",
                    "--security-opt=no-new-privileges",
                    "--tmpfs=/tmp:mode=1777",
                    "--network",
                    project + "_office",
                    image,
                ]
                run(*command, "fixtures", timeout=900)
                clients.append(command)
            run(*clients[0], "app", timeout=400)
            run("docker", "exec", worker, "sh", "-c", 'kill "$(pgrep -xo socat)"')
            health = subprocess.run(
                ["docker", "exec", worker, "/usr/local/bin/healthcheck.sh"], check=False
            )
            assert health.returncode != 0, (
                "A dead socket relay must fail the health check"
            )
            run(*compose, "restart", "office-worker", env=env)
            run(
                *compose,
                "up",
                "-d",
                "--no-build",
                "--wait",
                "--wait-timeout",
                "300",
                env=env,
            )
            run(*clients[1], "app", timeout=400)
            run(*compose, "stop", "office-worker", env=env)
            run(*clients[0], "outage", timeout=300)
            processes = run("docker", "top", app, capture=True)
            assert "soffice" not in processes and "unoserver" not in processes, (
                processes
            )
            print("PASS no local LibreOffice or UNO fallback")
        finally:
            subprocess.run(
                [*compose, "logs", "--tail", "30"], cwd=ROOT, env=env, check=False
            )
            run(*compose, "down", "--volumes", "--remove-orphans", env=env)


if __name__ == "__main__":
    main()
