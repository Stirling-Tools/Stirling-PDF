# Isolated LibreOffice conversions

From the repository root:

```sh
docker compose -f docker/embedded/compose/docker-compose-isolated-office.yml up --build -d
```

This deployment runs Stirling, a small socket relay, and a LibreOffice worker.
The worker has `network_mode: none`, a read-only root filesystem, no capabilities,
and no application, host-directory, or Docker-socket mounts. Requests and results
travel as bytes through a Unix socket in a Docker-managed named volume.

The relay accepts requests only on the private Compose network. The worker cannot
use that relay to initiate connections. Its loopback network remains available for
UNO's internal communication; it has no route to the app, host, LAN, DNS servers,
or Internet. The application uses `/bin/false` for its local LibreOffice fallback,
so a worker outage returns a conversion error instead of bypassing isolation.

Documents are not rewritten before conversion. External resources that are absent
from the worker cannot appear in the output; embedded content remains available.
The worker can read its own image and temporary conversion files. This isolates
application/host files; it is not a prohibition on every file read or isolation
between successive jobs in the same worker. Do not mount secrets or app directories
into the worker or attach it to a network.

## Platforms and images

The release images support Linux amd64 and arm64/v8. The same Compose deployment
uses Linux containers on Linux hosts and Docker Desktop on Windows or macOS,
including Apple Silicon. The socket lives inside Docker's Linux named volume,
never on a Windows/macOS bind mount. No Landlock, user namespaces, custom seccomp
profile, privileged container, or additional host capabilities are required.

Ubuntu/glibc and Alpine/musl clients use the same UNO protocol. The shipped worker
is Ubuntu-based; Alpine clients do not require an Alpine LibreOffice worker.
Standard, fat, and backend images that include `unoconvert` can use this topology.
Ultra-lite images do not include office conversion tools and are not extended here.
This file targets Docker Compose on one Docker engine; it is not a Swarm or
multi-host Kubernetes deployment specification.

Set `STIRLING_IMAGE` to select an application image and `STIRLING_PORT` to change
the published port. Login is enabled. Existing settings can be mounted into
Stirling's `/configs`; retain the remote UNO and `/bin/false` environment settings.
The worker's UID/GID are 1001; keep its tmpfs ownership and the relay user in sync
if building a worker with different IDs. Stirling's own UID can differ.

## Verification

```sh
task docker:check:office
```

The check builds the actual worker, starts this Compose deployment, exercises
DOC/DOCX/ODT/RTF/PPTX/XLSX from both Ubuntu and Alpine clients, and checks that input
bytes are unchanged and PDFs contain text. It also tests both application
conversion directions, a worker restart, failed conversions during a worker outage,
absence of local fallback processes, filesystem mounts, and IPv4/IPv6 TCP/UDP denial.
CI runs on native amd64 and arm64 Linux runners. Docker Desktop on Windows and
emulated ARM64 can run the same check; a macOS Docker Desktop run must be recorded
separately before calling that host combination tested.

This is an opt-in deployment. Merging these files does not isolate existing
single-container installations or other converters such as Calibre and Chromium.
