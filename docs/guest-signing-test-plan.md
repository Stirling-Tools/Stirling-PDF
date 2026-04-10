# Guest Signing — Test Plan

## Automated coverage summary

The following scenarios are already covered by automated tests and **do not need manual testing**:

| Area | Coverage | Test file |
|------|----------|-----------|
| Guest certificate generation (PKCS12, SAN, key usage) | Unit | `GuestCertificateServiceTest.java` |
| EKU is `emailProtection` (not `codeSigning`) | Unit | `GuestCertificateServiceTest.java` |
| Password determinism / uniqueness | Unit | `GuestCertificateServiceTest.java` |
| GUEST_CERT defaulted for external participants | Unit | `WorkflowParticipantControllerTest.java` |
| Registered users not defaulted to GUEST_CERT | Unit | `WorkflowParticipantControllerTest.java` |
| Audit trail: IP hashed, UA stored, timestamp present | Unit | `WorkflowParticipantControllerTest.java` |
| Audit trail: User-agent truncated at 500 chars | Unit | `WorkflowParticipantControllerTest.java` |
| Audit trail: null IP stored as null (not exception) | Unit | `WorkflowParticipantControllerTest.java` |
| GUEST_CERT password not stored in metadata | Unit | `WorkflowParticipantControllerTest.java` |
| Expired token → 403 | Unit | `WorkflowParticipantControllerTest.java` |
| Already-SIGNED → 400 | Unit | `WorkflowParticipantControllerTest.java` |
| Already-DECLINED → 400 | Unit | `WorkflowParticipantControllerTest.java` |
| Unknown token → 403 | Unit | `WorkflowParticipantControllerTest.java` |
| Blank token → 400 | Unit | `WorkflowParticipantControllerTest.java` |
| HTML injection in email: docName, ownerName, message | Unit | `EmailServiceTest.java` |
| `javascript:` URL replaced with `#` in email | Unit | `EmailServiceTest.java` |
| Email sends for null optional params | Unit | `EmailServiceTest.java` |
| `/sign/:token` — loading spinner shown | E2E | `GuestSigningE2E.spec.ts` |
| `/sign/:token` — expired (403) page | E2E | `GuestSigningE2E.spec.ts` |
| `/sign/:token` — already-SIGNED state on load | E2E | `GuestSigningE2E.spec.ts` |
| `/sign/:token` — already-DECLINED state on load | E2E | `GuestSigningE2E.spec.ts` |
| `/sign/:token` — 500 error page | E2E | `GuestSigningE2E.spec.ts` |
| Signing form renders with doc name, owner, message | E2E | `GuestSigningE2E.spec.ts` |
| PDF iframe present with correct src | E2E | `GuestSigningE2E.spec.ts` |
| Auto-cert selected by default + info alert | E2E | `GuestSigningE2E.spec.ts` |
| Switching to P12 shows file + password inputs | E2E | `GuestSigningE2E.spec.ts` |
| Switching back to auto-cert hides P12 inputs | E2E | `GuestSigningE2E.spec.ts` |
| Submit → success page; FormData contains GUEST_CERT + token | E2E | `GuestSigningE2E.spec.ts` |
| Submit failure shows error with server message | E2E | `GuestSigningE2E.spec.ts` |
| Submit button disabled while in-flight | E2E | `GuestSigningE2E.spec.ts` |
| Decline → opens modal with correct title + body | E2E | `GuestSigningE2E.spec.ts` |
| Decline → Cancel closes modal, form still visible | E2E | `GuestSigningE2E.spec.ts` |
| Decline → Confirm transitions to declined state | E2E | `GuestSigningE2E.spec.ts` |
| SelectParticipantsStep — registered/external tabs | Unit | `SelectParticipantsStep.test.tsx` |
| SelectParticipantsStep — email validation + duplicates | Unit | `SelectParticipantsStep.test.tsx` |
| SelectParticipantsStep — add by button / Enter key | Unit | `SelectParticipantsStep.test.tsx` |
| SelectParticipantsStep — remove participant | Unit | `SelectParticipantsStep.test.tsx` |
| SelectParticipantsStep — Continue disabled when empty | Unit | `SelectParticipantsStep.test.tsx` |
| GuestSignPage — all page states (loading/expired/signed/etc.) | Unit | `GuestSignPage.test.tsx` |
| GuestSignPage — submit calls correct endpoint | Unit | `GuestSignPage.test.tsx` |

---

## Running the automated tests

```bash
# Backend unit tests (from repo root)
./gradlew :app:proprietary:test \
  --tests "stirling.software.proprietary.workflow.service.GuestCertificateServiceTest" \
  --tests "stirling.software.proprietary.workflow.controller.WorkflowParticipantControllerTest" \
  --tests "stirling.software.proprietary.security.service.EmailServiceTest"

# Frontend unit tests
cd frontend && npm test -- --run \
  src/core/routes/GuestSignPage.test.tsx \
  src/core/components/shared/signing/steps/SelectParticipantsStep.test.tsx

# Frontend E2E (requires dev server running)
cd frontend && npx playwright test src/core/tests/guestSigning/GuestSigningE2E.spec.ts
```

---

## Residual manual test plan

These scenarios require a running system with real SMTP, storage, and a PDF.

### Prerequisites

