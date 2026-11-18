import * as fs from "node:fs";
import * as path from "node:path";
import {
  request as playwrightRequest,
  type APIRequestContext,
} from "@playwright/test";

/**
 * Shared wiring for the SaaS live suite: a real SaaS backend and SaaS frontend running locally
 * against a real Supabase project (the shared v3 one by default, see `task e2e:saas-live`).
 *
 * Signed-in specs need a v3 test account. The setup project signs it in through the real login
 * page and saves the browser state to {@link STATE_FILE}; specs read the Supabase access token
 * back out of that state for their API calls, so the UI and the API act as the same user. With no
 * account configured the state is empty and the signed-in specs skip.
 */

/** The SaaS frontend, including its RUN_SUBPATH. Trailing slash so relative gotos keep the subpath. */
export const SAAS_APP_URL = withTrailingSlash(
  process.env.SAAS_E2E_APP_URL ?? "http://localhost:5174/app",
);

/** The SaaS backend the frontend talks to. */
export const SAAS_API_URL =
  process.env.SAAS_E2E_API_URL ?? "http://localhost:8081";

/** Optional linked self-hosted backend, for the install-to-server leg. */
export const SELF_HOSTED_API_URL = process.env.SELF_HOSTED_E2E_API_URL ?? "";

export const STATE_FILE = path.resolve(
  process.cwd(),
  "..",
  "..",
  ".test-state",
  "saas-live",
  "user.json",
);

export function hasTestAccount(): boolean {
  return !!process.env.SAAS_E2E_EMAIL && !!process.env.SAAS_E2E_PASSWORD;
}

interface StoredSession {
  accessToken: string;
  email: string | null;
}

/** The Supabase session the setup project saved, or null when no account was signed in. */
export function savedSession(): StoredSession | null {
  if (!fs.existsSync(STATE_FILE)) return null;
  const state = JSON.parse(fs.readFileSync(STATE_FILE, "utf8")) as {
    origins?: Array<{
      localStorage?: Array<{ name: string; value: string }>;
    }>;
  };
  for (const origin of state.origins ?? []) {
    for (const item of origin.localStorage ?? []) {
      if (!/^sb-.+-auth-token$/.test(item.name)) continue;
      const session = JSON.parse(item.value) as {
        access_token?: string;
        user?: { email?: string };
      };
      if (session.access_token) {
        return {
          accessToken: session.access_token,
          email: session.user?.email ?? null,
        };
      }
    }
  }
  return null;
}

export function anonymousApi(): Promise<APIRequestContext> {
  return playwrightRequest.newContext({ baseURL: SAAS_API_URL });
}

export function signedInApi(accessToken: string): Promise<APIRequestContext> {
  return playwrightRequest.newContext({
    baseURL: SAAS_API_URL,
    extraHTTPHeaders: { Authorization: `Bearer ${accessToken}` },
  });
}

/** Every key anywhere in a JSON value, for privacy assertions over whole responses. */
export function allKeys(
  value: unknown,
  into: Set<string> = new Set(),
): Set<string> {
  if (Array.isArray(value)) {
    value.forEach((item) => allKeys(item, into));
  } else if (value && typeof value === "object") {
    for (const [key, child] of Object.entries(value)) {
      into.add(key);
      allKeys(child, into);
    }
  }
  return into;
}

function withTrailingSlash(url: string): string {
  return url.endsWith("/") ? url : `${url}/`;
}
