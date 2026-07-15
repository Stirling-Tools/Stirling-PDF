export interface MacosSigningIdentity {
  alias: string;
  source: "MACOS_KEYCHAIN";
  subject: string;
  issuer: string;
  subjectCommonName: string;
  issuerCommonName: string;
  serialNumber: string;
  keyAlgorithm: string;
  notBefore: string;
  notAfter: string;
  expired: boolean;
  notYetValid: boolean;
}

export type ChooseMacosSigningIdentityResult =
  | { status: "selected"; identity: MacosSigningIdentity }
  | { status: "cancelled" }
  | { status: "error"; message: string };

/** SHA-256 hex of cert DER — only identity handle Cert Sign accepts for macOS Keychain. */
export function isSha256IdentityHash(value: string | undefined | null): boolean {
  return typeof value === "string" && /^[0-9A-Fa-f]{64}$/.test(value.replace(/\s/g, ""));
}

export function isMacosKeychainAvailable(): boolean {
  return false;
}

export async function chooseMacosSigningIdentity(): Promise<ChooseMacosSigningIdentityResult> {
  return {
    status: "error",
    message:
      "macOS Keychain signing is only available in the Stirling PDF macOS app",
  };
}
