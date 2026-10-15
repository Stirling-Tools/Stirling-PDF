import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  clearLastViewedPages,
  forgetLastViewedPages,
  getLastViewedPage,
  moveLastViewedPage,
  resumeLastViewedPages,
  setLastViewedPage,
  suspendLastViewedPages,
} from "@app/services/lastViewedPageStore";

const FILE_A = "report.pdf|2048|1700000000000";
const FILE_B = "notes.pdf|512|1700000000000";
const RENAMED_A = "final report.pdf|2048|1700000000000";

beforeEach(() => localStorage.clear());
afterEach(() => resumeLastViewedPages());

describe("lastViewedPageStore", () => {
  it("forgets a file returned to its first page", () => {
    setLastViewedPage(FILE_A, 4);
    setLastViewedPage(FILE_A, 1);

    expect(getLastViewedPage(FILE_A)).toBeNull();
  });

  it("moves a position to the key a file now goes by", () => {
    setLastViewedPage(FILE_A, 6);

    moveLastViewedPage(FILE_A, RENAMED_A);

    expect(getLastViewedPage(FILE_A)).toBeNull();
    expect(getLastViewedPage(RENAMED_A)).toBe(6);
  });

  it("keeps a position already recorded under the new key", () => {
    setLastViewedPage(FILE_A, 6);
    setLastViewedPage(RENAMED_A, 9);

    moveLastViewedPage(FILE_A, RENAMED_A);

    expect(getLastViewedPage(FILE_A)).toBeNull();
    expect(getLastViewedPage(RENAMED_A)).toBe(9);
  });

  it("forgets only the files named", () => {
    setLastViewedPage(FILE_A, 3);
    setLastViewedPage(FILE_B, 5);

    forgetLastViewedPages([FILE_A]);

    expect(getLastViewedPage(FILE_A)).toBeNull();
    expect(getLastViewedPage(FILE_B)).toBe(5);
  });

  it("clears every position", () => {
    setLastViewedPage(FILE_A, 3);
    setLastViewedPage(FILE_B, 5);

    clearLastViewedPages();

    expect(getLastViewedPage(FILE_A)).toBeNull();
    expect(getLastViewedPage(FILE_B)).toBeNull();
  });

  it("records nothing between a sign-out and the next viewer mount", () => {
    setLastViewedPage(FILE_A, 3);

    suspendLastViewedPages();
    setLastViewedPage(FILE_B, 5);

    expect(getLastViewedPage(FILE_A)).toBeNull();
    expect(getLastViewedPage(FILE_B)).toBeNull();

    resumeLastViewedPages();
    setLastViewedPage(FILE_B, 5);
    expect(getLastViewedPage(FILE_B)).toBe(5);
  });

  it("evicts the least recently saved file past the cap", () => {
    for (let index = 0; index < 500; index++) {
      setLastViewedPage(`file-${index}.pdf|1|1`, 2);
    }
    setLastViewedPage("file-0.pdf|1|1", 3);

    setLastViewedPage(FILE_A, 4);

    expect(getLastViewedPage("file-1.pdf|1|1")).toBeNull();
    expect(getLastViewedPage("file-0.pdf|1|1")).toBe(3);
    expect(getLastViewedPage(FILE_A)).toBe(4);
  });
});
