import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";
// Resolves to the SaaS override (src/saas/portal/contexts) via the @portal cascade.
import { usePortalLinked } from "@portal/contexts/usePortalLinked";

function Probe() {
  return <span data-testid="linked">{String(usePortalLinked())}</span>;
}

describe("usePortalLinked (SaaS)", () => {
  it("is always true — no account-link step, no LinkProvider needed", () => {
    // Renders with no LinkProvider in the tree: the SaaS override must not read it.
    const { getByTestId } = render(<Probe />);
    expect(getByTestId("linked").textContent).toBe("true");
  });
});
