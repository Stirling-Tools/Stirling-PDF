import apiClient from "@editor/services/apiClient";

/** A signing certificate held on a hardware source (Windows store or PKCS#11 token). */
export interface HardwareCertificateInfo {
  alias: string;
  source: "WINDOWS_STORE" | "PKCS11";
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

export interface Pkcs11LibraryInfo {
  name: string;
  path: string;
}

export interface HardwareSigningCapabilities {
  desktop: boolean;
  osName: string;
  windowsStoreSupported: boolean;
  pkcs11Supported: boolean;
  detectedLibraries: Pkcs11LibraryInfo[];
}

const BASE = "/api/v1/security/cert-sign/hardware";

/**
 * The backend lists these routes under the certificate-signing endpoint. Without
 * the key, desktop routing looks up `cert-sign/hardware/<action>`, finds no such
 * local endpoint and asks for an account instead of using the bundled backend.
 */
const CERT_SIGN_ENDPOINT = { endpointName: "cert-sign" };

export async function getHardwareSigningCapabilities(): Promise<HardwareSigningCapabilities> {
  const response = await apiClient.get<HardwareSigningCapabilities>(
    `${BASE}/capabilities`,
    CERT_SIGN_ENDPOINT,
  );
  return response.data;
}

export async function listWindowsCertificates(): Promise<
  HardwareCertificateInfo[]
> {
  const response = await apiClient.get<HardwareCertificateInfo[]>(
    `${BASE}/windows-certificates`,
    CERT_SIGN_ENDPOINT,
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
    CERT_SIGN_ENDPOINT,
  );
  return response.data;
}
