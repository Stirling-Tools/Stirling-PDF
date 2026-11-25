import { test, expect } from "@editor/tests/helpers/stub-test-base";
import { waitForEditorReady } from "@editor/tests/stubbed/editorReady";
import path from "path";

// qpdf --encrypt scan-password scan-password 256 -- scanned-no-ocr.pdf scanned-no-ocr-encrypted.pdf
const SCAN = path.join(
  import.meta.dirname,
  "../test-fixtures/scanned-no-ocr-encrypted.pdf",
);

test("an unlocked scan explains that OCR cannot preserve protection", async ({
  page,
}) => {
  const ocrRequests: string[] = [];
  page.on("request", (request) => {
    if (request.url().includes("/api/v1/misc/ocr-pdf"))
      ocrRequests.push(request.url());
  });

  await page.goto("/editor");
  await page.getByTestId("file-input").setInputFiles(SCAN);
  await page
    .getByLabel("Password to open", { exact: true })
    .fill("scan-password");
  await page.getByRole("button", { name: "Open PDF", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page
    .getByRole("link", { name: "PDF Text Editor", exact: true })
    .first()
    .click();
  await waitForEditorReady(page);
  const hint = page.getByTestId("pdf-editor-scan-hint");
  const ocr = hint.getByRole("button", { name: "Run OCR", exact: true });
  await expect(ocr).toBeVisible();
  await expect(ocr).toBeDisabled();
  await expect(hint.getByRole("note")).toHaveText(
    "OCR cannot yet preserve this PDF's protection. The protected original remains available for viewing.",
  );
  await expect(ocr).toHaveAccessibleDescription(/protection/);
  const removePassword = hint.getByRole("button", {
    name: "Remove Password",
    exact: true,
  });
  await expect(removePassword).toBeVisible();
  await page.getByTestId("pdf-editor-root").screenshot({
    path: test.info().outputPath("protected-ocr-sidebar.png"),
  });
  await expect(page).toHaveURL(/\/pdf-text-editor$/);
  expect(ocrRequests).toEqual([]);
  await removePassword.click();
  await expect(page).toHaveURL(/\/remove-password$/);
});
