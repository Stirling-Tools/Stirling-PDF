import { beforeEach, describe, expect, test, vi } from "vitest";

const h = vi.hoisted(() => ({ post: vi.fn() }));
vi.mock("@app/services/apiClient", () => ({ default: { post: h.post } }));

import {
  convertUrlToPdf,
  urlToPdfOperationConfig,
  urlToPdfToApiParams,
  urlToPdfFromApiParams,
} from "@app/hooks/tools/urlToPdf/useUrlToPdfOperation";

const pdfResponse = (
  overrides: { headers?: Record<string, string>; request?: unknown } = {},
) => ({
  data: new Blob(["%PDF-1.7"], { type: "application/pdf" }),
  headers: { "content-type": "application/pdf", ...overrides.headers },
  request: overrides.request,
});

describe("urlToPdfToApiParams", () => {
  test("trims the address before sending it", () => {
    expect(
      urlToPdfToApiParams({ urlInput: "  https://example.com  " }),
    ).toEqual({ urlInput: "https://example.com" });
  });

  test("round-trips back into tool parameters", () => {
    expect(urlToPdfFromApiParams({ urlInput: "https://example.com" })).toEqual({
      urlInput: "https://example.com",
    });
  });
});

describe("urlToPdfOperationConfig", () => {
  test("declares that it runs without an input file", () => {
    expect(urlToPdfOperationConfig.runsWithoutInputFiles).toBe(true);
  });

  test("tells a composer that an address is mandatory", () => {
    expect(urlToPdfOperationConfig.validateParams?.({ urlInput: "" })).toBe(
      false,
    );
    expect(
      urlToPdfOperationConfig.validateParams?.({
        urlInput: "https://example.com",
      }),
    ).toBe(true);
  });
});

describe("convertUrlToPdf", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test("posts the address as multipart form data", async () => {
    h.post.mockResolvedValue(pdfResponse());

    await convertUrlToPdf({ urlInput: "https://example.com" });

    const [endpoint, formData, config] = h.post.mock.calls[0];
    expect(endpoint).toBe("/api/v1/convert/url/pdf");
    expect(config).toEqual({ responseType: "blob" });
    expect((formData as FormData).get("urlInput")).toBe("https://example.com");
  });

  test("names the output from the backend's Content-Disposition", async () => {
    h.post.mockResolvedValue(
      pdfResponse({
        headers: {
          "content-disposition": 'attachment; filename="example_com.pdf"',
        },
      }),
    );

    const result = await convertUrlToPdf({ urlInput: "https://example.com/a" });

    expect(result.files).toHaveLength(1);
    expect(result.files[0].name).toBe("example_com.pdf");
  });

  test("falls back to the hostname when the backend names nothing", async () => {
    h.post.mockResolvedValue(pdfResponse());

    const result = await convertUrlToPdf({
      urlInput: "https://www.example.com/deep/page",
    });

    expect(result.files[0].name).toBe("example.com.pdf");
  });

  test("fails rather than accepting the SPA page a rejection redirects to", async () => {
    h.post.mockResolvedValue({
      data: new Blob(["<html></html>"], { type: "text/html" }),
      headers: { "content-type": "text/html" },
      request: {
        responseURL:
          "http://localhost:8080/url-to-pdf?error=error.urlNotReachable",
      },
    });

    await expect(
      convertUrlToPdf({ urlInput: "https://example.com" }),
    ).rejects.toThrow("The server could not reach that address.");
  });

  test("reports a disabled endpoint by its redirect code", async () => {
    h.post.mockResolvedValue({
      data: new Blob(["<html></html>"], { type: "text/html" }),
      headers: { "content-type": "text/html" },
      request: {
        responseURL:
          "http://localhost:8080/url-to-pdf?error=error.endpointDisabled",
      },
    });

    await expect(
      convertUrlToPdf({ urlInput: "https://example.com" }),
    ).rejects.toThrow("URL to PDF is disabled on this server.");
  });

  test("still fails on a non-PDF body with no redirect to read", async () => {
    h.post.mockResolvedValue({
      data: new Blob(["<html></html>"], { type: "text/html" }),
      headers: { "content-type": "text/html" },
    });

    await expect(
      convertUrlToPdf({ urlInput: "https://example.com" }),
    ).rejects.toThrow("The server did not return a PDF for that address.");
  });
});
