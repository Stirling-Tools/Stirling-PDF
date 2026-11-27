import { describe, expect, test } from "vitest";
import {
  buildCertSignFormData,
  certSignFromApiParams,
  certSignToApiParams,
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

describe("buildCertSignFormData - stamp placement", () => {
  const box = { x: 120.5, y: 300, width: 220, height: 60 };

  test("a chosen signature field is sent instead of a page or box", () => {
    const formData = buildCertSignFormData(
      params({
        signMode: "AUTO",
        showSignature: true,
        pageNumber: 3,
        fieldName: "Approver",
        stampBox: box,
      }),
      pdf(),
    );

    expect(formData.get("fieldName")).toBe("Approver");
    expect(formData.get("pageNumber")).toBeNull();
    expect(formData.get("x")).toBeNull();
    expect(formData.get("width")).toBeNull();
  });

  test("a placed box is sent with the page it sits on", () => {
    const formData = buildCertSignFormData(
      params({
        signMode: "AUTO",
        showSignature: true,
        pageNumber: 2,
        stampBox: box,
      }),
      pdf(),
    );

    expect(formData.get("pageNumber")).toBe("2");
    expect(formData.get("x")).toBe("120.5");
    expect(formData.get("y")).toBe("300");
    expect(formData.get("width")).toBe("220");
    expect(formData.get("height")).toBe("60");
    expect(formData.get("fieldName")).toBeNull();
  });

  test("with nothing placed only the page is sent, so the server uses its default corner", () => {
    const formData = buildCertSignFormData(
      params({ signMode: "AUTO", showSignature: true, pageNumber: 4 }),
      pdf(),
    );

    expect(formData.get("showSignature")).toBe("true");
    expect(formData.get("pageNumber")).toBe("4");
    expect(formData.get("x")).toBeNull();
    expect(formData.get("fieldName")).toBeNull();
  });

  test("an invisible signature sends no placement", () => {
    const formData = buildCertSignFormData(
      params({
        signMode: "AUTO",
        showSignature: false,
        fieldName: "Approver",
        stampBox: box,
      }),
      pdf(),
    );

    expect(formData.get("fieldName")).toBeNull();
    expect(formData.get("x")).toBeNull();
  });

  test("a visible signature is written in the signer's language and time zone", () => {
    const formData = buildCertSignFormData(
      params({ signMode: "AUTO", showSignature: true }),
      pdf(),
    );

    expect(formData.get("dateLabel")).toBe("Date:");
    expect(formData.get("locationLabel")).toBe("Location:");
    expect(formData.get("timeZone")).toBe(
      Intl.DateTimeFormat().resolvedOptions().timeZone,
    );
    expect(formData.get("signedByLabel")).toContain("{name}");
  });

  test("an invisible signature sends no stamp language", () => {
    const formData = buildCertSignFormData(
      params({ signMode: "AUTO", showSignature: false }),
      pdf(),
    );

    expect(formData.get("timeZone")).toBeNull();
    expect(formData.get("signedByLabel")).toBeNull();
  });

  test("a saved step does not pin the author's language", () => {
    const api = certSignToApiParams(
      params({ signMode: "AUTO", showSignature: true }),
    );

    expect(api.timeZone).toBeUndefined();
    expect(api.signedByLabel).toBeUndefined();
  });

  test("placement round-trips through the request model", () => {
    const placed = params({
      signMode: "AUTO",
      showSignature: true,
      pageNumber: 2,
      stampBox: box,
    });
    expect(certSignFromApiParams(certSignToApiParams(placed))).toMatchObject({
      pageNumber: 2,
      stampBox: box,
    });

    const inField = params({
      signMode: "AUTO",
      showSignature: true,
      fieldName: "Approver",
    });
    const restored = certSignFromApiParams(certSignToApiParams(inField));
    expect(restored.fieldName).toBe("Approver");
    expect(restored.stampBox).toBeUndefined();
  });

  test("sends the graphic choice and watermark for a visible signature", () => {
    const formData = buildCertSignFormData(
      params({
        signMode: "AUTO",
        showSignature: true,
        stampGraphic: "NONE",
        showWatermark: true,
      }),
      pdf(),
    );
    expect(formData.get("stampGraphic")).toBe("NONE");
    expect(formData.get("showWatermark")).toBe("true");
    expect(formData.get("showLogo")).toBeNull();
  });

  test("a saved step with only showLogo still sets the watermark", () => {
    expect(
      certSignFromApiParams({ certType: "SERVER", showLogo: false })
        .showWatermark,
    ).toBe(false);
  });

  test("the signer's image is uploaded only for the image graphic", () => {
    const image = new File(["png"], "sig.png", { type: "image/png" });
    const withImage = buildCertSignFormData(
      params({
        signMode: "AUTO",
        showSignature: true,
        stampGraphic: "IMAGE",
        signatureImage: image,
      }),
      pdf(),
    );
    expect(withImage.get("signatureImage")).toBeInstanceOf(File);
    const named = buildCertSignFormData(
      params({
        signMode: "AUTO",
        showSignature: true,
        stampGraphic: "NAME",
        signatureImage: image,
      }),
      pdf(),
    );
    expect(named.get("signatureImage")).toBeNull();
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

describe("buildCertSignFormData - reviewed signer", () => {
  test("sends the reviewed fingerprint for the server and device sources", () => {
    const server = buildCertSignFormData(
      params({ signMode: "AUTO", expectedCertificateSha256: "ab12" }),
      pdf(),
    );
    expect(server.get("expectedCertificateSha256")).toBe("ab12");
    const upload = buildCertSignFormData(
      params({
        signMode: "MANUAL",
        certType: "PKCS12",
        expectedCertificateSha256: "ab12",
      }),
      pdf(),
    );
    expect(upload.get("expectedCertificateSha256")).toBeNull();
  });

  test("asks for the token only for a keychain ID that was on one", () => {
    const keychain = buildCertSignFormData(
      params({
        signMode: "DEVICE",
        certType: "MACOS_KEYCHAIN",
        alias: "abc",
        requireToken: true,
      }),
      pdf(),
    );
    expect(keychain.get("requireToken")).toBe("true");
    const windows = buildCertSignFormData(
      params({
        signMode: "DEVICE",
        certType: "WINDOWS_STORE",
        alias: "abc",
        requireToken: true,
      }),
      pdf(),
    );
    expect(windows.get("requireToken")).toBeNull();
  });

  test("a saved step never pins the reviewed certificate", () => {
    const api = certSignToApiParams(
      params({
        signMode: "AUTO",
        expectedCertificateSha256: "ab12",
        requireToken: true,
      }),
    );
    expect(api.expectedCertificateSha256).toBeUndefined();
    expect(api.requireToken).toBeUndefined();
  });
});
