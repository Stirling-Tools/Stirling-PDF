# Shared Signing Feature - Architecture & Workflow

## Overview

The Shared Signing feature enables collaborative document signing workflows where a document owner can request signatures from multiple participants. Each participant receives a secure token to access the document, submit their digital signature (with optional wet signature overlay), and track the signing progress.

**Key Capabilities:**
- Multi-participant signing sessions
- Digital certificate signatures (P12/PKCS12, JKS, SERVER, USER_CERT, PEM/UPLOAD)
- Visual wet signature overlays (drawn, typed, or uploaded) — multiple per participant
- Token-based participant access (no authentication required for participants)
- Authenticated participant access for registered users via sign-requests API
- Progress tracking for session owners
- Optional signature summary page appended to finalized PDF
- Automatic role downgrade after signing (security)
- GDPR-compliant wet signature metadata cleanup

## Architecture

### Database Schema

#### Core Tables

**`workflow_sessions`**
- Tracks signing sessions created by document owners
- Links to original and processed (signed) PDF files
- Stores session metadata (message, due date, status)

**`workflow_participants`**
- One record per participant per session
- Tracks participant status: PENDING → VIEWED → SIGNED/DECLINED
  - `NOTIFIED` status is reserved for a future email notification feature; no current code path sets it
- Stores participant-specific metadata (certificates, wet signatures) as JSONB
- Each participant holds their own `shareToken` (UUID) for token-based access — no separate `FileShare` record is created
- `accessRole` controls what actions the participant can perform. `COMMENTER` (and `EDITOR`) allow submitting a signature; `VIEWER` does not. After signing/declining, effective role is automatically downgraded to `VIEWER`

**`user_server_certificates`**
- Stores auto-generated certificates per user
- Enables "Use My Personal Certificate" option

#### Extended Tables

**`stored_files`**
- Added `workflow_session_id` to link files to signing sessions
- Added `file_purpose` enum (SIGNING_ORIGINAL, SIGNING_SIGNED, etc.)

**`file_shares`**
- Regular file shares are created when the session owner shares the document with other users via the file manager
- The `workflow_participant_id` column is deprecated; participant access is self-contained in `WorkflowParticipant.shareToken`

### Backend Architecture

#### Service Layer

**WorkflowSessionService** (`816 lines`)
- Core workflow management service
- Creates sessions with participants
- Handles participant status updates
- Stores signature metadata (certificates and wet signatures)
- Finalizes sessions by coordinating signing process

Key responsibilities:
- Session lifecycle management (create, list, get details, delete)
- Participant management (add, remove, notify)
- Certificate submission storage
- Wet signature metadata storage
- Session finalization orchestration

**UnifiedAccessControlService**
- Validates participant tokens
- Checks session status and expiration
- Maps participant status to effective access role
- Automatic role downgrade after signing: SIGNED/DECLINED → VIEWER role

**UserServerCertificateService**
- Auto-generates personal certificates for users
- Manages certificate storage and retrieval
- Enables "Use My Personal Certificate" signing option

#### Controller Layer

**SigningSessionController** (Owner-facing + Authenticated participant endpoints)
- `POST /api/v1/security/cert-sign/sessions` - Create signing session
- `GET /api/v1/security/cert-sign/sessions` - List user's sessions
- `GET /api/v1/security/cert-sign/sessions/{id}` - Get session details
- `GET /api/v1/security/cert-sign/sessions/{id}/pdf` - Download original PDF
- `POST /api/v1/security/cert-sign/sessions/{id}/finalize` - Finalize and apply signatures
- `GET /api/v1/security/cert-sign/sessions/{id}/signed-pdf` - Download signed PDF
- `DELETE /api/v1/security/cert-sign/sessions/{id}` - Delete session
- `POST /api/v1/security/cert-sign/sessions/{id}/participants` - Add participants
- `DELETE /api/v1/security/cert-sign/sessions/{id}/participants/{participantId}` - Remove participant
- `GET /api/v1/security/cert-sign/sign-requests` - List sign requests for authenticated user
- `GET /api/v1/security/cert-sign/sign-requests/{id}` - Get sign request details
- `GET /api/v1/security/cert-sign/sign-requests/{id}/document` - Download document for signing
- `POST /api/v1/security/cert-sign/sign-requests/{id}/sign` - Sign document (authenticated)
- `POST /api/v1/security/cert-sign/sign-requests/{id}/decline` - Decline sign request (authenticated)

