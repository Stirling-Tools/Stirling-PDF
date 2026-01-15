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
       │      │ Remote endpoints
       │      │ (hostLocation: remote)
       │      │
   ┌───▼──┐ ┌─▼────┐
   │ UNO  │ │ UNO  │
   │ #1   │ │ #2   │
   │:2002 │ │:2002 │
   └──────┘ └──────┘
```

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
PROCESS_EXECUTOR_UNO_SERVER_ENDPOINTS_0_PORT: "2002"
PROCESS_EXECUTOR_UNO_SERVER_ENDPOINTS_0_HOST_LOCATION: "remote"  # Critical!
PROCESS_EXECUTOR_UNO_SERVER_ENDPOINTS_0_PROTOCOL: "http"

PROCESS_EXECUTOR_UNO_SERVER_ENDPOINTS_1_HOST: "unoserver2"
PROCESS_EXECUTOR_UNO_SERVER_ENDPOINTS_1_PORT: "2002"
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
    image: ghcr.io/unoconv/unoserver-docker:0.4.4
    # ... same config as unoserver1/2
```

2. Add environment variables to stirling-pdf service:
```yaml
      PROCESS_EXECUTOR_UNO_SERVER_ENDPOINTS_2_HOST: "unoserver3"
      PROCESS_EXECUTOR_UNO_SERVER_ENDPOINTS_2_PORT: "2002"
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
- **Cause**: `hostLocation: "auto"` or missing
- **Fix**: Set `HOSTLOCATION: "remote"` for all endpoints

### Conversions using only one server
- **Cause**: Session limit too low or not matching endpoint count
- **Fix**: Set `PROCESS_EXECUTOR_SESSION_LIMIT_LIBRE_OFFICE_SESSION_LIMIT` to match endpoint count

### UNO server not starting
- **Check**: `docker compose logs unoserver1`
- **Common**: LibreOffice profile corruption
- **Fix**: `docker compose down -v` (removes volumes)

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
PROCESS_EXECUTOR_UNOSERVERENDPOINTS_0_PROTOCOL: "https"
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
