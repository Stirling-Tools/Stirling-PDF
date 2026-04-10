/**
 * E2E tests for the Guest Signing flow (/sign/:token).
 *
 * These tests use Playwright's route mocking to intercept all API calls, so no
 * running backend is required. They cover the full page-state machine from the
 * browser perspective.
 *
 * Run: npx playwright test src/core/tests/guestSigning/GuestSigningE2E.spec.ts
 */

import { test, expect, Page, Route } from '@playwright/test';

// ─── Shared fixtures ─────────────────────────────────────────────────────────

const TOKEN = 'test-share-token-abc';
const SIGN_URL = `/sign/${TOKEN}`;

const SESSION_PAYLOAD = {
  sessionId: 'session-1',
  documentName: 'Contract_2026.pdf',
  ownerEmail: 'owner@company.com',
  message: 'Please review and sign by end of week.',
};

const PARTICIPANT_PENDING = {
  id: 1,
  email: 'guest@example.com',
  name: 'Guest Signer',
  status: 'PENDING',
};

const PARTICIPANT_SIGNED = { ...PARTICIPANT_PENDING, status: 'SIGNED' };
const PARTICIPANT_DECLINED = { ...PARTICIPANT_PENDING, status: 'DECLINED' };

// ─── Route helpers ────────────────────────────────────────────────────────────

async function mockHappyPath(page: Page) {
  await page.route('**/workflow/participant/session**', (route: Route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(SESSION_PAYLOAD) })
  );
  await page.route('**/workflow/participant/details**', (route: Route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(PARTICIPANT_PENDING) })
  );
  await page.route('**/workflow/participant/document**', (route: Route) =>
    route.fulfill({ status: 200, contentType: 'application/pdf', body: Buffer.from('%PDF-1.4 stub') })
  );
  await page.route('**/workflow/participant/submit-signature', (route: Route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ status: 'SIGNED' }) })
  );
  await page.route('**/workflow/participant/decline**', (route: Route) =>
    route.fulfill({ status: 200 })
  );
}

async function mockForbidden(page: Page) {
  await page.route('**/workflow/participant/**', (route: Route) =>
    route.fulfill({ status: 403 })
  );
}

async function mockAlreadySigned(page: Page) {
  await page.route('**/workflow/participant/session**', (route: Route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(SESSION_PAYLOAD) })
  );
  await page.route('**/workflow/participant/details**', (route: Route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(PARTICIPANT_SIGNED) })
  );
}

async function mockAlreadyDeclined(page: Page) {
  await page.route('**/workflow/participant/session**', (route: Route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(SESSION_PAYLOAD) })
  );
  await page.route('**/workflow/participant/details**', (route: Route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(PARTICIPANT_DECLINED) })
  );
}

async function mockServerError(page: Page) {
  await page.route('**/workflow/participant/**', (route: Route) =>
    route.fulfill({ status: 500 })
  );
}

// ─── Tests ────────────────────────────────────────────────────────────────────

