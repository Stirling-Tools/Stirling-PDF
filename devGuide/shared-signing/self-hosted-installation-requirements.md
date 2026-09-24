# Shared Signing: self-hosted installation requirements

Verified 24 September 2026 against commit `910b5d012f` plus the local signing patch and current official documentation. This is a configuration and entitlement breakdown, not a production sign-off. Uploaded-certificate finalization and lifecycle safeguards have been repaired and retested locally; licensed deployments and backup restoration still need their own acceptance runs.

## Is the feature currently gated?

There are separate build, configuration, authentication and license gates. “Proprietary” is the source/build module containing server functionality; it does not mean every feature in that module requires payment.

| Capability | Current configuration requirement | Current license boundary |
|---|---|---|
| Store files on local disk | Login + `storage.enabled=true`, provider `local`, writable base path | No paid license, when optional file encryption is off |
| Shared Signing with uploaded certificates | Above + `storage.signing.enabled=true`; assigned registered participants | No paid license with local storage |
| Database BLOB file storage | `storage.provider=database` | Effective SERVER or ENTERPRISE entitlement |
| S3-compatible file storage | `storage.provider=s3` plus bucket/endpoint/credentials configuration | Effective SERVER or ENTERPRISE entitlement |
| Encrypt stored PDFs at rest, including local storage | `storage.encryption.enabled=true`, retained master key | Effective SERVER or ENTERPRISE entitlement |
| Managed Personal certificate | Paid certificate selector; stored/generated per user | Effective SERVER or ENTERPRISE entitlement; patched shared-signing API rejects unlicensed submissions |
| Managed Organization/Server certificate | Paid certificate selector + `system.serverCertificate.enabled=true` + usable keystore | Paid in UI and server-certificate service |
| Platform audit logging, including storage encryption audit events | Audit enabled at suitable level and retained database capacity | Enterprise |

The documentation calls the paid certificate/storage boundary Pro/Enterprise. The code uses `SERVER`/`ENTERPRISE`; a purchased linked Team entitlement can promote the effective tier to SERVER. An installed key and a linked Team entitlement are alternative entitlement mechanisms, not two requirements. Confirm the effective server tier rather than infer it from a marketing plan name.