**WorkflowParticipantController** (Participant-facing, token-based)
- `GET /api/v1/workflow/participant/session?token={token}` - View session details
- `GET /api/v1/workflow/participant/details?token={token}` - Get participant details
- `GET /api/v1/workflow/participant/document?token={token}` - Download PDF
- `POST /api/v1/workflow/participant/submit-signature` - Submit signature
- `POST /api/v1/workflow/participant/decline?token={token}` - Decline to sign

#### Data Flow

```
Owner creates session → Participants receive tokens →
Participants access via token (or authenticated) → Participants submit signatures →
Owner finalizes → System applies signatures → [Optional: append summary page] → Signed PDF generated
```

### Frontend Architecture

#### Quick Access Integration

**SignPopout Component**
- Displays in Quick Access Bar (top navigation)
- Shows active and completed signing sessions
- Auto-refreshes every 15 seconds to show signature progress
- Badge indicator shows count of pending sessions

**ActiveSessionsPanel**
- Lists sessions where user is owner or participant
- Shows signature progress: "X/Y signatures" (e.g., "2/5 signatures")
- Color-coded badges:
  - Blue: No signatures yet (0/X)
  - Yellow: Partial signatures (X/Y)
  - Green: Ready to finalize (X/X)

**CompletedSessionsPanel**
- Lists finalized sessions and declined sign requests
- Allows viewing/downloading signed PDFs

#### Workbench Views

**SignRequestWorkbenchView**
- Full-screen view for participants to sign documents
- Integrated PDF viewer with annotation support
- Certificate selection (Personal/Organization/Custom P12)
- Wet signature input (draw, type, or upload)
- Signature placement on PDF pages

**SessionDetailWorkbenchView**
- Owner's view of session details
- Participant list with status indicators
- Ability to add/remove participants
- Finalize button when all signatures collected
- Download original/signed PDF

#### State Management

**FileContext Integration**
- Signing sessions operate within FileContext workflow
- PDFs loaded once, persist across tool switches
- Memory management for large files (up to 100GB+)

**ToolWorkflowContext**
- Registers custom workbench views
- Manages navigation between viewer and signing tools
- Preserves file state during signing operations

#### Services & Hooks

**workflowService.ts**
- API client for all signing endpoints
- Handles session creation, listing, and management
- Participant operations (submit, decline)

**useWorkflowSession.ts**
- React hook for owner session management
- State management for session list and details

**useParticipantSession.ts**
- React hook for participant signing workflow
- Manages signature submission state

## Signing Workflow Process

### 1. Session Creation (Owner)

```
Owner → Uploads PDF → Selects participants → Creates session
        ↓
System creates:
  - WorkflowSession record
  - WorkflowParticipant records (one per participant, each with a unique shareToken)
        ↓
Participants receive token (via email or share link)
```

**API Call:**
```bash
POST /api/v1/security/cert-sign/sessions
Content-Type: multipart/form-data

file: document.pdf
workflowType: SIGNING
documentName: "contract.pdf"           # Optional display name
participantUserIds: [1, 2, 3]          # Registered user IDs
participantEmails: ["a@b.com"]         # External/unregistered users
participants: [...]                    # Detailed participant configs (optional)
message: "Please sign this contract"
dueDate: "2025-12-31"
ownerEmail: "owner@example.com"        # Optional, for notifications
workflowMetadata: '{"showSignature": false, "showLogo": false, "includeSummaryPage": true}'
```

