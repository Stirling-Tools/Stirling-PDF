import { afterEach, describe, expect, it } from "vitest";
import type { FileId } from "@editor/types/file";
import { reviewMode } from "@editor/tools/pdfTextEditor/store/reviewMode";
import { reviewLanguage } from "@editor/tools/pdfTextEditor/store/reviewLanguage";

const FILE = "file-1" as FileId;

describe("reviewMode.close", () => {
  afterEach(() => {
    reviewMode.close();
    reviewLanguage.set({ open: null, requested: null });
  });

  it("drops a language the report picked for a file the review never opened", () => {
    reviewMode.set({ reviewing: true });
    reviewLanguage.set({ requested: { fileId: FILE, language: "fr-FR" } });
    reviewMode.close();
    expect(reviewMode.get().reviewing).toBe(false);
    expect(reviewLanguage.get().requested).toBeNull();
  });
});
