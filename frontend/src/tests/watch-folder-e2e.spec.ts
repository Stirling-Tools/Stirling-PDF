/**
 * E2E test: create a server-folder Watch Folder (Rotate 90° + Text Stamp),
 * upload a PDF, wait for PipelineDirectoryProcessor to process it, verify output.
 *
 * Run: npx playwright test watch-folder-e2e --project=chromium --reporter=list --timeout=120000
 */

import { test, expect, Page } from '@playwright/test';

const USER = process.env.STIRLING_USER ?? 'admin';
const PASS = process.env.STIRLING_PASS ?? 'stirling';
const FOLDER_NAME = 'TDD Rotate+Stamp';

// Minimal 1-page valid PDF (from pdf spec — smallest valid PDF)
const MINIMAL_PDF = Buffer.from(
  '%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj ' +
  '2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj ' +
  '3 0 obj<</Type/Page/MediaBox[0 0 612 792]/Parent 2 0 R>>endobj ' +
  'xref\n0 4\n0000000000 65535 f\n0000000009 00000 n\n' +
  '0000000058 00000 n\n0000000115 00000 n\n' +
  'trailer<</Size 4/Root 1 0 R>>\nstartxref\n190\n%%EOF'
);

// ---------------------------------------------------------------------------
// Auth helper
// ---------------------------------------------------------------------------

/**
 * Logs in via the API, stores the JWT in localStorage, and dispatches
 * jwt-available so the React AuthProvider recognises the new session.
 * Returns the JWT token string.
 */
async function loginViaApi(page: Page): Promise<string> {
  const result = await page.evaluate(async ({ user, pass }) => {
    const r = await fetch('/api/v1/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ username: user, password: pass }),
    });
    const body = await r.json().catch(() => ({}));
    const token = body.token ?? body.session?.access_token ?? null;
    if (token) {
      localStorage.setItem('stirling_jwt', token);
      // Notify the React auth context that a JWT is now available
      window.dispatchEvent(new CustomEvent('jwt-available'));
    }
    return { ok: r.ok, hasToken: !!token, token: token as string | null };
  }, { user: USER, pass: PASS });

  expect(result.ok, 'Login failed — check STIRLING_USER/STIRLING_PASS').toBe(true);
  expect(result.hasToken, 'No JWT in login response').toBe(true);
  return result.token!;
}

// ---------------------------------------------------------------------------
// API helpers (bypass UI for setup/teardown)
// ---------------------------------------------------------------------------

async function deleteTestFolderIfExists(page: Page, folderId: string): Promise<void> {
  await page.evaluate(async ({ id }) => {
    const jwt = localStorage.getItem('stirling_jwt');
    const headers: Record<string, string> = jwt ? { Authorization: `Bearer ${jwt}` } : {};
    await fetch(`/api/v1/pipeline/server-folder/${id}`, { method: 'DELETE', headers }).catch(() => {});
  }, { id: folderId });
}

async function uploadPdfToServerFolder(
  page: Page, folderId: string, filename: string, pdfBytes: number[], fileId?: string
): Promise<{ status: number; fileId: string }> {
  return page.evaluate(async ({ id, name, bytes, fid }) => {
    const jwt = localStorage.getItem('stirling_jwt');
    const headers: Record<string, string> = jwt ? { Authorization: `Bearer ${jwt}` } : {};
    const blob = new Blob([new Uint8Array(bytes)], { type: 'application/pdf' });
    const resolvedFileId = fid ?? crypto.randomUUID();
    const fd = new FormData();
    fd.append('fileId', resolvedFileId);
    fd.append('fileInput', blob, name);
    const r = await fetch(`/api/v1/pipeline/server-folder/${id}/files`, {
      method: 'POST', headers, body: fd,
    });
    return { status: r.status, fileId: resolvedFileId };
  }, { id: folderId, name: filename, bytes: Array.from(pdfBytes), fid: fileId ?? null });
}