**Session-level `workflowMetadata` fields:**
| Field | Type | Description |
|-------|------|-------------|
| `showSignature` | boolean | Show visible digital signature block on PDF |
| `pageNumber` | integer | Page to place digital signature on |
| `showLogo` | boolean | Show logo in digital signature block |
| `includeSummaryPage` | boolean | Append a signature summary page before digital signing |

**Response:**
```json
{
  "sessionId": "uuid",
  "documentName": "contract.pdf",
  "participants": [
    {
      "userId": 1,
      "email": "user1@example.com",
      "shareToken": "token1",
      "status": "PENDING"
    }
  ],
  "participantCount": 3,
  "signedCount": 0
}
```

### 2. Participant Access

```
Participant → Clicks token link → Views session details
        ↓
Status changes: PENDING/NOTIFIED → VIEWED
        ↓
Participant downloads PDF to review
```

**Access URL (unauthenticated):**
```
https://app.example.com/sign?token={participant_token}
```

**Authenticated participants** can also use:
```
GET /api/v1/security/cert-sign/sign-requests
GET /api/v1/security/cert-sign/sign-requests/{sessionId}
GET /api/v1/security/cert-sign/sign-requests/{sessionId}/document
```

**Automatic Status Update:**
- First access: PENDING/NOTIFIED → VIEWED
- Downloads tracked but don't change status

### 3. Signature Submission

```
Participant → Selects certificate type → Uploads certificate (if needed)
           → Draws/uploads wet signatures (optional, multiple supported)
           → Submits signature
        ↓
System stores:
  - Certificate data (P12/JKS keystore as base64)
  - Certificate password
  - Wet signatures metadata (JSON array: base64 image + coordinates per signature)
        ↓
Status changes: VIEWED → SIGNED
Access role: EDITOR → VIEWER (automatic downgrade)
```

**API Call (token-based, unauthenticated):**
```bash
POST /api/v1/workflow/participant/submit-signature
Content-Type: multipart/form-data

participantToken: {token}
certType: P12 | JKS | SERVER | USER_CERT
p12File: certificate.p12 (if certType=P12)
jksFile: keystore.jks (if certType=JKS)
password: cert_password
showSignature: false
pageNumber: 1
location: "New York"
reason: "I approve this contract"
showLogo: false
wetSignaturesData: '[{"page":0,"x":100,"y":200,"width":150,"height":50,"type":"IMAGE","data":"base64..."}]'
```

**API Call (authenticated users):**
```bash
POST /api/v1/security/cert-sign/sign-requests/{sessionId}/sign
Content-Type: multipart/form-data

certType: SERVER | USER_CERT | UPLOAD | PEM | PKCS12 | PFX | JKS
p12File: certificate.p12 (if applicable)
password: cert_password
reason: "I approve this contract"
location: "New York"
wetSignaturesData: '[...]'
```

**Metadata Storage (JSONB):**
```json
{
  "certificateSubmission": {
    "certType": "P12",
    "password": "cert_password",
    "p12Keystore": "base64_encoded_keystore",
    "showSignature": false,
    "pageNumber": 1,
    "location": "New York",
    "reason": "I approve this contract",
    "showLogo": false
  },
  "wetSignatures": [
    {
      "type": "IMAGE",
      "data": "base64_image",
      "page": 0,
      "x": 100,
      "y": 200,
      "width": 150,
      "height": 50
    }
  ]
}
```

Note: Multiple wet signatures are supported per participant (array).

### 4. Progress Tracking (Owner)

```
Owner → Views session list → Sees "2/5 signatures"
      → Clicks session → Views participant status
        ↓
Participant list shows:
  - user1@example.com: SIGNED ✓
  - user2@example.com: SIGNED ✓
  - user3@example.com: VIEWED (pending)
  - user4@example.com: PENDING
  - user5@example.com: DECLINED ✗
        ↓
Auto-refresh every 15 seconds
```

**Badge Colors:**
- 🔵 Blue: 0/5 signatures (awaiting)
- 🟡 Yellow: 2/5 signatures (partial)
- 🟢 Green: 5/5 signatures (ready to finalize)

