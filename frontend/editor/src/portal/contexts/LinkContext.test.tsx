import { describe, expect, it } from "vitest";
import { render, screen, act } from "@testing-library/react";
import {
  deriveLinkState,
  LINK_INFO,
  LinkProvider,
  useApplyLinkFacts,
  useLink,
} from "@portal/contexts/LinkContext";

describe("deriveLinkState", () => {
  it("maps raw facts to the three link states", () => {
    expect(deriveLinkState(false, false)).toBe("unlinked");
    expect(deriveLinkState(false, true)).toBe("unlinked");
    expect(deriveLinkState(true, false)).toBe("linked-free");
    expect(deriveLinkState(true, true)).toBe("linked-subscribed");
  });
});

describe("LINK_INFO", () => {
  it("only unlocks features once linked", () => {
    expect(LINK_INFO.unlinked.unlocked).toBe(false);
    expect(LINK_INFO["linked-free"].unlocked).toBe(true);
    expect(LINK_INFO["linked-subscribed"].unlocked).toBe(true);
  });
});

function Probe() {
  const { linkState, isLinked, featuresUnlocked } = useLink();
  const apply = useApplyLinkFacts();
  return (
    <div>
      <span data-testid="state">{linkState}</span>
      <span data-testid="linked">{String(isLinked)}</span>
      <span data-testid="unlocked">{String(featuresUnlocked)}</span>
      <button onClick={() => apply(true, true)}>subscribe</button>
    </div>
  );
}

describe("LinkProvider", () => {
  it("defaults to unlinked and locks features", () => {
    render(
      <LinkProvider>
        <Probe />
      </LinkProvider>,
    );
    expect(screen.getByTestId("state").textContent).toBe("unlinked");
    expect(screen.getByTestId("linked").textContent).toBe("false");
    expect(screen.getByTestId("unlocked").textContent).toBe("false");
  });

  it("applies link facts to update the derived state", () => {
    render(
      <LinkProvider>
        <Probe />
      </LinkProvider>,
    );
    act(() => screen.getByText("subscribe").click());
    expect(screen.getByTestId("state").textContent).toBe("linked-subscribed");
    expect(screen.getByTestId("unlocked").textContent).toBe("true");
  });

  it("throws when useLink is used outside the provider", () => {
    function Bare() {
      useLink();
      return null;
    }
    expect(() => render(<Bare />)).toThrow(/useLink must be used/);
  });
});
