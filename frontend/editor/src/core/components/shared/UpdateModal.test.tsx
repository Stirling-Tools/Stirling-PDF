import { render, screen, waitFor } from "@testing-library/react";
import { MantineProvider } from "@mantine/core";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { MachineInfo, UpdateSummary } from "@app/services/updateService";

const getFullUpdateInfo = vi.fn();

vi.mock("@app/services/updateService", () => ({
  updateService: {
    getFullUpdateInfo: (...args: unknown[]) => getFullUpdateInfo(...args),
    getDownloadUrl: () => null,
    compareVersions: (a: string, b: string) => (a === b ? 0 : a > b ? 1 : -1),
  },
}));

import UpdateModal from "@app/components/shared/UpdateModal";

const summary: UpdateSummary = {
  latest_version: "2.0.0",
  max_priority: "normal",
  any_breaking: false,
};

const machine = (): MachineInfo => ({
  machineType: "Client-win",
  activeSecurity: false,
  licenseType: "NORMAL",
});

function wrap(machineInfo: MachineInfo) {
  return (
    <MantineProvider>
      <UpdateModal
        opened
        onClose={() => {}}
        currentVersion="1.0.0"
        updateSummary={summary}
        machineInfo={machineInfo}
      />
    </MantineProvider>
  );
}

describe("UpdateModal", () => {
  afterEach(() => getFullUpdateInfo.mockReset());

  it("does not refetch version info when machineInfo identity changes but values are equal", async () => {
    getFullUpdateInfo.mockResolvedValue({
      latest_version: "2.0.0",
      new_versions: [],
    });

    const { rerender } = render(wrap(machine()));

    await waitFor(() =>
      expect(
        screen.queryByText("update.loadingDetailedInfo"),
      ).not.toBeInTheDocument(),
    );
    expect(getFullUpdateInfo).toHaveBeenCalledTimes(1);

    rerender(wrap(machine()));

    await waitFor(() => expect(getFullUpdateInfo).toHaveBeenCalledTimes(1));
  });
});
