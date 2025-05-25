# UnoServer Configuration Guide

## Overview

Stirling-PDF supports multiple UnoServer instances to improve concurrent document conversion performance. This document explains how to configure and use this feature.

The UnoServer component in Stirling-PDF is now conditional, meaning it will only be enabled if the required executables are available on your system. This allows Stirling-PDF to run in environments without LibreOffice/UnoServer while gracefully disabling office document conversion functionality.

## Configuration Options

### Multiple Local Instances

You can configure Stirling-PDF to start multiple UnoServer instances locally. Each instance will run on its own port starting from the base port.

In `settings.yml`:

```yaml
processExecutor:
  sessionLimit:
    libreOfficeSessionLimit: 4  # Set to desired number of instances
  baseUnoconvPort: 2003  # Base port for UnoServer instances
  useExternalUnoconvServers: false  # Set to false to use local instances
```

### External UnoServer Instances

For more advanced setups or when running in a clustered environment, you can configure Stirling-PDF to use external UnoServer instances running on different hosts:

```yaml
processExecutor:
  useExternalUnoconvServers: true
  unoconvServers:
    - "192.168.1.100:2003"  # Format is host:port
    - "192.168.1.101:2003" 
    - "unoserver-host:2003"
```

## Installation

### Docker

The easiest way to use UnoServer with Stirling-PDF is to use the "fat" Docker image, which includes all required dependencies:

```bash
docker pull frooodle/s-pdf:latest-fat
```

### Manual Installation

If you want to install UnoServer manually:

1. Install LibreOffice:
   ```bash
   # Ubuntu/Debian
   sudo apt-get update
   sudo apt-get install -y libreoffice
   
   # CentOS/RHEL
   sudo yum install -y libreoffice
   
   # macOS
   brew install libreoffice
   ```

2. Install UnoServer using pip:
   ```bash
   pip install unoserver
   ```

3. Verify installation:
   ```bash
   unoserver --version
   unoconvert --version
   ```

### Installation Location

Stirling-PDF will automatically detect UnoServer in these locations:

- In the same directory as the unoconvert executable
- At `/opt/venv/bin/unoserver` (Docker default)
- In standard system paths (`/usr/bin/unoserver`, `/usr/local/bin/unoserver`)
- In your PATH environment variable

## Advanced Features

### Health Checks

The system performs automatic health checks on all UnoServer instances every 60 seconds. These checks:

- Verify that each server is reachable and operational
- Automatically restart local instances that have failed
- Log the health status of all instances
- Update the circuit breaker status for each instance

Health checks are logged at INFO level and show the number of healthy and unhealthy instances.

### Circuit Breaker

For fault tolerance, each UnoServer instance implements a circuit breaker pattern that:

1. Tracks conversion failures for each instance
2. After 3 consecutive failures, marks the instance as unavailable (circuit open)
3. Waits for a cooldown period (30 seconds) before attempting to use the instance again
4. Automatically routes requests to healthy instances

The circuit breaker helps prevent cascading failures and provides automatic recovery.

### Performance Metrics

The UnoServerManager records and logs detailed metrics about UnoServer usage:

- Total number of conversions
- Success/failure rate
- Conversions per server instance
- Average conversion time per instance

These metrics are logged periodically and on application shutdown, helping you monitor and optimize performance.

Example metrics log:
```
UnoServer metrics - Total: 120, Failed: 5, Success Rate: 95.83%
Conversions per instance:
  [0] 127.0.0.1:2003 - Count: 32 (26.67%), Avg Time: 1250.45ms
  [1] 127.0.0.1:2004 - Count: 30 (25.00%), Avg Time: 1187.33ms
  [2] 127.0.0.1:2005 - Count: 29 (24.17%), Avg Time: 1345.78ms
  [3] 127.0.0.1:2006 - Count: 29 (24.17%), Avg Time: 1290.12ms
```

## Testing Multiple Instances

To test that multiple UnoServer instances are working correctly:

