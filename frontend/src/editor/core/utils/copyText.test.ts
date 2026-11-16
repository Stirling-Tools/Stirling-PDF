import { afterEach, describe, expect, test, vi } from "vitest";
import { copyText } from "@editor/utils/copyText";

function setSecureContext(secure: boolean) {
  Object.defineProperty(window, "isSecureContext", {
    configurable: true,
    value: secure,
  });
}

function setClipboard(writeText?: (text: string) => Promise<void>) {
  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: writeText ? { writeText } : undefined,
  });
}

function stubExecCommand(result: boolean) {
  const execCommand = vi.fn(() => result);
  Object.defineProperty(document, "execCommand", {
    configurable: true,
    value: execCommand,
  });
  return execCommand;
}

describe("copyText", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  test("uses the async clipboard API in secure contexts", async () => {
    setSecureContext(true);
    const writeText = vi.fn().mockResolvedValue(undefined);
    setClipboard(writeText);
    const execCommand = stubExecCommand(true);

    await expect(copyText("hello")).resolves.toBe(true);
    expect(writeText).toHaveBeenCalledWith("hello");
    expect(execCommand).not.toHaveBeenCalled();
  });

  test("falls back to execCommand over plain HTTP", async () => {
    setSecureContext(false);
    setClipboard(undefined);
    const execCommand = stubExecCommand(true);

    await expect(copyText("hello")).resolves.toBe(true);
    expect(execCommand).toHaveBeenCalledWith("copy");
    expect(document.querySelector("textarea")).toBeNull();
  });

  test("falls back to execCommand when the async write is rejected", async () => {
    setSecureContext(true);
    setClipboard(vi.fn().mockRejectedValue(new Error("denied")));
    const execCommand = stubExecCommand(true);

    await expect(copyText("hello")).resolves.toBe(true);
    expect(execCommand).toHaveBeenCalledWith("copy");
  });

  test("reports failure when no clipboard path succeeds", async () => {
    setSecureContext(false);
    setClipboard(undefined);
    stubExecCommand(false);

    await expect(copyText("hello")).resolves.toBe(false);
  });

  test("does not copy empty text", async () => {
    setSecureContext(false);
    const execCommand = stubExecCommand(true);

    await expect(copyText("")).resolves.toBe(false);
    expect(execCommand).not.toHaveBeenCalled();
  });
});