- Stirling PDF running with the config below applied
- A real SMTP server (or MailHog locally) receiving email
- A test PDF document
- A valid .p12 certificate for the P12 upload test

---

### MT-1 — Owner invites an external guest (email delivery)

**Steps:**
1. Log in as a registered user
2. Open a PDF and start a signing session
3. In the participants step, switch to the **External (by email)** tab
4. Enter a real email address and click Add
5. Continue through the session creation flow
6. Check the inbox of the guest email address

**Expected:**
- Email received with subject `Please sign: <document name>`
- Email shows owner's email, document name, optional message
- "Review and Sign Document" button links to `https://<your-host>/sign/<token>`
- No raw HTML visible in the email body (escaping check)
- No raw IP address visible anywhere in the email

---

### MT-2 — Guest signs with auto-generated certificate (happy path)

**Steps:**
1. Open the signing link from MT-1
2. Verify the loading spinner appears briefly
3. Verify document name and owner info are displayed
4. Verify PDF is visible in the embedded preview
5. Verify **"Use auto-generated certificate (recommended)"** is selected by default
6. Draw a signature in the canvas
7. Click **Submit Signature**

**Expected:**
- Success page: "Your signature has been submitted successfully."
- PDF in session now has a digital signature
- Signature certificate CN includes the guest's email (sanitized)
- Certificate SAN contains `rfc822Name=<email>` — verify in Adobe Acrobat / PDF viewer signature panel
- Participant status in admin panel changed to SIGNED
- Audit trail in database: `ipHash` is a Base64 SHA-256 (not raw IP), `userAgent` matches browser, `submittedAt` timestamp is recent

---

### MT-3 — Guest signs with their own P12 certificate

**Steps:**
1. Open a fresh signing link (new session)
2. Select **"Upload my own certificate"**
3. Upload a valid `.p12` file
4. Enter the certificate password
5. Draw a signature and submit

**Expected:**
- Success page shown
- PDF signed with the uploaded certificate (not a Stirling-generated one)
- Signature visible in PDF viewer with details from the P12

---

### MT-4 — Guest uses an expired signing link

**Steps:**
1. Set a participant's `expires_at` to the past in the database (or wait for expiry)
2. Navigate to the signing link

**Expected:**
- "This signing link has expired." page
- Contact message displayed
- No way to proceed to the signing form

---

### MT-5 — Guest declines and owner is notified

**Steps:**
1. Open a valid signing link
2. Click **Decline**
3. Confirm in the modal

**Expected:**
- "You have declined this signing request." page
- Participant status in session changes to DECLINED
- Session owner sees participant marked as declined in the session view

---

### MT-6 — Duplicate submission prevented

**Steps:**
1. Complete signing (MT-2)
2. Navigate back to the same `/sign/:token` URL

**Expected:**
- Page immediately shows the already-signed state ("Your signature has been submitted successfully.")
- No signing form is shown

---

### MT-7 — Email content security

**Steps:**
1. Create a session with a document named: `<img src=x onerror=alert(1)>.pdf`
2. Send invitation to a guest

**Expected:**
- Email subject: `Please sign: <img src=x onerror=alert(1)>.pdf` (angle brackets visible as text, not rendered)
- Email body: document name appears as text `&lt;img src=x onerror=alert(1)&gt;.pdf`
- No JavaScript executes in the email client

---

### MT-8 — Mobile / responsive layout

**Steps:**
1. Open the signing link on a mobile device or via browser DevTools responsive mode (375px width)

**Expected:**
- Page is usable at mobile width
- PDF preview, certificate chooser, and signature canvas are all visible and usable
- Buttons are appropriately sized for touch

---

### MT-9 — No-email configuration (mail disabled)

**Steps:**
1. Disable `mail.enabled` in config
2. Create a session with an external guest participant

**Expected:**
- Session creation succeeds
- No email is sent (no error in logs)
- Participant status remains `PENDING` (not `NOTIFIED`)
- Operator can still manually share the signing URL from the session detail view

---

## Config required

Add to your `settings.yml` (or environment variables):

```yaml
storage:
  enabled: true          # required for group signing
  signing:
    enabled: true        # enables the signing session feature

mail:
  enabled: true
  host: smtp.example.com     # your SMTP server
  port: 587
  username: stirling@example.com
  password: your-smtp-password
  from: noreply@stirling-pdf.example.com
  startTlsEnable: true       # recommended; use sslEnable: true + port 465 for implicit TLS
```

### Local development with MailHog

MailHog provides a local SMTP server with a web UI at `http://localhost:8025`.

```bash
# Start MailHog (Docker)
docker run -d -p 1025:1025 -p 8025:8025 mailhog/mailhog

# settings.yml for local dev
mail:
  enabled: true
  host: localhost
  port: 1025
  username: ""
  password: ""
  from: test@stirling-pdf.local
  startTlsEnable: false
```

### Environment variable equivalents

```
STIRLING_STORAGE_ENABLED=true
STIRLING_STORAGE_SIGNING_ENABLED=true
MAIL_ENABLED=true
MAIL_HOST=smtp.example.com
MAIL_PORT=587
MAIL_USERNAME=stirling@example.com
MAIL_PASSWORD=secret
MAIL_FROM=noreply@stirling-pdf.example.com
MAIL_STARTTLS_ENABLE=true
```
