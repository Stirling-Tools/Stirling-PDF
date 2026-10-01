import apiClient from "@app/services/apiClient";

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

export async function getHardwareSigningCapabilities(): Promise<HardwareSigningCapabilities> {
  const response = await apiClient.get<HardwareSigningCapabilities>(
    `${BASE}/capabilities`,
  );
  return response.data;
}

export async function listWindowsCertificates(): Promise<
  HardwareCertificateInfo[]
> {
  const response = await apiClient.get<HardwareCertificateInfo[]>(
    `${BASE}/windows-certificates`,
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
  );
  return response.data;
}
