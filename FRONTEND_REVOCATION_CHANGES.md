# Frontend TODO: Revocation Status Migration

## Background
The backend has removed the deprecated `notRevoked` boolean field in favor of `revocationStatus` string field.

**revocationStatus values**:
- `"not-checked"` - revocation checking was disabled
- `"good"` - certificate was checked and is not revoked
- `"revoked"` - certificate is revoked
- `"soft-fail"` - revocation status couldn't be determined (network error, etc.)
- `"unknown"` - other failure scenarios

## Files That Need Changes

### 1. `/frontend/src/hooks/tools/validateSignature/utils/signatureUtils.ts`

Add mappings for new backend fields in `normalizeBackendResult()`:
```typescript
export const normalizeBackendResult = (
  item: SignatureValidationBackendResult,
  stirlingFile: StirlingFile,
  index: number
): SignatureValidationSignature => ({
  id: `${stirlingFile.fileId}-${index}`,
  valid: Boolean(item.valid),
  chainValid: Boolean(item.chainValid),
  trustValid: Boolean(item.trustValid),
  chainValidationError: item.chainValidationError ?? null,  // ADD THIS
  certPathLength: item.certPathLength ?? null,              // ADD THIS
  notExpired: Boolean(item.notExpired),
  revocationChecked: item.revocationChecked ?? null,        // ADD THIS
  revocationStatus: item.revocationStatus ?? null,          // ADD THIS
  validationTimeSource: item.validationTimeSource ?? null,  // ADD THIS
  signerName: coerceString(item.signerName),
  // ... rest of fields
})
```

### 2. `/frontend/src/hooks/tools/validateSignature/utils/signatureStatus.ts`

**Current code** (lines 42-43):
```typescript
// Use new revocationStatus field if available, fallback to notRevoked for backward compatibility
const revStatus = signature.revocationStatus || (signature.notRevoked ? 'good' : 'unknown');
```

**Change to**:
```typescript
const revStatus = signature.revocationStatus || 'unknown';
```

### 3. `/frontend/src/hooks/tools/validateSignature/utils/signatureCsv.ts`

**Current code** (lines 12, 42):
```typescript
'notRevoked',  // line 12 in CSV header
booleanToString(signature.notRevoked),  // line 42 in data row
```

**Recommended change** - replace with detailed status:
```typescript
// Header:
'revocationStatus',

// Data:
signature.revocationStatus || 'unknown',
```

### 4. `/frontend/src/hooks/tools/validateSignature/utils/reportStatus.ts`

**Current code** (line 24):
```typescript
(sig) => sig.valid && sig.chainValid && sig.trustValid && sig.notExpired && sig.notRevoked
```

**Change to**:
```typescript
(sig) => sig.valid && sig.chainValid && sig.trustValid && sig.notExpired && sig.revocationStatus === 'good'
```

### 5. `/frontend/src/components/tools/validateSignature/ValidateSignatureResults.tsx`

**Current code** (line 33):
```typescript
signature.notRevoked;
```

**Change to**:
```typescript
signature.revocationStatus === 'good'
```

## Migration Pattern

**For boolean contexts** (if statements, filters):
```typescript
// Old: signature.notRevoked
// New: signature.revocationStatus === 'good'
```

**For display/logging**:
```typescript
signature.revocationStatus  // "good" | "revoked" | "soft-fail" | "not-checked" | "unknown"
```
