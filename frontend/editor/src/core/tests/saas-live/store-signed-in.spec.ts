import {
  test,
  expect,
  request as playwrightRequest,
  type APIRequestContext,
} from "@playwright/test";
import {
  SELF_HOSTED_API_URL,
  STATE_FILE,
  anonymousApi,
  savedSession,
  signedInApi,
} from "@app/tests/saas-live/saasLive";
import {
  DEFAULT_TEST_PASSWORD,
  DEFAULT_TEST_USERNAME,
} from "@app/tests/helpers/login";

/**
 * One listing's whole life on a real SaaS backend and database, as a team leader: build a
 * pipeline that holds passwords, check the preflight, publish, read it back as a stranger, search,
 * star, install from the listing page, remove and republish. Optionally installs the same listing
 * on a linked self-hosted server too.
 *
 * The database is shared, so the run names everything with a run id and deletes its pipelines at
 * the end. The listing itself can only be soft-removed, so a REMOVED row per run stays behind.
 */

test.describe.configure({ mode: "serial" });
test.use({ storageState: STATE_FILE });

const RUN = Date.now().toString(36);
const NAME = `Encrypt and compress check ${RUN}`;
const DESCRIPTION =
  "Locks each document with a password and then shrinks it, from an automated store check.";
const USER_PASSWORD = `e2e-user-${RUN}`;
const OWNER_PASSWORD = `e2e-owner-${RUN}`;
const PUBLIC = "/api/v1/store/public/pipelines";

let api: APIRequestContext;
let anon: APIRequestContext;
let email: string | null = null;
let policyId = "";
let storeId = "";
let publisherName = "";
const createdPolicyIds: string[] = [];

function details(extra: Record<string, unknown> = {}) {
  return {
    policyId,
    name: NAME,
    description: DESCRIPTION,
    category: "security",
    ...extra,
  };
}

function chainWithPasswords() {
  return [
    {
      operation: "/api/v1/misc/compress-pdf",
      parameters: { optimizeLevel: 2 },
    },
    {
      operation: "/api/v1/security/add-password",
      parameters: {
        password: USER_PASSWORD,
        ownerPassword: OWNER_PASSWORD,
        keyLength: 256,
      },
    },
  ];
}

function codes(report: { findings: Array<{ code: string }> }): string[] {
  return report.findings.map((finding) => finding.code);
}

function containsSecret(value: unknown): boolean {
  const text = JSON.stringify(value);
  return text.includes(USER_PASSWORD) || text.includes(OWNER_PASSWORD);
}

test.beforeAll(async () => {
  const session = savedSession();
  test.skip(
    !session,
    "Needs SAAS_E2E_EMAIL and SAAS_E2E_PASSWORD for a v3 team leader with portal access",
  );
  api = await signedInApi(session!.accessToken);
  anon = await anonymousApi();
  email = session!.email;
});

test.afterAll(async () => {
  if (!api) return;
  if (storeId) {
    await api.delete(`/api/v1/store/pipelines/${storeId}`).catch(() => null);
  }
  for (const id of createdPolicyIds) {
    await api.delete(`/api/v1/policies/${id}`).catch(() => null);
  }
  await api.dispose();
  await anon.dispose();
});

test("a team leader creates a pipeline that holds passwords", async () => {
  const res = await api.post("/api/v1/policies", {
    data: {
      name: NAME,
      enabled: false,
      required: false,
      icon: "lock",
      inputs: [],
      // Compress first: compress cannot read an encrypted PDF.
      steps: chainWithPasswords(),
      outputIds: [],
    },
  });
  expect(res.status(), await res.text()).toBe(200);
  policyId = (await res.json()).id;
  expect(policyId).toBeTruthy();
  createdPolicyIds.push(policyId);
});

