import { describe, expect, it } from "vitest";
import { PdfPermissionFlag } from "@embedpdf/models";
import { buildPdfAccessFromSnapshot } from "@app/services/pdfPasswordStore";
import type { PdfPermissionSnapshot } from "@app/services/pdfPermissionProbe";

function snapshot(
  overrides: Partial<PdfPermissionSnapshot> = {},
): PdfPermissionSnapshot {
  return {
    encrypted: true,
    requiresOpeningPassword: false,
    permissions: 0,
    ownerAuthenticated: false,
    pageCount: 1,
    signed: false,
    ...overrides,
  };
}

const ALL_FLAGS = [
  "canModify",
  "canAssemble",
  "canExtract",
  "canPrint",
  "canPrintFaithful",
] as const;

describe("buildPdfAccessFromSnapshot", () => {
  it("grants every permission for unencrypted files", () => {
    const access = buildPdfAccessFromSnapshot(
      snapshot({ encrypted: false, permissions: 0 }),
    );
    for (const flag of ALL_FLAGS) expect(access[flag]).toBe(true);
    expect(access.encrypted).toBe(false);
    expect(access.password).toBe("");
    expect(access.requiresOpeningPassword).toBe(false);
    expect(access.openingAuthenticated).toBe(true);
  });

  it("maps permission bits for restricted documents", () => {
    const access = buildPdfAccessFromSnapshot(
      snapshot({
        permissions: PdfPermissionFlag.Print | PdfPermissionFlag.CopyContents,
      }),
    );
    expect(access.canPrint).toBe(true);
    expect(access.canExtract).toBe(true);
    expect(access.canPrintFaithful).toBe(false);
    expect(access.canModify).toBe(false);
    expect(access.canAssemble).toBe(false);
  });

  it("grants every permission to owner-authenticated sessions", () => {
    const access = buildPdfAccessFromSnapshot(
      snapshot({ permissions: 0, ownerAuthenticated: true }),
    );
    for (const flag of ALL_FLAGS) expect(access[flag]).toBe(true);
    expect(access.ownerAuthenticated).toBe(true);
  });

  it("grants every permission when owner passwords are not honoured", () => {
    const access = buildPdfAccessFromSnapshot(
      snapshot({ permissions: 0 }),
      false,
    );
    for (const flag of ALL_FLAGS) expect(access[flag]).toBe(true);
    expect(access.honorOwnerPasswords).toBe(false);
  });

  it("leaves server-only protection metadata undefined", () => {
    const access = buildPdfAccessFromSnapshot(snapshot());
    expect(access.encryptionKeyLength).toBeUndefined();
    expect(access.encryptionRevision).toBeUndefined();
    expect(access.credentialFingerprint).toBeUndefined();
  });
});
