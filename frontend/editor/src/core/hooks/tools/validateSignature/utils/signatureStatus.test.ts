import { describe, expect, test } from "vitest";
import type { TFunction } from "i18next";
import { computeSignatureStatus } from "@app/hooks/tools/validateSignature/utils/signatureStatus";
import type { SignatureValidationSignature } from "@app/types/validateSignature";

// t() stub: return the provided default string (2nd arg) so labels are stable.
const t = ((_key: string, def?: string) =>
  def ?? _key) as unknown as TFunction<"translation">;

const sig = (
  overrides: Partial<SignatureValidationSignature>,
): SignatureValidationSignature =>
  ({
    valid: true,
    chainValid: true,
    trustValid: true,
    notExpired: true,
    selfSigned: false,
    revocationStatus: "good",
    ...overrides,
  }) as SignatureValidationSignature;

describe("computeSignatureStatus - trust surfacing", () => {
  test("cryptographically valid AND trusted -> green Valid", () => {
    const status = computeSignatureStatus(sig({}), t);
    expect(status.kind).toBe("valid");
    expect(status.label).toBe("Valid");
  });

  test("valid crypto but self-signed -> yellow warning, not green", () => {
    const status = computeSignatureStatus(
      sig({ selfSigned: true, chainValid: false, trustValid: false }),
      t,
    );
    expect(status.kind).toBe("warning");
    expect(status.label).toBe("Valid, signer not verified");
    expect(status.details.join(" ")).toMatch(/self-signed/i);
  });

  test("self-signed BUT explicitly trusted (Stirling auto cert) -> green Valid", () => {
    const status = computeSignatureStatus(
      sig({ selfSigned: true, chainValid: true, trustValid: true }),
      t,
    );
    expect(status.kind).toBe("valid");
    expect(status.label).toBe("Valid");
  });

  test("valid crypto but untrusted chain (not self-signed) -> warning", () => {
    const status = computeSignatureStatus(
      sig({ chainValid: false, trustValid: false }),
      t,
    );
    expect(status.kind).toBe("warning");
    expect(status.details.join(" ")).toMatch(/not trusted/i);
  });

  test("expired cert downgrades a valid signature to warning", () => {
    const status = computeSignatureStatus(sig({ notExpired: false }), t);
    expect(status.kind).toBe("warning");
    expect(status.details.join(" ")).toMatch(/expired/i);
  });

  test("revoked cert downgrades to warning", () => {
    const status = computeSignatureStatus(
      sig({ revocationStatus: "revoked" }),
      t,
    );
    expect(status.kind).toBe("warning");
    expect(status.details.join(" ")).toMatch(/revoked/i);
  });

  test("content appended after signing -> warning", () => {
    const status = computeSignatureStatus(
      sig({ coversEntireDocument: false }),
      t,
    );
    expect(status.kind).toBe("warning");
    expect(status.details.join(" ")).toMatch(/modified after signing/i);
  });

  test("revocation not checked -> still valid but surfaced as a caveat", () => {
    const status = computeSignatureStatus(
      sig({ revocationStatus: "not-checked" }),
      t,
    );
    expect(status.kind).toBe("valid");
    expect(status.details.join(" ")).toMatch(/revocation was not checked/i);
  });

  test("cryptographic failure -> red Invalid regardless of trust", () => {
    const status = computeSignatureStatus(sig({ valid: false }), t);
    expect(status.kind).toBe("invalid");
    expect(status.label).toBe("Invalid");
  });

  test("backend error message -> Invalid", () => {
    const status = computeSignatureStatus(
      sig({ errorMessage: "boom" } as Partial<SignatureValidationSignature>),
      t,
    );
    expect(status.kind).toBe("invalid");
    expect(status.details).toContain("boom");
  });
});
