import { describe, expect, it, vi } from "vitest";
import { renderHook } from "@testing-library/react";

const updateSeats = vi.hoisted(() => ({
  value: undefined as
    | { openUpdateSeats: (o?: unknown) => Promise<void>; isLoading: boolean }
    | undefined,
}));
const license = vi.hoisted(() => ({
  value: undefined as
    | { licenseInfo: { licenseType?: string } | null }
    | undefined,
}));

vi.mock("@app/contexts/UpdateSeatsContext", () => ({
  useOptionalUpdateSeats: () => updateSeats.value,
}));
vi.mock("@app/contexts/LicenseContext", () => ({
  useOptionalLicense: () => license.value,
}));

import { useSeatManagement } from "@app/portal/seatManagement";

const provider = { openUpdateSeats: vi.fn(async () => {}), isLoading: false };

describe("self-hosted seat management", () => {
  it("offers the seat picker on an Enterprise licence", () => {
    updateSeats.value = provider;
    license.value = { licenseInfo: { licenseType: "ENTERPRISE" } };
    const { result } = renderHook(() => useSeatManagement());
    expect(result.current.available).toBe(true);

    const onChanged = vi.fn();
    result.current.open(onChanged);
    expect(provider.openUpdateSeats).toHaveBeenCalledWith({
      onSuccess: onChanged,
    });
  });

  it("withholds it on a licence that is not seat-metered", () => {
    updateSeats.value = provider;
    license.value = { licenseInfo: { licenseType: "SERVER" } };
    const { result } = renderHook(() => useSeatManagement());
    expect(result.current.available).toBe(false);
  });

  // The roster renders inside hosts that mount only part of the provider tree
  // (settings), so a missing provider must read as "no seat flow", not throw.
  it("withholds it, without throwing, when no seat provider is mounted", () => {
    updateSeats.value = undefined;
    license.value = { licenseInfo: { licenseType: "ENTERPRISE" } };
    const { result } = renderHook(() => useSeatManagement());
    expect(result.current.available).toBe(false);
    expect(() => result.current.open(vi.fn())).not.toThrow();
  });
});
