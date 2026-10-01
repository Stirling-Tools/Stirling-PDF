import { describe, expect, test, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MantineProvider } from "@mantine/core";
import type { RedactionItem } from "@embedpdf/plugin-redaction";
import { RedactionSelectionMenu } from "@app/components/viewer/RedactionSelectionMenu";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (_key: string, fallback: string) => fallback }),
}));

const handleToolSelect = vi.fn();
const commitPending = vi.fn();
const removePending = vi.fn();

vi.mock("@app/contexts/ToolWorkflowContext", () => ({
  useToolWorkflow: () => ({ handleToolSelect }),
}));

vi.mock("@app/components/viewer/useActiveDocumentId", () => ({
  useActiveDocumentId: () => "doc-1",
}));

vi.mock("@embedpdf/plugin-redaction/react", () => ({
  useRedaction: () => ({ provides: { commitPending, removePending } }),
}));

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <MantineProvider>{children}</MantineProvider>
);

const item: RedactionItem = {
  id: "mark-1",
  page: 0,
  kind: "area",
  rect: { origin: { x: 0, y: 0 }, size: { width: 10, height: 10 } },
  source: "legacy",
  markColor: "#ff0000",
  redactionColor: "#000000",
};

const REVIEW = /Review and apply all redactions/;

function renderMenu(selected = true) {
  return render(
    <RedactionSelectionMenu
      context={{ type: "redaction", item, pageIndex: 0 }}
      selected={selected}
      menuWrapperProps={{ ref: vi.fn() }}
      rect={item.rect}
      placement={{ suggestTop: false, spaceAbove: 0, spaceBelow: 0 }}
    />,
    { wrapper },
  );
}

describe("RedactionSelectionMenu", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // The menu is anchored to one pending mark, so applying from it (which burns
  // in *every* pending mark) belongs in the redaction review panel instead.
  test("hands the apply decision to the redaction panel", () => {
    renderMenu();

    fireEvent.click(screen.getByRole("button", { name: REVIEW }));

    expect(handleToolSelect).toHaveBeenCalledWith("redact");
    expect(commitPending).not.toHaveBeenCalled();
  });

  test("still removes the mark it is anchored to", () => {
    renderMenu();

    fireEvent.click(screen.getByRole("button", { name: "Remove this mark" }));

    expect(removePending).toHaveBeenCalledWith(0, "mark-1");
  });

  test("renders nothing while the mark is not selected", () => {
    renderMenu(false);

    expect(screen.queryByRole("button", { name: REVIEW })).toBeNull();
  });
});
