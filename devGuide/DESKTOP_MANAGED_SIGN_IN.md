# Managed desktop sign-in and document privacy

The desktop MSI and `stirling-provisioning.json` support three independent policies:

| JSON setting | MSI property | Effect when true |
| --- | --- | --- |
| `requireSignIn` | `STIRLING_REQUIRE_SIGN_IN=1` | Requires a verified account session before mounting the workbench or background file handlers. Removes guest/local-only access. Logout returns to sign-in. |
| `saasOnly` | `STIRLING_SAAS_ONLY=1` | Restricts account connections to Stirling Cloud. Removes self-hosted sign-in and rejects self-hosted connection changes and SSO callbacks. |
| `localProcessingOnly` | `STIRLING_LOCAL_PROCESSING_ONLY=1` | Restricts document processing to the bundled backend. Hides cloud-only tools and disables document storage, sharing, shared signing and server automation. |

All default to false. Set the first two to require Stirling Cloud sign-in. `saasOnly` alone still permits local use without an account; `requireSignIn` alone permits either account type. Add `localProcessingOnly` to keep documents on the device regardless of the account type.

## Windows deployment through Intune or another distributor

Use a device installation in system context with the MSI properties:

```powershell
msiexec.exe /i Stirling-PDF.msi /qn ALLUSERS=1 STIRLING_REQUIRE_SIGN_IN=1 STIRLING_SAAS_ONLY=1 STIRLING_LOCAL_PROCESSING_ONLY=1
```

Alternatively, deploy this file as an administrator to `%ProgramData%\Stirling-PDF\stirling-provisioning.json`:

```json
{
  "requireSignIn": true,
  "saasOnly": true,
  "localProcessingOnly": true
}
```

Keep that file writable only by administrators/system and readable by app users. It is retained and reapplied at every launch, including for existing profiles. Machine provisioning takes precedence over a file in the user's app-data directory. Restart the app after changing the policy.

The same JSON works at `/Library/Application Support/Stirling-PDF/stirling-provisioning.json` on macOS and `/etc/stirling-pdf/stirling-provisioning.json` on Linux. Per-user provisioning remains available for initial configuration, but its file is consumed after application and is not a durable machine policy.

## Existing self-hosted deployments

To require sign-in to a particular self-hosted server:

```json
{
  "serverUrl": "https://pdf.example.org",
  "lockConnectionMode": true,
  "requireSignIn": true,
  "saasOnly": false
}
```

`lockConnectionMode` retains its existing meaning: lock the configured server while allowing local fallback unless `requireSignIn` is also enabled. A JSON file combining `saasOnly: true` with a nonempty `serverUrl` is invalid and prevents startup. When the MSI sets SaaS-only, the provisioner removes any previous self-hosted URL and lock from its output.

## Document privacy

`localProcessingOnly` keeps sign-in, account management and billing available. It applies to both SaaS and self-hosted connections: signing in does not permit documents to leave the device. The app offers only locally supported tools and conversion formats, with no cloud fallback when a dependency is unavailable or the bundled backend is starting.

The policy disables server storage (Stirling library), file sharing, shared signing, mobile document/signature transfer, AI chat/classification and server pipelines/processing folders. Timestamping is also unavailable because it sends a document digest to a timestamp authority. Ordinary local signing, local files and mounted local folders remain available. Cached server folders and files are hidden without deleting them; the library's local view is labelled **Local files**.

The desktop request layer blocks document requests to SaaS, self-hosted and signed upload URLs, including background tasks and stale UI actions. Requests under the policy cannot follow HTTP redirects, and services that can forward document data are blocked even on the bundled backend. Raw AI streaming and server automation also check the policy before resolving a destination. Unreadable policies fail closed.

This is an application policy, not an operating-system firewall or DLP boundary. It does not prevent other programs from accessing or transmitting files, or prevent a user from opening the SaaS website outside the desktop app. Existing documents on a server are not deleted.

## Session and policy lifecycle

Managed access validates the account with the selected authentication server at launch and when the token changes. A token left over from a different server, an anonymous Cloud session, or an expired token that cannot refresh does not grant access. A verified, unexpired session can continue using local tools while offline; starting a new app session requires the authentication server to be reachable. This policy does not disable local processing for signed-in users.

Logout and session expiry return to the required sign-in screen. Previously completed onboarding and a saved local-mode preference cannot bypass the requirement. Policy read errors do not fall back to guest access.

Omitted policy properties preserve their stored values. To remove a requirement, deploy explicit `false` values (or MSI properties set to `0`) and restart. Later MSI provisioning updates merge with the existing provisioning file so update-only changes preserve all three policies. Removing the provisioning file alone does not clear already stored settings.

These settings control access in the desktop application. They do not add authentication to the bundled local backend or restrict which Stirling Cloud organisation a user may join.
