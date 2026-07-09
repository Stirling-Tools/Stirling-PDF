import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";
import { AssistantMount } from "@portal/components/AssistantMount";

describe("AssistantMount (SaaS)", () => {
  it("renders nothing — the AI assistant blob is hidden pre-release", () => {
    const { container } = render(<AssistantMount />);
    expect(container).toBeEmptyDOMElement();
  });
});