The main [Shared Signing guide](https://docs.stirlingpdf.com/Functionality/Security/Shared-Signing/) and [storage guide](https://docs.stirlingpdf.com/Configuration/Storage/File-Sharing-Storage/) describe the free local/uploaded path. The [Security overview](https://docs.stirlingpdf.com/Functionality/Security/) still broadly labels Shared Signing Pro/Enterprise. That overview is inconsistent with the specific guide, implementation and observed unlicensed workflow.

Paid storage is checked at configuration/startup and wrapped with a runtime write guard. Entitlement loss pauses new paid-storage writes while existing content remains readable with the necessary configuration/keys. Do not interpret read access after expiry as permission for new paid processing.

## Required for every Shared Signing installation

| Installation requirement | What the operator must provide | How to verify |
|---|---|---|
| Correct application package | A server build containing authentication and workflow/storage modules; standard supported server deployment with matching frontend/backend | Users can log in; Shared Signing APIs exist; effective feature flags are true |
| Authentication and accounts | `security.enableLogin=true`; enabled accounts for coordinator and every participant; adequate user capacity | Test with ordinary users and confirm intended names appear in the participant picker |
| Durable document storage | One provider, sufficient space/quota, correct write permissions; mount the local base path if using containers | Upload, create request, restart, reopen and retrieve |
| Durable application database | Preserve users, participant/status records, file references and managed Personal certificates; default embedded H2 can be used | Restart preserves the request and identity records; restore rehearsal works |
| Persistent configuration/key material | Retain settings and the generated application key, plus applicable certificate/file-encryption keys | Pending certificate data remains decryptable after restart/restore |
| Enabled workflow | `storage.enabled=true` and `storage.signing.enabled=true` | `/api/v1/config/app-config` reports `storageEnabled` and `storageGroupSigningEnabled` as true |
| Reachable web service | Browser-reachable instance URL; HTTPS for real credentials and private-key uploads; correct frontend URL/reverse-proxy routing | Participant can log in, review, submit and download through the intended external address |
| Certificate source | At least one usable source: each user's uploaded certificate/private key, or enabled licensed managed sources | Check identity/validity; verify actual digital signatures in a completed PDF |

The normal free user allowance in this checkout is five accounts; grandfathered limits and purchased capacity can change the effective allowance. Check the instance's actual admission limit before arranging a larger signing group. Do not assume free Shared Signing means unlimited user accounts.

For source builds, use the server/proprietary flavor and include security/additional features. `DOCKER_ENABLE_SECURITY=false` or `DISABLE_ADDITIONAL_FEATURES=true` can exclude required functionality at build time. Setting a runtime login flag cannot restore classes omitted from a stripped build. For packaged deployment, start with the [official Docker installation guide](https://docs.stirlingpdf.com/Installation/Docker%20Install/) and pin the version that passes the release gates. This checkout requires JDK 25 when building/running its development environment; packaged images supply their own runtime.

## Baseline configuration

Merge this into an existing instance's settings; it is not a complete deployment file. `/storage` is the container path in this example and must be mounted persistently. Use an appropriate absolute path for a bare-JAR installation.

```yaml
security:
  enableLogin: true

storage:
  enabled: true
  provider: local
  local:
    basePath: /storage
  signing:
    enabled: true
    userListScope: org

system:
  frontendUrl: https://pdf.example.com
```

Equivalent relevant environment variables:

```text
SECURITY_ENABLELOGIN=true
STORAGE_ENABLED=true
STORAGE_PROVIDER=local
STORAGE_LOCAL_BASEPATH=/storage
STORAGE_SIGNING_ENABLED=true
STORAGE_SIGNING_USERLISTSCOPE=org
SYSTEM_FRONTENDURL=https://pdf.example.com
```

`org` lists enabled users across the instance; the current implementation treats any other value as team scope. Use `team` deliberately where required and validate membership. The actual binding is **`storage.signing.userListScope`**, as shown above. The local patch corrects its former placement under `storage.encryption` in `settings.yml.template`. Existing installations should check their saved setting explicitly.

File sharing is a separate switch. `storage.sharing.enabled`, share-link settings and email-sharing settings are not prerequisites for the registered-user Shared Signing workflow.

## Additional requirements for all certificate choices

For the full supported certificate selector - uploaded, Personal and Organization/Server - add a valid paid entitlement and a usable server certificate. Local storage remains a valid choice; there is no requirement to buy or operate S3 just to unlock managed signing.

1. **Activate the entitlement.** Use the supported instance activation/account-link flow. For an installed license key, this checkout reads `premium.enabled=true` and `premium.key` (environment names `PREMIUM_ENABLED` / `PREMIUM_KEY`). The key may be supplied by a protected mounted file using `file:/path/to/license`. A paid linked Team entitlement can independently grant Server features. Keep activation material out of distributed customer examples. Verify `runningProOrHigher=true` after activation.
2. **Enable and initialize the server certificate.** Add the block below. After startup/activation, verify certificate availability and identity in the admin settings; a true setting alone does not prove the keystore was successfully created.
3. **Choose the organization identity.** Use the auto-generated certificate for evaluation/internal trust, or upload the organization's `.p12`/`.pfx` private-key keystore through the supported admin certificate settings. A website's HTTPS certificate is a separate concern from the PDF signing certificate.
4. **Preserve managed keys.** The organization keystore is stored as `configs/server-certificate.p12`. Personal certificates are generated/stored per account in the application database. Preserve database and configuration together; do not regenerate the organization certificate on every restart.
5. **Define recipient trust.** A cryptographically valid self-signed certificate is not automatically trusted by an external reader. Agree the CA/trust anchors, validation/revocation policy and recipient PDF reader. Stirling's own trust settings do not configure Acrobat or other clients automatically. See [Certificate Signing](https://docs.stirlingpdf.com/Functionality/Security/Certificate-Signing/) for supported sources and validation configuration.

```yaml
system:
  serverCertificate:
    enabled: true
    organizationName: Your Organisation
    validity: 365
    regenerateOnStartup: false
```

Environment equivalents are `SYSTEM_SERVERCERTIFICATE_ENABLED`, `SYSTEM_SERVERCERTIFICATE_ORGANIZATIONNAME`, `SYSTEM_SERVERCERTIFICATE_VALIDITY`, and `SYSTEM_SERVERCERTIFICATE_REGENERATEONSTARTUP`.

The browser shared-signing flow sends uploaded private-key material to the server for pending submissions and later finalization. The installation must be acceptable as a custodian of that material. Hardware-backed, non-exportable desktop keys are a separate certificate-signing capability; they are not an additional prerequisite or a verified option in this Shared Signing journey.

## Storage, database and backup distinctions

- **Local files still need a database.** PDFs live in the local directory; users, sessions, signer records and file pointers live in the application database. Preserve both. In the standard container layout, mount `/configs` and the selected `/storage` path.
- **`storage.provider=database` is not the same as an external database.** The former stores file contents as BLOBs in the configured application database. Switching the application's metadata database from embedded H2 to external PostgreSQL is a separate setting and paid capability. Current code gates custom-database processing at Pro-or-higher; the template's “Enterprise users ONLY” comment is outdated. See [External Database](https://docs.stirlingpdf.com/Configuration/Storage/External%20Database/).
- **S3 is optional.** If selected, provide the bucket, region, correct endpoint style and credentials/role permissions to write, read and delete objects. Keep the application database and configuration persistent as well. Follow the vendor-specific settings in the [storage guide](https://docs.stirlingpdf.com/Configuration/Storage/File-Sharing-Storage/).
- **Encryption is a separate paid option even on local disk.** `storage.encryption.enabled=true` adds PDF/blob encryption. Retain its master key (`configs/file-encryption.key` by default, or the configured secret) as well as the DB key registry. This is distinct from the application's generated key used to encrypt pending certificate metadata.
- **Backup set:** document blobs + database + configuration/generated application key + organization certificate + optional file-encryption master key. Verify restoration with a pending request and a finalized document. A PDF-only backup cannot restore the workflow.
- **Multiple nodes add requirements.** Nodes need consistent metadata, shared file access/provider and matching keys; file-encryption cluster mode requires an explicit identical master key. The single-node example does not constitute a verified clustered deployment.

## Optional dependencies and limits

| Requirement someone might assume | Actual status |
|---|---|
| SMTP/email service | Not required for the tested registered-user signing journey. Needed for separate email-dependent functions. Configuring SMTP does not implement missing signing invitations/reminders. |
| Public access / external guest accounts | Participants need access to the instance, which can be through a private network. Normal Shared Signing requires registered users; anonymous guest signing is not verified. |
| External PostgreSQL or S3 | Optional deployment choices; embedded DB plus persistent local storage supports the base workflow. |
| Separate signing server, OCR, LibreOffice, AI engine or Redis | None is a dependency of the reviewed single-node Shared Signing path. Use the packaged backend's PDF/cryptography support. |
| Public CA certificate or time-stamp service | Not necessary for an internal synthetic signing demonstration. Recipient trust, revocation network access and trusted timestamp requirements depend on the customer's evidence requirements and must be validated separately. |
| Enterprise license | Not required solely for the three certificate choices if the effective Server entitlement is available. Required for the platform audit subsystem. A signing summary page and session statuses are not the same as that audit subsystem. |

If platform audit evidence is required, enable and size the Enterprise audit subsystem and its retention settings; do not infer that every desired business event is captured without testing. See [Audit Logging](https://docs.stirlingpdf.com/Configuration/Security/Audit%20Logging/). Storage encryption works on the Server tier, but its encryption/decryption/key lifecycle audit events use that Enterprise subsystem.

## Acceptance before handing the installation to users

Use the [release-gate plan](./release-gate-plan.md). At minimum: two ordinary users submit distinct certificates, owner finalizes, final PDF contains the expected valid digital signatures and visible marks, both parties retrieve it, and pending/completed requests survive restart. Negative cases must reject late signing, viewer signing and expired access. Recheck the actual downloaded artifact, not a green Signed label.

Use a release containing the signing fixes and verify its behavior. Flags and a license alone cannot substitute for the output, permission and persistence acceptance tests. A successful local unlicensed run does not sign off licensed Personal/Organization certificates, S3/database storage, encryption-at-rest recovery, SSO or clustered installations.

## Implementation evidence

Repository paths refer to the evaluated base and local patch; line numbers below identify the original review and may shift with the patch:

- `app/core/.../controller/api/misc/ConfigController.java:274-292`: login/storage/signing availability; no license check in the group-signing flag.
- `app/proprietary/.../workflow/service/WorkflowSessionService.java:85`: storage/signing switches; no whole-feature paid gate.
- `app/proprietary/.../storage/config/StorageProviderConfig.java:75,136-177`: encryption and database/S3 paid checks; local provider available without them.
- `app/proprietary/.../storage/provider/LicensedStorageProvider.java:16`: runtime paid-write guard with reads retained.
- `frontend/editor/src/core/components/tools/certSign/CertificateSelector.tsx:51`: managed options gated by `runningProOrHigher`.
- `app/proprietary/.../service/ServerCertificateService.java:68-110`: paid-tier/configuration/keystore checks. The patched workflow submission services also check entitlement before accepting managed Personal/Server certificates, including participant-token submissions.
- `app/proprietary/.../security/configuration/ee/LicenseKeyChecker.java:89-136`: installed-key verification and linked Team promotion.
- `app/proprietary/.../security/configuration/ee/DatabaseLicenseGuard.java:20`: effective Pro-or-higher guard for custom application DB processing.
- `app/proprietary/.../service/UserLicenseSettingsService.java:54,305`: default user allowance and effective capacity calculation.
- `app/common/.../model/ApplicationProperties.java:1498`: actual signing picker configuration binding.
- `app/proprietary/.../workflow/service/MetadataEncryptionService.java:22,123`: pending certificate metadata uses the persisted generated application key.
- `devGuide/STORAGE_ENCRYPTION_AT_REST.md`: blob key management, license and audit distinctions.
