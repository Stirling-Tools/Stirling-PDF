import { describe, expect, test } from "vitest";
import type { AppConfig } from "@editor/types/appConfig";
import { resolveTimestampPdfDefaultParameters } from "@editor/hooks/tools/timestampPdf/useTimestampPdfParameters";

describe("resolveTimestampPdfDefaultParameters", () => {
  test("uses the admin's default timestamp authority", async () => {
    const appConfig = {
      timestampDefaultTsaUrl: "https://tsa.example.test",
    } as AppConfig;
    await expect(
      resolveTimestampPdfDefaultParameters({ appConfig, language: "en" }),
    ).resolves.toEqual({ tsaUrl: "https://tsa.example.test" });
  });

  test("sets nothing without an admin default or a config", async () => {
    await expect(
      resolveTimestampPdfDefaultParameters({
        appConfig: {},
        language: "en",
      }),
    ).resolves.toEqual({});
    await expect(
      resolveTimestampPdfDefaultParameters({ appConfig: null, language: "en" }),
    ).resolves.toEqual({});
  });
});
