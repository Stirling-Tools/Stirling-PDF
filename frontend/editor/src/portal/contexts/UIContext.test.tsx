import { describe, expect, it, vi } from "vitest";
import { act, render } from "@testing-library/react";
import { UIProvider, useUI } from "@app/portal/contexts/UIContext";

/**
 * The context value is memoised, so every piece of state it exposes has to appear in the memo's
 * dependency array or consumers never see it change. `trialSetupRequested` was added without it and
 * the enterprise CTA silently did nothing: the flag flipped, the memo did not, and no consumer
 * re-rendered. There is no `react-hooks/exhaustive-deps` rule in this repo to catch that, so it gets
 * a test instead.
 */
function probe() {
  const seen: boolean[] = [];
  let api: ReturnType<typeof useUI>;

  function Probe() {
    api = useUI();
    seen.push(api.trialSetupRequested);
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

describe("UIContext — the trial-setup signal reaches consumers", () => {
  it("re-renders consumers when the request is raised and cleared", () => {
    const p = probe();
    expect(p.api.trialSetupRequested).toBe(false);

    act(() => p.api.requestTrialSetup());
    expect(p.api.trialSetupRequested).toBe(true);
    expect(p.seen).toContain(true);

    act(() => p.api.clearTrialSetupRequest());
    expect(p.api.trialSetupRequested).toBe(false);
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
