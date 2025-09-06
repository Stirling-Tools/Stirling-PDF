# Audit System Help

## About the Audit System
The Stirling PDF audit system records user actions and system events for security monitoring, compliance, and troubleshooting purposes.

## Audit Levels

| Level | Name | Description | Use Case |
|-------|------|-------------|----------|
| 0 | OFF | Minimal auditing, only critical security events | Development environments |
| 1 | BASIC | Authentication events, security events, and errors | Production environments with minimal storage |
| 2 | STANDARD | All HTTP requests and operations (default) | Normal production use |
| 3 | VERBOSE | Detailed information including headers, parameters, and results | Troubleshooting and detailed analysis |

## Configuration
Audit settings are configured in the `settings.yml` file under the `premium.proFeatures.audit` section:

```yaml
premium:
  proFeatures:
    audit:
      enabled: true           # Enable/disable audit logging
      level: 2                # Audit level (0=OFF, 1=BASIC, 2=STANDARD, 3=VERBOSE)
      retentionDays: 90       # Number of days to retain audit logs
```

## Common Event Types

### BASIC Events:
- USER_LOGIN - User login
- USER_LOGOUT - User logout
- USER_FAILED_LOGIN - Failed login attempt
- USER_PROFILE_UPDATE - User or profile operations

### STANDARD Events:
- HTTP_REQUEST - GET requests for viewing
- PDF_PROCESS - PDF processing operations
- FILE_OPERATION - File-related operations
- SETTINGS_CHANGED - System or admin settings operations

### VERBOSE Events:
- Detailed versions of STANDARD events with parameters and results