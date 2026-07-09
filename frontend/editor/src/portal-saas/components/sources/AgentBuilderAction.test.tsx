import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";
import { AgentBuilderAction } from "@portal/components/sources/AgentBuilderAction";

describe("AgentBuilderAction (SaaS)", () => {
  it("renders nothing — Agent Builder is hidden pre-release", () => {
    const { container } = render(<AgentBuilderAction />);
    expect(container).toBeEmptyDOMElement();
  });
});
