import { describe, expect, it, vi } from "vitest";
import {
  fireEvent,
  render as baseRender,
  screen,
} from "@testing-library/react";
import { PortalTestProviders } from "@portal/test/TestQueryProvider";
import { RoutingRules } from "@portal/components/policies/RoutingRules";
import type { WireRoutingRule } from "@app/policies/types";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (_key: string, fallback?: string) => fallback ?? _key,
    i18n: { changeLanguage: vi.fn() },
  }),
}));

const DESTINATIONS = [
  { id: "src-finance", name: "Finance archive" },
  { id: "src-legal", name: "Legal review" },
];

function setup(rules: WireRoutingRule[], canClassify = true) {
  const onChange = vi.fn();
  baseRender(
    <RoutingRules
      rules={rules}
      onChange={onChange}
      destinations={DESTINATIONS}
      canClassify={canClassify}
    />,
    { wrapper: PortalTestProviders },
  );
  return onChange;
}

const rule = (values: string[], outputId: string): WireRoutingRule => ({
  field: "classification.labels",
  operator: "matches-any",
  values,
  outputId,
});

describe("RoutingRules", () => {
  it("offers no rule editor until routing is switched on", () => {
    setup([]);

    expect(screen.queryByText("Routes")).not.toBeInTheDocument();
    expect(screen.getByTestId("routing-toggle")).toBeInTheDocument();
  });

  it("cannot be switched on until the pipeline classifies", () => {
    const onChange = setup([], false);

    fireEvent.click(screen.getByTestId("routing-toggle"));

    expect(onChange).not.toHaveBeenCalled();
    expect(
      screen.getByText(
        "Add a Classify step to the pipeline first - routes read the document type it works out.",
      ),
    ).toBeInTheDocument();
  });

  it("can still be switched off after the classify step is removed", () => {
    const onChange = setup([rule(["invoice"], "src-finance")], false);

    fireEvent.click(screen.getByTestId("routing-toggle"));

    expect(onChange).toHaveBeenCalledWith([]);
  });

  it("seeds one blank rule when switched on, since an empty list is 'off'", () => {
    const onChange = setup([]);

    fireEvent.click(screen.getByTestId("routing-toggle"));

    expect(onChange).toHaveBeenCalledWith([
      // Blank types, so the invalid state prompts the user; the first destination is a head start.
      { ...rule([], "src-finance") },
    ]);
  });

  it("clears every rule when switched off, so nothing routes behind the user's back", () => {
    const onChange = setup([rule(["invoice"], "src-finance")]);

    fireEvent.click(screen.getByTestId("routing-toggle"));

    expect(onChange).toHaveBeenCalledWith([]);
  });

  it("appends a rule without disturbing the ones above it", () => {
    const onChange = setup([rule(["invoice"], "src-finance")]);

    fireEvent.click(screen.getByText("Add a route"));

    expect(onChange).toHaveBeenCalledWith([
      rule(["invoice"], "src-finance"),
      rule([], "src-finance"),
    ]);
  });

  it("removes the rule whose remove button was pressed", () => {
    const onChange = setup([
      rule(["invoice"], "src-finance"),
      rule(["contract"], "src-legal"),
    ]);

    fireEvent.click(screen.getAllByRole("button", { name: "Remove rule" })[0]);

    expect(onChange).toHaveBeenCalledWith([rule(["contract"], "src-legal")]);
  });
});
