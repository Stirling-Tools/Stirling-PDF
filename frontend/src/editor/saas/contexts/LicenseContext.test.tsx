import { act, renderHook } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";
import type { ReactNode } from "react";
import { LicenseProvider, useLicense } from "@app/contexts/LicenseContext";

const getLicenseInfo = vi.hoisted(() => vi.fn());
vi.mock("@app/services/licenseService", () => ({
  default: { getLicenseInfo },
}));
vi.mock("@app/contexts/AppConfigContext", () => ({
  useAppConfig: () => ({ config: { isAdmin: true } }),
}));
vi.mock("@app/testing/serverExperienceSimulations", () => ({
  getSimulatedLicenseInfo: () => null,
}));

it("does not read an installation licence on SaaS, including after checkout refresh", async () => {
  const { result } = renderHook(() => useLicense(), {
    wrapper: ({ children }: { children: ReactNode }) => (
      <MemoryRouter>
        <LicenseProvider>{children}</LicenseProvider>
      </MemoryRouter>
    ),
  });
  await act(() => result.current.refetchLicense());
  expect(result.current.loading).toBe(false);
  expect(result.current.licenseInfo).toBeNull();
  expect(getLicenseInfo).not.toHaveBeenCalled();
});
