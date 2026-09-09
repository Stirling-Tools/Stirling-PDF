/**
 * PDF/UA alt text is keyed by an image's position within one document ("pageIndex:ordinal"), so the
 * same key names a different image in the next file. A multi-file PDF/UA conversion posts one
 * request per file, so an unscoped description would be attached to whatever image happens to sit
 * in that position in every other document - a wrong description that still passes the checker.
 */

import { beforeEach, describe, expect, test, vi } from "vitest";
import { convertProcessor } from "@app/hooks/tools/convert/useConvertOperation";
import {
  defaultParameters,
  type ConvertParameters,
} from "@app/hooks/tools/convert/useConvertParameters";

const api = vi.hoisted(() => ({ post: vi.fn() }));
vi.mock("@app/services/apiClient", () => ({
  default: {
    post: api.post,
    get: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
    interceptors: { response: { use: vi.fn() } },
  },
}));

const pdfUaParameters = (altText: string): ConvertParameters => ({
  ...defaultParameters,
  fromExtension: "pdf",
  toExtension: "pdfua",
  pdfUaOptions: { ...defaultParameters.pdfUaOptions, altText },
});

const pdf = (name: string) =>
  new File(["%PDF-1.7"], name, { type: "application/pdf" });

const bodyOf = (call: number): FormData =>
  api.post.mock.calls[call][1] as FormData;

beforeEach(() => {
  vi.clearAllMocks();
  api.post.mockResolvedValue({
    data: new Blob(["%PDF-1.7"], { type: "application/pdf" }),
    headers: { "content-type": "application/pdf" },
  });
});

describe("PDF/UA alt text never crosses documents", () => {
  test("posts to the PDF/UA endpoint with the descriptions when one file is converted", async () => {
    await convertProcessor(pdfUaParameters("0:1=Bar chart of revenue"), [
      pdf("report.pdf"),
    ]);

    expect(api.post).toHaveBeenCalledTimes(1);
    expect(api.post.mock.calls[0][0]).toBe("/api/v1/convert/pdf/ua");
    expect(bodyOf(0).get("altText")).toBe("0:1=Bar chart of revenue");
  });

  test("drops the descriptions when several files are converted, rather than mislabelling", async () => {
    await convertProcessor(pdfUaParameters("0:1=Bar chart of revenue"), [
      pdf("report.pdf"),
      pdf("appendix.pdf"),
    ]);

    // One request per file: without scoping, appendix.pdf's figure 0:1 would be called a bar chart.
    expect(api.post).toHaveBeenCalledTimes(2);
    expect(bodyOf(0).get("altText")).toBeNull();
    expect(bodyOf(1).get("altText")).toBeNull();
  });

  test("keeps the options that really do apply to every file", async () => {
    const parameters = pdfUaParameters("0:1=Bar chart of revenue");
    parameters.pdfUaOptions.profile = "ua2";
    parameters.pdfUaOptions.language = "fr-FR";
    parameters.pdfUaOptions.overrideLanguage = true;

    await convertProcessor(parameters, [pdf("a.pdf"), pdf("b.pdf")]);

    for (const call of [0, 1]) {
      expect(bodyOf(call).get("profile")).toBe("ua2");
      expect(bodyOf(call).get("language")).toBe("fr-FR");
      expect(bodyOf(call).get("overrideLanguage")).toBe("true");
    }
  });

  test("leaves the caller's parameters untouched", async () => {
    const parameters = pdfUaParameters("0:1=Bar chart of revenue");

    await convertProcessor(parameters, [pdf("a.pdf"), pdf("b.pdf")]);

    expect(parameters.pdfUaOptions.altText).toBe("0:1=Bar chart of revenue");
  });
});
