# Storage Encryption at Rest

Encrypts files stored by Stirling (My Files, workflow files) so the bytes on disk, in the database,
or in S3 are unreadable without the master key. Requires a Pro or Enterprise licence to enable.

> **Back up the master key.** Losing it makes every encrypted stored file permanently
> unrecoverable. There is no recovery path by design — that is what makes the encryption
> meaningful.

> **Audit trail requires Enterprise.** Encryption itself works on Pro, but the audit events
> below (encrypt, decrypt, revocation, plaintext export, migration) are only recorded on an
> Enterprise licence — the audit subsystem is Enterprise-gated platform-wide. On Pro the files
> are encrypted exactly the same way, but there is no access trail, which matters if you are
> enabling this to satisfy an audit-logging requirement (HIPAA, CMMC). A warning is logged at
> startup when encryption is enabled without an Enterprise licence.

## How it works

Envelope encryption, three levels:

| Level | What it is | Where it lives |
|---|---|---|
| Master key | Wraps the scope keys | Config property, env var, or `configs/file-encryption.key` |
| Scope key (KEK) | One per team; wraps each file's data key | `file_encryption_keys` table, master-key-wrapped |
| Data key (DEK) | One per stored blob; encrypts the bytes | Inside the blob's own header, scope-key-wrapped |

Each blob is self-describing: an `SPDFEAR1` header carries the format version, the scope key's id,
the plaintext length, and the wrapped data key, followed by AES-256-GCM streaming ciphertext
(1 MiB segments). The header is bound as associated data to both the key wrap and the payload, so a
header cannot be transplanted between blobs.

Consequences of that design worth knowing:

- Blobs without the magic prefix are treated as plaintext and passed through, so enabling the
  feature needs no migration and old files keep working.
- Because the key id is pinned per blob, moving a user between teams never breaks their existing
  files.
- Plaintext sizes are what get recorded in the database, so quotas and `Content-Length` are
  unaffected (ciphertext on disk is ~96 bytes + 16 bytes/MiB larger).
- Presigned S3 download URLs are suppressed once encrypted content can exist — a presigned GET
  would hand raw ciphertext to the browser — so those downloads stream through the application.

## Enabling it

```yaml
storage:
  encryption:
    enabled: true
```

The master key is resolved in this order:

1. `stirling.security.fileEncryptionKey` property
2. `STIRLING_FILE_ENCRYPTION_KEY` environment variable
3. an auto-generated `configs/file-encryption.key` (owner-only permissions)

Generate a key with:

```bash
openssl rand -base64 32
```

It must decode to exactly 32 bytes; anything else fails at startup rather than silently
downgrading the cipher. The startup log prints a fingerprint (a SHA-256 prefix, never the key) so
you can verify a backup matches the live key.

**Cluster mode** (`cluster.enabled=true`) requires the key to be set explicitly and identically on
every node; the auto-generated file is refused, because a node-local key would make files written
elsewhere unreadable.

### Turning it off

Disabling only stops encrypting *new* writes. Existing encrypted files stay readable as long as the
key material is present — the decrypt path is always active and is never licence-gated, so a lapsed
licence cannot lock you out of your own data.

## Encrypting files that already exist

Enabling the flag does not touch the existing plaintext backlog. To convert it:

```bash
curl -X POST  http://localhost:8080/api/v1/admin/storage-encryption/migrate
curl          http://localhost:8080/api/v1/admin/storage-encryption/migrate/status
```

The job is throttled, resumable, and safe to re-run: for each file it writes the encrypted copy
under a new storage key, swaps the database row only if nothing else changed it, and deletes the old
blob last. If a user replaces a file mid-migration their copy wins and the job skips it. Progress is
in-memory, so a restart mid-run loses the counters and `migrate/status` reports `IDLE` again — just
start it again; already-encrypted files are skipped. There is currently no way to cancel a run, and
on a cluster the guard is per-node, so trigger the migration on one node only.

## Revoking access (kill switch)

Disabling a scope key makes every file under it fail closed with `403` until it is re-enabled:

```bash
curl -X POST http://localhost:8080/api/v1/admin/storage-encryption/keys/{keyId}/disable
curl -X POST http://localhost:8080/api/v1/admin/storage-encryption/keys/{keyId}/enable
```

This is reversible: the key material stays in the database and nothing is destroyed. No API path
deletes key material. On a cluster, other nodes pick the change up within their 60-second key-cache
window.

## Rotating the master key

Rotation only re-wraps the small `file_encryption_keys` table — file contents are never rewritten.

1. Set the new key as `stirling.security.fileEncryptionKey`.
2. Keep the outgoing key in `stirling.security.fileEncryptionKeyPrevious`.
3. Bump `stirling.security.fileEncryptionKeyVersion`.
4. Restart. Startup warns about rows still wrapped by the previous key.
5. `POST /api/v1/admin/storage-encryption/master/rotate`.
6. Remove `fileEncryptionKeyPrevious` and restart.

Key material is never accepted over HTTP; the endpoint only performs the re-wrap step.

## Auditing

**Requires an Enterprise licence** (see the note at the top): on Pro these events are silently
dropped by the audit subsystem, and a warning is logged at startup.

Encrypt, decrypt, denied-decrypt, key lifecycle, rotation, and migration events are written to the
audit trail, along with a `plaintextExport` marker whenever a plaintext copy of encrypted content is
served. Per-read decrypt events can be noisy on busy instances and can be turned off with
`storage.encryption.auditReads: false`; denials and key lifecycle events are always recorded.

Two semantics worth knowing when reading the trail:

- A `decrypt` event means a decryption was *authorised and opened*, not that bytes were read to
  completion — a load that is discarded still records one, and a re-read of the same open resource
  (e.g. an HTTP range request) does not record a second.
- `plaintextExport` is currently emitted for stored-file and share-link downloads. Workflow-file
  downloads are not yet marked.

## Status and backup verification

```bash
curl http://localhost:8080/api/v1/admin/storage-encryption/status
```

Reports whether writes are encrypted, the master-key fingerprint, encrypted vs plaintext file
counts, and every key row with its status history. All endpoints under
`/api/v1/admin/storage-encryption` require an admin account.

## What this protects against

Stolen disks, database dumps, exposed object-storage buckets, decommissioned media, and platform
users who are not authorised for a file. It is not a defence against an attacker who already has
root on a running instance — at that point the key is in memory. No storage-level encryption product
claims otherwise.
