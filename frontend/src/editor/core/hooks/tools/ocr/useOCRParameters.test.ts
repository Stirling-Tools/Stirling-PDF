import { beforeEach, describe, expect, test, vi } from "vitest";
import apiClient from "@editor/services/apiClient";
import { resolveOCRDefaultParameters } from "@editor/hooks/tools/ocr/useOCRParameters";

vi.mock("@editor/services/apiClient", () => ({ default: { get: vi.fn() } }));

const serverLanguages = (languages: string[]) =>
  vi.mocked(apiClient.get).mockResolvedValue({ data: { languages } });

describe("resolveOCRDefaultParameters", () => {
  beforeEach(() => vi.mocked(apiClient.get).mockReset());

  test("picks the installed language matching the UI language", async () => {
    serverLanguages(["eng", "fra"]);
    await expect(
      resolveOCRDefaultParameters({ appConfig: null, language: "fr-FR" }),
    ).resolves.toEqual({ languages: ["fra"] });
  });

  test("sets nothing when the server lacks the UI language", async () => {
    serverLanguages(["eng"]);
    await expect(
      resolveOCRDefaultParameters({ appConfig: null, language: "fr-FR" }),
    ).resolves.toEqual({});
  });
});
