# Stirling PDF Audit System

This document provides guidance on how to use the audit system in Stirling PDF.

## Overview

The audit system provides comprehensive logging of user actions and system events, storing them in a database for later review. This is useful for:

- Security monitoring
- Compliance requirements
- User activity tracking
- Troubleshooting

## Audit Levels

The audit system supports different levels of detail that can be configured in the settings.yml file:

### Level 0: OFF
- Disables all audit logging except for critical security events
- Minimal database usage and performance impact
- Only recommended for development environments

### Level 1: BASIC
- Authentication events (login, logout, failed logins)
- Password changes
- User/role changes
- System configuration changes
- HTTP request errors (status codes >= 400)

### Level 2: STANDARD (Default)
- Everything in BASIC plus:
- All HTTP requests (basic info: URL, method, status)
- File operations (upload, download, process)
- PDF operations (view, edit, etc.)
- User operations

### Level 3: VERBOSE
- Everything in STANDARD plus:
- Request headers and parameters
- Method parameters
- Operation results
- Detailed timing information

## Configuration

Audit levels are configured in the settings.yml file under the premium section:

```yaml
premium:
  proFeatures:
    audit:
      enabled: true           # Enable/disable audit logging
      level: 2                # Audit level (0=OFF, 1=BASIC, 2=STANDARD, 3=VERBOSE)
      retentionDays: 90       # Number of days to retain audit logs
```

## Automatic Auditing

The following events are automatically audited (based on configured level):

### HTTP Request Auditing
All HTTP requests are automatically audited with details based on the configured level:

- **BASIC level**: Only errors (status code >= 400)
- **STANDARD level**: All requests with basic information (URL, method, status code, latency, IP)
- **VERBOSE level**: All of the above plus headers, parameters, and detailed timing

### Controller Method Auditing
All controller methods with web mapping annotations are automatically audited:

- `@GetMapping`
- `@PostMapping`
- `@PutMapping`
- `@DeleteMapping`
- `@PatchMapping`

Methods with these annotations are audited at the **STANDARD** level by default.

### Security Events
The following security events are always audited at the **BASIC** level:

- Authentication events (login, logout, failed login attempts)
- Password changes
- User/role changes

## Manual Auditing

There are two ways to add audit events from your code:

### 1. Using AuditService Directly

Inject the `AuditService` and use it directly:

```java
@Service
@RequiredArgsConstructor
public class MyService {

    private final AuditService auditService;
    
    public void processPdf(MultipartFile file) {
        // Process the file...
        
        // Add an audit event with default level (STANDARD)
        auditService.audit("PDF_PROCESSED", Map.of(
            "filename", file.getOriginalFilename(),
            "size", file.getSize(),
            "operation", "process"
        ));
        
        // Or specify an audit level
        auditService.audit("PDF_PROCESSED_DETAILED", Map.of(
            "filename", file.getOriginalFilename(),
            "size", file.getSize(),
            "operation", "process",
            "metadata", file.getContentType(),
            "user", "johndoe"
        ), AuditLevel.VERBOSE);
        
        // Critical security events should use BASIC level to ensure they're always logged
        auditService.audit("SECURITY_EVENT", Map.of(
            "action", "file_access",
            "resource", file.getOriginalFilename()
        ), AuditLevel.BASIC);
    }
}
```

### 2. Using the @Audited Annotation

For simpler auditing, use the `@Audited` annotation on your methods:

```java
@Service
public class UserService {

    // Basic audit level for important security events
    @Audited(type = "USER_REGISTRATION", level = AuditLevel.BASIC)
    public User registerUser(String username, String email) {
        // Method implementation
        User user = new User(username, email);
        // Save user...
        return user;
    }
    
    // Sensitive operations should use BASIC but disable argument logging
    @Audited(type = "USER_PASSWORD_CHANGE", level = AuditLevel.BASIC, includeArgs = false)
    public void changePassword(String username, String newPassword) {
        // Change password implementation
        // includeArgs=false prevents the password from being included in the audit
    }
    
    // Standard level for normal operations (default)
    @Audited(type = "USER_LOGIN")
    public boolean login(String username, String password) {
        // Login implementation
        return true;
    }
    
    // Verbose level for detailed information
    @Audited(type = "USER_SEARCH", level = AuditLevel.VERBOSE, includeResult = true)
    public List<User> searchUsers(String query) {
        // Search implementation
        // At VERBOSE level, this will include both the query and results
        return userList;
    }
}
```

With the `@Audited` annotation:
- You can specify the audit level using the `level` parameter
- Method arguments are automatically included in the audit event (unless `includeArgs = false`)
- Return values can be included with `includeResult = true`
- Exceptions are automatically captured and included in the audit
- The aspect handles all the boilerplate code for you
- The annotation respects the configured global audit level

### 3. Controller Automatic Auditing

In addition to the manual methods above, all controller methods with web mapping annotations are automatically audited, even without the `@Audited` annotation:

```java
@RestController
@RequestMapping("/api/users")
public class UserController {

    // This method will be automatically audited
    @GetMapping("/{id}")
    public ResponseEntity<User> getUser(@PathVariable String id) {
        // Method implementation
        return ResponseEntity.ok(user);
    }
    
    // This method will be automatically audited
    @PostMapping
    public ResponseEntity<User> createUser(@RequestBody User user) {
        // Method implementation
        return ResponseEntity.ok(savedUser);
    }
    
    // This method uses @Audited and takes precedence over automatic auditing
    @Audited(type = "USER_DELETE", level = AuditLevel.BASIC)
    @DeleteMapping("/{id}")
    public ResponseEntity<Void> deleteUser(@PathVariable String id) {
        // Method implementation
        return ResponseEntity.noContent().build();
    }
}
```

Important notes about automatic controller auditing:
- All controller methods with web mapping annotations are audited at the STANDARD level
- If a method already has an @Audited annotation, that takes precedence
- The audit event includes controller name, method name, path, and HTTP method
- At VERBOSE level, request parameters are also included
- Exceptions are automatically captured

## Common Audit Event Types

Use consistent event types throughout the application:

- `FILE_UPLOAD` - When a file is uploaded
- `FILE_DOWNLOAD` - When a file is downloaded
- `PDF_PROCESS` - When a PDF is processed (split, merged, etc.)
- `USER_CREATE` - When a user is created
- `USER_UPDATE` - When a user details are updated
- `PASSWORD_CHANGE` - When a password is changed
- `PERMISSION_CHANGE` - When permissions are modified
- `SETTINGS_CHANGE` - When system settings are changed

## Security Considerations

- Sensitive data is automatically masked in audit logs (passwords, API keys, tokens)
- Each audit event includes a unique request ID for correlation
- Audit events are stored asynchronously to avoid performance impact
- The `/auditevents` endpoint is disabled to prevent unauthorized access to audit data

## Database Storage

Audit events are stored in the `audit_events` table with the following schema:

- `id` - Unique identifier
- `principal` - The username or system identifier
- `type` - The event type
- `data` - JSON blob containing event details
- `timestamp` - When the event occurred

## Metrics

Prometheus metrics are available at `/actuator/prometheus` for monitoring system performance and audit event volume.