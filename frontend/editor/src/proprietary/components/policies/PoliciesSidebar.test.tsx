import "fake-indexeddb/auto";
import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MantineProvider } from "@mantine/core";

// Enabling a policy creates its backing Watch Folders SmartFolder (IndexedDB);
// jsdom's crypto lacks randomUUID, which smartFolderStorage uses for folder ids.
if (typeof globalThis.crypto?.randomUUID !== "function") {
  const orig = globalThis.crypto;
  vi.stubGlobal("crypto", {
    getRandomValues: orig?.getRandomValues?.bind(orig),
    randomUUID: () =>
      `p-${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`,
  });
}
import {
  PoliciesSection,
  PolicyDetailTakeover,
  usePolicyDetailActive,
} from "@app/components/policies/PoliciesSidebar";
import { resetPolicySelection } from "@app/components/policies/policySelectionStore";

/**
 * Mirrors how RightSidebar swaps the policy list for the detail takeover: the
 * list shows above Tools when nothing is open, the takeover replaces it when a
 * policy is selected.
 */
function PoliciesHost() {
  const active = usePolicyDetailActive();
  return active ? <PolicyDetailTakeover /> : <PoliciesSection />;
}

function renderHost() {
  return render(
    <MantineProvider>
      <PoliciesHost />
    </MantineProvider>,
  );
}

describe("Policies right-sidebar surface", () => {
  beforeEach(() => {
    localStorage.clear();
    resetPolicySelection();
  });

  it("renders the policy list with every category", () => {
    renderHost();
    expect(screen.getByText("Policies")).toBeInTheDocument();
    // The mock/live data-source toggle is present in the list header.
    expect(screen.getByText("Demo data")).toBeInTheDocument();
    for (const label of [
      "Ingestion",
      "Security",
      "Compliance",
      "Routing",
      "Retention",
    ]) {
      expect(screen.getByText(label)).toBeInTheDocument();
    }
  });

  it("shows the seeded Ingestion policy as active and others as set-up", () => {
    renderHost();
    expect(screen.getAllByText("Active").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("Set up").length).toBeGreaterThanOrEqual(1);
  });

  it("opens the narrative view when an active policy is clicked", () => {
    renderHost();
    fireEvent.click(screen.getByText("Ingestion"));
    expect(screen.getByText("Enforces")).toBeInTheDocument();
    expect(screen.getByText("Edit Settings")).toBeInTheDocument();
  });

  it("shows the recent-activity feed for a policy that has activity", () => {
    renderHost();
    fireEvent.click(screen.getByText("Ingestion"));
    expect(screen.getByText("Recent Activity")).toBeInTheDocument();
    // Seeded mock activity rows render (not the empty state).
    expect(screen.getByText("MSA_Acme_2026.pdf")).toBeInTheDocument();
    expect(screen.queryByText("No activity yet")).not.toBeInTheDocument();
  });

  it("returns to the list via the back button", () => {
    renderHost();
    fireEvent.click(screen.getByText("Ingestion"));
    expect(screen.getByText("Enforces")).toBeInTheDocument();
    fireEvent.click(screen.getByLabelText("Back"));
    expect(screen.getByText("Policies")).toBeInTheDocument();
  });

  it("opens the 3-step setup wizard for an unconfigured policy", () => {
    renderHost();
    fireEvent.click(screen.getByText("Security"));
    expect(screen.getByText("Set up Security Policy")).toBeInTheDocument();
    expect(screen.getByText("Step 1 of 3")).toBeInTheDocument();
  });

  it("advances through the wizard and enables the policy", async () => {
    renderHost();
    fireEvent.click(screen.getByText("Security"));
    fireEvent.click(screen.getByText("Continue")); // → step 2
    expect(screen.getByText("Sources")).toBeInTheDocument();
    fireEvent.click(screen.getByText("Continue")); // → step 3
    expect(screen.getByText("Summary")).toBeInTheDocument();
    fireEvent.click(screen.getByText("Enable Policy"));
    // Enable is async (creates the backing folder); the detail footer with
    // "Edit Settings" appears once the policy is configured.
    expect(await screen.findByText("Edit Settings")).toBeInTheDocument();
  });
});
