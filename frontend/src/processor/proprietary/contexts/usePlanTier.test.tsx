import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";
import { LinkProvider, type LinkState } from "@portal/contexts/LinkContext";
import { usePlanTier } from "@portal/contexts/usePlanTier";

function Probe() {
  return <span data-testid="tier">{usePlanTier()}</span>;
}

function renderTierFor(initialState: LinkState) {
  return render(
    <LinkProvider initialState={initialState}>
      <Probe />
    </LinkProvider>,
  ).getByTestId("tier").textContent;
}

describe("usePlanTier (self-hosted) — tier from link state", () => {
  it("unlinked → free", () => {
    expect(renderTierFor("unlinked")).toBe("free");
  });
  it("linked-free → free", () => {
    expect(renderTierFor("linked-free")).toBe("free");
  });
  it("linked-subscribed → pro", () => {
    expect(renderTierFor("linked-subscribed")).toBe("pro");
  });
});
