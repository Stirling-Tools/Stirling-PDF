import { describe, expect, test } from "vitest";
import { QueryClient } from "@tanstack/react-query";
import type { AppConfig } from "@editor/types/appConfig";
import { resolveTimestampPdfDefaultParameters } from "@editor/hooks/tools/timestampPdf/useTimestampPdfParameters";

describe("resolveTimestampPdfDefaultParameters", () => {
  const queryClient = new QueryClient();

  test("uses the admin's default timestamp authority", async () => {
    const appConfig = {
      timestampDefaultTsaUrl: "https://tsa.example.test",
    } as AppConfig;
    await expect(
      resolveTimestampPdfDefaultParameters({
        appConfig,
        language: "en",
        queryClient,
      }),
    ).resolves.toEqual({ tsaUrl: "https://tsa.example.test" });
  });

  test("sets nothing without an admin default or a config", async () => {
    await expect(
      resolveTimestampPdfDefaultParameters({
        appConfig: {},
        language: "en",
        queryClient,
      }),
    ).resolves.toEqual({});
    await expect(
      resolveTimestampPdfDefaultParameters({
        appConfig: null,
        language: "en",
        queryClient,
      }),
    ).resolves.toEqual({});
  });
});
