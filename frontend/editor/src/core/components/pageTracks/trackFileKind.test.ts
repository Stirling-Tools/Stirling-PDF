import { describe, expect, it } from "vitest";

import {
  isPageImage,
  opensAsTrack,
  toPdfName,
} from "@app/components/pageTracks/trackFileKind";

const file = (name: string, type = "") => ({ name, type });

describe("trackFileKind", () => {
  it("opens PDFs and browser-decodable images as tracks", () => {
    expect(opensAsTrack(file("report.PDF"))).toBe(true);
    expect(opensAsTrack(file("download", "application/pdf"))).toBe(true);
    expect(isPageImage(file("photo.JPEG"))).toBe(true);
    expect(isPageImage(file("scan.webp"))).toBe(true);
    expect(opensAsTrack(file("scan.tiff"))).toBe(false);
    expect(opensAsTrack(file("logo.svg"))).toBe(false);
    expect(opensAsTrack(file("notes.docx"))).toBe(false);
    expect(opensAsTrack(file("png"))).toBe(false);
  });

  it("names a saved track as a PDF", () => {
    expect(toPdfName("report.pdf")).toBe("report.pdf");
    expect(toPdfName("photo.final.png")).toBe("photo.final.pdf");
    expect(toPdfName("photo_split.jpeg")).toBe("photo_split.pdf");
    expect(toPdfName("untitled")).toBe("untitled.pdf");
  });
});
