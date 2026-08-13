# File Sharing Feature - Architecture & Workflow

## Overview

The File Sharing feature enables users to store files server-side and share them with other registered users or via token-based share links. Files are stored using a pluggable storage provider (local filesystem or database) with optional quota enforcement.

**Key Capabilities:**
- Server-side file storage (upload, update, download, delete)
- Optional history bundle and audit log attachments per file
- Direct user-to-user sharing with access roles
- Token-based share links (requires `system.frontendUrl`)
- Optional email notifications for shares (requires `mail.enabled`)
- Access audit trail (tracks who accessed a share link and how)
- Automatic share link expiration
- Storage quotas (per-user and total)
- Pluggable storage backend (local filesystem or database BLOB)
- Integration with the Shared Signing workflow
- Policy enforcement at egress (who may receive a document, on what terms, and what the copy that leaves looks like)

## Architecture

### Database Schema

**`stored_files`**
- One record per uploaded file
- Stores file metadata (name, content type, size, storage key)
- Optionally links to a history bundle and audit log as separate stored objects
- `workflow_session_id` — nullable link to a `WorkflowSession` (signing feature)
- `file_purpose` — enum classifying the file's role: `GENERIC`, `SIGNING_ORIGINAL`, `SIGNING_SIGNED`, `SIGNING_HISTORY`

