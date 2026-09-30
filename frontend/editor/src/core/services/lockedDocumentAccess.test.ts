import { afterEach, describe, expect, it, vi } from "vitest";
import {
  clearLockedDocumentAccess,
  forgetLockedDocumentAccess,
  getLockedDocumentAccess,
  getLockedDocumentAccessVersion,
  isLockedDocumentPasswordRejected,
  lockedDocumentRequest,
  rejectLockedDocumentPassword,
  retainLockedDocumentAccess,
  setLockedDocumentAccess,
  subscribeLockedDocumentAccess,
  type LockedDocumentAccess,
} from "@app/services/lockedDocumentAccess";

const pdf = (content: string) =>
  new File([content], "doc.pdf", { type: "application/pdf" });

const access = (
  origin: LockedDocumentAccess["origin"],
  password = "pw",
): LockedDocumentAccess => ({ source: pdf(origin), password, origin });

const withId = (file: File, fileId: string) => Object.assign(file, { fileId });

afterEach(() => {
  clearLockedDocumentAccess();
});

describe("lockedDocumentAccess", () => {
  it("stores access per exact file version", () => {
    const entry = access("unlocked");
    setLockedDocumentAccess("v2", entry);

    expect(getLockedDocumentAccess("v2")).toBe(entry);
    expect(getLockedDocumentAccess("v1")).toBeUndefined();
  });

  it("drops entries whose version left the workbench and keeps the rest", () => {
    setLockedDocumentAccess("gone", access("unlocked"));
    setLockedDocumentAccess("kept", access("entered"));

    retainLockedDocumentAccess(["kept", "other"]);

    expect(getLockedDocumentAccess("gone")).toBeUndefined();
    expect(getLockedDocumentAccess("kept")).toBeDefined();
  });

  it("forgets one entry and clears all", () => {
    setLockedDocumentAccess("a", access("entered"));
    setLockedDocumentAccess("b", access("appended"));

    forgetLockedDocumentAccess("a");
    expect(getLockedDocumentAccess("a")).toBeUndefined();

    clearLockedDocumentAccess();
    expect(getLockedDocumentAccess("b")).toBeUndefined();
  });

  it("notifies subscribers only when something changed", () => {
    const listener = vi.fn();
    const unsubscribe = subscribeLockedDocumentAccess(listener);
    const before = getLockedDocumentAccessVersion();

    setLockedDocumentAccess("a", access("entered"));
    retainLockedDocumentAccess(["a"]);
    forgetLockedDocumentAccess("missing");
    expect(listener).toHaveBeenCalledTimes(1);

    retainLockedDocumentAccess([]);
    expect(listener).toHaveBeenCalledTimes(2);
    expect(getLockedDocumentAccessVersion()).toBe(before + 2);

    unsubscribe();
    setLockedDocumentAccess("b", access("entered"));
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it("builds a request from the locked source and its password", () => {
    const workbenchCopy = withId(pdf("re-save"), "v2");
    const original = pdf("encrypted");
    setLockedDocumentAccess("v2", {
      source: original,
      password: "s3cret",
      origin: "unlocked",
    });

    expect(lockedDocumentRequest(workbenchCopy)).toEqual({
      file: original,
      documentPassword: "s3cret",
    });
  });

  it("sends a file with no known access as-is and without a password", () => {
    const plain = withId(pdf("plain"), "p1");

    expect(lockedDocumentRequest(plain)).toEqual({ file: plain });
  });

  it("rejects only a typed password, and a new one clears the flag", () => {
    setLockedDocumentAccess("typed", access("entered", "bad"));
    setLockedDocumentAccess("prompt", access("unlocked"));

    rejectLockedDocumentPassword("typed");
    rejectLockedDocumentPassword("prompt");

    expect(getLockedDocumentAccess("typed")).toBeUndefined();
    expect(isLockedDocumentPasswordRejected("typed")).toBe(true);
    expect(getLockedDocumentAccess("prompt")).toBeDefined();
    expect(isLockedDocumentPasswordRejected("prompt")).toBe(false);

    setLockedDocumentAccess("typed", access("entered", "good"));
    expect(isLockedDocumentPasswordRejected("typed")).toBe(false);
  });

  it("forgets a refusal once its file leaves the workbench", () => {
    setLockedDocumentAccess("typed", access("entered", "bad"));
    rejectLockedDocumentPassword("typed");

    retainLockedDocumentAccess([]);

    expect(isLockedDocumentPasswordRejected("typed")).toBe(false);
  });
});