### 5. Session Finalization

```
Owner → Clicks "Finalize" → System processes signatures
        ↓
Processing steps:
  1. Apply wet signatures to PDF (visual overlays)
  1.5. Append signature summary page (if includeSummaryPage=true)
  2. Apply digital certificates in participant order
     - Visual signature block suppressed when summary page is enabled
  3. Store signed PDF
  4. Clear wet signature metadata (GDPR compliance)
        ↓
Owner downloads signed PDF
```

**Finalization Process:**

1. **Apply Wet Signatures First**
   ```java
   for (WetSignature sig : wetSignatures) {
     PDPage page = document.getPage(sig.getPage());
     byte[] imageBytes = Base64.decode(sig.getData());
     // Convert Y from top-left (UI) to bottom-left (PDF) coordinate system
     float pdfY = page.getMediaBox().getHeight() - sig.getY() - sig.getHeight();
     PDImageXObject image = PDImageXObject.createFromByteArray(document, imageBytes, "signature");
     contentStream.drawImage(image, sig.getX(), pdfY, sig.getWidth(), sig.getHeight());
   }
   ```

2. **Append Summary Page (optional, before digital signing)**

   If `includeSummaryPage=true`, a new A4 page is appended showing:
   - Stirling logo and "Signature Summary" title
   - Document name and session owner
   - Finalization timestamp
   - Per-participant: name, email, status, signed timestamp, reason, location, certificate type
   - Supports overflow to additional pages

   This step occurs **before** digital certificate signing so signatures are not invalidated.
   When a summary page is added, the visual digital signature block (`showSignature`) is suppressed — wet signatures (hand-drawn overlays) are unaffected.

3. **Apply Digital Certificates (in participant order)**
   ```java
   for (Participant p : participants) {
     if (p.status == SIGNED) {
       KeyStore keystore = buildKeystore(p.certificate);
       // Reason: participant override > owner default > "Document Signing"
       // Location: participant-provided only (no default)
       CertSignController.sign(pdfBytes, keystore, password, settings);
     }
   }
   ```

4. **Store and Cleanup**
   ```java
   StoredFile signedFile = storeFile(signedPdfBytes, SIGNING_SIGNED);
   session.setProcessedFile(signedFile);
   session.setFinalized(true);

   // GDPR: Clear sensitive metadata after finalization
   for (Participant p : participants) {
     p.metadata.remove("wetSignatures");         // Clears wet signature image data
     p.metadata.remove("certificateSubmission"); // Clears keystore bytes + password
   }
   ```

**API Call:**
```bash
POST /api/v1/security/cert-sign/sessions/{sessionId}/finalize
Authorization: Bearer {owner_token}
```

**Response:** Binary PDF file with Content-Disposition header

## Key Technical Features

### 1. Double JSON Encoding Fix (Recent)

**Problem:** JSONB columns were storing JSON strings instead of JSON objects, requiring double-parsing.

**Solution:** Created `JsonMapConverter` JPA AttributeConverter:
```java
@Convert(converter = JsonMapConverter.class)
@Column(name = "participant_metadata", columnDefinition = "jsonb")
private Map<String, Object> participantMetadata;
```

**Benefits:**
- Single parse on read
- Proper JSON storage in PostgreSQL
- Type-safe Map access
- Backward compatible with legacy data

### 2. Signature Progress Display (Recent)

**Implementation:**
- `WorkflowSessionResponse` includes `participantCount` and `signedCount`
- `WorkflowMapper` calculates counts when converting to DTO
- Frontend displays "X/Y signatures" in session list
- Auto-refresh every 15 seconds keeps counts updated

### 3. Token-Based Security

**No Authentication Required for Participants:**
- Participants access via secure token (UUID)
- Token linked to specific participant and session
- Automatic expiration support
- One-time signing (cannot sign twice)

**Authenticated Participant Access:**
- Registered users can also access sign requests via `/api/v1/security/cert-sign/sign-requests`
- Standard Spring Security authentication required
- Supports additional cert types: UPLOAD, PEM, PKCS12, PFX