test.describe('GuestSignPage', () => {

  // ── Page state machine ──────────────────────────────────────────────────

  test('shows loading spinner before API responds', async ({ page }) => {
    // Delay the session response so we can catch the loading state
    await page.route('**/workflow/participant/session**', async (route) => {
      await new Promise(resolve => setTimeout(resolve, 500));
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(SESSION_PAYLOAD) });
    });
    await page.route('**/workflow/participant/details**', (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(PARTICIPANT_PENDING) })
    );

    await page.goto(SIGN_URL);
    await expect(page.getByText(/loading signing session/i)).toBeVisible();
  });

  test('shows expired message for 403 response', async ({ page }) => {
    await mockForbidden(page);
    await page.goto(SIGN_URL);

    await expect(page.getByText(/this signing link has expired/i)).toBeVisible();
    await expect(page.getByText(/contact the document owner for a new link/i)).toBeVisible();
  });

  test('shows already-signed state when participant status is SIGNED', async ({ page }) => {
    await mockAlreadySigned(page);
    await page.goto(SIGN_URL);

    await expect(page.getByText(/your signature has been submitted successfully/i)).toBeVisible();
    await expect(page.getByText(/you may close this window/i)).toBeVisible();
  });

  test('shows declined state when participant status is DECLINED', async ({ page }) => {
    await mockAlreadyDeclined(page);
    await page.goto(SIGN_URL);

    await expect(page.getByText(/you have declined this signing request/i)).toBeVisible();
  });

  test('shows error state on 500 server error', async ({ page }) => {
    await mockServerError(page);
    await page.goto(SIGN_URL);

    await expect(page.getByText(/something went wrong/i)).toBeVisible();
  });

  // ── Ready (signing form) ────────────────────────────────────────────────

  test('renders signing form with document details', async ({ page }) => {
    await mockHappyPath(page);
    await page.goto(SIGN_URL);

    await expect(page.getByText('Sign Document')).toBeVisible();
    await expect(page.getByText('Contract_2026.pdf')).toBeVisible();
    await expect(page.getByText(/Requested by owner@company.com/i)).toBeVisible();
    await expect(page.getByText('Please review and sign by end of week.')).toBeVisible();
  });

  test('shows document preview iframe', async ({ page }) => {
    await mockHappyPath(page);
    await page.goto(SIGN_URL);

    await expect(page.locator('iframe[title="Document to sign"]')).toBeVisible();
    const iframeSrc = await page.locator('iframe[title="Document to sign"]').getAttribute('src');
    expect(iframeSrc).toContain(TOKEN);
    expect(iframeSrc).toContain('document');
  });

  test('auto-cert option is selected by default', async ({ page }) => {
    await mockHappyPath(page);
    await page.goto(SIGN_URL);

    // The auto-cert radio should be checked
    const autoRadio = page.getByLabel(/use auto-generated certificate/i);
    await expect(autoRadio).toBeChecked();
  });

  test('shows auto-cert info alert when auto cert is selected', async ({ page }) => {
    await mockHappyPath(page);
    await page.goto(SIGN_URL);

    await expect(page.getByText(/a certificate will be generated using your email address/i)).toBeVisible();
  });

  // ── Certificate chooser ─────────────────────────────────────────────────

  test('switching to P12 shows file input and password field', async ({ page }) => {
    await mockHappyPath(page);
    await page.goto(SIGN_URL);

    await page.getByLabel(/upload my own certificate/i).check();

    await expect(page.getByLabel(/certificate file/i)).toBeVisible();
    await expect(page.getByLabel(/certificate password/i)).toBeVisible();
    // Auto-cert alert should be hidden
    await expect(page.getByText(/a certificate will be generated using your email address/i)).not.toBeVisible();
  });

  test('switching back to auto-cert hides file inputs', async ({ page }) => {
    await mockHappyPath(page);
    await page.goto(SIGN_URL);

    await page.getByLabel(/upload my own certificate/i).check();
    await expect(page.getByLabel(/certificate file/i)).toBeVisible();

    await page.getByLabel(/use auto-generated certificate/i).check();
    await expect(page.getByLabel(/certificate file/i)).not.toBeVisible();
    await expect(page.getByText(/a certificate will be generated using your email address/i)).toBeVisible();
  });

  // ── Submit signature ────────────────────────────────────────────────────

  test('submits with GUEST_CERT and shows success state', async ({ page }) => {
    let capturedFormData: Record<string, string> = {};

    await page.route('**/workflow/participant/session**', (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(SESSION_PAYLOAD) })
    );
    await page.route('**/workflow/participant/details**', (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(PARTICIPANT_PENDING) })
    );
    await page.route('**/workflow/participant/document**', (route) =>
      route.fulfill({ status: 200, contentType: 'application/pdf', body: Buffer.from('%PDF-1.4') })
    );
    await page.route('**/workflow/participant/submit-signature', async (route) => {
      const request = route.request();
      const postData = request.postData();
      if (postData) capturedFormData.raw = postData;
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ status: 'SIGNED' }) });
    });

    await page.goto(SIGN_URL);
    await expect(page.getByText('Sign Document')).toBeVisible();

    // Submit with default auto-cert
    await page.getByRole('button', { name: /submit signature/i }).click();

    // Should transition to success state
    await expect(page.getByText(/your signature has been submitted successfully/i)).toBeVisible();

    // Verify certType was GUEST_CERT
    expect(capturedFormData.raw).toContain('GUEST_CERT');
    expect(capturedFormData.raw).toContain(TOKEN);
  });

  test('shows error message when submission fails', async ({ page }) => {
    await page.route('**/workflow/participant/session**', (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(SESSION_PAYLOAD) })
    );
    await page.route('**/workflow/participant/details**', (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(PARTICIPANT_PENDING) })
    );
    await page.route('**/workflow/participant/document**', (route) =>
      route.fulfill({ status: 200, contentType: 'application/pdf', body: Buffer.from('%PDF-1.4') })
    );
    await page.route('**/workflow/participant/submit-signature', (route) =>
      route.fulfill({ status: 400, body: 'Session has expired' })
    );

    await page.goto(SIGN_URL);
    await expect(page.getByText('Sign Document')).toBeVisible();
    await page.getByRole('button', { name: /submit signature/i }).click();

    await expect(page.getByText(/something went wrong/i)).toBeVisible();
    await expect(page.getByText('Session has expired')).toBeVisible();
  });

  test('Submit Signature button shows loading state while in flight', async ({ page }) => {
    await page.route('**/workflow/participant/session**', (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(SESSION_PAYLOAD) })
    );
    await page.route('**/workflow/participant/details**', (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(PARTICIPANT_PENDING) })
    );
    await page.route('**/workflow/participant/document**', (route) =>
      route.fulfill({ status: 200, contentType: 'application/pdf', body: Buffer.from('%PDF-1.4') })
    );
    await page.route('**/workflow/participant/submit-signature', async (route) => {
      await new Promise(resolve => setTimeout(resolve, 600));
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ status: 'SIGNED' }) });
    });

    await page.goto(SIGN_URL);
    await expect(page.getByText('Sign Document')).toBeVisible();

    await page.getByRole('button', { name: /submit signature/i }).click();

    // Button should be in loading/disabled state
    const submitBtn = page.getByRole('button', { name: /submit signature/i });
    await expect(submitBtn).toBeDisabled();

    // Eventually success
    await expect(page.getByText(/your signature has been submitted successfully/i)).toBeVisible();
  });

  // ── Decline flow ────────────────────────────────────────────────────────

  test('decline button opens confirmation modal', async ({ page }) => {
    await mockHappyPath(page);
    await page.goto(SIGN_URL);

    await expect(page.getByText('Sign Document')).toBeVisible();
    await page.getByRole('button', { name: /decline/i }).first().click();

    await expect(page.getByText('Decline signing?')).toBeVisible();
    await expect(page.getByText(/are you sure you want to decline/i)).toBeVisible();
  });

  test('Cancel in decline modal closes modal without declining', async ({ page }) => {
    await mockHappyPath(page);
    await page.goto(SIGN_URL);

    await page.getByRole('button', { name: /decline/i }).first().click();
    await expect(page.getByText('Decline signing?')).toBeVisible();

    await page.getByRole('button', { name: /cancel/i }).click();

    await expect(page.getByText('Decline signing?')).not.toBeVisible();
    // Signing form still present
    await expect(page.getByRole('button', { name: /submit signature/i })).toBeVisible();
  });

  test('confirming decline transitions to declined state', async ({ page }) => {
    await mockHappyPath(page);
    await page.goto(SIGN_URL);

    await page.getByRole('button', { name: /decline/i }).first().click();
    await expect(page.getByText('Decline signing?')).toBeVisible();

    // Click the confirm Decline button inside the modal
    const modalDeclineBtn = page.getByRole('dialog').getByRole('button', { name: /decline/i });
    await modalDeclineBtn.click();

    await expect(page.getByText(/you have declined this signing request/i)).toBeVisible();
  });

  // ── Accessibility ───────────────────────────────────────────────────────

  test('Submit Signature button is initially enabled', async ({ page }) => {
    await mockHappyPath(page);
    await page.goto(SIGN_URL);

    await expect(page.getByText('Sign Document')).toBeVisible();
    await expect(page.getByRole('button', { name: /submit signature/i })).toBeEnabled();
  });

  test('Decline button is initially enabled', async ({ page }) => {
    await mockHappyPath(page);
    await page.goto(SIGN_URL);

    await expect(page.getByText('Sign Document')).toBeVisible();
    await expect(page.getByRole('button', { name: /decline/i }).first()).toBeEnabled();
  });
});
