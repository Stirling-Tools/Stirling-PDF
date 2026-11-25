import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import path from "node:path";

export const root = fileURLToPath(new URL("../../", import.meta.url));
export const stateDir = path.join(root, ".test-state/enterprise-sso");
export const configPath = path.join(stateDir, "config.json");
export const idpUrl = "http://localhost:18080";
export const realm = "enterprise-sso-lab";
export const metadataUrl = `${idpUrl}/realms/${realm}/protocol/saml/descriptor`;

/** Loads only the lab's ignored configuration; never falls back to production environment files. */
export async function config() {
  return JSON.parse(await readFile(configPath, "utf8"));
}

/** Stores generated test credentials and reports under the gitignored lab directory. */
export async function save(name, value) {
  await writeFile(path.join(stateDir, name), `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
}

/** Rejects incomplete targeting before account or provider mutations can begin. */
export function validateTarget(c) {
  assert.equal(c.disposable, true, "Use a disposable test project and team; set disposable=true.");
  assert.match(c.projectRef ?? "", /^[a-z]{20}$/, "Set the Supabase test projectRef.");
  assert.equal(c.supabaseUrl, `https://${c.projectRef}.supabase.co`, "Project reference and Supabase URL must agree.");
  for (const key of ["appUrl", "apiUrl"]) {
    const url = new URL(c[key]);
    assert.ok(
      url.protocol === "https:" || (url.protocol === "http:" && ["localhost", "127.0.0.1"].includes(url.hostname)),
      `${key} must use HTTPS or loopback HTTP.`,
    );
    assert.ok(
      !url.username && !url.password && !url.search && !url.hash,
      `${key} must be a base URL without credentials or query parameters.`,
    );
  }
  assert.ok(
    c.publishableKey && !c.publishableKey.startsWith("sb_secret_"),
    "Supply a public Supabase key, never a secret key.",
  );
  if (!c.publishableKey.startsWith("sb_publishable_"))
    assert.equal(claims(c.publishableKey).role, "anon", "Only an anon JWT is a public API key.");
  assert.ok(Number.isSafeInteger(c.expectedTeamId) && c.expectedTeamId > 0, "Set the disposable expectedTeamId.");
  assert.ok(c.leader?.email && c.leader?.password, "Set the existing test leader email and password.");
  assert.ok(["keycloak", "entra"].includes(c.idp), "idp must be keycloak or entra.");
}

/** Omits response bodies and tokens from errors; upstream errors may contain credentials. */
export async function request(
  url,
  {
    token,
    key,
    body,
    form,
    method = body === undefined && form === undefined ? "GET" : "POST",
    expected = [200],
    ...options
  } = {},
) {
  const response = await fetch(url, {
    method,
    redirect: "error",
    signal: AbortSignal.timeout(30_000),
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(key ? { apikey: key } : {}),
      ...(form
        ? { "Content-Type": "application/x-www-form-urlencoded" }
        : body === undefined
          ? {}
          : { "Content-Type": "application/json" }),
    },
    body: form ?? (body === undefined ? undefined : JSON.stringify(body)),
    ...options,
  });
  assert.ok(
    expected.includes(response.status),
    `${method} ${new URL(url).pathname}: expected ${expected.join("/")}, got ${response.status}.`,
  );
  const raw = await response.text();
  return raw ? (response.headers.get("content-type")?.includes("json") ? JSON.parse(raw) : raw) : null;
}

/** Decoding is for test assertions only; the live API validates signature and session admission. */
export function claims(token) {
  return JSON.parse(Buffer.from(token.split(".")[1], "base64url").toString());
}

/** Requires provider evidence in the actual Supabase session, including after refresh. */
export function assertSaml(session, provider) {
  const jwt = claims(session.access_token);
  assert.equal(jwt.role, "authenticated");
  assert.ok(jwt.session_id);
  assert.ok(
    jwt.amr?.some((entry) => entry.method === "sso/saml" && entry.provider === provider && Number.isFinite(entry.timestamp)),
    "Supabase token lacks signed SAML provider evidence.",
  );
}

/** Extracts the live SP identifiers, rejecting metadata that cannot safely configure the lab. */
export function spMetadata(xml, authUrl) {
  const entityId = xml.match(/\bentityID="([^"]+)"/)?.[1];
  const acsUrl = xml.match(/<(?:\w+:)?AssertionConsumerService\b[^>]*\bLocation="([^"]+)"/)?.[1];
  const certificate = xml.match(/<(?:\w+:)?X509Certificate>([\s\S]*?)<\/(?:\w+:)?X509Certificate>/)?.[1]?.replace(/\s/g, "");
  assert.equal(entityId, `${authUrl}/sso/saml/metadata`, "Unexpected SP entity ID in live metadata.");
  assert.equal(acsUrl, `${authUrl}/sso/saml/acs`, "Unexpected ACS in live metadata.");
  assert.ok(certificate && /^[a-zA-Z0-9+/=]+$/.test(certificate), "Missing SP signing certificate.");
  return { entityId, acsUrl, certificate };
}

/** Resolves the repository's installed browser tooling without introducing another dependency tree. */
export function browserTools() {
  return createRequire(path.join(root, "frontend/package.json"))("@playwright/test");
}
