import { describe, it, expect, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MantineProvider } from "@mantine/core";
import { PoliciesPanel } from "@app/components/policies/PoliciesPanel";

function renderPanel() {
  return render(
    <MantineProvider>
      <PoliciesPanel data={{}} />
    </MantineProvider>,
  );
}

describe("PoliciesPanel", () => {
  beforeEach(() => localStorage.clear());

  it("renders the category rail", () => {
    renderPanel();
    expect(screen.getByText("Policies")).toBeInTheDocument();
    // Each category label appears at least once (rail; the selected one also
    // shows in the detail header).
    for (const label of [
      "Ingestion",
      "Security",
      "Compliance",
      "Routing",
      "Retention",
    ]) {
      expect(screen.getAllByText(label).length).toBeGreaterThanOrEqual(1);
    }
  });

  it("shows the narrative view for the default-active Ingestion policy", () => {
    renderPanel();
    expect(screen.getByText("Enforces")).toBeInTheDocument();
    expect(screen.getAllByText("Active").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("Edit Settings")).toBeInTheDocument();
  });

  it("opens the 3-step setup wizard for an unconfigured policy", () => {
    renderPanel();
    fireEvent.click(screen.getByText("Security"));
    expect(screen.getByText("Set up Security Policy")).toBeInTheDocument();
    expect(screen.getByText("Step 1 of 3")).toBeInTheDocument();
  });

  it("advances through the wizard and enables the policy", () => {
    renderPanel();
    fireEvent.click(screen.getByText("Security"));
    fireEvent.click(screen.getByText("Continue")); // → step 2
    expect(screen.getByText("Sources")).toBeInTheDocument();
    fireEvent.click(screen.getByText("Continue")); // → step 3
    expect(screen.getByText("Summary")).toBeInTheDocument();
    fireEvent.click(screen.getByText("Enable Policy"));
    // Now configured → narrative footer is shown.
    expect(screen.getByText("Edit Settings")).toBeInTheDocument();
  });

  it("shows the per-document cost in the billing bar", () => {
    renderPanel();
    expect(screen.getByText("$0.02")).toBeInTheDocument();
  });
});
