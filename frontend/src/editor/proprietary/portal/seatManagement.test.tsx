import { describe, expect, it, vi } from "vitest";
import { renderHook } from "@testing-library/react";
import type { LicenseInfo } from "@app/types/license";

const updateSeats = vi.hoisted(() => ({
  value: undefined as
    | { openUpdateSeats: (o?: unknown) => Promise<void>; isLoading: boolean }
    | undefined,
}));
const license = vi.hoisted(() => ({
  value: undefined as { licenseInfo: LicenseInfo | null } | undefined,
}));

vi.mock("@app/contexts/UpdateSeatsContext", () => ({
  useOptionalUpdateSeats: () => updateSeats.value,
}));
vi.mock("@app/contexts/LicenseContext", () => ({
  useOptionalLicense: () => license.value,
}));

import { useSeatManagement } from "@app/portal/seatManagement";

const provider = { openUpdateSeats: vi.fn(async () => {}), isLoading: false };

function withLicence(info: Partial<LicenseInfo>) {
  updateSeats.value = provider;
  license.value = {
    licenseInfo: {
      licenseType: "SERVER",
      enabled: true,
      maxUsers: 100,
      hasKey: true,
      ...info,
    },
  };
  return renderHook(() => useSeatManagement()).result;
}

describe("self-hosted seat management", () => {
  it("offers the seat picker on Team (SERVER), which is sold with seats", () => {
    const result = withLicence({ licenseType: "SERVER", maxUsers: 100 });
    expect(result.current.available).toBe(true);

    const onChanged = vi.fn();
    result.current.open(onChanged);
    expect(provider.openUpdateSeats).toHaveBeenCalledWith({
      onSuccess: onChanged,
    });
  });

  it("offers it on Enterprise too", () => {
    expect(
      withLicence({ licenseType: "ENTERPRISE", maxUsers: 500 }).current
        .available,
    ).toBe(true);
  });

  // A free licence is capped, not extendable: the route off it is an upgrade.
  it("withholds it on a free licence", () => {
    expect(
      withLicence({ licenseType: "NORMAL", maxUsers: 5 }).current.available,
    ).toBe(false);
  });

  it("withholds it on a disabled licence", () => {
    expect(withLicence({ enabled: false }).current.available).toBe(false);
  });

  // maxUsers 0 is a legacy unlimited licence - there is no seat count to raise.
  it("withholds it on a legacy unlimited licence", () => {
    expect(withLicence({ maxUsers: 0 }).current.available).toBe(false);
  });

  // The roster renders inside hosts that mount only part of the provider tree
  // (settings), so a missing provider must read as "no seat flow", not throw.
  it("withholds it, without throwing, when no seat provider is mounted", () => {
    const result = withLicence({});
    updateSeats.value = undefined;
    const { result: noProvider } = renderHook(() => useSeatManagement());
    expect(result.current.available).toBe(true);
    expect(noProvider.current.available).toBe(false);
    expect(() => noProvider.current.open(vi.fn())).not.toThrow();
  });
});
