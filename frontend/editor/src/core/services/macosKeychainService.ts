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