async function triggerProcessing(page: Page, folderId: string): Promise<number> {
  return page.evaluate(async ({ id }) => {
    const jwt = localStorage.getItem('stirling_jwt');
    const headers: Record<string, string> = jwt ? { Authorization: `Bearer ${jwt}` } : {};
    const r = await fetch(`/api/v1/pipeline/server-folder/${id}/process`, {
      method: 'POST', headers,
    });
    return r.status;
  }, { id: folderId });
}

async function pollForOutput(page: Page, folderId: string, timeoutMs = 30_000): Promise<string[]> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const files = await page.evaluate(async ({ id }) => {
      const jwt = localStorage.getItem('stirling_jwt');
      const headers: Record<string, string> = jwt ? { Authorization: `Bearer ${jwt}` } : {};
      const r = await fetch(`/api/v1/pipeline/server-folder/${id}/output`, { headers });
      if (!r.ok) return [];
      return (await r.json() as { filename: string }[]).map(f => f.filename);
    }, { id: folderId });

    if (files.length > 0) return files;
    console.log(`[poll] No output yet, waiting… (${Math.round((deadline - Date.now()) / 1000)}s left)`);
    await page.waitForTimeout(5000);
  }
  return [];
}

// ---------------------------------------------------------------------------
// Clean up any stale IDB data from old prefix-based folder IDs
// ---------------------------------------------------------------------------

async function clearStalePrefixedFolders(page: Page): Promise<void> {
  await page.evaluate(async () => {
    // Open the smart folders IDB and remove any folder whose id starts with 'folder-'
    await new Promise<void>((resolve) => {
      const req = indexedDB.open('stirling-pdf-smart-folders');
      req.onsuccess = () => {
        const db = req.result;
        const storeName = db.objectStoreNames[0];
        if (!storeName) { resolve(); return; }
        const tx = db.transaction(storeName, 'readwrite');
        const store = tx.objectStore(storeName);
        const cursor = store.openCursor();
        cursor.onsuccess = (e: any) => {
          const c = e.target.result;
          if (!c) { resolve(); return; }
          if (typeof c.value?.id === 'string' && c.value.id.startsWith('folder-')) {
            c.delete();
          }
          c.continue();
        };
        tx.oncomplete = () => resolve();
        tx.onerror = () => resolve();
      };
      req.onerror = () => resolve();
    });
  });
  console.log('[setup] Cleared stale folder-prefixed IDB entries');
}

// ---------------------------------------------------------------------------
// UI helpers
// ---------------------------------------------------------------------------

async function navigateToWatchFolders(page: Page): Promise<void> {
  // Click the Watch Folders button in the QuickAccessBar using its data-testid
  await page.locator('[data-testid="watchFolders-button"]').click();
  // Wait until the Watch Folders home page is visible (the "New folder" button appears)
  await page.waitForSelector('button:has-text("New folder")', { timeout: 10000 });
}

async function openNewFolderModal(page: Page): Promise<void> {
  // The header "New folder" button is the one in the main workbench area (not the sidebar).
  // Use the button role to be precise, then click it.
  await page.getByRole('button', { name: 'New folder' }).first().click();
  // Title comes from translation: smartFolders.modal.createTitle = "New watched folder"
  await expect(page.getByText('New watched folder')).toBeVisible({ timeout: 8000 });
}

// ---------------------------------------------------------------------------
// Auth + navigation setup
// ---------------------------------------------------------------------------

/**
 * Authenticate and wait for the main app to be loaded and stable.
 *
 * Strategy:
 * 1. Navigate to /login (no redirect risk — login page renders unconditionally)
 * 2. Call loginViaApi to store JWT + dispatch jwt-available
 * 3. The Login component detects the session and navigates to / (SPA nav)
 * 4. Wait for the main app to be visible (QuickAccessBar watchFolders button)
 * 5. Dismiss any modal dialogs (onboarding, cookie consent) that block interactions
 */
