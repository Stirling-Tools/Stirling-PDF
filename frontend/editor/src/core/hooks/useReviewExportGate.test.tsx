import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, fireEvent, screen } from "@testing-library/react";
import { MantineProvider } from "@mantine/core";
import type { FileItemPolicyRef } from "@app/components/shared/PolicyBadges";
import { useReviewExportGate } from "@app/hooks/useReviewExportGate";

// The gate modal portals to document.body, so query via `screen` (whole
// document) rather than the render container.
const withProvider = (ui: React.ReactElement) =>
  render(<MantineProvider>{ui}</MantineProvider>);

// The gate reads only these two, so mocking them drives its branch logic.
const badgeMap = new Map<string, FileItemPolicyRef[]>();
const openFileReview = vi.fn();

vi.mock("@app/hooks/usePolicyFileBadges", () => ({
  usePolicyFileBadges: () => badgeMap,
}));
vi.mock("@app/hooks/useOpenFileReview", () => ({
  useOpenFileReview: () => openFileReview,
}));

const failed: FileItemPolicyRef = {
  id: "classification",
  name: "Classification",
  accentColor: "#f00",
  recent: false,
  failed: true,
};

function Harness({
  action,
  targetIds,
  proceed,
}: {
  action: string;
  targetIds: string[];
  proceed: () => void;
}) {
  const { guardExport, gateModal } = useReviewExportGate();
  return (
    <>
      <button onClick={() => guardExport(action, targetIds, proceed)}>
        go
      </button>
      {gateModal}
    </>
  );
}

describe("useReviewExportGate", () => {
  beforeEach(() => {
    badgeMap.clear();
    openFileReview.mockClear();
  });

  it("proceeds immediately when no target needs review", () => {
    const proceed = vi.fn();
    withProvider(
      <Harness action="download" targetIds={["a"]} proceed={proceed} />,
    );
    fireEvent.click(screen.getByText("go"));
    expect(proceed).toHaveBeenCalledTimes(1);
    expect(screen.queryByText("reviewTool.gate.title")).toBeNull();
  });

  it("opens the gate instead of proceeding when a target needs review", async () => {
    badgeMap.set("a", [failed]);
    const proceed = vi.fn();
    withProvider(
      <Harness action="download" targetIds={["a"]} proceed={proceed} />,
    );
    fireEvent.click(screen.getByText("go"));
    expect(proceed).not.toHaveBeenCalled();
    expect(await screen.findByText("reviewTool.gate.title")).toBeTruthy();
  });

  it('"Download anyway" runs the deferred export', async () => {
    badgeMap.set("a", [failed]);
    const proceed = vi.fn();
    withProvider(
      <Harness action="download" targetIds={["a"]} proceed={proceed} />,
    );
    fireEvent.click(screen.getByText("go"));
    fireEvent.click(await screen.findByText("reviewTool.gate.continueAnyway"));
    expect(proceed).toHaveBeenCalledTimes(1);
  });

  it('"Review now" opens the review flow for the first failing file, not the export', async () => {
    badgeMap.set("b", [failed]);
    const proceed = vi.fn();
    withProvider(
      <Harness action="download" targetIds={["a", "b"]} proceed={proceed} />,
    );
    fireEvent.click(screen.getByText("go"));
    fireEvent.click(await screen.findByText("reviewTool.gate.reviewNow"));
    expect(openFileReview).toHaveBeenCalledWith("b");
    expect(proceed).not.toHaveBeenCalled();
  });

  it("ignores an in-flight (enforcing) failure — that is a spinner, not a gate", () => {
    badgeMap.set("a", [{ ...failed, enforcing: true }]);
    const proceed = vi.fn();
    withProvider(
      <Harness action="download" targetIds={["a"]} proceed={proceed} />,
    );
    fireEvent.click(screen.getByText("go"));
    expect(proceed).toHaveBeenCalledTimes(1);
    expect(screen.queryByText("reviewTool.gate.title")).toBeNull();
  });
});
