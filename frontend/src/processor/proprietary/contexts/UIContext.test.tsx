import { describe, expect, it, vi } from "vitest";
import { act, render } from "@testing-library/react";
import { UIProvider, useUI } from "@editor/portal/contexts/UIContext";

/**
 * The context value is memoised, so every piece of state it exposes has to appear in the memo's
 * dependency array or consumers never see it change: the flag flips, the memo does not, and no
 * consumer re-renders. There is no `react-hooks/exhaustive-deps` rule in this repo to catch that, so it gets
 * a test instead.
 */
function probe() {
  const seen: boolean[] = [];
  let api: ReturnType<typeof useUI>;

  function Probe() {
    api = useUI();
    seen.push(api.linkModalOpen);
    return null;
  }

  render(
    <UIProvider>
      <Probe />
    </UIProvider>,
  );
  return {
    seen,
    get api() {
      return api;
    },
  };
}

describe("UIContext — state changes reach consumers", () => {
  it("opens banner prompts without a previous pipeline failure context", () => {
    const p = probe();
    const cause = { pipelineId: "rotate", trigger: "upload" as const };
    act(() => p.api.openLinkModal("exhausted", cause));
    expect(p.api.linkModalFailureContext).toEqual(cause);
    act(() => p.api.closeLinkModal());
    act(() => p.api.openLinkModal("exhausted"));
    expect(p.api.linkModalOpen).toBe(true);
    expect(p.api.linkModalFailureContext).toBeUndefined();
  });
  it("re-renders consumers when the link dialog opens and closes", () => {
    const p = probe();
    expect(p.api.linkModalOpen).toBe(false);

    act(() => p.api.openLinkModal());
    expect(p.api.linkModalOpen).toBe(true);
    expect(p.seen).toContain(true);

    act(() => p.api.closeLinkModal());
    expect(p.api.linkModalOpen).toBe(false);
  });
});

it("does not replace an active renewal with concurrent exhausted-credit prompts", () => {
  const p = probe();
  act(() => {
    p.api.openLinkModal("reauth");
    p.api.openLinkModal("exhausted");
  });
  expect(p.api.linkModalMode).toBe("reauth");
  const cancel = vi.fn();
  act(() =>
    p.api.publishConnectOutcome({
      mode: "reauth",
      state: "working",
      sessionRestored: false,
      cancel,
    }),
  );
  act(() => p.api.openLinkModal("exhausted"));
  expect(p.api.connectOutcome?.state).toBe("working");
  act(() => p.api.closeLinkModal());
  expect(cancel).toHaveBeenCalledOnce();
  act(() => p.api.openLinkModal("link"));
  expect(p.api.linkModalMode).toBe("link");
  expect(p.api.connectOutcome).toBeNull();
});
