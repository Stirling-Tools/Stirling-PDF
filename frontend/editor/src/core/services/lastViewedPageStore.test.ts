import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  clearLastViewedPages,
  forgetLastViewedPages,
  getLastViewedPage,
  moveLastViewedPage,
  resumeLastViewedPages,
  setLastViewedPage,
  suspendLastViewedPages,
  type LastViewedFile,
} from "@app/services/lastViewedPageStore";
import type { FileId } from "@app/types/file";

function file(fileId: string, quickKey: string): LastViewedFile {
  return { fileId: fileId as FileId, quickKey };
}

const FILE_A = file("a", "report.pdf|2048|1700000000000");
const RENAMED_A = file("a", "final report.pdf|2048|1700000000000");
const FILE_B = file("b", "notes.pdf|512|1700000000000");

beforeEach(() => localStorage.clear());
afterEach(() => resumeLastViewedPages());

describe("lastViewedPageStore", () => {
  it("forgets a file returned to its first page", () => {
    setLastViewedPage(FILE_A, 4);
    setLastViewedPage(FILE_A, 1);

    expect(getLastViewedPage(FILE_A.quickKey)).toBeNull();
  });

  it("ignores entries it cannot read", () => {
    localStorage.setItem(
      "stirling.viewer.lastViewedPage",
      JSON.stringify({ [FILE_A.quickKey]: 4, [FILE_B.quickKey]: { page: 5 } }),
    );

    expect(getLastViewedPage(FILE_A.quickKey)).toBeNull();
    expect(getLastViewedPage(FILE_B.quickKey)).toBeNull();
  });

  it("moves a position to the key a file now goes by", () => {
    setLastViewedPage(FILE_A, 6);

    moveLastViewedPage(FILE_A.quickKey, RENAMED_A);

    expect(getLastViewedPage(FILE_A.quickKey)).toBeNull();
    expect(getLastViewedPage(RENAMED_A.quickKey)).toBe(6);
  });

  it("keeps a position already recorded under the new key", () => {
    setLastViewedPage(FILE_A, 6);
    setLastViewedPage(RENAMED_A, 9);

    moveLastViewedPage(FILE_A.quickKey, RENAMED_A);

    expect(getLastViewedPage(FILE_A.quickKey)).toBeNull();
    expect(getLastViewedPage(RENAMED_A.quickKey)).toBe(9);
  });

  it("forgets the positions of deleted records, and no others", () => {
    setLastViewedPage(FILE_A, 3);
    setLastViewedPage(FILE_B, 5);

    forgetLastViewedPages([FILE_A.fileId]);

    expect(getLastViewedPage(FILE_A.quickKey)).toBeNull();
    expect(getLastViewedPage(FILE_B.quickKey)).toBe(5);
  });

  it("keeps a position a newer copy of the same file recorded", () => {
    setLastViewedPage(FILE_A, 3);
    setLastViewedPage(file("a-copy", FILE_A.quickKey), 8);

    forgetLastViewedPages([FILE_A.fileId]);

    expect(getLastViewedPage(FILE_A.quickKey)).toBe(8);
  });

  it("clears every position", () => {
    setLastViewedPage(FILE_A, 3);
    setLastViewedPage(FILE_B, 5);

    clearLastViewedPages();

    expect(getLastViewedPage(FILE_A.quickKey)).toBeNull();
    expect(getLastViewedPage(FILE_B.quickKey)).toBeNull();
  });

  it("records nothing between a sign-out and the next viewer mount", () => {
    setLastViewedPage(FILE_A, 3);

    suspendLastViewedPages();
    setLastViewedPage(FILE_B, 5);

    expect(getLastViewedPage(FILE_A.quickKey)).toBeNull();
    expect(getLastViewedPage(FILE_B.quickKey)).toBeNull();

    resumeLastViewedPages();
    setLastViewedPage(FILE_B, 5);
    expect(getLastViewedPage(FILE_B.quickKey)).toBe(5);
  });

  it("evicts the least recently saved file past the cap", () => {
    for (let index = 0; index < 500; index++) {
      setLastViewedPage(file(`id-${index}`, `file-${index}.pdf|1|1`), 2);
    }
    setLastViewedPage(file("id-0", "file-0.pdf|1|1"), 3);

    setLastViewedPage(FILE_A, 4);

    expect(getLastViewedPage("file-1.pdf|1|1")).toBeNull();
    expect(getLastViewedPage("file-0.pdf|1|1")).toBe(3);
    expect(getLastViewedPage(FILE_A.quickKey)).toBe(4);
  });
});
