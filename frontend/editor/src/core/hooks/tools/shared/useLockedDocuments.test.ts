import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const lockedIds = new Set<string>();
vi.mock("@app/contexts/file/fileHooks", () => ({
  useFileContext: () => ({
    selectors: {
      getStirlingFileStub: (id: string) => ({
        processedFile: { isEncrypted: lockedIds.has(id) },
      }),
    },
  }),
}));

import {
  summarizeLockedDocuments,
  useLockedDocuments,
} from "@app/hooks/tools/shared/useLockedDocuments";
import {
  clearLockedDocumentAccess,
  setLockedDocumentAccess,
} from "@app/services/lockedDocumentAccess";
import { createStirlingFile } from "@app/types/fileContext";
import type { FileId } from "@app/types/file";

const file = (id: string) =>
  createStirlingFile(
    new File(["%PDF"], `${id}.pdf`, { type: "application/pdf" }),
    id as FileId,
  );
const isLocked = (id: string) => lockedIds.has(id);

afterEach(() => {
  // Unmount first: clearing the store re-renders anything still subscribed.
  cleanup();
  clearLockedDocumentAccess();
  lockedIds.clear();
});

describe("summarizeLockedDocuments", () => {
  it("lists unlocked copies as sent in their original form", () => {
    const unlocked = file("unlocked");
    setLockedDocumentAccess("unlocked", {
      source: file("original"),
      password: "pw",
      origin: "unlocked",
    });

    const summary = summarizeLockedDocuments(
      [unlocked, file("plain")],
      isLocked,
    );

    expect(summary.usingOriginal).toEqual([unlocked]);
    expect(summary.needsPassword).toEqual([]);
    expect(summary.ready).toBe(true);
  });

  it("asks for a password for a locked file and blocks until one is entered", () => {
    lockedIds.add("locked");
    const locked = file("locked");

    const before = summarizeLockedDocuments([locked], isLocked);
    expect(before.needsPassword).toEqual([locked]);
    expect(before.ready).toBe(false);

    setLockedDocumentAccess("locked", {
      source: locked,
      password: "typed",
      origin: "entered",
    });
    const after = summarizeLockedDocuments([locked], isLocked);
    expect(after.needsPassword).toEqual([locked]);
    expect(after.enteredPassword).toBe("typed");
    expect(after.ready).toBe(true);
  });

  it("does not ask again for an append tool's still-locked output", () => {
    lockedIds.add("signed");
    const signed = file("signed");
    setLockedDocumentAccess("signed", {
      source: signed,
      password: "pw",
      origin: "appended",
    });

    const summary = summarizeLockedDocuments([signed], isLocked);

    expect(summary.needsPassword).toEqual([]);
    expect(summary.usingOriginal).toEqual([]);
    expect(summary.ready).toBe(true);
  });

  it("shows no shared password when the locked files were given different ones", () => {
    lockedIds.add("a");
    lockedIds.add("b");
    setLockedDocumentAccess("a", {
      source: file("a"),
      password: "one",
      origin: "entered",
    });
    setLockedDocumentAccess("b", {
      source: file("b"),
      password: "two",
      origin: "entered",
    });

    const summary = summarizeLockedDocuments([file("a"), file("b")], isLocked);

    expect(summary.enteredPassword).toBe("");
    expect(summary.ready).toBe(true);
  });
});

describe("useLockedDocuments", () => {
  it("re-renders when a password is entered", () => {
    lockedIds.add("locked");
    const files = [file("locked")];
    const { result } = renderHook(() => useLockedDocuments(files));
    expect(result.current.ready).toBe(false);

    act(() => {
      setLockedDocumentAccess("locked", {
        source: files[0],
        password: "typed",
        origin: "entered",
      });
    });

    expect(result.current.ready).toBe(true);
  });
});