async function authenticateAndLoadApp(page: Page): Promise<void> {
  // Set the CookieConsent library's browser cookie BEFORE navigating to any page.
  // The library reads from document.cookie (not localStorage) and only shows the banner
  // when no valid consent record is found.
  const ccValue = encodeURIComponent(JSON.stringify({
    categories: ['necessary', 'analytics'],
    revision: 0,
    data: null,
    consentTimestamp: new Date().toISOString(),
    consentId: 'test-consent-id',
    lastConsentTimestamp: new Date().toISOString(),
    services: { analytics: {} },
    languageCode: 'en',
    expirationTime: Date.now() + 365 * 24 * 60 * 60 * 1000,
  }));
  await page.context().addCookies([{
    name: 'cc_cookie',
    value: ccValue,
    domain: 'localhost',
    path: '/',
    expires: Math.floor(Date.now() / 1000) + 365 * 24 * 60 * 60,
  }]);

  // Go to the login page directly — avoids any auth-guard redirect race
  await page.goto('/login', { waitUntil: 'domcontentloaded' });

  // Pre-set localStorage keys to suppress onboarding and upgrade banner.
  // Must be done on the same origin (login page) before the main app renders.
  await page.evaluate(() => {
    // Mark onboarding as completed so the tour modal never opens
    localStorage.setItem('onboarding::completed', 'true');
    // Suppress the "Upgrade to Server Plan" friendly banner (shown at most once per week)
    // by pretending it was shown just now — banner logic: only shows if >= 7 days since last shown
    localStorage.setItem('upgradeBannerFriendlyLastShownAt', Date.now().toString());
  });

  // Login and store JWT; dispatch jwt-available so the React auth context wakes up
  await loginViaApi(page);

  // The Login component detects the new session (via jwt-available → refreshSession)
  // and does navigate('/', { replace: true }).  Wait for the URL to become '/'.
  try {
    await page.waitForURL('/', { timeout: 15000 });
  } catch {
    // If we're already at '/' (e.g., login was disabled or instant redirect), that's fine
  }

  // Wait for the QuickAccessBar to be ready — proof that the main app has rendered
  await page.waitForSelector('[data-testid="watchFolders-button"]', { timeout: 30000 });

  // Dismiss any modal dialogs (onboarding tour, cookie consent) that would
  // intercept pointer events and block clicks on the QuickAccessBar.
  await dismissBlockingModals(page);
}

/**
 * Close any open dialogs or tooltips that would prevent clicking UI elements.
 * The cookie consent dialog is handled by pre-setting the cc_cookie before page load.
 * This function handles any residual blocking elements.
 */
