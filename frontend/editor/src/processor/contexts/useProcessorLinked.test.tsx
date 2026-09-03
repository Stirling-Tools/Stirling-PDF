import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";
import { LinkProvider, type LinkState } from "@processor/contexts/LinkContext";
import { useProcessorLinked } from "@processor/contexts/useProcessorLinked";

function Probe() {
  return <span data-testid="linked">{String(useProcessorLinked())}</span>;
}

function renderLinkedFor(initialState: LinkState) {
  return render(
    <LinkProvider initialState={initialState}>
      <Probe />
    </LinkProvider>,
  ).getByTestId("linked").textContent;
}

describe("useProcessorLinked (self-hosted) — gated on the account link", () => {
  it("unlinked → false", () => {
    expect(renderLinkedFor("unlinked")).toBe("false");
  });
  it("linked-free → true", () => {
    expect(renderLinkedFor("linked-free")).toBe("true");
  });
  it("linked-subscribed → true", () => {
    expect(renderLinkedFor("linked-subscribed")).toBe("true");
  });
});
