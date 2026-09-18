import { test, expect } from "@app/tests/helpers/stub-test-base";
import type { Page, Route } from "@playwright/test";

/**
 * The AI page's status card and mode chooser.
 *
 * The case that matters is `degraded`: the engine's own /health is exempt from the shared-secret
 * check, so before this card an admin with a mismatched secret saw a green "AI engine reachable"
 * toast while every real request was being refused. The card must say amber there.
 */

test.use({ stubOptions: { enableLogin: true, isAdmin: true }, seedJwt: true });

const ENABLED_SETTINGS = {
  enabled: true,
  url: "http://stirling-engine:5001",
  timeoutSeconds: 120,
  longRunningTimeoutSeconds: 600,
  streamTimeoutSeconds: 1800,
  features: {
    chat: true,
    documentQuestions: true,
    createPdf: true,
    mathAuditor: true,
    pdfComment: true,
    classify: false,
  },
  models: {
    provider: "anthropic",
    smartModel: "claude-sonnet-5",
    fastModel: "claude-haiku-4-5",
  },
  rag: { embeddingProvider: "voyageai", embeddingModel: "voyage-4", topK: 20 },
  limits: { maxPages: 500, maxCharacters: 200000, modelMaxConcurrency: 4 },
};

async function openAiSettings(
  page: Page,
  status: Record<string, unknown>,
  settings: Record<string, unknown> = ENABLED_SETTINGS,
  linked = false,
) {
  await page.route("**/api/v1/account-link/status", (route: Route) =>
    route.fulfill({ json: { linked } }),
  );
  await page.route(
    "**/api/v1/admin/settings/section/aiEngine",
    (route: Route) => route.fulfill({ json: settings }),
  );
  await page.route("**/api/v1/ai/status", (route: Route) =>
    route.fulfill({ json: status }),
  );
  await page.goto("/settings/adminAi");
  await expect(page.locator(".settings-page")).toBeVisible({ timeout: 30_000 });
  await page.locator(".settings-card").first().waitFor({ timeout: 20_000 });
}

/** The card with this heading, so a word the status strip also uses stays unambiguous. */
function cardNamed(page: Page, heading: string) {
  return page.locator(".settings-card").filter({ hasText: heading }).first();
}

/**
 * Its label carries the info-tooltip text too, and "Smart model max tokens" shares the prefix, so
 * match far enough in to land on the model field itself.
 */
function smartModelInput(page: Page) {
  return cardNamed(page, "Models & Providers").getByRole("textbox", {
    name: /^Smart model High-capability/,
  });
}

test("a healthy engine reports its models and an accepted secret", async ({
  page,
}) => {
  await openAiSettings(page, {
    enabled: true,
    reachable: true,
    latencyMs: 84,
    authenticated: true,
    smartModel: "claude-sonnet-5",
    fastModel: "claude-haiku-4-5",
  });

  await expect(page.getByText("Engine running").first()).toBeVisible();
  await expect(page.getByText("claude-sonnet-5").first()).toBeVisible();
  await expect(page.getByText("claude-haiku-4-5").first()).toBeVisible();
  await expect(page.getByText("Accepted").first()).toBeVisible();
  await expect(page.getByText("84 ms").first()).toBeVisible();
});

test("a rejected shared secret reads as a problem, not as healthy", async ({
  page,
}) => {
  await openAiSettings(page, {
    enabled: true,
    reachable: true,
    latencyMs: 61,
    authenticated: false,
    smartModel: "claude-sonnet-5",
    fastModel: "claude-haiku-4-5",
    error: "The engine rejected this server's shared secret.",
  });

  await expect(
    page.getByText("Engine is up, but refusing this server").first(),
  ).toBeVisible();
  await expect(
    page.getByText(/different shared secrets/i).first(),
  ).toBeVisible();
  await expect(page.getByText("Rejected").first()).toBeVisible();
  // The engine answered /health, so anything keyed off reachability alone would say "running".
  await expect(page.getByText("Engine running")).toHaveCount(0);
});