**Automatic Role Downgrade:**
- After signing: EDITOR → VIEWER
- After declining: EDITOR → VIEWER
- Prevents modification after action taken

### 4. Storage Integration

**Unified with File Sharing:**
- All PDFs stored via `StorageProvider` (Database or Local)
- Respects storage quotas
- Supports files up to 100GB+ (with Local storage)
- Consistent with existing file sharing infrastructure

### 5. Certificate Types

**P12/PKCS12/PFX:** User uploads PKCS#12 file + password
**JKS:** User uploads Java KeyStore + password
**PEM/UPLOAD:** User uploads PEM certificate + private key
**SERVER:** Uses organization's server certificate (no upload needed)
**USER_CERT:** Uses user's auto-generated personal certificate (one-click)

Note: UPLOAD, PEM, PKCS12, PFX are available on the authenticated (`sign-requests`) path. The token-based path uses P12, JKS, SERVER, USER_CERT.

## Frontend Components Overview

### Owner Workflow Components

1. **CreateSessionPanel** - Form to create new signing session
2. **ActiveSessionsPanel** - List of pending sessions with progress
3. **SessionDetailWorkbenchView** - Full session management interface
4. **CompletedSessionsPanel** - History of finalized sessions

### Participant Workflow Components

1. **SignRequestWorkbenchView** - Main signing interface
2. **SignatureSettingsInput** - Certificate selection and configuration
3. **WetSignatureInput** - Draw/type/upload signature overlay
4. **SignatureSettingsDisplay** - Preview of signature settings

### Shared Components

1. **UserSelector** - Multi-select user picker for participants
2. **LocalEmbedPDFWithAnnotations** - PDF viewer with signature placement

## Configuration

### Backend Configuration

**application.properties:**
```properties
# Database (H2 or PostgreSQL)
spring.jpa.hibernate.ddl-auto=update

# Security
DOCKER_ENABLE_SECURITY=true

# Storage Provider (DATABASE or LOCAL)
storage.provider=LOCAL
storage.maxFileSize=100GB
```

### Frontend Configuration

**Quick Access Bar:**
- Signing popout accessible from top navigation
- Auto-refresh interval: 15 seconds
- Badge shows pending session count

## API Reference Summary

### Owner Endpoints (Authenticated)

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/v1/security/cert-sign/sessions` | Create session |
| GET | `/api/v1/security/cert-sign/sessions` | List sessions |
| GET | `/api/v1/security/cert-sign/sessions/{id}` | Get details |
| POST | `/api/v1/security/cert-sign/sessions/{id}/finalize` | Finalize session |
| GET | `/api/v1/security/cert-sign/sessions/{id}/pdf` | Download original |
| GET | `/api/v1/security/cert-sign/sessions/{id}/signed-pdf` | Download signed |
| DELETE | `/api/v1/security/cert-sign/sessions/{id}` | Delete session |
| POST | `/api/v1/security/cert-sign/sessions/{id}/participants` | Add participants |
| DELETE | `/api/v1/security/cert-sign/sessions/{id}/participants/{pid}` | Remove participant |

### Authenticated Participant Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/v1/security/cert-sign/sign-requests` | List sign requests |
| GET | `/api/v1/security/cert-sign/sign-requests/{id}` | Get sign request details |
| GET | `/api/v1/security/cert-sign/sign-requests/{id}/document` | Download document |
| POST | `/api/v1/security/cert-sign/sign-requests/{id}/sign` | Sign document |
| POST | `/api/v1/security/cert-sign/sign-requests/{id}/decline` | Decline signing |

