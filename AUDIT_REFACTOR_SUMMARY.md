# Audit System Refactor - Complete Implementation

**Date**: 2026-03-01
**Status**: Complete

## Overview
Refactored audit system to use semantic audit levels with independent metadata capture flags, addressing log noise and providing granular control over performance/completeness tradeoffs.

## Changes Made

### 1. Backend: Semantic Audit Levels (AuditLevel.java)

**Old Confusing Names:**
- BASIC, STANDARD, STANDARD, VERBOSE (semantics unclear)

**New Semantic Meanings:**

- **Level 1 - BASIC**: File operations only
  - PDF operations (compress, split, merge, convert, etc.)
  - File uploads/downloads
  - Settings changes
  - Excludes all GET requests

- **Level 2 - STANDARD** (Recommended for most deployments):
  - Everything in BASIC
  - User actions (login/logout, account changes)
  - General GET requests
  - **Excludes continuous polling calls** (/auth/me, /app-config, /health, /metrics, /footer-info, /admin/license-info, /endpoints-availability)
  - Reduces log noise while maintaining audit trail

- **Level 3 - VERBOSE** (Debug only):
  - Everything in STANDARD
  - Continuous polling calls
  - Method parameters
  - Request timing details
  - Warning: High volume, use temporarily

### 2. Backend: Independent Metadata Flags (ApplicationProperties.java)

Separated expensive metadata extraction from audit level:

```java
captureFileHash = false          // SHA-256 hash extraction (50-200ms per file)
capturePdfAuthor = false         // PDF author metadata (requires PDF parsing)
captureOperationResults = false  // Method return values (high volume, not recommended)
```

**Benefits:**
- User can have Level 2 audit without expensive hashing
- Or capture hashes independently at any level
- Performance warnings included in configuration

### 3. Backend: Polling Call Filtering (AuditService.java)

Added `isPollingCall()` helper to identify continuous endpoints:
- `/auth/me` (user state polling)
- `/app-config` (frontend config polling)
- `/footer-info`
- `/admin/license-info`
- `/endpoints-availability`
- `/health`
- `/metrics`

At STANDARD level: excluded from audit log
At VERBOSE level: included in audit log

Prevents audit logs being drowned in polling noise while maintaining security compliance.

### 4. Backend: Metadata Capture Logic (AuditService.java)

```java
// File hashing: only if captureFileHash = true
if (auditConfig.isCaptureFileHash()) {
    fileData.put("fileHash", calculateSHA256(file));
}

// PDF author: only if capturePdfAuthor = true
if (auditConfig.isCapturePdfAuthor()) {
    fileData.put("pdfAuthor", extractPDFAuthor(file));
}

// Operation results: only if captureOperationResults = true
if (auditService.shouldCaptureOperationResults()) {
    auditData.put("result", sanitizedReturnValue);
}
```

### 5. Settings Configuration (settings.yml.template)

```yaml
premium.enterpriseFeatures.audit:
  enabled: true                    # Enable audit logging
  level: 2                         # 1=BASIC, 2=STANDARD, 3=VERBOSE
  retentionDays: 90               # 0 or negative = infinite
  captureFileHash: false          # SHA-256 hash (performance: 50-200ms per file)
  capturePdfAuthor: false         # PDF author extraction (performance: varies)
  captureOperationResults: false  # Method return values (NOT RECOMMENDED: high volume)
```

All settings documented with:
- Purpose and impact
- Performance warnings
- Use case recommendations

### 6. Frontend: AdminSecuritySection Updates

**Interface Updated:**
- Added three new boolean properties to audit settings

**Level Descriptions Rewritten:**
- Level 1 - BASIC: "File Operations Only"
- Level 2 - STANDARD: "File Operations + User Actions (Recommended)"
- Level 3 - VERBOSE: "Everything Including Polling (Debug Only)"

**New UI Controls:**

1. **File Hash Capture** (Orange warning box):
   - Toggle for SHA-256 hash extraction
   - Description: "Extract SHA-256 hash of uploaded PDF files"
   - Performance: 50-200ms per file

2. **PDF Author Metadata** (Orange warning box):
   - Toggle for PDF author extraction
   - Description: "Extract author field from PDF documents"
   - Performance note: requires PDF parsing

3. **Operation Results Capture** (Red warning box - "NOT RECOMMENDED"):
   - Toggle for method return value capture
   - Warning: "significantly increases log volume and disk usage"
   - Recommendation: "Only enable for debugging"

**Design Philosophy:**
- Orange alerts for optional performance-sensitive features
- Red alert for not-recommended debugging-only feature
- Clear descriptions of impact at point of configuration
- All toggles disabled when login not enabled

## Audit Event Structure Example

**Before (Confusing):**
```
Level 2 might include polling, might include hashes - unclear behavior
```

**After (Clear):**
```
Level 2 audit event:
- Principal: alice
- Event: compress-pdf
- Files: [{name: "document.pdf", size: 1487}]
- Note: No hash unless captureFileHash=true
- Note: Polling calls excluded

Level 2 + captureFileHash=true:
- Files: [{name: "document.pdf", size: 1487, fileHash: "abc123..."}]

Level 3 audit event:
- Includes polling calls like /auth/me
- Includes method parameters
- If captureOperationResults=true: includes return values
```

## Migration Notes

- Existing audit level 2 (STANDARD) mappings preserved
- New properties default to `false` (opt-in for expensive features)
- No breaking changes to existing audit data
- Admin can incrementally enable features based on needs

## Performance Impact Summary

| Feature | Impact | Recommended |
|---------|--------|------------|
| Level 1 (BASIC) | Low | File-only audit |
| Level 2 (STANDARD) | Medium | Most deployments |
| Level 3 (VERBOSE) | High | Debugging only |
| captureFileHash | +50-200ms/file | Optional, performance-sensitive |
| capturePdfAuthor | +varies/file | Optional, parsing required |
| captureOperationResults | High volume | Not recommended |

## Testing Checklist

- [ ] Level 1: File operations logged, GET requests excluded
- [ ] Level 2: User actions + files logged, polling excluded
- [ ] Level 3: All events logged including polling
- [ ] captureFileHash: SHA-256 hashes extracted when enabled
- [ ] capturePdfAuthor: PDF author extracted when enabled
- [ ] captureOperationResults: Return values captured when enabled
- [ ] Polling calls excluded at Level 2, included at Level 3
- [ ] Performance acceptable with metadata capture disabled
- [ ] UI warnings display correctly
- [ ] Settings persist correctly

## Files Modified

**Backend:**
- `AuditLevel.java` - Updated level descriptions
- `ApplicationProperties.java` - Added new audit flags
- `AuditConfigurationProperties.java` - Read new flags
- `AuditService.java` - Implement logic, add polling detection
- `ControllerAuditAspect.java` - Skip polling at STANDARD level
- `AuditAspect.java` - Use new flags
- `settings.yml.template` - Document all settings

**Frontend:**
- `AdminSecuritySection.tsx` - UI for new settings, updated descriptions