test("the preflight blocks reserved words and contact details in the text", async () => {
  const res = await api.post("/api/v1/store/publish/preflight", {
    data: details({
      name: `Official Stirling compressor ${RUN}`,
      description:
        "Write to someone@example.com and ask for the settings to use.",
    }),
  });
  expect(res.status()).toBe(200);
  const report = await res.json();
  expect(report.canPublish).toBe(false);
  expect(report.manifest).toBeNull();
  expect(codes(report)).toEqual(
    expect.arrayContaining(["reserved-word", "email-in-text"]),
  );
});

test("the preflight blocks profanity, however it is spelled", async () => {
  for (const name of [`F.u.c.k compressor ${RUN}`, `Sh1tty scans ${RUN}`]) {
    const report = await (
      await api.post("/api/v1/store/publish/preflight", {
        data: details({ name }),
      })
    ).json();
    expect(report.canPublish, name).toBe(false);
    expect(codes(report), name).toContain("blocked-word");
  }
});

test("the preflight clears both passwords and asks installers for them", async () => {
  const res = await api.post("/api/v1/store/publish/preflight", {
    data: details(),
  });
  expect(res.status()).toBe(200);
  const report = await res.json();
  expect(report.canPublish, JSON.stringify(report.findings)).toBe(true);
  expect(report.existingStoreId).toBeNull();
  expect(containsSecret(report)).toBe(false);

  const cleared = report.findings.find(
    (finding: { code: string }) => finding.code === "secret-cleared",
  );
  expect(cleared?.severity).toBe("warn");
  expect(cleared?.where).toMatchObject({ kind: "step", stepIndex: 1 });

  const [compress, encrypt] = report.manifest.steps;
  expect(encrypt.parameters).not.toHaveProperty("password");
  expect(encrypt.parameters).not.toHaveProperty("ownerPassword");
  expect(encrypt.parameters.keyLength).toBe(256);
  expect(compress.parameters.optimizeLevel).toBe(2);
  expect(report.manifest.requiredOnInstall).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ kind: "source" }),
      expect.objectContaining({ kind: "destination" }),
      expect.objectContaining({
        kind: "parameter",
        stepIndex: 1,
        field: "password",
      }),
      expect.objectContaining({
        kind: "parameter",
        stepIndex: 1,
        field: "ownerPassword",
      }),
    ]),
  );
});

test("publishing blocked text is refused with the report", async () => {
  const res = await api.post("/api/v1/store/publish", {
    data: details({ name: `Stirling verified ${RUN}` }),
  });
  expect(res.status()).toBe(422);
  const report = await res.json();
  expect(report.canPublish).toBe(false);
  expect(codes(report)).toContain("reserved-word");
});

test("publishing clean text creates a listing with a store id", async () => {
  const res = await api.post("/api/v1/store/publish", { data: details() });
  expect(res.status(), await res.text()).toBe(201);
  const listing = await res.json();
  expect(listing.storeId).toMatch(/^sp-[0-9a-hjkmnp-tv-z]{8}$/);
  storeId = listing.storeId;
  expect(listing.name).toBe(NAME);
  expect(listing.viewer.isTeammate).toBe(true);
  expect(listing.viewer.author?.displayName).toBeTruthy();
  publisherName = listing.viewer.author.displayName;
  expect(containsSecret(listing)).toBe(false);
  // Stored in UTC: a server-local timestamp read as UTC lands in the future and shows "just now".
  expect(Math.abs(Date.parse(listing.updatedAt) - Date.now())).toBeLessThan(
    5 * 60_000,
  );
});

test("the source pipeline links back to its listing", async () => {
  const res = await api.get(`/api/v1/policies/${policyId}`);
  expect(res.status()).toBe(200);
  expect((await res.json()).storeId).toBe(storeId);
});

test("editing the pipeline keeps the link, so publishing again is a republish", async () => {
  // The builder saves the whole policy without storeId; that used to unlink it.
  const { storeId: _link, ...edited } = await (
    await api.get(`/api/v1/policies/${policyId}`)
  ).json();
  const saved = await api.post("/api/v1/policies", {
    data: { ...edited, name: `${NAME} edited` },
  });
  expect(saved.status(), await saved.text()).toBe(200);
  expect((await saved.json()).storeId).toBe(storeId);

  const report = await (
    await api.post("/api/v1/store/publish/preflight", { data: details() })
  ).json();
  expect(report.existingStoreId).toBe(storeId);
});

