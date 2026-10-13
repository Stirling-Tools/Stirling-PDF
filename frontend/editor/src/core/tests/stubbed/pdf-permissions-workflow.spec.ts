import { test, expect } from "@app/tests/helpers/stub-test-base";
import path from "node:path";

const fixture = path.join(
  import.meta.dirname,
  "../test-fixtures/owner-only-restricted.pdf",
);

test("owner-only PDF opens without prompting and elevation retains the original on cancellation", async ({
  page,
}) => {
  await page.route("**/api/v1/security/inspect-pdf-security", (route) => {
    const body = route.request().postData() ?? "";
    const password = /name="password"\r\n\r\n([^\r]*)/.exec(body)?.[1] ?? "";
    if (password && password !== "owner-test-password") {
      return route.fulfill({
        status: 400,
        json: { type: "/errors/pdf-password", status: 400 },
      });
    }
    return route.fulfill({
      json: {
        encrypted: true,
        signed: false,
        ownerAuthenticated: password === "owner-test-password",
        permissions: 0,
        encryptionKeyLength: 256,
        encryptionRevision: 6,
        credentialFingerprint: "fixture-credentials",
        canModify: password !== "",
        canAssemble: password !== "",
        pageCount: 1,
      },
    });
  });
  await page.goto("/annotate");
  await page.getByTestId("files-button").click();
  await page.getByTestId("file-input").setInputFiles(fixture);
  const firstPage = page.locator('[data-page-index="0"]').first();
  await expect(firstPage).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole("dialog")).toHaveCount(0);
  const elevate = page.getByRole("button", {
    name: "Enter permissions password",
    exact: true,
  });
  await expect(elevate).toBeVisible();
  await firstPage.click();
  await page.keyboard.press("Control+a");
  const copy = page
    .locator("[data-text-selection-menu]")
    .getByRole("button", { name: "Copy", exact: true });
  await expect(copy).toBeDisabled();
  await elevate.click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Close", exact: true })
    .click();
  await expect(firstPage).toBeVisible();
  await expect(elevate).toBeVisible();
  await elevate.click();
  await page.getByPlaceholder("Enter the PDF password").fill("incorrect");
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Unlock", exact: true })
    .click();
  await expect(page.getByRole("dialog").getByRole("alert")).toBeVisible();
  await page
    .getByPlaceholder("Enter the PDF password")
    .fill("owner-test-password");
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Unlock", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(
    page.getByText(
      "Permissions password verified for this session. Stored document restrictions remain unchanged.",
    ),
  ).toBeVisible();
  await expect(firstPage).toBeVisible();
  await firstPage.click();
  await page.keyboard.press("Control+a");
  await expect(copy).toBeEnabled();
  await expect(
    page.getByRole("button", { name: "Highlight", exact: true }),
  ).toHaveCount(0);
});
