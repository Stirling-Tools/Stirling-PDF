import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  acknowledgeAccountLinkPrompt,
  clearAccountLinkBlock,
  reportFreeTierExhausted,
  requestAccountLinkPrompt,
  useAccountLinkBlock,
} from "@app/services/accountLinkBlock";

const cause = {
  pipelineId: "rotate",
  pipelineName: "Rotate",
  fileName: "report.pdf",
  trigger: "upload" as const,
};

describe("credit prompt session", () => {
  beforeEach(() => {
    sessionStorage.clear();
    clearAccountLinkBlock();
  });

  it("keeps the first failed file as the cause of a concurrent background burst", () => {
    const { result } = renderHook(useAccountLinkBlock);
    act(() => {
      reportFreeTierExhausted("background", cause);
      reportFreeTierExhausted("background", {
        ...cause,
        fileName: "other.pdf",
      });
    });
    expect(result.current.promptPending).toBe(true);
    expect(result.current.context).toEqual(cause);
  });

  it("suppresses further automatic prompts after recovery but allows explicit reopening", () => {
    const { result } = renderHook(useAccountLinkBlock);
    act(() => {
      reportFreeTierExhausted("background", cause);
      acknowledgeAccountLinkPrompt();
      clearAccountLinkBlock();
      reportFreeTierExhausted("foreground", cause);
    });
    expect(result.current.promptPending).toBe(false);
    act(requestAccountLinkPrompt);
    expect(result.current.promptPending).toBe(true);
  });

  it("honours persisted session suppression and rearms for a fresh tab session", () => {
    sessionStorage.setItem("stirling:credit-prompt-shown", "true");
    clearAccountLinkBlock();
    const { result } = renderHook(useAccountLinkBlock);
    act(() => reportFreeTierExhausted("background", cause));
    expect(result.current.promptPending).toBe(false);
    act(() => {
      sessionStorage.clear();
      clearAccountLinkBlock();
      reportFreeTierExhausted("background", cause);
    });
    expect(result.current.promptPending).toBe(true);
  });

  it("retains suppression when session storage becomes unavailable", () => {
    const { result } = renderHook(useAccountLinkBlock);
    act(() => {
      reportFreeTierExhausted("background", cause);
      acknowledgeAccountLinkPrompt();
    });
    const read = vi
      .spyOn(Storage.prototype, "getItem")
      .mockImplementation(() => {
        throw new Error("blocked");
      });
    try {
      act(() => {
        clearAccountLinkBlock();
        reportFreeTierExhausted("background", cause);
      });
      expect(result.current.promptPending).toBe(false);
    } finally {
      read.mockRestore();
    }
  });
  it("retains suppression when storage is readable but refuses writes", () => {
    const { result } = renderHook(useAccountLinkBlock);
    const write = vi
      .spyOn(Storage.prototype, "setItem")
      .mockImplementation(() => {
        throw new Error("quota exceeded");
      });
    try {
      act(() => {
        reportFreeTierExhausted("background", cause);
        acknowledgeAccountLinkPrompt();
        clearAccountLinkBlock();
        reportFreeTierExhausted("background", cause);
      });
      expect(result.current.promptPending).toBe(false);
    } finally {
      write.mockRestore();
    }
  });
});
