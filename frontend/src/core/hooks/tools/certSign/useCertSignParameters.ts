import { BaseParameters } from "@app/types/parameters";
import {
  useBaseParameters,
  BaseParametersHook,
} from "@app/hooks/tools/shared/useBaseParameters";

/** Visible certificate widget position in page fractions (0–1), top-left origin; pageIndex is 0-based. */
export interface CertAppearanceRect {
  pageIndex: number;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface CertSignParameters extends BaseParameters {
  // Sign mode selection
  signMode: "MANUAL" | "AUTO";
  // Certificate signing options (only for manual mode)
  certType: "" | "PEM" | "PKCS12" | "PFX" | "JKS";
  privateKeyFile?: File;
  certFile?: File;
  p12File?: File;
  jksFile?: File;
  password: string;

  // Signature appearance options
  showSignature: boolean;
  reason: string;
  location: string;
  name: string;
  pageNumber: number;
  showLogo: boolean;
  /** When set with showSignature, sent as signatureRect* fields for custom size/placement. */
  certAppearanceRect: CertAppearanceRect | null;
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
  certAppearanceRect: null,
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
        default:
          return false;
      }
    },
  });
};
