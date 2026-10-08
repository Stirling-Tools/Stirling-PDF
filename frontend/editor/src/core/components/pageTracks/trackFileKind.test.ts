import { describe, expect, it } from "vitest";

import {
  isPageImageName,
  isPdfName,
  opensAsTrack,
  toPdfName,
} from "@app/components/pageTracks/trackFileKind";

describe("trackFileKind", () => {
  it("opens PDFs and browser-decodable images as tracks", () => {
    expect(isPdfName("report.PDF")).toBe(true);
    expect(isPageImageName("photo.JPG")).toBe(true);
    expect(isPageImageName("scan.webp")).toBe(true);
    expect(opensAsTrack("scan.tiff")).toBe(false);
    expect(opensAsTrack("notes.docx")).toBe(false);
    expect(opensAsTrack("png")).toBe(false);
    expect(opensAsTrack(undefined)).toBe(false);
  });

  it("names a saved track as a PDF", () => {
    expect(toPdfName("report.pdf")).toBe("report.pdf");
    expect(toPdfName("photo.final.png")).toBe("photo.final.pdf");
    expect(toPdfName("photo_split.jpeg")).toBe("photo_split.pdf");
    expect(toPdfName("untitled")).toBe("untitled.pdf");
  });
});