### Token-Based Participant Endpoints (No Auth Required)

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/v1/workflow/participant/session?token={token}` | View session |
| GET | `/api/v1/workflow/participant/details?token={token}` | Get participant details |
| GET | `/api/v1/workflow/participant/document?token={token}` | Download PDF |
| POST | `/api/v1/workflow/participant/submit-signature` | Submit signature |
| POST | `/api/v1/workflow/participant/decline?token={token}` | Decline signing |

## Security Considerations

### Data Protection
- Wet signature image data cleared after finalization (GDPR compliance)
- Certificate submission data (keystore bytes + password) cleared after finalization (GDPR compliance)
- Certificate passwords are not encrypted at rest while stored (TODO: encrypt at rest)
- Token expiration support

### Access Control
- Owner authentication required for session management
- Participant access via secure UUID tokens (no auth) or standard auth (sign-requests)
- Automatic role downgrade prevents re-signing
- Session status checks prevent unauthorized actions

### Audit Trail
- All participant actions tracked
- FileShare access logged
- Status transitions recorded
- Notification history maintained

## Performance Characteristics

### Scalability
- Supports PDFs up to 100GB+ (with Local storage provider)
- Memory-efficient streaming for large files
- IndexedDB caching on frontend
- Database indexes on session_id, share_token, workflow_session_id

### Response Times
- Session creation: ~500ms (10MB file)
- Session listing: ~100ms
- Token validation: ~50ms
- Finalization: ~2s per MB of PDF (varies by certificate operations)

## Future Enhancements

### Planned Features
- Email notifications for participants
- Reminder system for pending signatures
- Bulk signing operations
- Template-based signing workflows
- Signature validation/verification UI
- Certificate password encryption at rest
- Certificate keystore cleanup after finalization (GDPR)
- Webhook support for external integrations
- Analytics dashboard for signing metrics

### Additional Workflow Types
- **REVIEW** - Document review with comments
- **APPROVAL** - Multi-level approval chains
- **COLLABORATION** - Real-time collaborative editing

## Troubleshooting

### Common Issues

**"Token invalid" error:**
- Check token exists in workflow_participants table
- Verify session is not finalized
- Check expiration date (expires_at)

**Signature not appearing on PDF:**
- Verify certificate type is correct
- Check certificate password
- Review logs for signing errors
- Ensure PDFDocumentFactory is available

**"Awaiting signatures" not updating:**
- Backend should return participantCount and signedCount
- Frontend auto-refresh every 15 seconds
- Check network tab for API errors

**Wet signatures not visible after finalization:**
- Wet signatures are applied first as image overlays (Step 1)
- Check `wetSignaturesData` was sent as valid JSON array
- Verify page index is within document bounds
- Note: wet signatures survive regardless of `includeSummaryPage` setting

### Debug Queries

```sql
-- Check session status
SELECT session_id, status, finalized,
       (SELECT COUNT(*) FROM workflow_participants WHERE workflow_session_id = ws.id) as participant_count,
       (SELECT COUNT(*) FROM workflow_participants WHERE workflow_session_id = ws.id AND status = 'SIGNED') as signed_count
FROM workflow_sessions ws;

-- Check participant tokens
SELECT email, status, share_token, expires_at
FROM workflow_participants
WHERE workflow_session_id = (SELECT id FROM workflow_sessions WHERE session_id = '{session_id}');

-- Check metadata storage
SELECT email,
       participant_metadata->'certificateSubmission'->>'certType' as cert_type,
       jsonb_array_length(participant_metadata->'wetSignatures') as wet_sig_count
FROM workflow_participants;
```

## Summary

The Shared Signing feature provides a complete collaborative signing workflow with:
- ✅ Multi-participant support with progress tracking
- ✅ Multiple certificate types (P12/PKCS12/PFX, JKS, PEM, SERVER, USER_CERT)
- ✅ Visual wet signature overlays (multiple per participant)
- ✅ Token-based security for unauthenticated participants
- ✅ Authenticated participant access via sign-requests API
- ✅ Automatic role management
- ✅ Large file support (100GB+)
- ✅ GDPR-compliant wet signature metadata cleanup
- ✅ Real-time progress updates
- ✅ Full frontend integration with Quick Access Bar
- ✅ Optional signature summary page with logo and participant details

The architecture leverages existing file sharing infrastructure while adding workflow-specific features, ensuring consistency and maintainability across the application.
