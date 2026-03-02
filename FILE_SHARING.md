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

## Workflow Share Integration

`FileShare` records with a non-null `workflow_participant_id` are **workflow shares**. They differ from regular shares:

- Not returned in `GET /api/v1/storage/files` (filtered out)
- Used internally by the signing workflow to link a participant's token to a file
- `isWorkflowShare()` helper distinguishes the two types

This keeps the file manager clean — participants only see signing-workflow files via the workflow-specific endpoints, not in their general file list.

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
    enabled: true                # Master switch for all sharing
    linkEnabled: true            # Enable token-based share links (requires system.frontendUrl)
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

**File listed despite being a workflow file:**
- Workflow participant files should have `workflow_participant_id` set on their `FileShare`
- If appearing in the file list, check `listAccessibleFiles` query filters

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
- ✅ Workflow share integration (signing sessions use `FileShare` for participant access)
