import argparse
import json
import pathlib
import subprocess

parser = argparse.ArgumentParser(
    description="Check runtime-user configuration and startup failures."
)
parser.add_argument("--image", required=True)
parser.add_argument("--output")
options = parser.parse_args()
image = options.image
setup = 'log() { echo "$*"; }; command_exists() { command -v "$1" >/dev/null 2>&1; }; '
cases = [
    ("bad-uid", ["-e", "PUID=oops"], "", "PUID must be an integer", 1),
    ("negative-uid", ["-e", "PUID=-1"], "", "PUID must be an integer", 1),
    ("too-large-gid", ["-e", "PGID=4294967295"], "", "PGID must be an integer", 1),
    (
        "missing-setpriv",
        [],
        "mv /usr/bin/setpriv /usr/bin/setpriv.hidden; ",
        "setpriv is missing",
        1,
    ),
    (
        "root-without-setpriv",
        ["-e", "PUID=0", "-e", "PGID=0"],
        "mv /usr/bin/setpriv /usr/bin/setpriv.hidden; ",
        "uid=0(root)",
        0,
    ),
    ("no-switch-capabilities", ["--cap-drop=ALL"], "", "Could not launch a process", 1),
    ("unprepared-numeric-user", ["--user", "12345:12346"], "", "not writable", 1),
    (
        "root-group-nonroot-user",
        ["-e", "PUID=1000", "-e", "PGID=0"],
        "",
        "gid=0(root)",
        0,
    ),
]
results = []
for name, args, prefix, expected, rc in cases:
    p = subprocess.run(
        [
            "docker",
            "run",
            "--rm",
            *args,
            "--entrypoint",
            "bash",
            image,
            "-c",
            prefix + setup + "source /scripts/runtime-user.sh; run_as_runtime_user id",
        ],
        text=True,
        capture_output=True,
    )
    result = {
        "name": name,
        "pass": p.returncode == rc and expected in p.stdout + p.stderr,
        "exit": p.returncode,
        "output": p.stdout + p.stderr,
    }
    results.append(result)
    print(json.dumps(result), flush=True)
if options.output:
    pathlib.Path(options.output).write_text(json.dumps(results, indent=2))
raise SystemExit(int(any(not r["pass"] for r in results)))
