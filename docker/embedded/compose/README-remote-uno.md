# Stirling-PDF with Remote UNO Servers

This docker-compose configuration demonstrates running Stirling-PDF with **separate UNO server containers** for LibreOffice document conversion, enabling horizontal scaling and better resource isolation.

## Architecture

```
┌─────────────────────┐
│   Stirling-PDF      │
│   (Main App)        │
│                     │
│ Uses BlockingQueue  │
│ pool to distribute  │
│ load across servers │
└──────┬──────┬───────┘
       │      │
       │      │ XMLRPC to :2003
       │      │ (hostLocation: remote)
       │      │
   ┌───▼──┐ ┌─▼────┐
   │ UNO  │ │ UNO  │
   │ #1   │ │ #2   │
   │:2003 │ │:2003 │
   └──────┘ └──────┘
```

### The two ports, and which one you configure

Each UNO container listens on two ports, and only one of them is an endpoint:

| Port | Bound to | What it is |
| --- | --- | --- |
| **2003** (`UNOSERVER_PORT`) | `0.0.0.0` | unoserver's XMLRPC control plane. **This is the endpoint port.** |
| 2002 (`UNOSERVER_UNO_PORT`) | `127.0.0.1` | The UNO socket that the container's own `soffice` accepts on. Internal to the container. |

Point an endpoint at 2002 and every conversion fails with connection refused,
because `soffice` is only accepting on the container's loopback.

