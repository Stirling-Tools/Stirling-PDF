/**
 * SSE endpoint auth tests.
 *
 * Assumes the backend is running on :8080 and Vite dev server on :5173.
 * Credentials: set env vars STIRLING_USER / STIRLING_PASS, or defaults to admin/stirling.
 *
 * Run: npx playwright test sse-auth --project=chromium --reporter=list
 */

import { test, expect, Page } from '@playwright/test';

const USER = process.env.STIRLING_USER ?? 'admin';
const PASS = process.env.STIRLING_PASS ?? 'stirling';

// ---------------------------------------------------------------------------
// Login helper — calls the API login endpoint, stores JWT in localStorage
// ---------------------------------------------------------------------------

async function loginViaApi(page: Page): Promise<string | null> {
  const result = await page.evaluate(async ({ user, pass }) => {
    try {
      const r = await fetch('/api/v1/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ username: user, password: pass }),
      });
      const body = await r.json().catch(() => ({}));
      // Support both response shapes:
      //   { token: "..." }  (older format)
      //   { session: { access_token: "..." } }  (current format)
      const token = body.token ?? body.session?.access_token ?? null;
      if (r.ok && token) {
        localStorage.setItem('stirling_jwt', token);
        return token as string;
      }
      return `LOGIN_FAILED:${r.status}:${JSON.stringify(body)}`;
    } catch (e: any) {
      return `LOGIN_ERROR:${e.message}`;
    }
  }, { user: USER, pass: PASS });

  console.log(`[login] result: ${typeof result === 'string' && result.length > 60 ? result.slice(0, 60) + '…' : result}`);
  return typeof result === 'string' && !result.startsWith('LOGIN') ? result : null;
}

// ---------------------------------------------------------------------------
// SSE token helper — exchanges JWT for a short-lived sseToken
// POST /api/v1/pipeline/sse-token  →  { sseToken: "..." }
// ---------------------------------------------------------------------------

async function getSseToken(page: Page, sessionId: string): Promise<string | null> {
  return page.evaluate(async ({ session }) => {
    const jwt = localStorage.getItem('stirling_jwt');
    if (!jwt) return null;
    try {
      const r = await fetch('/api/v1/pipeline/sse-token', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${jwt}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        credentials: 'include',
        body: `session=${encodeURIComponent(session)}`,
      });
      if (!r.ok) return `SSE_TOKEN_FAILED:${r.status}`;
      const body = await r.json().catch(() => ({}));
      return (body.sseToken as string) ?? null;
    } catch (e: any) {
      return `SSE_TOKEN_ERROR:${e.message}`;
    }
  }, { session: sessionId });
}

// ---------------------------------------------------------------------------
// Diagnostic suite
// ---------------------------------------------------------------------------

test.describe('SSE diagnostics', () => {

  test('report auth state before login', async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' });

    const info = await page.evaluate(async () => {
      const jwt = localStorage.getItem('stirling_jwt');
      const loginRes = await fetch('/api/v1/proprietary/ui-data/login').then(r => r.json()).catch(() => ({}));
      return { jwtPresent: jwt !== null, enableLogin: loginRes.enableLogin };
    });

    console.log(`[diag] enableLogin=${info.enableLogin}  jwtPresent=${info.jwtPresent}`);
    expect(info.enableLogin).toBeDefined();
  });

  test('probe SSE endpoint before and after login', async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' });

    // Before login — no sseToken, no session cookie → expect 401
    const before = await page.evaluate(async () => {
      const r = await fetch('/api/v1/pipeline/events?session=diag-pre', {
        headers: { Accept: 'text/event-stream' },
        credentials: 'include',
      });
      await r.body?.cancel();
      return r.status;
    });
    console.log(`[diag] SSE before login → ${before}`);

    // Login
    const jwt = await loginViaApi(page);
    console.log(`[diag] Login succeeded: ${jwt !== null}`);

    if (jwt) {
      // Exchange JWT for sseToken
      const sseToken = await getSseToken(page, 'diag-post');
      console.log(`[diag] sseToken obtained: ${sseToken !== null && !sseToken?.startsWith('SSE_TOKEN')}`);

      if (sseToken && !sseToken.startsWith('SSE_TOKEN')) {
        const after = await page.evaluate(async ({ token }) => {
          const url = `/api/v1/pipeline/events?session=diag-post&sseToken=${encodeURIComponent(token)}`;
          console.log('[page] SSE url:', url.slice(0, 80) + '…');
          const r = await fetch(url, {
            headers: { Accept: 'text/event-stream' },
            credentials: 'include',
          });
          await r.body?.cancel();
          return r.status;
        }, { token: sseToken });
        console.log(`[diag] SSE after login with sseToken → ${after}`);
      }
    }

    expect(before).toBe(401); // should definitely be 401 before login
  });

});

