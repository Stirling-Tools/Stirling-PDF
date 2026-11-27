import { beforeEach, describe, expect, test, vi } from "vitest";
import { QueryClient } from "@tanstack/react-query";
import apiClient from "@editor/services/apiClient";
import { resolveOCRDefaultParameters } from "@editor/hooks/tools/ocr/useOCRParameters";
import { ocrLanguagesQuery } from "@editor/hooks/tools/ocr/ocrLanguages";

vi.mock("@editor/services/apiClient", () => ({ default: { get: vi.fn() } }));

const serverLanguages = (languages: string[]) =>
  vi.mocked(apiClient.get).mockResolvedValue({ data: { languages } });

const resolveIn = (queryClient: QueryClient) =>
  resolveOCRDefaultParameters({
    appConfig: null,
    language: "fr-FR",
    queryClient,
  });

describe("resolveOCRDefaultParameters", () => {
  beforeEach(() => vi.mocked(apiClient.get).mockReset());

  test("picks the installed language matching the UI language", async () => {
    serverLanguages(["eng", "fra"]);
    await expect(resolveIn(new QueryClient())).resolves.toEqual({
      languages: ["fra"],
    });
  });

  test("sets nothing when the server lacks the UI language", async () => {
    serverLanguages(["eng"]);
    await expect(resolveIn(new QueryClient())).resolves.toEqual({});
  });

  test("reads the list already loaded without asking the server again", async () => {
    const queryClient = new QueryClient();
    queryClient.setQueryData(ocrLanguagesQuery().queryKey, ["eng", "fra"]);
    await expect(resolveIn(queryClient)).resolves.toEqual({
      languages: ["fra"],
    });
    expect(apiClient.get).not.toHaveBeenCalled();
  });
});
