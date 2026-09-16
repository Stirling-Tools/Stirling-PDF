import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";
// Resolves to the SaaS override (src/processor-saas/contexts) via the @processor cascade.
import { useProcessorLinked } from "@processor/contexts/useProcessorLinked";

function Probe() {
  return <span data-testid="linked">{String(useProcessorLinked())}</span>;
}

describe("useProcessorLinked (SaaS)", () => {
  it("is always true — no account-link step, no LinkProvider needed", () => {
    // Renders with no LinkProvider in the tree: the SaaS override must not read it.
    const { getByTestId } = render(<Probe />);
    expect(getByTestId("linked").textContent).toBe("true");
  });
});
