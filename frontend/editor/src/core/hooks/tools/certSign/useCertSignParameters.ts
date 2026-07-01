import { BaseParameters } from "@app/types/parameters";
import {
  useBaseParameters,
  BaseParametersHook,
} from "@app/hooks/tools/shared/useBaseParameters";

export interface CertSignParameters extends BaseParameters {
  // Where the signing certificate comes from:
  //  MANUAL = upload a keystore file, AUTO = server certificate,
  //  DEVICE = a certificate held on this machine (Windows store or USB PKCS#11 token, desktop only).
  signMode: "MANUAL" | "AUTO" | "DEVICE";
  // For MANUAL this is the uploaded file format; for DEVICE it is the hardware kind
  // (WINDOWS_STORE or PKCS11). Hardware kinds are only offered in the desktop app.
  certType: "" | "PEM" | "PKCS12" | "PFX" | "JKS" | "WINDOWS_STORE" | "PKCS11";
  privateKeyFile?: File;
  certFile?: File;
  p12File?: File;
  jksFile?: File;
  password: string;

  // Hardware signing (desktop only)
  alias?: string;
  pkcs11LibraryPath?: string;
  pkcs11Slot?: number;

  // Signature appearance options
  showSignature: boolean;
  reason: string;
  location: string;
  name: string;
  pageNumber: number;
  showLogo: boolean;
}

export const defaultParameters: CertSignParameters = {
  signMode: "MANUAL",
  certType: "",
  password: "",
  showSignature: false,
  reason: "",
  location: "",
  name: "",
  pageNumber: 1,
  showLogo: true,
};

export type CertSignParametersHook = BaseParametersHook<CertSignParameters>;

export const useCertSignParameters = (): CertSignParametersHook => {
  return useBaseParameters({
    defaultParameters,
    endpointName: "cert-sign",
    validateFn: (params) => {
      // Auto mode (server certificate) - no additional validation needed
      if (params.signMode === "AUTO") {
        return true;
      }

      // Manual mode - requires certificate type and files
      if (!params.certType) {
        return false;
      }

      // Check for required files based on cert type
      switch (params.certType) {
        case "PEM":
          return !!(params.privateKeyFile && params.certFile);
        case "PKCS12":
        case "PFX":
          return !!params.p12File;
        case "JKS":
          return !!params.jksFile;
        case "WINDOWS_STORE":
          // Need a chosen certificate from the Windows store.
          return !!params.alias;
        case "PKCS11":
          // Need a driver library and a chosen certificate on the token.
          return !!(params.pkcs11LibraryPath && params.alias);
        default:
          return false;
      }
    },
  });
};
