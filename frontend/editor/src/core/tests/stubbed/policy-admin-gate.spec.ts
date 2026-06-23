import { test, expect } from "@app/tests/helpers/stub-test-base";

/**
 * Policy editing is admin-only (mirrors the backend's enforcement on the
 * save/delete endpoints). The frontend gate is `canConfigure = !enableLogin ||
 * isAdmin`, surfaced through `usePolicies()`:
 *   - login enabled + non-admin  → read-only: the setup wizard shows the
 *     "Managed by your organization" locked state instead of the steps.
 *   - login enabled + admin      → full setup flow ("Step 1 of 2").
 *   - login disabled (single-user/desktop) → open to the local operator.
 *
 * Backend-free: the app-config (`enableLogin`/`isAdmin`) and the empty policy
 * list are stubbed via `mockAppApis`, so this asserts the gating wiring without
 * a live Spring Boot server. "Security" is the only non-coming-soon policy, so
 * it's the one we open.
 */

const LOCKED_TITLE = "Managed by your organization";
const LOCKED_DESC = "Contact a team leader to change this policy.";

/** Open the Security policy from the right-sidebar Policies list. */
async function openSecurityPolicy(page: import("@playwright/test").Page) {
  const row = page.locator("button.pol-row").filter({ hasText: "Security" });
  await expect(row).toBeVisible({ timeout: 15_000 });
  await row.click();
  // The wizard header confirms we opened the right policy in either state.
  await expect(page.getByText("Set up Security Policy")).toBeVisible();
}

// Policies are a SaaS-only feature: POLICIES_ENABLED is off in the proprietary
// and core builds this stubbed suite runs against, so the policy UI never
// renders here. Skip unless the app under test is built with policies enabled
// and the runner opts in via POLICIES_E2E=1.
test.beforeEach(() => {
  const enabled = ["1", "true"].includes(process.env.POLICIES_E2E ?? "");
  test.skip(!enabled, "Policies are SaaS-only; set POLICIES_E2E=1 to run");
});

test.describe("Policy editing gate — non-admin (login on)", () => {
  test.use({
    stubOptions: { enableLogin: true, isAdmin: false },
    seedJwt: true,
  });

  test("non-admin gets the read-only locked state", async ({ page }) => {
    await openSecurityPolicy(page);
    await expect(page.getByText(LOCKED_TITLE)).toBeVisible();
    await expect(page.getByText(LOCKED_DESC)).toBeVisible();
    // The editable flow must NOT be reachable.
    await expect(page.getByText(/Step \d+ of \d+/)).toHaveCount(0);
  });
});

test.describe("Policy editing gate — admin (login on)", () => {
  test.use({
    stubOptions: { enableLogin: true, isAdmin: true },
    seedJwt: true,
  });

  test("admin can reach the setup wizard", async ({ page }) => {
    await openSecurityPolicy(page);
    await expect(page.getByText(/Step \d+ of \d+/)).toBeVisible();
    await expect(page.getByText(LOCKED_TITLE)).toHaveCount(0);
  });
});

test.describe("Policy editing gate — single-user (login off)", () => {
  test.use({ stubOptions: { enableLogin: false, isAdmin: false } });

  test("local operator can reach the setup wizard with no admin role", async ({
    page,
  }) => {
    await openSecurityPolicy(page);
    await expect(page.getByText(/Step \d+ of \d+/)).toBeVisible();
    await expect(page.getByText(LOCKED_TITLE)).toHaveCount(0);
  });
});