test("an unreachable engine says so and offers no stale detail", async ({
  page,
}) => {
  await openAiSettings(page, {
    enabled: true,
    reachable: false,
    error: "AI engine request timed out",
  });

  await expect(page.getByText("Engine unreachable").first()).toBeVisible();
  await expect(
    page.getByText("AI engine request timed out").first(),
  ).toBeVisible();
});

test("with AI off the card stays quiet and the facts are hidden", async ({
  page,
}) => {
  await openAiSettings(
    page,
    { enabled: false, reachable: false },
    { ...ENABLED_SETTINGS, enabled: false },
  );

  await expect(page.getByText("AI is switched off").first()).toBeVisible();
  // Scoped to the status card: "Smart model" is also a field label further down the page.
  const statusCard = page.locator(".settings-card").first();
  await expect(statusCard.getByText("Smart model")).toHaveCount(0);
  await expect(statusCard.getByText("Engine URL")).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: /Check again/i }),
  ).toBeDisabled();
});

test("the status card adds a Status anchor to the section nav", async ({
  page,
}) => {
  await openAiSettings(page, {
    enabled: true,
    reachable: true,
    authenticated: true,
  });

  // Poll because the cards mount lazily, and trim because WebKit keeps the whitespace around
  // each heading that Chromium strips - the raw strings are not comparable across engines.
  await expect
    .poll(async () =>
      (await page.locator(".settings-card__toggle").allInnerTexts()).map((t) =>
        t.trim(),
      ),
    )
    .toEqual([
      "Status",
      "Connection",
      "Capabilities",
      "Models & Providers",
      "Documents & RAG",
      "Limits & Performance",
    ]);
});

test("the mode chooser owns the engine fields, and cloud is not selectable", async ({
  page,
}) => {
  await openAiSettings(page, {
    enabled: true,
    reachable: true,
    authenticated: true,
  });

  const self = page.getByRole("radio", { name: /Run your own engine/i });
  const off = page.getByRole("radio", { name: /^Off$/i });
  const cloud = page.getByRole("radio", { name: /Stirling Cloud AI/i });

  await expect(self).toBeChecked();
  await expect(cloud).toBeDisabled();
  await expect(page.getByLabel(/AI engine URL/i)).toBeVisible();

  // Switching off takes the engine fields with it - they belong to the option.
  await off.click();
  await expect(off).toBeChecked();
  await expect(page.getByLabel(/AI engine URL/i)).toHaveCount(0);

  await self.click();
  await expect(page.getByLabel(/AI engine URL/i)).toBeVisible();
});

test("the about notice links to the set-up guide", async ({ page }) => {
  await openAiSettings(page, {
    enabled: true,
    reachable: true,
    authenticated: true,
  });

  const guide = page.getByRole("link", { name: /Set-up guide/i });
  await expect(guide).toBeVisible();
  await expect(guide).toHaveAttribute(
    "href",
    "https://docs.stirlingpdf.com/Configuration/AI%20Engine",
  );
});

test("cloud AI is not selectable until the server is linked", async ({
  page,
}) => {
  await openAiSettings(
    page,
    { enabled: true, reachable: true, authenticated: true },
    ENABLED_SETTINGS,
    false,
  );

  await expect(
    page.getByRole("radio", { name: /Stirling Cloud AI/i }),
  ).toBeDisabled();
  await expect(page.getByText(/Link an account first/i).first()).toBeVisible();
});

