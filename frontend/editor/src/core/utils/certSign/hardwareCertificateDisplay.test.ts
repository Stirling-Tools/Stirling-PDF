import { describe, expect, it } from "vitest";
import { HardwareCertificateInfo } from "@app/services/hardwareSigningService";
import {
  byUsefulness,
  displayName,
  distinctIssuer,
  expiryDate,
  isGuidish,
  isUsable,
  matches,
  rank,
  validityOf,
} from "@app/utils/certSign/hardwareCertificateDisplay";

const cert = (
  overrides: Partial<HardwareCertificateInfo> = {},
): HardwareCertificateInfo => ({
  alias: "Jane Doe",
  source: "WINDOWS_STORE",
  subject: "CN=Jane Doe, O=Acme, C=ES",
  issuer: "CN=FNMT-RCM, C=ES",
  subjectCommonName: "Jane Doe",
  issuerCommonName: "FNMT-RCM",
  serialNumber: "1a2b3c",
  keyAlgorithm: "RSA",
  notBefore: "2025-01-01T00:00:00Z",
  notAfter: "2027-04-11T00:00:00Z",
  expired: false,
  notYetValid: false,
  ...overrides,
});

const GUID = "3f2504e0-4f89-11d3-9a0c-0305e82c3301";

describe("naming a certificate", () => {
  it("treats a bare GUID as no name at all", () => {
    expect(isGuidish(GUID)).toBe(true);
    expect(isGuidish("Jane Doe")).toBe(false);
    expect(isGuidish(null)).toBe(true);
  });

  it("prefers the Windows friendly name over a GUID subject", () => {
    expect(
      displayName(cert({ subjectCommonName: GUID, alias: "My signing key" })),
    ).toBe("My signing key");
  });

  it("falls back to the subject when nothing is readable", () => {
    expect(displayName(cert({ subjectCommonName: GUID, alias: GUID }))).toBe(
      GUID,
    );
  });
});

describe("what the row shows", () => {
  it("hides the issuer of a self-signed certificate", () => {
    // "Jane Doe · Jane Doe" reads as a defect rather than as information.
    expect(distinctIssuer(cert({ issuerCommonName: "Jane Doe" }))).toBeNull();
  });

  it("shows an issuer that says something the name does not", () => {
    expect(distinctIssuer(cert())).toBe("FNMT-RCM");
  });

  it("reduces the expiry to a date", () => {
    expect(expiryDate(cert())).toBe("2027-04-11");
    expect(expiryDate(cert({ notAfter: "" }))).toBe("");
  });

  it("reports the three validity states", () => {
    expect(validityOf(cert())).toBe("valid");
    expect(validityOf(cert({ expired: true }))).toBe("expired");
    expect(validityOf(cert({ notYetValid: true }))).toBe("notYetValid");
  });
});

describe("ordering the list", () => {
  it("puts what you can sign with first and what you cannot last", () => {
    const usable = cert({ alias: "Zoe", subjectCommonName: "Zoe" });
    const system = cert({ alias: GUID, subjectCommonName: GUID });
    const expired = cert({
      alias: "Adam",
      subjectCommonName: "Adam",
      expired: true,
    });

    expect(rank(usable)).toBeLessThan(rank(system));
    expect(rank(system)).toBeLessThan(rank(expired));
    // Alphabetical order must not float an expired certificate to the top.
    expect([expired, system, usable].sort(byUsefulness)[0]).toBe(usable);
  });

  it("counts expired and not-yet-valid certificates as unusable", () => {
    expect(isUsable(cert())).toBe(true);
    expect(isUsable(cert({ expired: true }))).toBe(false);
    expect(isUsable(cert({ notYetValid: true }))).toBe(false);
  });
});

describe("searching the list", () => {
  it("matches on name, issuer, full subject and serial", () => {
    expect(matches(cert(), "jane")).toBe(true);
    expect(matches(cert(), "FNMT")).toBe(true);
    expect(matches(cert(), "acme")).toBe(true);
    expect(matches(cert(), "1a2b")).toBe(true);
    expect(matches(cert(), "nothing here")).toBe(false);
  });

  it("shows everything when nothing has been typed", () => {
    expect(matches(cert(), "")).toBe(true);
    expect(matches(cert(), "   ")).toBe(true);
  });
});
