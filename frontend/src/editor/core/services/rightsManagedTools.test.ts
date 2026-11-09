import { describe, expect, it, vi } from "vitest";
import { TOOL_IO } from "@editor/types/toolIO";
import {
  rightsManagedToolBlockReason,
  rightsManagedToolRule,
} from "@editor/services/rightsManagedTools";
import type {
  OpenedRightsManagedPdf,
  RightsManagedPermissions,
} from "@editor/services/rightsManagedPdf";

const purview = vi.hoisted(() => ({
  known: new Set<string>(),
  opened: new Map<string, OpenedRightsManagedPdf>(),
}));

vi.mock("@editor/services/rightsManagedPdf", async (importOriginal) => ({
  ...(await importOriginal<
    typeof import("@editor/services/rightsManagedPdf")
  >()),
  isKnownRightsManagedPdf: (fileId: string) => purview.known.has(fileId),
  getOpenedRightsManagedPdf: (fileId: string) => purview.opened.get(fileId),
}));

const FULL: RightsManagedPermissions = {
  view: true,
  print: true,
  copy: true,
  edit: true,
  comment: true,
  export: true,
  owner: false,
};

function openWith(fileId: string, permissions: RightsManagedPermissions) {
  purview.known.add(fileId);
  purview.opened.set(fileId, {
    protection: { permissions },
  } as OpenedRightsManagedPdf);
}

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
  "/api/v1/misc/add-attachments",
  "/api/v1/misc/add-comments",
  "/api/v1/misc/add-image",
  "/api/v1/misc/add-page-numbers",
  "/api/v1/misc/add-stamp",
  "/api/v1/misc/auto-rename",
  "/api/v1/misc/auto-rotate-pdf",
  "/api/v1/misc/auto-split-pdf",
  "/api/v1/misc/batch-process-attachments",
  "/api/v1/misc/compress-pdf",
  "/api/v1/misc/decompress-pdf",
  "/api/v1/misc/delete-attachment",
  "/api/v1/misc/extract-attachments",
  "/api/v1/misc/extract-single-attachment",
  "/api/v1/misc/flatten",
  "/api/v1/misc/flatten-portfolio",
  "/api/v1/misc/list-attachments",
  "/api/v1/misc/ocr-pdf",
  "/api/v1/misc/remove-blanks",
  "/api/v1/misc/rename-attachment",
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

describe("rightsManagedToolBlockReason", () => {
  it("leaves files that are not Purview protected alone", () => {
    expect(
      rightsManagedToolBlockReason("/api/v1/security/add-password", "plain"),
    ).toBeUndefined();
  });

  it("refuses a view-only file for a tool that changes it", () => {
    openWith("view-only", { ...FULL, edit: false, copy: false });
    expect(
      rightsManagedToolBlockReason("/api/v1/general/rotate-pdf", "view-only"),
    ).toBe("Your permissions on this protected PDF do not allow changes.");
  });

  it("refuses a file without the copy right for a tool that reads its content", () => {
    openWith("no-copy", { ...FULL, copy: false });
    expect(
      rightsManagedToolBlockReason("/api/v1/general/rotate-pdf", "no-copy"),
    ).toBeUndefined();
    expect(
      rightsManagedToolBlockReason("/api/v1/misc/auto-rename", "no-copy"),
    ).toBe(
      "Your permissions on this protected PDF do not allow copying its content, which this tool needs.",
    );
  });

  it.each([
    "/api/v1/misc/extract-attachments",
    "/api/v1/misc/extract-single-attachment",
  ])("lets %s save attachments only with the export right", (endpoint) => {
    openWith("exports", { ...FULL, edit: false, copy: false });
    openWith("no-export", { ...FULL, export: false });
    expect(rightsManagedToolBlockReason(endpoint, "exports")).toBeUndefined();
    expect(rightsManagedToolBlockReason(endpoint, "no-export")).toBe(
      "Your Microsoft Purview permissions do not allow saving copies of this PDF's attachments.",
    );
  });

  it("accepts an opened file whose rights cover the tool", () => {
    openWith("full", FULL);
    expect(
      rightsManagedToolBlockReason("/api/v1/general/rotate-pdf", "full"),
    ).toBeUndefined();
  });
});
