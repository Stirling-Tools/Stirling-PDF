import { describe, expect, it, vi } from "vitest";
import { AxiosError } from "axios";
import { Blob as NodeBlob } from "node:buffer";
import apiClient from "@app/services/apiClient";
import {
  isValidWebUrl,
  urlToPdfOperationConfig,
} from "@app/hooks/tools/urlToPdf/useUrlToPdfOperation";

vi.mock("@app/services/apiClient", () => ({ default: { post: vi.fn() } }));
vi.mock("@app/hooks/tools/shared/useToolOperation", () => ({
  ToolType: { custom: 2 },
  useToolOperation: vi.fn(),
}));

describe("URL conversion", () => {
  it.each([
    "http://example.com",
    "https://example.com/path?q=value",
    " https://example.com ",
  ])("accepts %s", (url) => {
    expect(isValidWebUrl(url)).toBe(true);
  });
  it.each([
    "",
    "example.com",
    "file:///etc/passwd",
    "javascript:alert(1)",
    "ftp://example.com",
  ])("rejects %s", (url) => {
    expect(isValidWebUrl(url)).toBe(false);
  });
  it("submits a URL without files and preserves the returned PDF filename", async () => {
    vi.mocked(apiClient.post).mockResolvedValue({
      data: new Blob(["%PDF-1.7"], { type: "application/pdf" }),
      headers: { "content-disposition": 'attachment; filename="website.pdf"' },
    });
    const result = await urlToPdfOperationConfig.customProcessor(
      { urlInput: " https://example.com " },
      [],
    );
    expect(apiClient.post).toHaveBeenCalledWith(
      "/api/v1/convert/url/pdf",
      expect.any(FormData),
      { responseType: "blob", suppressErrorToast: true },
    );
    const form = vi.mocked(apiClient.post).mock.calls.at(-1)![1] as FormData;
    expect(form.get("urlInput")).toBe("https://example.com");
    expect(form.has("fileInput")).toBe(false);
    expect(result.files[0].name).toBe("website.pdf");
    expect(result.files[0].type).toBe("application/pdf");
  });
  it("rejects a non-PDF response rather than importing it as a PDF", async () => {
    vi.mocked(apiClient.post).mockResolvedValue({
      data: new Blob(["error page"], { type: "text/html" }),
      headers: {},
    });
    await expect(
      urlToPdfOperationConfig.customProcessor(
        { urlInput: "https://example.com" },
        [],
      ),
    ).rejects.toThrow("could not be converted");
  });
  it.each([
    { detail: "The URL is not allowed or could not be reached." },
    new NodeBlob(
      [
        JSON.stringify({
          detail: "The URL is not allowed or could not be reached.",
        }),
      ],
      { type: "application/problem+json" },
    ),
  ])(
    "displays the backend error message from a JSON or blob response",
    async (data) => {
      const error = new AxiosError("Request failed with status code 400");
      error.response = {
        data,
        status: 400,
        statusText: "Bad Request",
        headers: {},
        config: { headers: {} },
      } as AxiosError["response"];
      vi.mocked(apiClient.post).mockRejectedValue(error);
      await expect(
        urlToPdfOperationConfig.customProcessor(
          { urlInput: "https://example.com" },
          [],
        ),
      ).rejects.toThrow("The URL is not allowed or could not be reached.");
    },
  );
  it("preserves a network error when no backend message is available", async () => {
    const error = new AxiosError("Network Error");
    vi.mocked(apiClient.post).mockRejectedValue(error);
    await expect(
      urlToPdfOperationConfig.customProcessor(
        { urlInput: "https://example.com" },
        [],
      ),
    ).rejects.toBe(error);
  });
});
