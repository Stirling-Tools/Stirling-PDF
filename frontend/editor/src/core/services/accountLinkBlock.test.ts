import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  acknowledgeAccountLinkPrompt,
  clearAccountLinkBlock,
  reportFreeTierExhausted,
  useAccountLinkBlock,
} from "@app/services/accountLinkBlock";

const cause = {
  pipelineId: "rotate",
  pipelineName: "Rotate",
  trigger: "upload" as const,
};

describe("credit prompt session", () => {
  beforeEach(() => {
    sessionStorage.clear();
    clearAccountLinkBlock();
  });

  it("keeps the first failed pipeline as the cause of concurrent failures", () => {
    const { result } = renderHook(useAccountLinkBlock);
    act(() => {
      reportFreeTierExhausted(cause);
      reportFreeTierExhausted({
        ...cause,
        pipelineId: "other-pipeline",
      });
    });
    expect(result.current.promptPending).toBe(true);
    expect(result.current.context).toEqual(cause);
  });

  it("suppresses further automatic prompts after recovery", () => {
    const { result } = renderHook(useAccountLinkBlock);
    act(() => {
      reportFreeTierExhausted(cause);
      acknowledgeAccountLinkPrompt();
      clearAccountLinkBlock();
      reportFreeTierExhausted(cause);
    });
    expect(result.current.promptPending).toBe(false);
  });

  it("does not attach a later pipeline failure to a prompt opened by a direct feature", () => {
    const { result } = renderHook(useAccountLinkBlock);
    act(() => {
      reportFreeTierExhausted();
      reportFreeTierExhausted(cause);
    });
    expect(result.current.promptPending).toBe(true);
    expect(result.current.context).toBeUndefined();
  });

  it("honours persisted session suppression and rearms for a fresh tab session", () => {
    sessionStorage.setItem("stirling:credit-prompt-shown", "true");
    clearAccountLinkBlock();
    const { result } = renderHook(useAccountLinkBlock);
    act(() => reportFreeTierExhausted(cause));
    expect(result.current.promptPending).toBe(false);
    act(() => {
      sessionStorage.clear();
      clearAccountLinkBlock();
      reportFreeTierExhausted(cause);
    });
    expect(result.current.promptPending).toBe(true);
  });

  it("retains suppression when session storage becomes unavailable", () => {
    const { result } = renderHook(useAccountLinkBlock);
    act(() => {
      reportFreeTierExhausted(cause);
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
        reportFreeTierExhausted(cause);
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
        reportFreeTierExhausted(cause);
        acknowledgeAccountLinkPrompt();
        clearAccountLinkBlock();
        reportFreeTierExhausted(cause);
      });
      expect(result.current.promptPending).toBe(false);
    } finally {
      write.mockRestore();
    }
  });
});