async function dismissBlockingModals(page: Page): Promise<void> {
  // Dismiss cookie consent if it still appears (fallback — should be prevented by addCookies)
  const cookieNoThanks = page.getByRole('button', { name: /no thanks/i });
  if (await cookieNoThanks.isVisible({ timeout: 1500 }).catch(() => false)) {
    await cookieNoThanks.click();
    await page.waitForTimeout(300);
  }

  // Dismiss any tooltip that might intercept clicks (e.g., "Watch walkthroughs here" tooltip)
  const tooltipClose = page.getByRole('button', { name: /close tooltip/i });
  if (await tooltipClose.isVisible({ timeout: 1000 }).catch(() => false)) {
    await tooltipClose.click();
    await page.waitForTimeout(200);
  }

  // Dismiss Mantine onboarding modal — press Escape (should already be suppressed by localStorage)
  const overlay = page.locator('[data-fixed="true"].mantine-Modal-overlay').first();
  if (await overlay.isVisible({ timeout: 500 }).catch(() => false)) {
    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test.describe('Watch Folder E2E — server-folder with Rotate + Add Stamp', () => {

  let createdFolderId: string | null = null;

  test.beforeEach(async ({ page }) => {
    await authenticateAndLoadApp(page);
    await clearStalePrefixedFolders(page);
  });

  test.afterEach(async ({ page }) => {
    if (createdFolderId) {
      await deleteTestFolderIfExists(page, createdFolderId);
      createdFolderId = null;
    }
  });

  // ── Test 1: UI folder creation ────────────────────────────────────────────

  test('create server-folder via UI with Rotate + Text Stamp steps', async ({ page }) => {
    await navigateToWatchFolders(page);
    await openNewFolderModal(page);

    // Fill folder name — placeholder from translation: smartFolders.modal.namePlaceholder = "My watched folder"
    const nameInput = page.getByPlaceholder('My watched folder');
    await nameInput.fill(FOLDER_NAME);

    // AutomationCreation starts with DEFAULT_TOOL_COUNT=2 empty tool slots (indices 0 and 1).
    // MIN_TOOL_COUNT=2 so we cannot remove them. We must fill both slots.
    // canSave() requires ALL tools to have configured=true and operation!==''.

    // ── Fill slot 0 (first empty entry) with Rotate ──
    // The first "Select a tool..." input is at index 0
    await page.getByPlaceholder('Select a tool...').first().click();
    await page.waitForTimeout(200);
    await page.getByPlaceholder('Select a tool...').first().fill('rotate');
    await page.waitForTimeout(400);
    await page.getByRole('button', { name: 'Rotate' }).first().click();
    await page.waitForTimeout(300);

    // Rotate has automationSettings — click "Configure tool" and set 90°
    await page.getByTitle('Configure tool').first().click();
    await page.waitForTimeout(300);
    await page.getByRole('button', { name: '90°' }).click();
    await page.waitForTimeout(200);
    await page.getByRole('button', { name: 'Save Configuration' }).click();
    await page.waitForTimeout(400);

    // ── Fill slot 1 (second empty entry) with Add Stamp ──
    // Add Stamp uses ToolType.singleFile + a plain backend endpoint (/api/v1/misc/add-stamp),
    // no customProcessor — it runs server-side without issues.
    await page.getByPlaceholder('Select a tool...').last().click();
    await page.waitForTimeout(200);
    await page.getByPlaceholder('Select a tool...').last().fill('stamp');
    await page.waitForTimeout(400);
    await page.getByRole('button', { name: 'Add Stamp to PDF' }).first().click();
    await page.waitForTimeout(300);

    // Add Stamp requires stampText to be non-empty (validated in useAddStampParameters)
    await page.getByTitle('Configure tool').last().click();
    await page.waitForTimeout(300);
    await page.getByLabel('Stamp Text').fill('TDD');
    await page.waitForTimeout(200);
    await page.getByRole('button', { name: 'Save Configuration' }).click();
    await page.waitForTimeout(400);

    // ── Set input source to Server watch folder ──
    // The input source is a Mantine Select textbox — target by role+name to avoid strict-mode ambiguity
    await page.getByRole('textbox', { name: 'Input source' }).click();
    await page.getByRole('option', { name: 'Server watch folder' }).click();
    await page.waitForTimeout(300);

    // ── Save ──
    // Button text from translation: smartFolders.modal.createFolder = "Create Folder"
    await page.getByText('Create Folder').click();

    // Wait for modal to close
    await expect(page.getByText('New watched folder')).toBeHidden({ timeout: 10000 });

    // Get the newly created folder ID from IDB
    createdFolderId = await page.evaluate(async () => {
      return new Promise<string | null>((resolve) => {
        const req = indexedDB.open('stirling-pdf-smart-folders');
        req.onsuccess = () => {
          const db = req.result;
          const storeName = db.objectStoreNames[0];
          const tx = db.transaction(storeName, 'readonly');
          const store = tx.objectStore(storeName);
          const all = store.getAll();
          all.onsuccess = () => {
            const folders = all.result as { id: string; name: string }[];
            const match = folders.find(f => f.name === 'TDD Rotate+Stamp');
            resolve(match?.id ?? null);
          };
          all.onerror = () => resolve(null);
        };
        req.onerror = () => resolve(null);
      });
    });

    console.log(`[test] Created folder ID: ${createdFolderId}`);
    expect(createdFolderId, 'Folder was not saved to IDB').not.toBeNull();
    expect(createdFolderId).not.toContain('folder-'); // no prefix

    // Verify server-side directory was created
    const serverStatus = await page.evaluate(async ({ id }) => {
      const jwt = localStorage.getItem('stirling_jwt');
      const headers: Record<string, string> = jwt ? { Authorization: `Bearer ${jwt}` } : {};
      const r = await fetch(`/api/v1/pipeline/server-folder/${id}/output`, { headers });
      return r.status;
    }, { id: createdFolderId! });

    console.log(`[test] Server folder /output status: ${serverStatus}`);
    expect(serverStatus).toBe(200); // 200 = folder exists (empty output is fine)
  });

  // ── Test 2: full pipeline run ─────────────────────────────────────────────

  test('upload PDF to server folder and receive processed output', async ({ page }) => {
    // Step 1: Create folder via API (faster than UI for pipeline test)
    // Get the JWT from localStorage (set by authenticateAndLoadApp in beforeEach)
    const token = await page.evaluate(() => localStorage.getItem('stirling_jwt'));
    expect(token, 'JWT must be present after login').toBeTruthy();

    // Create IDB folder entry
    const folderId = await page.evaluate(async ({ name }) => {
      const id = crypto.randomUUID();
      await new Promise<void>((resolve, reject) => {
        const req = indexedDB.open('stirling-pdf-smart-folders');
        req.onsuccess = () => {
          const db = req.result;
          const storeName = db.objectStoreNames[0];
          const tx = db.transaction(storeName, 'readwrite');
          const now = new Date().toISOString();
          tx.objectStore(storeName).put({
            id, name, description: '', automationId: 'tdd-automation',
            icon: 'FolderIcon', accentColor: '#3b82f6',
            inputSource: 'server-folder', processingMode: 'server',
            createdAt: now, updatedAt: now, maxRetries: 0, retryDelayMinutes: 5,
          });
          tx.oncomplete = () => resolve();
          tx.onerror = (e: any) => reject(e);
        };
        req.onerror = (e: any) => reject(e);
      });
      return id;
    }, { name: `${FOLDER_NAME} Pipeline` });

    console.log(`[pipeline] Created IDB folder: ${folderId}`);
    createdFolderId = folderId;

    // Create server-side folder via API
    const createStatus = await page.evaluate(async ({ id, name, jwt }) => {
      const configJson = JSON.stringify({
        name,
        pipeline: [
          { operation: '/api/v1/general/rotate-pdf', parameters: { angle: 90 } },
          {
            operation: '/api/v1/misc/add-stamp',
            parameters: {
              stampType: 'text', stampText: 'TDD',
              pageNumbers: '1', fontSize: 40, position: 5,
              rotation: 0, opacity: 0.5, overrideX: -1, overrideY: -1,
              customColor: '#d3d3d3', customMargin: 'medium', alphabet: 'roman',
            },
          },
        ],
      });
      const fd = new FormData();
      fd.append('folderId', id);
      fd.append('name', name);
      fd.append('sessionId', crypto.randomUUID());
      fd.append('json', configJson);
      const headers: Record<string, string> = jwt ? { Authorization: `Bearer ${jwt}` } : {};
      const r = await fetch('/api/v1/pipeline/server-folder', {
        method: 'POST', headers, body: fd,
      });
      if (!r.ok) {
        const text = await r.text().catch(() => '');
        throw new Error(`Create server folder failed: ${r.status} ${text}`);
      }
      return r.status;
    }, { id: folderId, name: `${FOLDER_NAME} Pipeline`, jwt: token });

    console.log(`[pipeline] Created server folder, status: ${createStatus}`);

    // Step 2: Upload a minimal PDF
    const { status: uploadStatus } = await uploadPdfToServerFolder(
      page, folderId, 'test-input.pdf', Array.from(MINIMAL_PDF)
    );
    console.log(`[pipeline] Upload status: ${uploadStatus}`);
    expect(uploadStatus).toBe(200);

    // Step 3: Trigger immediate processing (bypasses 60s scheduled scan)
    const triggerStatus = await triggerProcessing(page, folderId);
    console.log(`[pipeline] Trigger status: ${triggerStatus}`);
    expect(triggerStatus).toBe(202);

    // Step 4: Poll for output
    console.log('[pipeline] Waiting for output (up to 30s)…');
    const outputFiles = await pollForOutput(page, folderId, 30_000);
    console.log(`[pipeline] Output files: ${JSON.stringify(outputFiles)}`);

    expect(outputFiles.length, 'No output files produced within 30s').toBeGreaterThan(0);
    expect(outputFiles[0]).toMatch(/\.pdf$/i);
  });

});