test("the owner edits the listing's words without republishing", async () => {
  const before = await (await api.get(`${PUBLIC}/${storeId}`)).json();
  const description =
    "Locks each document with a password, then shrinks it. Edited by the store check.";
  const res = await api.patch(`/api/v1/store/pipelines/${storeId}`, {
    data: {
      name: NAME,
      description,
      category: "security",
      whatChanged: "Clearer description.",
    },
  });
  expect(res.status(), await res.text()).toBe(200);

  const after = await (await anon.get(`${PUBLIC}/${storeId}`)).json();
  expect(after.description).toBe(description);
  expect(after.latestChange).toBe("Clearer description.");
  expect(after.updatedAt).toBe(before.updatedAt);
  expect(after.steps).toEqual(before.steps);

  const blocked = await api.patch(`/api/v1/store/pipelines/${storeId}`, {
    data: { name: `Official ${NAME}`, description, category: "security" },
  });
  expect(blocked.status()).toBe(422);
  expect(codes(await blocked.json())).toContain("reserved-word");
});

test("a stranger sees the listing but never its author or the passwords", async () => {
  const detail = await anon.get(`${PUBLIC}/${storeId}`);
  expect(detail.status()).toBe(200);
  const body = await detail.json();
  expect(body.viewer).toBeNull();
  expect(body.starred).toBeNull();
  const text = JSON.stringify(body);
  expect(text).not.toContain(publisherName);
  if (email) expect(text).not.toContain(email);
  expect(containsSecret(body)).toBe(false);

  const manifest = await anon.get(`${PUBLIC}/${storeId}/manifest`);
  expect(manifest.status()).toBe(200);
  expect(containsSecret(await manifest.json())).toBe(false);
});

test("search puts an exact store id first and finds the name", async () => {
  const byId = await (await anon.get(`${PUBLIC}?q=${storeId}`)).json();
  expect(byId.items[0]?.storeId).toBe(storeId);

  const byName = await (await anon.get(`${PUBLIC}?q=${RUN}&limit=60`)).json();
  expect(
    byName.items.map((item: { storeId: string }) => item.storeId),
  ).toContain(storeId);

  const byCategory = await (
    await anon.get(`${PUBLIC}?q=${RUN}&category=retention`)
  ).json();
  expect(byCategory.total).toBe(0);
});

test("stars are per user and idempotent", async () => {
  const star = `/api/v1/store/pipelines/${storeId}/star`;
  expect(await (await api.put(star)).json()).toEqual({
    starCount: 1,
    starred: true,
  });
  expect((await (await api.put(star)).json()).starCount).toBe(1);

  const detail = await (await api.get(`${PUBLIC}/${storeId}`)).json();
  expect(detail.starred).toBe(true);
  const starred = await (await api.get("/api/v1/store/starred")).json();
  expect(starred.map((item: { storeId: string }) => item.storeId)).toContain(
    storeId,
  );

  expect(await (await api.delete(star)).json()).toEqual({
    starCount: 0,
    starred: false,
  });
  expect((await (await api.delete(star)).json()).starCount).toBe(0);
});

