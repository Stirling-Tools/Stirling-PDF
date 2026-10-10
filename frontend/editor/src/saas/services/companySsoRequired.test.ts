import { afterEach, expect, it, vi } from "vitest";
import { reportCompanySsoRequired } from "@app/services/companySsoRequired";

afterEach(() => vi.unstubAllGlobals());

it("redirects enforced company access to a local ceremony with the connection ID", () => {
  const assign = vi.fn();
  vi.stubGlobal("window", { location: { assign } });
  const id = "00000000-0000-4000-8000-000000000001";
  reportCompanySsoRequired(403, {
    code: "COMPANY_SSO_REQUIRED",
    connectionId: id,
  });
  expect(assign).toHaveBeenCalledWith(`/company-sso?connection=${id}`);
});

it("never treats a server-supplied destination as a redirect URL", () => {
  const assign = vi.fn();
  vi.stubGlobal("window", { location: { assign } });
  reportCompanySsoRequired(403, {
    code: "COMPANY_SSO_REQUIRED",
    connectionId: "https://other.example",
  });
  expect(assign).toHaveBeenCalledWith("/company-sso");
});

it("leaves unrelated failures on the current screen", () => {
  const assign = vi.fn();
  vi.stubGlobal("window", { location: { assign } });
  reportCompanySsoRequired(401, { code: "COMPANY_SSO_REQUIRED" });
  reportCompanySsoRequired(403, { code: "FORBIDDEN" });
  reportCompanySsoRequired(403, null);
  expect(assign).not.toHaveBeenCalled();
});
