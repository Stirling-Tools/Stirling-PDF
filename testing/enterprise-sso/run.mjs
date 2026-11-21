import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import {
  assertSaml,
  browserTools,
  claims,
  config,
  idpUrl,
  request,
  save,
  spMetadata,
  stateDir,
  validateTarget,
} from "./lib.mjs";

const mode = process.argv[2];
let step = "configuration";
let browser;
const passed = [];

function pass(name) {
  passed.push(name);
  console.log(`PASS ${name}`);
}

async function main() {
  assert.ok(["doctor", "run"].includes(mode), "Usage: node testing/enterprise-sso/run.mjs doctor|run [--headed]");
  const c = await config();
  validateTarget(c);
  const authUrl = `${c.supabaseUrl}/auth/v1`;
  const api = (route, token, body, options = {}) =>
    request(`${c.apiUrl.replace(/\/$/, "")}/api/v1/${route}`, { token, body, ...options });
  const auth = (route, body) => request(`${authUrl}/${route}`, { key: c.publishableKey, body });
  const members = (token) => api(`team/${c.expectedTeamId}/members`, token);
  const me = async (token) => (await api("auth/me", token)).user;
  const required = async (token) => {
    const denied = await api("auth/me", token, undefined, { expected: [403] });
    assert.equal(denied.code, "COMPANY_SSO_REQUIRED");
  };

  step = "Supabase SAML metadata and ordinary leader sign-in";
  const sp = spMetadata(await request(`${authUrl}/sso/saml/metadata`, { key: c.publishableKey }), authUrl);
  const original = await auth("token?grant_type=password", c.leader);
  assert.equal(claims(original.access_token).iss, authUrl);
  let settings = await api("company-sso/settings", original.access_token);
  assert.equal(settings.entityId, sp.entityId, "Stirling Entity ID differs from live Supabase metadata.");
  assert.equal(settings.acsUrl, sp.acsUrl, "Stirling ACS differs from live Supabase metadata.");
  assert.equal(settings.available, true, "Enable company SSO on the test backend.");
  assert.equal(settings.eligible, true, "Start an Enterprise trial for the disposable team.");
  pass("Live Supabase metadata agrees with Stirling; SSO and Enterprise access are enabled");

  let checkpoint;
  if (settings.active) {
    checkpoint = JSON.parse(await readFile(path.join(stateDir, "checkpoint.json"), "utf8"));
    assert.equal(checkpoint.projectRef, c.projectRef);
    assert.equal(checkpoint.teamId, c.expectedTeamId);
    assert.equal(checkpoint.originalAuthId, original.user.id);
    assert.equal(checkpoint.connectionId, settings.connectionId, "Refusing an active connection not created by this lab.");
  } else {
    const owner = await me(original.access_token);
    assert.equal(owner.team?.id, c.expectedTeamId, "The signed-in leader is not in the configured test team.");
    const member = (await members(original.access_token)).find((row) => row.id === owner.id);
    assert.equal(member?.role, "LEADER");
    assert.equal(member?.supabaseId, original.user.id);
    checkpoint = { projectRef: c.projectRef, teamId: c.expectedTeamId, originalAuthId: original.user.id, ownerId: owner.id };
  }
  const metadataXml = await readFile(path.join(stateDir, "idp.xml"), "utf8");
  assert.ok(metadataXml.includes("EntityDescriptor"), "Run configure to prepare IdP metadata.");
  pass("Test leader and disposable team identified");
  if (mode === "doctor") {
    console.log(
      "Preflight passed. The run command saves and activates SSO for this team, then adds/removes/rejoins the lab employee.",
    );
    return;
  }

  step = "browser startup";
  const { chromium, expect } = browserTools();
  browser = await chromium.launch({ headless: c.idp !== "entra" && !process.argv.includes("--headed") });

  /** A new browser context forces a fresh SAML ceremony; no auth responses or API calls are mocked. */
  async function companyLogin(username, connect = false) {
    const context = await browser.newContext({ locale: "en-US" });
    await context.addCookies([
      {
        name: "cc_cookie",
        value: JSON.stringify({ categories: ["necessary"], revision: 0, data: null, rfc_cookie: false }),
        url: c.appUrl,
      },
    ]);
    const page = await context.newPage();
    page.setDefaultTimeout(45_000);
    try {
      await page.goto(
        `${c.appUrl.replace(/\/$/, "")}/company-sso?connection=${settings.connectionId}${connect ? "&connect=1" : ""}`,
      );
      if (connect) {
        await page.getByLabel("Existing account email", { exact: true }).fill(c.leader.email);
        await page.getByLabel("Password", { exact: true }).fill(c.leader.password);
        await page.getByRole("button", { name: "Verify existing account", exact: true }).click();
        await expect(page.getByText(`Existing account: ${c.leader.email}`, { exact: true })).toBeVisible();
      }
      const startResponse = page.waitForResponse(
        (response) => response.url().endsWith("/api/v1/company-sso/start") && response.request().method() === "POST",
      );
      await page.getByRole("button", { name: "Continue with company SSO", exact: true }).click();
      const started = await startResponse;
      assert.equal(started.status(), 200, "The company sign-in attempt was rejected.");
      const start = await started.json();
      if (c.idp === "keycloak") {
        await page.waitForURL((url) => url.origin === idpUrl);
        await page.locator("#username").fill(username);
        await page.locator("#password").fill(c.keycloak.userPassword);
        await page.locator("#kc-login").click();
      } else {
        console.log(`Complete Entra sign-in in the opened browser as the ${username} test user (including MFA).`);
      }
      await expect(page.getByText(/^Company identity:/)).toBeVisible({ timeout: 300_000 });
      if (connect && (await page.getByRole("button", { name: "Connect an existing team account", exact: true }).isVisible())) {
        await page.getByRole("button", { name: "Connect an existing team account", exact: true }).click();
      }
      const session = await page.evaluate(() => JSON.parse(sessionStorage.getItem("company-sso-session")));
      assertSaml(session, start.providerId);
      if (username === "employee") {
        await required(session.access_token);
      }
      await page
        .getByRole("button", { name: connect ? "Connect my existing account" : "Continue to my company team", exact: true })
        .click();
      await expect(page.getByRole("heading", { name: "Your account is connected", exact: true })).toBeVisible();
      return { session, provider: start.providerId };
    } finally {
      await context.close();
    }
  }

  step = "draft provider registration";
  if (!settings.active) {
    await api("company-sso/settings", original.access_token, { metadataXml });
    settings = await api("company-sso/settings", original.access_token);
    checkpoint.connectionId = settings.connectionId;
    await save("checkpoint.json", checkpoint);
  }

  step = "owner conversion through the real SAML browser flow";
  const owner = await companyLogin("owner", !settings.active);
  const ownerMe = await me(owner.session.access_token);
  assert.equal(ownerMe.id, checkpoint.ownerId);
  assert.equal(ownerMe.team?.id, c.expectedTeamId);
  let ownerMember = (await members(owner.session.access_token)).find((row) => row.id === checkpoint.ownerId);
  assert.equal(ownerMember.role, "LEADER");
  assert.equal(ownerMember.supabaseId, checkpoint.originalAuthId);
  assert.notEqual(
    owner.session.user.id,
    checkpoint.originalAuthId,
    "SAML auth identity should be separate from the original billing identity.",
  );
  pass("Owner conversion preserves account ID, company team, leadership and billing UUID");

  step = "SSO activation and ordinary-login denial";
  if (!settings.active) await api("company-sso/activate", owner.session.access_token, {});
  settings = await api("company-sso/settings", owner.session.access_token);
  assert.equal(settings.active, true);
  await required(original.access_token);
  pass("Required SSO blocks the original password session");

  step = "new employee admission";
  const membersBeforeAdmission = await members(owner.session.access_token);
  const employee = await companyLogin("employee");
  const employeeMe = await me(employee.session.access_token);
  assert.equal(employeeMe.team?.id, c.expectedTeamId);
  assert.notEqual(employeeMe.id, checkpoint.ownerId);
  if (checkpoint.employeeId) assert.equal(employeeMe.id, checkpoint.employeeId);
  else {
    assert.ok(
      !membersBeforeAdmission.some((row) => row.id === employeeMe.id),
      "Use a new test employee; the suite will not remove a pre-existing team member.",
    );
  }
  checkpoint.employeeId = employeeMe.id;
  await save("checkpoint.json", checkpoint);
  const member = (await members(owner.session.access_token)).find((row) => row.id === employeeMe.id);
  assert.equal(member?.role, "MEMBER");
  pass("Unadmitted SAML session is denied; admitted employee joins the correct team as Member");

  step = "membership restrictions";
  const leave = await api(`team/${c.expectedTeamId}/leave`, employee.session.access_token, {}, { expected: [400] });
  assert.match(leave.error, /company manages this team/i);
  const stillMember = (await members(owner.session.access_token)).some((row) => row.id === employeeMe.id);
  assert.ok(stillMember, "Denied Leave must preserve membership.");
  pass("Employee cannot leave the managed team");

  step = "refresh and leader removal";
  const refreshed = await auth("token?grant_type=refresh_token", { refresh_token: employee.session.refresh_token });
  assertSaml(refreshed, employee.provider);
  assert.equal((await me(refreshed.access_token)).id, employeeMe.id);
  await api(`team/${c.expectedTeamId}/members/${employeeMe.id}`, owner.session.access_token, undefined, { method: "DELETE" });
  await required(employee.session.access_token);
  await required(refreshed.access_token);
  const refreshedAfterRemoval = await auth("token?grant_type=refresh_token", { refresh_token: refreshed.refresh_token });
  await required(refreshedAfterRemoval.access_token);
  pass("Removal rejects existing sessions and tokens refreshed before or after removal");

  step = "fresh SAML rejoin";
  const rejoined = await companyLogin("employee");
  assert.equal((await me(rejoined.session.access_token)).id, employeeMe.id);
  assert.equal((await members(owner.session.access_token)).find((row) => row.id === employeeMe.id)?.role, "MEMBER");
  await required(refreshedAfterRemoval.access_token);
  pass("Fresh SAML rejoin preserves the user as Member and cannot revive the old session");
  await save("result.json", {
    status: "passed",
    at: new Date().toISOString(),
    projectRef: c.projectRef,
    teamId: c.expectedTeamId,
    connectionId: settings.connectionId,
    checks: passed,
  });
  console.log(`Live SAML acceptance passed. Company link: ${c.appUrl}/company-sso?connection=${settings.connectionId}`);
}

try {
  await main();
} catch (error) {
  // Browser errors can include assertion URLs or tokens. Persist only the failing stage.
  console.error(
    `FAIL ${step}. Check the prerequisites in testing/enterprise-sso/README.md; no credential-bearing browser traces are saved.`,
  );
  if (error.code === "ERR_ASSERTION" && !error.generatedMessage) {
    console.error(error.message.split("\n")[0]);
  }
  await save("result.json", { status: "failed", at: new Date().toISOString(), failedStep: step, checks: passed }).catch(
    () => {},
  );
  process.exitCode = 1;
} finally {
  await browser?.close();
}
