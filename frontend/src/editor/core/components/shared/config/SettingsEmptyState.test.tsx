import { describe, expect, test } from "vitest";
import { render, screen } from "@testing-library/react";
import { SettingsEmptyState } from "@app/components/shared/config/SettingsEmptyState";

describe("SettingsEmptyState", () => {
  test("states the situation without claiming anything is wrong", () => {
    render(
      <SettingsEmptyState title="No usage yet">
        Endpoint activity appears here once people start running tools.
      </SettingsEmptyState>,
    );

    expect(screen.getByText("No usage yet")).toBeTruthy();
    // Not an alert: an empty audit log on a fresh install is the normal state.
    expect(document.querySelector('[role="alert"]')).toBeNull();
    expect(document.querySelector(".settings-empty")).toBeTruthy();
  });
});
