import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";
import { LinkAccountFooterItem } from "@portal/components/LinkAccountFooterItem";

describe("LinkAccountFooterItem (SaaS)", () => {
  it("renders nothing — SaaS has no account to link", () => {
    const { container } = render(<LinkAccountFooterItem />);
    expect(container).toBeEmptyDOMElement();
  });
});
