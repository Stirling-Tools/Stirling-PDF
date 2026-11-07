import { describe, expect, it } from "vitest";
import { TOOL_IO } from "@editor/types/toolIO";
import { rightsManagedToolRule } from "@editor/services/rightsManagedTools";

const REVIEWED = [
  "/api/v1/filter/filter-contains-image",
  "/api/v1/filter/filter-contains-text",
  "/api/v1/filter/filter-file-size",
  "/api/v1/filter/filter-page-count",
  "/api/v1/filter/filter-page-rotation",
  "/api/v1/filter/filter-page-size",
  "/api/v1/general/booklet-imposition",
  "/api/v1/general/crop",
  "/api/v1/general/merge-pdfs",
  "/api/v1/general/multi-page-layout",
  "/api/v1/general/pdf-to-single-page",
  "/api/v1/general/rearrange-pages",
  "/api/v1/general/remove-image-pdf",
  "/api/v1/general/remove-pages",
  "/api/v1/general/rotate-pdf",
  "/api/v1/general/scale-pages",
  "/api/v1/general/split-by-size-or-count",
  "/api/v1/general/split-for-poster-print",
  "/api/v1/general/split-pages",
  "/api/v1/general/split-pdf-by-chapters",
  "/api/v1/general/split-pdf-by-sections",
  "/api/v1/misc/add-comments",
  "/api/v1/misc/add-image",
  "/api/v1/misc/add-page-numbers",
  "/api/v1/misc/add-stamp",
  "/api/v1/misc/auto-rename",
  "/api/v1/misc/auto-rotate-pdf",
  "/api/v1/misc/auto-split-pdf",
  "/api/v1/misc/compress-pdf",
  "/api/v1/misc/decompress-pdf",
  "/api/v1/misc/flatten",
  "/api/v1/misc/flatten-portfolio",
  "/api/v1/misc/ocr-pdf",
  "/api/v1/misc/remove-blanks",
  "/api/v1/misc/repair",
  "/api/v1/misc/replace-invert-pdf",
  "/api/v1/misc/scanner-effect",
  "/api/v1/misc/unlock-pdf-forms",
  "/api/v1/misc/update-metadata",
  "/api/v1/security/add-watermark",
  "/api/v1/security/auto-redact",
  "/api/v1/security/redact",
  "/api/v1/security/redact-execute",
  "/api/v1/security/sanitize-pdf",
  "/api/v1/security/validate-compliance",
];

describe("rightsManagedToolRule", () => {
  it("allows only endpoints reviewed to process protected content locally", () => {
    const allowed = Object.keys(TOOL_IO)
      .filter((endpoint) => rightsManagedToolRule(endpoint).supported)
      .sort();
    expect(allowed).toEqual(REVIEWED);
  });

  it.each([
    "/api/v1/misc/auto-rename",
    "/api/v1/general/split-pdf-by-chapters",
  ])(
    "needs the copy right for %s, which names outputs from the content",
    (endpoint) => {
      expect(rightsManagedToolRule(endpoint)).toEqual({
        supported: true,
        needsCopy: true,
      });
    },
  );
});