// ---------------------------------------------------------------------------
// Functional suite — SSE must return 200 once authenticated via sseToken
// ---------------------------------------------------------------------------

test.describe('SSE functional', () => {

  test.beforeEach(async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    const token = await loginViaApi(page);
    if (!token) {
      test.skip(true, `Login failed for user "${USER}" — check STIRLING_USER/STIRLING_PASS env vars`);
    }
  });

  test('SSE returns 200 with sseToken', async ({ page }) => {
    const sseToken = await getSseToken(page, 'pw-functional');
    expect(sseToken, 'Failed to obtain sseToken').toBeTruthy();
    expect(sseToken).not.toMatch(/^SSE_TOKEN/);

    const status = await page.evaluate(async ({ token }) => {
      const url = `/api/v1/pipeline/events?session=pw-functional&sseToken=${encodeURIComponent(token!)}`;
      const r = await fetch(url, {
        headers: { Accept: 'text/event-stream' },
        credentials: 'include',
      });
      await r.body?.cancel();
      return r.status;
    }, { token: sseToken });

    console.log(`[functional] SSE with sseToken → ${status}`);
    expect(status).toBe(200);
  });

  test('SSE returns 401 without sseToken or session cookie', async ({ page }) => {
    // Sanity check: even after login, removing credentials should give 401
    const status = await page.evaluate(async () => {
      // Fetch without credentials (no cookie) and no sseToken
      const r = await fetch('/api/v1/pipeline/events?session=pw-noauth', {
        headers: { Accept: 'text/event-stream' },
        // deliberately no credentials: 'include'
      });
      await r.body?.cancel();
      return r.status;
    });

    console.log(`[functional] SSE without token → ${status}`);
    expect(status).toBe(401);
  });

  test('EventSource opens without 401 errors using sseToken', async ({ page }) => {
    const sseErrors: string[] = [];

    page.on('response', response => {
      if (response.url().includes('/pipeline/events') && response.status() !== 200) {
        sseErrors.push(`${response.url()} → ${response.status()}`);
      }
    });

    const sseToken = await getSseToken(page, 'pw-eventsource');
    expect(sseToken, 'Failed to obtain sseToken for EventSource test').toBeTruthy();
    expect(sseToken).not.toMatch(/^SSE_TOKEN/);

    await page.evaluate(async ({ token }) => {
      const url = `/api/v1/pipeline/events?session=pw-eventsource&sseToken=${encodeURIComponent(token!)}`;
      const es = new EventSource(url);
      await new Promise<void>(resolve => {
        es.onopen = () => { es.close(); resolve(); };
        es.onerror = () => { es.close(); resolve(); };
        setTimeout(() => { es.close(); resolve(); }, 3000);
      });
    }, { token: sseToken });

    console.log(`[functional] EventSource errors: ${sseErrors.length > 0 ? sseErrors.join(', ') : 'none'}`);
    expect(sseErrors).toHaveLength(0);
  });

  test('sseToken is single-use — second connection with same token returns 401', async ({ page }) => {
    const sseToken = await getSseToken(page, 'pw-single-use');
    expect(sseToken, 'Failed to obtain sseToken').toBeTruthy();
    expect(sseToken).not.toMatch(/^SSE_TOKEN/);

    // First use — should succeed
    const first = await page.evaluate(async ({ token }) => {
      const url = `/api/v1/pipeline/events?session=pw-single-use&sseToken=${encodeURIComponent(token!)}`;
      const r = await fetch(url, { headers: { Accept: 'text/event-stream' }, credentials: 'include' });
      await r.body?.cancel();
      return r.status;
    }, { token: sseToken });

    // Second use of same token — should be rejected (token already consumed)
    const second = await page.evaluate(async ({ token }) => {
      const url = `/api/v1/pipeline/events?session=pw-single-use&sseToken=${encodeURIComponent(token!)}`;
      const r = await fetch(url, { headers: { Accept: 'text/event-stream' }, credentials: 'include' });
      await r.body?.cancel();
      return r.status;
    }, { token: sseToken });

    console.log(`[functional] sseToken first use → ${first}, second use → ${second}`);
    expect(first).toBe(200);
    expect(second).toBe(401);
  });

});