test("a linked server can pick cloud AI, and ingestion is off until asked for", async ({
  page,
}) => {
  await openAiSettings(
    page,
    { enabled: true, reachable: true, authenticated: true },
    ENABLED_SETTINGS,
    true,
  );

  const cloud = page.getByRole("radio", { name: /Stirling Cloud AI/i });
  await expect(cloud).toBeEnabled();
  await cloud.click();
  await expect(cloud).toBeChecked();

  // The engine fields belong to the self-hosted option and go with it.
  await expect(page.getByLabel(/AI engine URL/i)).toHaveCount(0);

  // The switch that decides whether whole documents leave the building, off by default.
  const upload = page.getByRole("switch", {
    name: /Send documents to Stirling Cloud/i,
  });
  await expect(upload).not.toBeChecked();
  // Click the visible label wrapper, not the hidden input - the house pattern for Mantine
  // switches, because force-clicking the input does not register in Firefox.
  await page
    .locator('label:has(input[aria-label="Send documents to Stirling Cloud"])')
    .click();
  await expect(upload).toBeChecked();
});

test("a server already in cloud mode opens on it", async ({ page }) => {
  await openAiSettings(
    page,
    { enabled: true, reachable: true, authenticated: true },
    {
      ...ENABLED_SETTINGS,
      mode: "CLOUD",
      cloud: { allowDocumentUpload: true },
    },
    true,
  );

  await expect(
    page.getByRole("radio", { name: /Stirling Cloud AI/i }),
  ).toBeChecked();
  await expect(
    page.getByRole("switch", { name: /Send documents to Stirling Cloud/i }),
  ).toBeChecked();
});

test("an unlinked server is pointed at where to link one", async ({ page }) => {
  await openAiSettings(
    page,
    { enabled: true, reachable: true, authenticated: true },
    ENABLED_SETTINGS,
    false,
  );

  const link = page.getByRole("link", {
    name: /Connect this server to a Stirling account/i,
  });
  await expect(link).toBeVisible();
  await expect(link).toHaveAttribute("href", "/settings/account-link");
});

test("cloud mode reports on Stirling Cloud, not on a local engine", async ({
  page,
}) => {
  await openAiSettings(
    page,
    {
      enabled: true,
      reachable: true,
      authenticated: true,
      smartModel: "managed-smart",
    },
    { ...ENABLED_SETTINGS, mode: "CLOUD" },
    true,
  );

  const statusCard = page.locator(".settings-card").first();
  await expect(
    statusCard.getByText("Running on Stirling Cloud", { exact: true }),
  ).toBeVisible();
  await expect(
    statusCard.getByText("Running on", { exact: true }),
  ).toBeVisible();
  await expect(
    statusCard.getByText("Account link", { exact: true }),
  ).toBeVisible();
  // The engine URL belongs to a server that is no longer doing the work.
  await expect(statusCard.getByText("Engine URL", { exact: true })).toHaveCount(
    0,
  );
  await expect(
    statusCard.getByText("Shared secret", { exact: true }),
  ).toHaveCount(0);
});

test("cloud mode makes the settings Stirling Cloud owns read-only", async ({
  page,
}) => {
  await openAiSettings(
    page,
    { enabled: true, reachable: true, authenticated: true },
    { ...ENABLED_SETTINGS, mode: "CLOUD" },
    true,
  );

  await expect(
    page.getByText("Managed by Stirling Cloud", { exact: true }).first(),
  ).toBeVisible();
  // Provider and embedding model are the cloud's to choose in this mode.
  await expect(smartModelInput(page)).toBeDisabled();
  await expect(
    cardNamed(page, "Documents & RAG").getByRole("textbox", {
      name: /^Embedding model/,
    }),
  ).toBeDisabled();
  // Capabilities and limits stay the admin's.
  await expect(
    // Mantine's NumberInput is a text input with inputmode=decimal, so its role is textbox.
    cardNamed(page, "Limits & Performance").getByRole("textbox", {
      name: /^Max pages per request/,
    }),
  ).toBeEnabled();
});

test("self-hosted mode leaves the model settings editable", async ({
  page,
}) => {
  await openAiSettings(
    page,
    { enabled: true, reachable: true, authenticated: true },
    ENABLED_SETTINGS,
    true,
  );

  await expect(smartModelInput(page)).toBeEnabled();
  await expect(
    page.getByText("Managed by Stirling Cloud", { exact: true }),
  ).toHaveCount(0);
});
