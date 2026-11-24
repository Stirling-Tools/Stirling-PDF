import { describe, expect, test } from "vitest";
import {
  buildCertSignFormData,
  certSignFromApiParams,
} from "@editor/hooks/tools/certSign/useCertSignOperation";
import {
  CertSignParameters,
  defaultParameters,
} from "@editor/hooks/tools/certSign/useCertSignParameters";

const pdf = () =>
  new File(["%PDF-1.4"], "doc.pdf", { type: "application/pdf" });

const params = (
  overrides: Partial<CertSignParameters>,
): CertSignParameters => ({
  ...defaultParameters,
  ...overrides,
});

describe("buildCertSignFormData - hardware cert types", () => {
  test("WINDOWS_STORE sends certType and alias, no files", () => {
    const formData = buildCertSignFormData(
      params({
        signMode: "MANUAL",
        certType: "WINDOWS_STORE",
        alias: "My Signing Cert",
      }),
      pdf(),
    );

    expect(formData.get("certType")).toBe("WINDOWS_STORE");
    expect(formData.get("alias")).toBe("My Signing Cert");
    expect(formData.get("p12File")).toBeNull();
    expect(formData.get("jksFile")).toBeNull();
  });

  test("MACOS_KEYCHAIN sends certType and alias, no files or driver", () => {
    const formData = buildCertSignFormData(
      params({
        signMode: "MANUAL",
        certType: "MACOS_KEYCHAIN",
        alias: "a0c6e71c07be96556aaab6ed6a73e3ccd1b5b3e9",
      }),
      pdf(),
    );

    expect(formData.get("certType")).toBe("MACOS_KEYCHAIN");
    expect(formData.get("alias")).toBe(
      "a0c6e71c07be96556aaab6ed6a73e3ccd1b5b3e9",
    );
    expect(formData.get("pkcs11LibraryPath")).toBeNull();
    expect(formData.get("p12File")).toBeNull();
  });

  test("PKCS11 sends driver path, slot, alias and PIN (as password)", () => {
    const formData = buildCertSignFormData(
      params({
        signMode: "MANUAL",
        certType: "PKCS11",
        pkcs11LibraryPath: "/usr/lib/opensc-pkcs11.so",
        pkcs11Slot: 0,
        alias: "token-cert",
        password: "1234",
      }),
      pdf(),
    );

    expect(formData.get("certType")).toBe("PKCS11");
    expect(formData.get("pkcs11LibraryPath")).toBe("/usr/lib/opensc-pkcs11.so");
    expect(formData.get("pkcs11Slot")).toBe("0");
    expect(formData.get("alias")).toBe("token-cert");
    expect(formData.get("password")).toBe("1234");
  });

  test("PKCS11 omits slot when not provided", () => {
    const formData = buildCertSignFormData(
      params({
        signMode: "MANUAL",
        certType: "PKCS11",
        pkcs11LibraryPath: "/usr/lib/opensc-pkcs11.so",
        alias: "token-cert",
        password: "1234",
      }),
      pdf(),
    );

    expect(formData.get("pkcs11Slot")).toBeNull();
  });

  test("AUTO mode still maps to SERVER without hardware fields", () => {
    const formData = buildCertSignFormData(params({ signMode: "AUTO" }), pdf());

    expect(formData.get("certType")).toBe("SERVER");
    expect(formData.get("alias")).toBeNull();
    expect(formData.get("pkcs11LibraryPath")).toBeNull();
  });
});

describe("buildCertSignFormData - signature details", () => {
  test("invisible signature still sends name, reason and location", () => {
    const formData = buildCertSignFormData(
      params({
        signMode: "AUTO",
        showSignature: false,
        name: "Jane Signer",
        reason: "Approval",
        location: "London",
      }),
      pdf(),
    );

    expect(formData.get("name")).toBe("Jane Signer");
    expect(formData.get("reason")).toBe("Approval");
    expect(formData.get("location")).toBe("London");
    expect(formData.get("showSignature")).toBeNull();
    expect(formData.get("pageNumber")).toBeNull();
    expect(formData.get("showLogo")).toBeNull();
  });

  test("blank details are omitted", () => {
    const formData = buildCertSignFormData(params({ signMode: "AUTO" }), pdf());

    expect(formData.get("name")).toBeNull();
    expect(formData.get("reason")).toBeNull();
    expect(formData.get("location")).toBeNull();
  });
});

describe("certSignFromApiParams - sign mode", () => {
  test.each([
    ["SERVER", "AUTO"],
    ["WINDOWS_STORE", "DEVICE"],
    ["MACOS_KEYCHAIN", "DEVICE"],
    ["PKCS11", "DEVICE"],
    ["PKCS12", "MANUAL"],
    ["PEM", "MANUAL"],
  ] as const)("%s restores as %s", (certType, signMode) => {
    expect(certSignFromApiParams({ certType }).signMode).toBe(signMode);
  });
});