test("installing from the listing page makes a paused copy and opens the builder", async ({
  page,
}) => {
  await page.goto(`processor/store/${storeId}`, {
    waitUntil: "domcontentloaded",
  });
  await expect(page.getByRole("heading", { name: NAME })).toBeVisible({
    timeout: 30_000,
  });
  await page.getByRole("button", { name: "Install to your team" }).click();
  await page.waitForURL(/\/processor\/pipelines\/[^/?#]+/, { timeout: 30_000 });

  const copyId = decodeURIComponent(
    new URL(page.url()).pathname.split("/").pop() ?? "",
  );
  expect(copyId).not.toBe(policyId);
  createdPolicyIds.push(copyId);

  const copy = await (await api.get(`/api/v1/policies/${copyId}`)).json();
  expect(copy.storeId).toBe(storeId);
  expect(copy.enabled).toBe(false);
  expect(copy.inputs).toEqual([]);
  expect(copy.outputIds).toEqual([]);
  expect(
    copy.steps.map((step: { operation: string }) => step.operation),
  ).toEqual(["/api/v1/misc/compress-pdf", "/api/v1/security/add-password"]);
  expect(containsSecret(copy)).toBe(false);

  // The install count is recorded after navigation, best effort.
  await expect
    .poll(
      async () =>
        (await (await anon.get(`${PUBLIC}/${storeId}`)).json()).installCount,
      { timeout: 15_000 },
    )
    .toBe(1);
});

test("a second install into the same team is not counted again", async () => {
  const res = await api.post(`/api/v1/store/pipelines/${storeId}/install`, {
    data: { target: "team" },
  });
  expect(res.status()).toBe(200);
  expect((await res.json()).installCount).toBe(1);
});

test("a linked self-hosted server installs the listing as its own paused copy", async () => {
  test.skip(
    !SELF_HOSTED_API_URL,
    "Set SELF_HOSTED_E2E_API_URL to a running self-hosted backend",
  );
  const server = await playwrightRequest.newContext({
    baseURL: SELF_HOSTED_API_URL,
  });
  try {
    const login = await server.post("/api/v1/auth/login", {
      data: {
        username: process.env.SELF_HOSTED_E2E_USER ?? DEFAULT_TEST_USERNAME,
        password: process.env.SELF_HOSTED_E2E_PASSWORD ?? DEFAULT_TEST_PASSWORD,
      },
    });
    expect(login.status(), await login.text()).toBe(200);
    const token = (await login.json()).session.access_token;
    const headers = { Authorization: `Bearer ${token}` };

    const manifest = await (
      await anon.get(`${PUBLIC}/${storeId}/manifest`)
    ).json();
    const imported = await server.post("/api/v1/policies/import", {
      headers,
      data: {
        name: manifest.name,
        icon: manifest.icon,
        storeId,
        steps: manifest.steps,
      },
    });
    expect(imported.status(), await imported.text()).toBe(201);
    const copy = await imported.json();
    expect(copy.storeId).toBe(storeId);
    expect(copy.enabled).toBe(false);
    expect(copy.name.startsWith(NAME)).toBe(true);
    expect(containsSecret(copy)).toBe(false);
    await server.delete(`/api/v1/policies/${copy.id}`, { headers });
  } finally {
    await server.dispose();
  }
});

test("a self-hosted server publishes its own pipeline, and its passwords stay on it", async () => {
  test.skip(
    !SELF_HOSTED_API_URL,
    "Set SELF_HOSTED_E2E_API_URL to a running self-hosted backend",
  );
  const server = await playwrightRequest.newContext({
    baseURL: SELF_HOSTED_API_URL,
  });
  let listingId = "";
  let localId = "";
  try {
    const login = await server.post("/api/v1/auth/login", {
      data: {
        username: process.env.SELF_HOSTED_E2E_USER ?? DEFAULT_TEST_USERNAME,
        password: process.env.SELF_HOSTED_E2E_PASSWORD ?? DEFAULT_TEST_PASSWORD,
      },
    });
    const headers = {
      Authorization: `Bearer ${(await login.json()).session.access_token}`,
    };
    const local = await server.post("/api/v1/policies", {
      headers,
      data: {
        name: `${NAME} self-hosted`,
        enabled: false,
        required: false,
        icon: "lock",
        inputs: [],
        steps: chainWithPasswords(),
        outputIds: [],
      },
    });
    expect(local.status(), await local.text()).toBe(200);
    localId = (await local.json()).id;

    // The store cannot read this server's pipelines, so the portal sends an export of it.
    const exported = await (
      await server.get(`/api/v1/policies/${localId}/store-export`, { headers })
    ).json();
    expect(containsSecret(exported)).toBe(false);

    const published = await api.post("/api/v1/store/publish", {
      data: {
        policyId: localId,
        name: `Self-hosted shrink and lock ${RUN}`,
        description: DESCRIPTION,
        category: "security",
        policy: exported,
      },
    });
    expect(published.status(), await published.text()).toBe(201);
    listingId = (await published.json()).storeId;
    const manifest = await (
      await anon.get(`${PUBLIC}/${listingId}/manifest`)
    ).json();
    expect(containsSecret(manifest)).toBe(false);

    const linked = await server.put(`/api/v1/policies/${localId}/store-link`, {
      headers,
      data: { storeId: listingId },
    });
    expect((await linked.json()).storeId).toBe(listingId);

    // Linked, the next publish from that server is a republish of the same listing.
    const again = await (
      await server.get(`/api/v1/policies/${localId}/store-export`, { headers })
    ).json();
    const report = await (
      await api.post("/api/v1/store/publish/preflight", {
        data: {
          policyId: localId,
          name: `Self-hosted shrink and lock ${RUN}`,
          description: DESCRIPTION,
          category: "security",
          policy: again,
        },
      })
    ).json();
    expect(report.existingStoreId).toBe(listingId);
  } finally {
    if (listingId) await api.delete(`/api/v1/store/pipelines/${listingId}`);
    if (localId) {
      const relogin = await server.post("/api/v1/auth/login", {
        data: {
          username: process.env.SELF_HOSTED_E2E_USER ?? DEFAULT_TEST_USERNAME,
          password:
            process.env.SELF_HOSTED_E2E_PASSWORD ?? DEFAULT_TEST_PASSWORD,
        },
      });
      await server.delete(`/api/v1/policies/${localId}`, {
        headers: {
          Authorization: `Bearer ${(await relogin.json()).session.access_token}`,
        },
      });
    }
    await server.dispose();
  }
});

test("the team sees its listing with who published it", async () => {
  const res = await api.get("/api/v1/store/team/pipelines");
  expect(res.status()).toBe(200);
  const mine = (await res.json()).find(
    (row: { storeId: string }) => row.storeId === storeId,
  );
  expect(mine).toMatchObject({
    status: "LISTED",
    removedBy: null,
    publishedBy: publisherName,
  });
});

test("removing hides the listing from everyone but the team", async () => {
  expect(
    (await api.delete(`/api/v1/store/pipelines/${storeId}`)).status(),
  ).toBe(204);

  expect((await anon.get(`${PUBLIC}/${storeId}`)).status()).toBe(410);
  expect((await anon.get(`${PUBLIC}/${storeId}/manifest`)).status()).toBe(410);
  expect((await (await anon.get(`${PUBLIC}?q=${storeId}`)).json()).total).toBe(
    0,
  );
  expect(
    (await api.put(`/api/v1/store/pipelines/${storeId}/star`)).status(),
  ).toBe(410);
  expect((await api.get(`${PUBLIC}/${storeId}`)).status()).toBe(200);

  const rows = await (await api.get("/api/v1/store/team/pipelines")).json();
  expect(
    rows.find((row: { storeId: string }) => row.storeId === storeId),
  ).toMatchObject({ status: "REMOVED", removedBy: "TEAM" });
});

test("republishing restores the listing under the same id", async () => {
  const whatChanged = "Second pass from the automated store check.";
  const res = await api.post(`/api/v1/store/pipelines/${storeId}/republish`, {
    data: details({ whatChanged }),
  });
  expect(res.status(), await res.text()).toBe(200);
  expect((await res.json()).storeId).toBe(storeId);

  const detail = await anon.get(`${PUBLIC}/${storeId}`);
  expect(detail.status()).toBe(200);
  expect((await detail.json()).latestChange).toBe(whatChanged);
});
