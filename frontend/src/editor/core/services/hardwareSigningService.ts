import apiClient from "@editor/services/apiClient";

/** A signing certificate: one held on a hardware source, or the server's own. */
export interface HardwareCertificateInfo {
  alias: string;
  source: "WINDOWS_STORE" | "MACOS_KEYCHAIN" | "PKCS11" | "SERVER";
  subject: string;
  displaySubject: string;
  issuer: string;
  subjectCommonName: string;
  issuerCommonName: string;
  serialNumber: string;
  keyAlgorithm: string;
  notBefore: string;
  notAfter: string;
  expired: boolean;
  notYetValid: boolean;
  /** True on a smart card or security key, false on this device, null when the source cannot tell. */
  onToken?: boolean | null;
  /** SHA-256 fingerprint, lowercase hex; sent back so signing refuses any other certificate. */
  sha256?: string;
}

export interface Pkcs11LibraryInfo {
  name: string;
  path: string;
}

export interface HardwareSigningCapabilities {
  desktop: boolean;
  osName: string;
  windowsStoreSupported: boolean;
  macKeychainSupported: boolean;
  pkcs11Supported: boolean;
  detectedLibraries: Pkcs11LibraryInfo[];
}

const BASE = "/api/v1/security/cert-sign/hardware";
// Routes discovery like signing itself: to the bundled backend that holds the keys. Callers
// show failures inline, so the global error toast would only repeat them.
const ROUTING = { endpointName: "cert-sign", suppressErrorToast: true };

export async function getHardwareSigningCapabilities(): Promise<HardwareSigningCapabilities> {
  const response = await apiClient.get<HardwareSigningCapabilities>(
    `${BASE}/capabilities`,
    ROUTING,
  );
  return response.data;
}

export async function listWindowsCertificates(): Promise<
  HardwareCertificateInfo[]
> {
  const response = await apiClient.get<HardwareCertificateInfo[]>(
    `${BASE}/windows-certificates`,
    ROUTING,
  );
  return response.data;
}

export async function listMacKeychainCertificates(): Promise<
  HardwareCertificateInfo[]
> {
  const response = await apiClient.get<HardwareCertificateInfo[]>(
    `${BASE}/macos-certificates`,
    ROUTING,
  );
  return response.data;
}

export async function listPkcs11Certificates(params: {
  libraryPath: string;
  slot?: number;
  pin: string;
}): Promise<HardwareCertificateInfo[]> {
  const response = await apiClient.post<HardwareCertificateInfo[]>(
    `${BASE}/pkcs11-certificates`,
    {
      libraryPath: params.libraryPath,
      slot: params.slot ?? null,
      pin: params.pin,
    },
    ROUTING,
  );
  return response.data;
}

/** The certificate server-side signing uses, or null when the server has none to offer. */
export async function getServerSigningCertificate(): Promise<HardwareCertificateInfo | null> {
  try {
    const response = await apiClient.get<HardwareCertificateInfo>(
      "/api/v1/security/cert-sign/server-certificate",
      ROUTING,
    );
    return response.data;
  } catch {
    return null;
  }
}
