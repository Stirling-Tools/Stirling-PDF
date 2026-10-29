import { describe, expect, test, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MantineProvider } from "@mantine/core";
import WorkbenchBarDesktopActions from "@editor/components/shared/workbenchBar/WorkbenchBarDesktopActions";

const renderActions = (downloadDisabledReason?: string) =>
  render(
    <MantineProvider>
      <WorkbenchBarDesktopActions
        currentView="viewer"
        showsFileActions
        actionsDisabled={false}
        policyEnforcing={false}
        downloadLabel="Download"
        downloadIconName="download"
        saveAsIconName="save"
        onPrint={vi.fn()}
        downloadDisabledReason={downloadDisabledReason}
        onExport={vi.fn()}
        onClose={vi.fn()}
      />
    </MantineProvider>,
  );

describe("WorkbenchBarDesktopActions", () => {
  test("disables saving when the document's rights forbid a copy", () => {
    renderActions(
      "Your Microsoft Purview permissions do not allow saving a copy of this PDF.",
    );
    expect(screen.getByRole("button", { name: "Download" })).toBeDisabled();
    expect(screen.getByRole("button", { name: /save ?as/i })).toBeDisabled();
    expect(screen.getByRole("button", { name: /print/i })).toBeEnabled();
  });

  test("keeps saving available otherwise", () => {
    renderActions();
    expect(screen.getByRole("button", { name: "Download" })).toBeEnabled();
    expect(screen.getByRole("button", { name: /save ?as/i })).toBeEnabled();
  });
});