**`file_shares`**
- One record per sharing relationship
- `egress_channel` - the share channel this row was granted through, so a delivery is judged the way the grant was (an email share mints a link, and that link is still an email share)
- `egress_file_id` / `egress_fingerprint` — cache of the processed copy a Sharing policy produced for this share (see [Sharing Policies](#sharing-policies-egress-enforcement))
- Two share types, distinguished by which fields are set:
  - **User share**: `shared_with_user_id` is set, `share_token` is null
  - **Link share**: `share_token` is set (UUID), `shared_with_user_id` is null
- `access_role` — `EDITOR`, `COMMENTER`, or `VIEWER`
- `expires_at` — nullable expiration for link shares
- `workflow_participant_id` — when set, marks this as a **workflow share** (hidden from the file manager, accessible only via workflow endpoints)

**`file_share_accesses`**
- One record per access event on a share link
- Tracks: user, share link, access type (`VIEW` or `DOWNLOAD`), timestamp

**`storage_cleanup_entries`**
- Queue of storage keys to be deleted asynchronously
- Used when a file is deleted but the physical storage object cleanup is deferred

### Access Roles

| Role | Can Read | Can Write |
|------|----------|-----------|
| `EDITOR` | ✅ | ✅ |
| `COMMENTER` | ✅ | ❌ |
| `VIEWER` | ✅ | ❌ |

Default role when none is specified: `EDITOR`.

Owners always have full access regardless of role.

#### Role Semantics: COMMENTER vs VIEWER

In the file storage layer, `COMMENTER` and `VIEWER` are equivalent — both grant read-only access and neither can replace file content. The distinction is meaningful in the **signing workflow** context:

| Context | COMMENTER | VIEWER |
|---------|-----------|--------|
| File storage | Read only (same as VIEWER) | Read only |
| Signing workflow | Can submit a signing action | Read only |

`WorkflowParticipant.canEdit()` returns `true` for `COMMENTER` (and `EDITOR`) roles, which the signing workflow uses to determine if a participant can still submit a signature. Once a participant has signed or declined, their effective role is automatically downgraded to `VIEWER` regardless of their configured role.

The rationale: "annotating" a document (submitting a signature) is not the same as "replacing" it. COMMENTER grants annotation rights without file-replacement rights.

### Backend Architecture

#### Service Layer

**FileStorageService** (`1137 lines`)
- Core file management service
- Upload, update, download, and delete operations
- User share management (share, revoke, leave)
- Link share management (create, revoke, access)
- Access recording and listing
- Storage quota enforcement
- Configuration feature gate checks

**StorageCleanupService**
- Scheduled daily: deletes orphaned storage keys from `storage_cleanup_entries`
- Scheduled daily: purges expired share links from `file_shares`
- Processes cleanup in batches of 50 entries

#### Storage Providers

**LocalStorageProvider**
- Files stored on the filesystem under `storage.local.basePath` (default: `./storage`)
- Storage key is a path relative to the base directory

**DatabaseStorageProvider**
- Files stored as BLOBs in `stored_file_blobs` table
- No filesystem dependency

Provider is selected at startup via `storage.provider: local | database`.

#### Controller Layer

**FileStorageController** (`/api/v1/storage`)
- All endpoints require authentication
- File CRUD and sharing operations

### Data Flow

```
User uploads file → StorageProvider stores bytes → StoredFile record created
       ↓
Owner shares file → FileShare record created (user or link)
       ↓
Recipient accesses file → Access recorded → File bytes streamed
```

## File Operations

### Upload File

```bash
POST /api/v1/storage/files
Content-Type: multipart/form-data

file: document.pdf                # Required — main file
historyBundle: history.json       # Optional — version history
auditLog: audit.json              # Optional — audit trail
```

**Response:**
```json
{
  "id": 42,
  "fileName": "document.pdf",
  "contentType": "application/pdf",
  "sizeBytes": 102400,
  "owner": "alice",
  "ownedByCurrentUser": true,
  "accessRole": "editor",
  "createdAt": "2025-01-01T12:00:00",
  "updatedAt": "2025-01-01T12:00:00",
  "sharedWithUsers": [],
  "sharedUsers": [],
  "shareLinks": []
}
```

### Update File

Replaces the file content. Only the owner can update.

```bash
PUT /api/v1/storage/files/{fileId}
Content-Type: multipart/form-data

file: document_v2.pdf
historyBundle: history.json       # Optional
auditLog: audit.json              # Optional
```

### List Files

Returns all files owned by or shared with the current user. Workflow-shared files (signing participants) are excluded — those are accessible via signing endpoints only.

```bash
GET /api/v1/storage/files
```

Response is sorted by `createdAt` descending.

### Download File

```bash
GET /api/v1/storage/files/{fileId}/download?inline=false
```

- `inline=false` (default) — `Content-Disposition: attachment`
- `inline=true` — `Content-Disposition: inline` (for browser preview)

### Delete File

Only the owner can delete. All associated share links and their access records are deleted first, then the database record, then the physical storage object.

```bash
DELETE /api/v1/storage/files/{fileId}
```

## Sharing Operations

### Share with User

```bash
POST /api/v1/storage/files/{fileId}/shares/users
Content-Type: application/json

{
  "username": "bob",          # Username or email address
  "accessRole": "editor"      # "editor", "commenter", or "viewer" (default: "editor")
}
```

**Behaviour:**
- If the target user exists: creates/updates a `FileShare` with `sharedWithUser` set
- If `username` is an email address and the user doesn't exist: creates a share link and sends a notification email (requires `sharing.emailEnabled` and `sharing.linkEnabled`)
- If the target user is the owner: returns 400
- If sharing is disabled: returns 403

### Revoke User Share

Only the owner can revoke.

```bash
DELETE /api/v1/storage/files/{fileId}/shares/users/{username}
```

### Leave Shared File

The recipient removes themselves from a shared file.

```bash
DELETE /api/v1/storage/files/{fileId}/shares/self
```

### Create Share Link

Creates a token-based link for anonymous/authenticated access. Requires `sharing.linkEnabled` and `system.frontendUrl` to be configured.

```bash
POST /api/v1/storage/files/{fileId}/shares/links
Content-Type: application/json

{
  "accessRole": "viewer"      # Optional (default: "editor")
}
```

**Response:**
```json
{
  "token": "550e8400-e29b-41d4-a716-446655440000",
  "accessRole": "viewer",
  "createdAt": "2025-01-01T12:00:00",
  "expiresAt": "2025-01-04T12:00:00"
}
```

Expiration is set to `now + sharing.linkExpirationDays` (default: 3 days).

### Revoke Share Link

```bash
DELETE /api/v1/storage/files/{fileId}/shares/links/{token}
```

Also deletes all access records for that token.

## Share Link Access

### Download via Share Link

Authentication is required (even for share links). Anonymous access is not permitted.

```bash
GET /api/v1/storage/share-links/{token}?inline=false
```

- Returns 401 if unauthenticated
- Returns 403 if authenticated but link doesn't permit access
- Returns 410 if the link has expired
- Records a `FileShareAccess` entry on success

> **Token-as-credential semantics:** Any authenticated user who holds the token can access the file — the token is the credential. If you need per-user access control (only a specific person can open it), use "Share with User" instead. Share links are appropriate for broader distribution where possession of the token implies authorization.

### Get Share Link Metadata

```bash
GET /api/v1/storage/share-links/{token}/metadata
```

Returns file name, owner, access role, creation/expiry timestamps, and whether the current user owns the file.

### List Accessed Share Links

Returns the most recent access for each non-expired share link the current user has accessed.

```bash
GET /api/v1/storage/share-links/accessed
```

### List Accesses for a Link (Owner Only)

```bash
GET /api/v1/storage/files/{fileId}/shares/links/{token}/accesses
```

Returns per-user access history (username, VIEW/DOWNLOAD, timestamp), sorted descending by time.

## Sharing Policies (egress enforcement)

A **Sharing** policy governs how documents leave the workspace. It is an ordinary stored policy (`/api/v1/policies`) authored under the `sharing` category, so it is created and edited in the portal's Policies page like any other - but it has no input source and nothing sweeps or polls for it. The sharing endpoints evaluate it inline, on the request that grants or delivers a share.

The governing policies are always the **file owner's team's**, never the accessor's.

### Where it fires

| Moment | Endpoint | What the policy can do |
|--------|----------|------------------------|
| Share with a user | `POST /files/{id}/shares/users` | refuse the share; cap the access role |
| Create a share link | `POST /files/{id}/shares/links` | refuse; cap the role; cap the link's lifetime |
| Email share | `POST /files/{id}/shares/users` (email address) | as above, judged as its own channel |
| Recipient opens it | `GET /share-links/{token}`, `GET /files/{id}/download` | force view-only; serve a processed copy |

The channel is stamped on the share row when it is granted (`file_shares.egress_channel`), so the link an email share mints is still evaluated as `emailShare` when the recipient opens it. Without that stamp a policy narrowed to the email channel would gate the grant and then let the delivery through untouched.

Typing a **registered user's** email address is still a user share: the row that names them is stamped `userShare`, and only the link that gets mailed is an `emailShare`. Both channels are evaluated before anything is written, each against the artefact it governs. Usernames in this product are commonly email addresses, so treating the row as an email share would quietly stop a `userShare` policy from biting on the ordinary path.

The owner downloading their own file is not egress and is never gated.

### Settings

| Setting | Effect |
|---------|--------|
| Default access | Ceiling on the role any new share may grant (`restricted` → `VIEWER`). Only tightens; it never promotes a weaker request. |
| External recipients | `allow` / `restrict` / `block`. Restrict grants read-only, view-only access on a one-day link. |
| Internal domains | Email domains counted as inside the org. Empty falls back to the file owner's own domain. |
| Share link expiry | Ceiling on link lifetime. Can only shorten the configured `linkExpirationDays`, never extend it. |
| Downloads | `viewOnly` always serves the document inline, never as an attachment, and rasterises the copy that leaves. |

Narrowing: **Runs on** limits the policy to particular share channels (`userShare`, `shareLink`, `emailShare`); empty means every channel.

Narrowing by document type is deliberately not offered. The `scopeTypes` field still round-trips in the stored format, but nothing sets or reads it: classification labels are written into the PDF only by the AI classify endpoint, and only into the editor's copy, so a file uploaded straight to storage carries none. A document-type rule would silently match nothing — worse than not having the control. It can return once stored files carry classification.

Several sharing policies compose to the most restrictive outcome: lowest role, shortest link life, view-only if any says so, blocked if any blocks.

### The processed copy

If the policy has any enabled tools (watermark, redact, strip active content), the recipient gets a **processed copy**; the stored original is untouched. It is derived on first delivery and cached against the share (`file_shares.egress_file_id`), keyed by a fingerprint over the transforming policies, their steps, and the source document's version — so editing the policy or replacing the document invalidates it automatically. The copy lives in the shared job file store, so it inherits that store's retention sweep and does not count against the owner's quota.

Three behaviours worth knowing:

- **Fails closed.** If the tool chain errors or does not finish inside 120s, the delivery is refused rather than falling back to the unprocessed original.
- **No signed-URL shortcut.** When a policy applies view-only or a transform, delivery always streams through the application. A provider-signed URL points straight at the stored object and would bypass both.
- **View-only is decided by the server.** `?inline` is a client hint about the disposition; it cannot decide whether the policy applies. A view-only delivery is always served inline, always processed, and its final pass rasterises the pages, so what leaves is a rendition rather than the stored document. Recipients still see the file; they do not receive a working copy of it.

**View-only over a non-PDF.** Stored files are not all PDFs, and the rasterising pass is a PDF operation. For a payload whose type says it is something else (a PNG, a spreadsheet), that pass is skipped and the stored bytes are served: view-only then means only the inline-only disposition, which is what it can mean for a format with no pages to render. Any tool chain the policy configures still runs, and still fails the delivery closed if a step refuses the type. A payload whose type cannot be read at all counts as a PDF, so it is rasterised or refused rather than handed over untouched.

The cached copy is read back through the low-level file store rather than the job-ownership-checked wrapper: the share has already authorised the recipient, and the ownership check would refuse every recipient except the one whose download happened to derive the copy.

### Configuration

Nothing extra. Sharing policies are inert unless the storage sharing feature is on (`storage.sharing.enabled`), and a deployment with no sharing policy behaves exactly as it did before.

## Workflow Share Integration

Signing workflow participants access documents via their own `WorkflowParticipant.shareToken`. No `FileShare` record is created for participants; access control is self-contained in the `WorkflowParticipant` entity.

The `FileShare.workflow_participant_id` column and the `FileShare.isWorkflowShare()` method are **deprecated**. Legacy data (sessions created before this change) may still have `FileShare` records with `workflow_participant_id` set, which continue to work via the existing token lookup path in `UnifiedAccessControlService`. No new records are created.

`GET /api/v1/storage/files` returns all files owned by or shared with the current user (via `FileShare`). Signing-session PDFs use the `file_purpose` field (`SIGNING_ORIGINAL`, `SIGNING_SIGNED`, etc.) to distinguish them from generic files. The file manager UI can filter on this field if needed.

## API Reference

| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| POST | `/api/v1/storage/files` | Upload file | Required |
| PUT | `/api/v1/storage/files/{id}` | Update file | Required (owner) |
| GET | `/api/v1/storage/files` | List accessible files | Required |
| GET | `/api/v1/storage/files/{id}` | Get file metadata | Required |
| GET | `/api/v1/storage/files/{id}/download` | Download file | Required |
| DELETE | `/api/v1/storage/files/{id}` | Delete file | Required (owner) |
| POST | `/api/v1/storage/files/{id}/shares/users` | Share with user | Required (owner) |
| DELETE | `/api/v1/storage/files/{id}/shares/users/{username}` | Revoke user share | Required (owner) |
| DELETE | `/api/v1/storage/files/{id}/shares/self` | Leave shared file | Required |
| POST | `/api/v1/storage/files/{id}/shares/links` | Create share link | Required (owner) |
| DELETE | `/api/v1/storage/files/{id}/shares/links/{token}` | Revoke share link | Required (owner) |
| GET | `/api/v1/storage/share-links/{token}` | Download via share link | Required |
| GET | `/api/v1/storage/share-links/{token}/metadata` | Get share link metadata | Required |
| GET | `/api/v1/storage/share-links/accessed` | List accessed share links | Required |
| GET | `/api/v1/storage/files/{id}/shares/links/{token}/accesses` | List share accesses | Required (owner) |

## Configuration

All storage settings live under the `storage:` key in `settings.yml`:

```yaml
storage:
  enabled: true                  # Requires security.enableLogin = true
  provider: local                # 'local' or 'database'
  local:
    basePath: './storage'        # Filesystem base directory (local provider only)
  quotas:
    maxStorageMbPerUser: -1      # Per-user storage cap in MB; -1 = unlimited
    maxStorageMbTotal: -1        # Total storage cap in MB; -1 = unlimited
    maxFileMb: -1                # Max size per upload (main + history + audit) in MB; -1 = unlimited
  sharing:
    enabled: false               # Master switch for all sharing (opt-in)
    linkEnabled: false           # Enable token-based share links (requires system.frontendUrl)
    emailEnabled: false          # Enable email notifications (requires mail.enabled)
    linkExpirationDays: 3        # Days until share links expire
```

**Prerequisites:**
- `storage.enabled` requires `security.enableLogin = true`
- `sharing.linkEnabled` requires `system.frontendUrl` to be set (used to build share link URLs)
- `sharing.emailEnabled` requires `mail.enabled = true`

## Security Considerations

### Access Control
- All endpoints require authentication — there is no anonymous access
- Owner-only operations enforced in service layer (not just controller)
- `requireReadAccess` / `requireEditorAccess` checked on every download

### Share Link Security
- Tokens are UUIDs (random, not guessable)
- Expiration enforced on every access
- Expired links return HTTP 410 Gone
- Revoked links delete all access records

### Quota Enforcement
- Checked before storing (not after)
- Accounts for existing file size when replacing (only the delta counts)
- Covers main file + history bundle + audit log in a single check

## Automatic Cleanup

`StorageCleanupService` runs two scheduled jobs daily:

1. **Orphaned storage cleanup** — processes up to 50 `StorageCleanupEntry` records, deletes the physical storage object, then removes the entry. Failed attempts increment `attemptCount` for retry.

2. **Expired share link cleanup** — deletes all `FileShare` records where `expiresAt` is in the past and `shareToken` is set.

## Troubleshooting

**"Storage is disabled":**
- Check `storage.enabled: true` in settings
- Verify `security.enableLogin: true`

**"Share links are disabled":**
- Check `sharing.linkEnabled: true`
- Verify `system.frontendUrl` is set and non-empty

**"Email sharing is disabled":**
- Check `sharing.emailEnabled: true`
- Verify `mail.enabled: true` and mail configuration

**Signing-session PDF appearing in the general file list:**
- This is expected — signing PDFs are accessible to owners and shared users
- Filter by `file_purpose` (`SIGNING_ORIGINAL`, `SIGNING_SIGNED`) in the UI to distinguish them

**Share link returns 410:**
- Link has expired — check `expires_at` in `file_shares` table
- Owner must create a new link

### Debug Queries

```sql
-- List files and their share counts
SELECT sf.stored_file_id, sf.original_filename, u.username as owner,
       COUNT(DISTINCT fs.file_share_id) FILTER (WHERE fs.shared_with_user_id IS NOT NULL) as user_shares,
       COUNT(DISTINCT fs.file_share_id) FILTER (WHERE fs.share_token IS NOT NULL) as link_shares
FROM stored_files sf
LEFT JOIN users u ON sf.owner_id = u.user_id
LEFT JOIN file_shares fs ON fs.stored_file_id = sf.stored_file_id
GROUP BY sf.stored_file_id, u.username;

-- Check share link expiration
SELECT share_token, access_role, created_at, expires_at,
       expires_at < NOW() as is_expired
FROM file_shares
WHERE share_token IS NOT NULL;

-- Check access history for a share link
SELECT u.username, fsa.access_type, fsa.accessed_at
FROM file_share_accesses fsa
JOIN file_shares fs ON fsa.file_share_id = fs.file_share_id
JOIN users u ON fsa.user_id = u.user_id
WHERE fs.share_token = '{token}'
ORDER BY fsa.accessed_at DESC;

-- Pending cleanup entries
SELECT storage_key, attempt_count, updated_at
FROM storage_cleanup_entries
ORDER BY updated_at ASC;
```

## Summary

The File Sharing feature provides:
- ✅ Server-side file storage with pluggable backend (local/database)
- ✅ History bundle and audit log attachments per file
- ✅ Direct user-to-user sharing with EDITOR/COMMENTER/VIEWER roles
- ✅ Token-based share links with expiration
- ✅ Optional email notifications for shares
- ✅ Per-access audit trail for share links
- ✅ Storage quotas (per-user, total, per-file)
- ✅ Automatic cleanup of expired links and orphaned storage
- ✅ Workflow integration (signing-session PDFs stored via same infrastructure; participant access via `WorkflowParticipant.shareToken`)