2003 carries **no authentication**. Anyone who can reach it can call `info()`,
convert a file, and choose the output path — see
[Security hardening](#security-hardening-libreoffice-ssrf-containment) below for
why the shipped compose keeps that port on an `internal` network.

## Key Features Demonstrated

### 1. Remote UNO Server Configuration
- **hostLocation: "remote"** - Required for cross-container communication
- **BlockingQueue pool** - Optimal endpoint selection under load
- **Health checks** - Each UNO server has `unoping` health check

### 2. Environment Variable Configuration
```yaml
PROCESS_EXECUTOR_AUTO_UNO_SERVER: "false"  # Disable local servers

# Define remote endpoints (Spring Boot list syntax)
PROCESS_EXECUTOR_UNO_SERVER_ENDPOINTS_0_HOST: "unoserver1"
PROCESS_EXECUTOR_UNO_SERVER_ENDPOINTS_0_PORT: "2003"              # XMLRPC, not 2002
PROCESS_EXECUTOR_UNO_SERVER_ENDPOINTS_0_HOST_LOCATION: "remote"   # Critical!
PROCESS_EXECUTOR_UNO_SERVER_ENDPOINTS_0_PROTOCOL: "http"

PROCESS_EXECUTOR_UNO_SERVER_ENDPOINTS_1_HOST: "unoserver2"
PROCESS_EXECUTOR_UNO_SERVER_ENDPOINTS_1_PORT: "2003"
PROCESS_EXECUTOR_UNO_SERVER_ENDPOINTS_1_HOST_LOCATION: "remote"
PROCESS_EXECUTOR_UNO_SERVER_ENDPOINTS_1_PROTOCOL: "http"
```

### 3. Session Limit
```yaml
PROCESS_EXECUTOR_SESSION_LIMIT_LIBRE_OFFICE_SESSION_LIMIT: "2"
```
Should match endpoint count for optimal concurrency.

## Usage

### Start the Stack
```bash
docker compose -f docker-compose-latest-security-remote-uno.yml up -d
```

### Monitor Logs
```bash
# Watch all services
docker compose -f docker-compose-latest-security-remote-uno.yml logs -f

# Watch just UNO servers
docker compose -f docker-compose-latest-security-remote-uno.yml logs -f unoserver1 unoserver2

# Watch main app
docker compose -f docker-compose-latest-security-remote-uno.yml logs -f stirling-pdf
```

### Health Check Status
```bash
docker compose -f docker-compose-latest-security-remote-uno.yml ps
```

Should show all services healthy:
```
NAME                           STATUS
Stirling-PDF-Security-Remote-UNO   Up (healthy)
UNO-Server-1                       Up (healthy)
UNO-Server-2                       Up (healthy)
```

### Test Conversion Load Distribution
Upload multiple documents for conversion and watch the logs - you'll see requests distributed across both UNO servers via the BlockingQueue pool.

## Scaling UNO Servers

### Add More Servers
To add a 3rd UNO server:

1. Add service to compose file:
```yaml
  unoserver3:
    container_name: UNO-Server-3
    image: ghcr.io/stirling-tools/stirling-unoserver:latest
    # ... same config as unoserver1/2, including networks: [uno-internal]
```

2. Add environment variables to stirling-pdf service:
```yaml
      PROCESS_EXECUTOR_UNO_SERVER_ENDPOINTS_2_HOST: "unoserver3"
      PROCESS_EXECUTOR_UNO_SERVER_ENDPOINTS_2_PORT: "2003"
      PROCESS_EXECUTOR_UNO_SERVER_ENDPOINTS_2_HOST_LOCATION: "remote"
      PROCESS_EXECUTOR_UNO_SERVER_ENDPOINTS_2_PROTOCOL: "http"
      PROCESS_EXECUTOR_SESSION_LIMIT_LIBRE_OFFICE_SESSION_LIMIT: "3"  # Update!
```

3. Add to `depends_on`:
```yaml
    depends_on:
      unoserver1:
        condition: service_healthy
      unoserver2:
        condition: service_healthy
      unoserver3:
        condition: service_healthy
```

### Scale with Docker Compose (Alternative)
```bash
docker compose -f docker-compose-latest-security-remote-uno.yml up -d --scale unoserver1=3
```
Note: This requires removing `container_name` and hardcoded ports.

## Troubleshooting

### "Connection refused" errors
Most often the endpoint port, not `hostLocation`. In order of likelihood:

- **Endpoint points at 2002.** That is the UNO socket, and it is bound to the UNO
  container's own `127.0.0.1`, so a connection from the app container is refused
  by the kernel before unoserver ever sees it. Set
  `PROCESS_EXECUTOR_UNO_SERVER_ENDPOINTS_<n>_PORT: "2003"`.
- **`hostLocation` is `auto` or missing.** The app then treats the endpoint as a
  local server it manages itself and looks for it on loopback *inside the app
  container*, where nothing is listening. Set
  `PROCESS_EXECUTOR_UNO_SERVER_ENDPOINTS_<n>_HOST_LOCATION: "remote"` on every
  endpoint.
- **The app is not on `uno-internal`.** The UNO containers are only on that
  network, so an app that has been moved off it has no route to them. Symptom is
  a DNS failure on the service name rather than a refusal.

### "Network is unreachable" from inside a UNO container
Working as intended — `uno-internal` is an `internal` network and has no default
route. Do not "fix" this by adding the UNO containers to a routable network; see
[Security hardening](#security-hardening-libreoffice-ssrf-containment).

### Conversions using only one server
- **Cause**: Session limit too low or not matching endpoint count
- **Fix**: Set `PROCESS_EXECUTOR_SESSION_LIMIT_LIBRE_OFFICE_SESSION_LIMIT` to match endpoint count

### UNO server not starting
- **Check**: `docker compose logs unoserver1`
- **Common**: LibreOffice profile corruption
- **Fix**: `docker compose down && docker compose up -d`. The profile lives in the
  container's own filesystem (`UNOSERVER_PROFILE_DIR`), not a volume, so
  recreating the container is enough — this stack declares no volumes to prune.

## Comparison: Local vs Remote UNO Servers

### Local (Auto) Mode
```yaml
PROCESS_EXECUTOR_AUTO_UNO_SERVER: "true"
PROCESS_EXECUTOR_SESSION_LIMIT_LIBRE_OFFICE_SESSION_LIMIT: "2"
# Creates 2 servers on 127.0.0.1:2003, 127.0.0.1:2005 inside container (Stirling-PDF's own servers)
```
- ✅ Simpler configuration
- ✅ Lower latency
- ❌ All in one container (resource competition)
- ❌ Can't scale independently

### Remote Mode (This File)
```yaml
PROCESS_EXECUTOR_AUTO_UNO_SERVER: "false"
# Define external endpoints with hostLocation: "remote"
```
- ✅ Resource isolation (separate containers)
- ✅ Independent scaling
- ✅ Better resilience (restart one without affecting others)
- ❌ Slightly higher network overhead
- ❌ More complex configuration

## Advanced Configuration

### HTTPS UNO Servers
If your UNO servers use HTTPS (e.g., behind a reverse proxy):
```yaml
PROCESS_EXECUTOR_UNO_SERVER_ENDPOINTS_0_PROTOCOL: "https"
```

### Custom Health Check Interval
```yaml
  unoserver1:
    healthcheck:
      interval: 5s    # Check more frequently
      timeout: 3s
      retries: 10
      start_period: 60s  # Give more startup time
```

### Debug Mode
To see detailed endpoint selection logs:
```yaml
environment:
  LOGGING_LEVEL_STIRLING_SOFTWARE_COMMON_UTIL_PROCESSEXECUTOR: DEBUG
```

## Security hardening (LibreOffice SSRF containment)

LibreOffice resolves external references embedded in office documents
(`<draw:image xlink:href="http://...">`, `file://...`, etc.) during conversion.
Left unchecked this turns document conversion into a Server-Side Request Forgery
(SSRF) and local-file-readback primitive (see #7628 / #7629).

Two layers protect against this, both **on by default**:

1. **Input sanitization** - uploads are routed to the sanitizer by *content* (not
   file extension), so flat-ODF (`.fodt`/`.fods`) and look-alike renames (e.g. a
   flat-ODF sent as `.xml`) have their external and `file:` references stripped
   before LibreOffice sees them.
2. **Process egress guard** - the LibreOffice/unoserver processes run with an
   `LD_PRELOAD` guard that refuses non-loopback `connect()`. Loopback stays open
   so the unoserver↔soffice UNO bridge keeps working. This applies to the main
   image and the standalone `stirling-unoserver` image. It narrows the reachable
   surface rather than isolating the process: anything that does not go through
   the dynamic `connect()` symbol - DNS, a raw socket, a direct syscall, a
   process that drops `LD_PRELOAD` and re-execs - is untouched by it. The network
   topology below is what actually contains a compromised converter.

To disable the network guard (e.g. you have a legitimate need for LibreOffice to
fetch remote images and accept the risk), set on the app **and** each unoserver:

```yaml
environment:
  LIBREOFFICE_ALLOW_NETWORK: "true"
```

> [!WARNING]
> **Layer 2 ships with the Docker images and nowhere else.** The guard is a
> Linux-only `LD_PRELOAD` shim that Stirling's own Dockerfiles compile and
> install; it is not part of the JAR. Run Stirling-PDF from the JAR, from a
> package, from the desktop build, or from your own base image, and LibreOffice
> converts documents with **completely unrestricted network access** — outbound
> to your LAN, your cloud metadata endpoint, and the internet. `LD_PRELOAD` is
> also ignored by macOS, so a macOS host has no guard even if the shim is
> present. Sanitization (layer 1) is in the JAR and still applies, but it does
> not cover legacy binary formats. If you self-host off Docker and convert
> untrusted documents, put the egress control somewhere you do control: a
> firewall rule, a network namespace, or an outbound-deny egress policy on
> whatever runs `soffice`.

### The shipped topology: isolate the UNO containers at the network layer

`docker-compose-latest-security-remote-uno.yml` already does this. The UNO
containers sit only on `uno-internal`, an `internal` Docker network; the app has
a foot on both that and the routable `stirling-network`, because the app itself
needs egress and a published port:

```yaml
networks:
  stirling-network:
    driver: bridge
  uno-internal:
    internal: true

services:
  stirling-pdf:
    networks: [stirling-network, uno-internal]
  unoserver1:
    networks: [uno-internal]
  unoserver2:
    networks: [uno-internal]
```

Every service also runs with `security_opt: [no-new-privileges:true]` and
`cap_drop: [ALL]`. The UNO containers need nothing added back — the image already
runs as a non-root user. The app adds back six. Four are fatal to drop: `SETUID`
and `SETGID`, without which the entrypoint's `setpriv` to `PUID`/`PGID` fails
outright, and `CHOWN` and `DAC_OVERRIDE`, without which it cannot create or
re-own the data directories first — in all four cases the container exits before
the app starts. `FOWNER` is not fatal; it lets root `chmod` the directories it
has just handed to the runtime uid, and without it those `chmod`s fail and the
modes are left as they were. `KILL` lets PID 1 signal across the uid boundary it
created, so `docker stop` reaches the JVM and Spring shuts down gracefully;
without it the kernel SIGKILLs the JVM when PID 1 exits, dropping in-flight
conversions. Dropping the rest takes away `NET_RAW`, which is one of the ways a
compromised process can reach the network without going through the libc calls
the `LD_PRELOAD` guard hooks.

The same block belongs on every Stirling-PDF container, remote UNO or not, and
the other compose files here carry it.

**What `internal: true` actually buys you, and what it does not.**

It buys: no default route off the network, so no egress to the host, your LAN or
the internet, and no DNS resolution of anything outside it. And no address on a
routable bridge, so the unauthenticated XMLRPC port is not reachable from other
Compose stacks or from a sidecar you later attach to `stirling-network`.

It does **not** isolate the containers that share the network from each other.
`internal` controls north-south traffic only; east-west is wide open. A
compromised `unoserver1` can still open connections to `unoserver2:2003` and to
`stirling-pdf:8080`, and 2003 has no authentication. So:

- Put nothing else on `uno-internal`. It is for the app and the UNO containers.
- Treat the UNO containers as a single trust domain. Compromise of one is
  compromise of all of them.
- Do not mount secrets into them. `convert()` on that port will read any path the
  process can see and hand it back.

**The network guarantee lasts only while the UNO containers are healthy.** If
every configured remote endpoint is unreachable, Stirling does not fail the
conversion: it falls back to running `soffice` inside the app container, which
sits on the routable `stirling-network` and therefore has a default route out.
Conversion then has only the `LD_PRELOAD` guard in front of it, which — see above
— is not containment. The fallback is logged, not silent:

```
WARN  Unoconvert command failed (...). Falling back to soffice command.
INFO  Running command: /usr/bin/soffice ...
```

Alert on that first line, and keep `restart: on-failure` on the UNO services so an
unhealthy one comes back. If the fallback is not acceptable to you at all, the
place to stop it is an egress policy on the app container itself — the app keeps
its own route out for reasons unrelated to conversion.

**Residual coverage.** Content sanitization covers OOXML/ODF, flat-ODF and HTML.
Legacy binary formats (`.doc`/`.xls`/`.ppt`, `.rtf`) are not content-inspected:
their outbound `http(s)` references are stopped by the network guard, but local
`file://` reads via such formats rely on the converter running non-root with no
access to sensitive paths.

## What This Demonstrates

This configuration showcases all the improvements from the PR reviews:

1. ✅ **Remote endpoint support** (`hostLocation: "remote"`)
2. ✅ **BlockingQueue pool** (optimal endpoint distribution)
3. ✅ **Idempotent lease close** (thread-safe)
4. ✅ **Robust health checks** (unoping → TCP → PID fallbacks)
5. ✅ **Proper validation** (hostLocation/protocol normalized)
6. ✅ **Session limit warnings** (logs mismatch if misconfigured)

## Performance Expectations

With 2 UNO servers, you can expect:
- **2x concurrent conversions** vs single server
- **~50% reduction in queue wait time** under load
- **Better resilience**: One server failure = 50% capacity, not 0%

Tested with 100GB+ PDFs - BlockingQueue ensures no endpoint starvation.
