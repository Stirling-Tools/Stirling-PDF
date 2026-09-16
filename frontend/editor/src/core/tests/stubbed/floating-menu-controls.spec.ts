import path from "path";
import { test, expect } from "@app/tests/helpers/stub-test-base";

const SAMPLE_PDF = path.join(
  import.meta.dirname,
  "../test-fixtures/sample.pdf",
);

/**
 * The floating PDF menus use native buttons with a shared stylesheet instead of
 * ActionIcon, so the disabled state is the stylesheet's responsibility. A
 * disabled control must not read as interactive: no pointer cursor, no hover
 * fill, and children inheriting the same cursor.
 */
test("disabled floating buttons do not look interactive", async ({ page }) => {
  test.setTimeout(120_000);
  await page.goto("/editor");
  await page.locator('input[type="file"]').first().setInputFiles(SAMPLE_PDF);
  await expect(page.locator('[data-page-index="0"]').first()).toBeVisible({
    timeout: 30_000,
  });
  await page.waitForTimeout(2_000);

  const styles = await page.evaluate(() => {
    const host = document.createElement("div");
    host.style.position = "fixed";
    host.style.top = "0px";
    host.style.right = "0px";
    host.style.zIndex = "999999";
    host.innerHTML = `
      <button id="disabled-btn" type="button" class="embedpdf-floating-btn" disabled>
        <span id="disabled-child" style="display:block;width:18px;height:18px"></span>
      </button>
      <button id="enabled-btn" type="button" class="embedpdf-floating-btn">
        <span id="enabled-child" style="display:block;width:18px;height:18px"></span>
      </button>
    `;
    document.body.appendChild(host);

    const read = (id: string) => {
      const el = document.getElementById(id) as HTMLElement;
      const style = getComputedStyle(el);
      return {
        cursor: style.cursor,
        opacity: style.opacity,
        background: style.backgroundColor,
      };
    };

    return {
      disabled: read("disabled-btn"),
      enabled: read("enabled-btn"),
      disabledChildCursor: getComputedStyle(
        document.getElementById("disabled-child") as HTMLElement,
      ).cursor,
    };
  });

  expect(styles.disabled.cursor).toBe("not-allowed");
  expect(styles.disabled.opacity).toBe("0.45");
  expect(styles.disabledChildCursor).toBe("not-allowed");
  expect(styles.enabled.cursor).toBe("pointer");

  await page.hover("#disabled-btn");
  const disabledBgAfter = await page.evaluate(
    () =>
      getComputedStyle(document.getElementById("disabled-btn") as HTMLElement)
        .backgroundColor,
  );
  expect(disabledBgAfter).toBe(styles.disabled.background);

  await page.hover("#enabled-btn");
  await page.waitForTimeout(400);
  const enabledBgAfter = await page.evaluate(
    () =>
      getComputedStyle(document.getElementById("enabled-btn") as HTMLElement)
        .backgroundColor,
  );
  expect(enabledBgAfter).not.toBe(styles.enabled.background);
});