1. Set `libreOfficeSessionLimit` to a value greater than 1 (e.g., 4)
2. Start the application
3. Check logs for messages like:
   ```
   Initializing UnoServerManager with maxInstances: 4, useExternal: false
   Starting UnoServer on 127.0.0.1:2003
   Starting UnoServer on 127.0.0.1:2004
   Starting UnoServer on 127.0.0.1:2005
   Starting UnoServer on 127.0.0.1:2006
   ```
4. Submit multiple file conversion requests simultaneously
5. Observe in logs that different server instances are being used in a round-robin manner
6. Check the metrics logs to verify the load distribution across instances

## Performance Considerations

- Each UnoServer instance requires additional memory (typically 100-200 MB)
- Set the `libreOfficeSessionLimit` according to your server's available resources
- For most use cases, a value between 2-4 provides a good balance
- Larger values may improve concurrency but increase memory usage
- The circuit breaker pattern helps maintain system stability under high load

## Queue Management

Stirling-PDF now includes a queue management system for office document conversions:

### Queue Status API

The system exposes REST endpoints for checking conversion queue status:

- `GET /api/v1/queue/status` - Get status of all process queues
- `GET /api/v1/queue/unoserver` - Get detailed information about UnoServer instances and active tasks
- `GET /api/v1/queue/task/{taskId}` - Get status of a specific task by ID

Example response from `/api/v1/queue/unoserver`:

```json
{
  "instanceCount": 4,
  "activeTaskCount": 2,
  "instances": [
    {
      "id": 0,
      "host": "127.0.0.1",
      "port": 2003,
      "managed": true,
      "running": true,
      "available": true,
      "failureCount": 0,
      "averageConversionTimeMs": 1523.45,
      "lastConversionTimeMs": 1498
    },
    ...
  ],
  "activeTasks": [
    {
      "id": "office-123",
      "name": "Convert document.docx to PDF",
      "status": "RUNNING",
      "queuePosition": 0,
      "queueTimeMs": 0,
      "processTimeMs": 542,
      "totalTimeMs": 542,
      "errorMessage": null
    },
    ...
  ]
}
```

### UI Integration

The system includes a built-in UI for monitoring conversion status:

1. A status indicator appears when a document is being converted
2. The indicator shows the current status, position in queue, and estimated wait time
3. For pages that use office conversions, a "Check Office Conversion Status" button provides detailed information about server instances and active conversions

## Troubleshooting

If you encounter issues with UnoServer:

1. Check logs for any error messages related to UnoServer startup
2. Look for health check logs to identify problematic instances
3. Verify ports are not already in use by other applications
4. Ensure LibreOffice is correctly installed
5. Check that UnoServer is properly installed and in your PATH:
   ```
   which unoserver
   which unoconvert
   ```
6. Try running a single UnoServer instance manually to check if it works:
   ```
   /opt/venv/bin/unoserver --port 2003 --interface 127.0.0.1
   ```
7. Use the queue status API to check the status of UnoServer instances:
   ```
   curl http://localhost:8080/api/v1/queue/unoserver
   ```
8. For external servers, verify network connectivity from the Stirling-PDF server

### Common Error Messages

| Error Message | Possible Cause | Solution |
|---------------|----------------|----------|
| "UnoServer is not available" | UnoServer executable not found | Install UnoServer or use the fat Docker image |
| "Failed to start UnoServer instance" | Port in use or LibreOffice issues | Check ports, restart application, or verify LibreOffice installation |
| "Circuit breaker opened for UnoServer instance" | Multiple conversion failures | Check logs for specific errors, verify UnoServer is working correctly |
| "No UnoServer instances available" | All instances are down or in circuit-open state | Restart application or check for resource issues |

## Environment Variables

When using Docker, you can configure UnoServer instances using environment variables:

- `LIBREOFFICE_SESSION_LIMIT`: Number of UnoServer instances to start
- `BASE_UNOCONV_PORT`: Base port number for UnoServer instances
- `USE_EXTERNAL_UNOCONVSERVERS`: Set to "true" to use external servers