import { describe, expect, test } from "vitest";
import {
  buildCertSignFormData,
  certSignFromApiParams,
  certSignToApiParams,
} from "@app/hooks/tools/certSign/useCertSignOperation";
import {
  CertSignParameters,
  defaultParameters,
} from "@app/hooks/tools/certSign/useCertSignParameters";

const pdf = () =>
  new File(["%PDF-1.4"], "doc.pdf", { type: "application/pdf" });

const params = (
  overrides: Partial<CertSignParameters>,
): CertSignParameters => ({
  ...defaultParameters,
  ...overrides,
});

describe("certSignToApiParams - visible signature placement", () => {
  test("legacy page-only path omits signatureRect* fields", () => {
    const api = certSignToApiParams(
      params({
        signMode: "AUTO",
        showSignature: true,
        pageNumber: 3,
        certAppearanceRect: null,
      }),
    );

    expect(api.showSignature).toBe(true);
    expect(api.pageNumber).toBe(3);
    expect(api.signatureRectX).toBeUndefined();
    expect(api.signatureRectY).toBeUndefined();
    expect(api.signatureRectWidth).toBeUndefined();
    expect(api.signatureRectHeight).toBeUndefined();
  });

  test("placed rect sends all four signatureRect* and derived pageNumber", () => {
    const api = certSignToApiParams(
      params({
        signMode: "AUTO",
        showSignature: true,
        pageNumber: 1,
        certAppearanceRect: {
          pageIndex: 2,
          x: 0.1,
          y: 0.2,
          width: 0.3,
          height: 0.05,
        },
      }),
    );

    expect(api.pageNumber).toBe(3);
    expect(api.signatureRectX).toBe(0.1);
    expect(api.signatureRectY).toBe(0.2);
    expect(api.signatureRectWidth).toBe(0.3);
    expect(api.signatureRectHeight).toBe(0.05);
  });

  test("form data includes signatureRect* when placed", () => {
    const formData = buildCertSignFormData(
      params({
        signMode: "AUTO",
        showSignature: true,
        certAppearanceRect: {
          pageIndex: 0,
          x: 0.25,
          y: 0.4,
          width: 0.2,
          height: 0.08,
        },
      }),
      pdf(),
    );

    expect(formData.get("signatureRectX")).toBe("0.25");
    expect(formData.get("signatureRectY")).toBe("0.4");
    expect(formData.get("signatureRectWidth")).toBe("0.2");
    expect(formData.get("signatureRectHeight")).toBe("0.08");
    expect(formData.get("pageNumber")).toBe("1");
  });

  test("fromApiParams restores certAppearanceRect when all four fields present", () => {
    const restored = certSignFromApiParams({
      certType: "SERVER",
      showSignature: true,
      pageNumber: 4,
      signatureRectX: 0.1,
      signatureRectY: 0.2,
      signatureRectWidth: 0.3,
      signatureRectHeight: 0.1,
    });

    expect(restored.certAppearanceRect).toEqual({
      pageIndex: 3,
      x: 0.1,
      y: 0.2,
      width: 0.3,
      height: 0.1,
    });
  });
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
