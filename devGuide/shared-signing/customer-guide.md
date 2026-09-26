# Shared Signing: customer guide supplement

24 September 2026 | Updated local demonstration build

This supplement covers the navigation and practical decisions verified in the local signing patch. It is not a statement that these changes are already in a published release. Use synthetic documents for the demonstration; confirm the customer deployment separately.

## Start with the official instructions

| Topic | Official reference | What this supplement adds |
|---|---|---|
| Shared Signing | [Shared Signing guide](https://docs.stirlingpdf.com/Functionality/Security/Shared-Signing/) | Current Sign menu, compact request form and finalization safeguards. |
| Accounts and login | [System and Security](https://docs.stirlingpdf.com/Configuration/Security/System%20and%20Security/) | Check ordinary participant accounts before the meeting. |
| Persistent files | [File Sharing and Storage](https://docs.stirlingpdf.com/Configuration/Storage/File-Sharing-Storage/) | Preserve PDFs, database and configuration together. |
| Certificates and trust | [Certificate Signing](https://docs.stirlingpdf.com/Functionality/Security/Certificate-Signing/) | Distinguish a submitted contribution, a finalized PDF and recipient trust. |
| Deployment | [Production Deployment Guide](https://docs.stirlingpdf.com/Production-Deployment-Guide/) | Rehearse on the exact externally reachable deployment. |

The official feature remains alpha. The tested setup uses ordinary registered accounts, local storage and uploaded test certificates. Licensed managed certificates, S3/database storage, SSO and external email delivery are not covered by this local demonstration.

## Owner: create and complete a request

1. Open one PDF. Click **Sign** in the permanent navigation rail, then **Request signatures**. The current PDF is carried into the form. When no PDF is selected, sending is disabled; choose a file from the library.
2. Choose the named participants. Their names stay visible in the picker beside the document and optional due date. Expand **Appearance and summary page (optional)** only when needed, then **Send signing request**.
3. Tell participants to open **Sign > Signing sessions** on the same server. Sending a request creates the session; it does not establish that an email was delivered. All participants may sign in any order. The due date is advisory.
4. Open your session to review individual statuses and the signature count. **Mine + Overdue** finds your sessions with past due dates. A submitted signature stays in Active until the owner finalizes.
5. Finalize when the required people have signed. At least one signature is required. Early finalization asks you to confirm which people are included and which will be left out. Cancel if an outstanding signature is still needed.
6. Open the final PDF from Completed or load it into Active Files. Download it and use **Validate PDF Signature** to check the expected signer count, identities and integrity. Check certificate trust separately in the recipient's intended PDF reader.

Finalization closes the request: outstanding participants cannot sign afterward. Create a new request if the document or intended signers must change. Submitted contributions cannot be edited in place. Participant removal is available while the session is active and revokes that invitation's access.

## Participant: review, sign or decline

1. Open **Sign > Signing sessions**, select the request, and review the owner and PDF.
2. Optionally draw, type or upload a visible mark, select **Use signature**, and click the page. Move, resize or delete marks before submission. Check their position and size at normal zoom. Typed marks now export without the large empty preview canvas.
3. Choose **Complete & Sign**. This also works without a visible mark. Select your uploaded certificate format: PKCS12/PFX, JKS, or PEM with both certificate and private-key files. The certificate password is separate from your Stirling password.
4. Wait for validation and check the displayed certificate subject and validity dates. Invalid or still-checking uploads cannot be submitted. Correct the file/password and retry; existing placed marks remain. **Sign Document** submits your contribution.
5. **Submitted - awaiting finalization** means the owner still needs to produce the final PDF. After finalization the request appears in Completed and opens the final document. Use **Add to Active Files** to retain it in your workspace for download.

If you cannot approve the document, use **Decline Request**. Decline is immediate and the current interface has no reason field or undo. A visible handwritten mark, a summary page and a digital certificate signature are different forms of evidence. A valid self-signed test certificate demonstrates integrity; it does not automatically establish trust for an outside recipient.

## Administrator: deployment acceptance checks

Use the official guides for installation commands and the companion self-hosted requirements document for the full configuration breakdown. Before a customer rollout, verify these points on the actual installation:

- Install a server package containing login, storage and workflow functionality, with matching frontend and backend versions. A runtime flag cannot restore features omitted from the build.
- Enable login, storage and shared signing. For the local/uploaded path, use the local provider and a persistent, writable storage path. A paid license is not required for that path; managed certificates and paid storage/encryption capabilities have separate entitlement requirements.
- Create enabled coordinator and participant accounts within the installation's effective user allowance. Verify the organization/team picker scope. Its setting is **storage.signing.userListScope**.
- Preserve the document store, application database and configuration/key material together. Restart the instance and retrieve both a final PDF and a pending request; then rehearse a backup restore.
- Publish the correct frontend URL through HTTPS and the intended reverse proxy. Check access from a participant's network, including certificate uploads and final downloads.
- Supply valid certificates and accessible private keys. For managed certificate options, enable and verify the licensed server configuration. Establish recipient trust anchors and any revocation policy separately.
- Rehearse the complete workflow on the pinned deployment version. Compare expected signatures with the finalized PDF. Exercise early closure, revoked access and an invalid upload.

SMTP is not a requirement for the demonstrated in-app request flow. Do not promise invitation delivery, reminders, guest onboarding or enforced signing order from this demonstration. Successful token API tests alone do not establish a customer-ready guest invitation journey.
