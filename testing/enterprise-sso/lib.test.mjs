import assert from "node:assert/strict";
import { createServer } from "node:http";
import { once } from "node:events";
import test from "node:test";
import { assertSaml, request, spMetadata, validateTarget } from "./lib.mjs";

const target = {
  disposable: true,
  projectRef: "abcdefghijklmnopqrst",
  supabaseUrl: "https://abcdefghijklmnopqrst.supabase.co",
  publishableKey: "sb_publishable_test",
  appUrl: "http://localhost:5173",
  apiUrl: "http://localhost:8080",
  expectedTeamId: 7,
  idp: "keycloak",
  leader: { email: "test@example.com", password: "example-only" },
};
const token = (payload) => `header.${Buffer.from(JSON.stringify(payload)).toString("base64url")}.signature`;

test("targeting requires an explicit disposable project, exact host and team", () => {
  validateTarget(target);
  for (const change of [
    { disposable: false },
    { supabaseUrl: "https://another-project.supabase.co" },
    { apiUrl: "http://public.example.com" },
    { expectedTeamId: 0 },
    { publishableKey: "sb_secret_example" },
    { publishableKey: token({ role: "service_role" }) },
  ])
    assert.throws(() => validateTarget({ ...target, ...change }));
});

test("SP discovery accepts namespace prefixes and rejects wrong ACS or a missing certificate", () => {
  const authUrl = `${target.supabaseUrl}/auth/v1`;
  const xml = `<md:EntityDescriptor entityID="${authUrl}/sso/saml/metadata"><ds:X509Certificate>YWJj\nZA==</ds:X509Certificate><md:AssertionConsumerService Binding="post" Location="${authUrl}/sso/saml/acs" /></md:EntityDescriptor>`;
  assert.equal(spMetadata(xml, authUrl).certificate, "YWJjZA==");
  assert.throws(() => spMetadata(xml.replace("/sso/saml/acs", "/saml/acs"), authUrl));
  assert.throws(() => spMetadata(xml.replace("X509Certificate>", "Other>"), authUrl));
});

test("SAML evidence requires the exact provider even when MFA is first", () => {
  const jwt = {
    role: "authenticated",
    session_id: "session",
    amr: [{ method: "totp" }, { method: "sso/saml", provider: "company", timestamp: 123 }],
  };
  assertSaml({ access_token: token(jwt) }, "company");
  assert.throws(() => assertSaml({ access_token: token(jwt) }, "other-company"));
  assert.throws(() => assertSaml({ access_token: token({ ...jwt, amr: [{ method: "password" }] }) }, "company"));
});

test("HTTP helper sends forms correctly and never follows credential-bearing redirects", async (t) => {
  let hits = 0;
  let received;
  const server = createServer(async (req, res) => {
    hits++;
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    received = Buffer.concat(chunks).toString();
    if (req.url === "/redirect") {
      res.writeHead(302, { Location: "/other" });
      res.end();
    } else if (req.url === "/deny") {
      res.writeHead(403);
      res.end("sensitive-response-never-log");
    } else {
      res.setHeader("Content-Type", "application/json");
      res.end("{}");
    }
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  t.after(() => {
    server.closeAllConnections();
    server.close();
  });
  const base = `http://127.0.0.1:${server.address().port}`;
  await request(base, { form: new URLSearchParams({ grant_type: "password", password: "a+b&c" }) });
  assert.equal(new URLSearchParams(received).get("password"), "a+b&c");
  const before = hits;
  await assert.rejects(request(`${base}/redirect`, { token: "example" }));
  assert.equal(hits, before + 1);
  await assert.rejects(request(`${base}/deny`), (error) => !error.message.includes("sensitive-response"));
});
