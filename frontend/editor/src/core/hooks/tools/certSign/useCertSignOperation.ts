import { useTranslation } from "react-i18next";
import {
  ToolType,
  useToolOperation,
} from "@app/hooks/tools/shared/useToolOperation";
import {
  objectToFormData,
  type FormDataFiles,
  type ToolApiParams,
  type ToolEndpoint,
} from "@app/hooks/tools/shared/toolApiMapping";
import { createStandardErrorHandler } from "@app/utils/toolErrorHandler";
import {
  CertSignParameters,
  defaultParameters,
} from "@app/hooks/tools/certSign/useCertSignParameters";

const ENDPOINT = "/api/v1/security/cert-sign" satisfies ToolEndpoint;
type CertSignApiParams = ToolApiParams[typeof ENDPOINT];

// Convert the tool's UI parameters into the cert-sign request body. The keystore
// uploads (privateKeyFile, certFile, p12File, jksFile) are actual File uploads
// and are appended separately (see buildCertSignFormData); only the scalar
// fields are serialized here.
export const certSignToApiParams = (
  parameters: CertSignParameters,
): CertSignApiParams => {
  // AUTO mode signs with the server certificate; no keystore/password is sent.
  if (parameters.signMode === "AUTO") {
    return withSignatureAppearance({ certType: "SERVER" }, parameters);
  }

  const apiParams: CertSignApiParams = {
    certType: parameters.certType as CertSignApiParams["certType"],
    password: parameters.password,
  };

  // Non-file identifiers depend on the chosen certificate type.
  switch (parameters.certType) {
    case "WINDOWS_STORE":
      if (parameters.alias) apiParams.alias = parameters.alias;
      break;
    case "PKCS11":
      if (parameters.pkcs11LibraryPath) {
        apiParams.pkcs11LibraryPath = parameters.pkcs11LibraryPath;
      }
      if (parameters.pkcs11Slot != null) {
        apiParams.pkcs11Slot = parameters.pkcs11Slot;
      }
      if (parameters.alias) apiParams.alias = parameters.alias;
      break;
  }

  return withSignatureAppearance(apiParams, parameters);
};

// Signature appearance fields are only sent when the visible signature is
// enabled, matching the original form behaviour.
const withSignatureAppearance = (
  apiParams: CertSignApiParams,
  parameters: CertSignParameters,
): CertSignApiParams => {
  if (parameters.showSignature) {
    apiParams.showSignature = true;
    apiParams.reason = parameters.reason;
    apiParams.location = parameters.location;
    apiParams.name = parameters.name;
    apiParams.pageNumber = parameters.pageNumber;
    apiParams.showLogo = parameters.showLogo;
  }
  return apiParams;
};

// Select the keystore File uploads for the chosen certificate type. AUTO mode
// (server certificate) uploads no keystore.
const certSignFiles = (parameters: CertSignParameters): FormDataFiles => {
  if (parameters.signMode === "AUTO") return {};

  switch (parameters.certType) {
    case "PEM":
      return {
        privateKeyFile: parameters.privateKeyFile,
        certFile: parameters.certFile,
      };
    case "PKCS12":
    case "PFX":
      return { p12File: parameters.p12File };
    case "JKS":
      return { jksFile: parameters.jksFile };
    default:
      return {};
  }
};

// Reconstruct the tool's UI parameters from a cert-sign request body, so a stored
// or AI-authored step can be re-rendered in the settings UI. Uploaded keystore
// files cannot be recovered from the request model.
export const certSignFromApiParams = (
  apiParams: CertSignApiParams,
): Partial<CertSignParameters> => {
  const result: Partial<CertSignParameters> = {
    signMode: apiParams.certType === "SERVER" ? "AUTO" : "MANUAL",
    showSignature: apiParams.showSignature ?? defaultParameters.showSignature,
  };

  if (apiParams.certType !== "SERVER") {
    result.certType = apiParams.certType;
    result.password = apiParams.password ?? defaultParameters.password;
  }
  if (apiParams.alias !== undefined) result.alias = apiParams.alias;
  if (apiParams.pkcs11LibraryPath !== undefined) {
    result.pkcs11LibraryPath = apiParams.pkcs11LibraryPath;
  }
  if (apiParams.pkcs11Slot !== undefined) {
    result.pkcs11Slot = apiParams.pkcs11Slot;
  }
  if (apiParams.reason !== undefined) result.reason = apiParams.reason;
  if (apiParams.location !== undefined) result.location = apiParams.location;
  if (apiParams.name !== undefined) result.name = apiParams.name;
  if (apiParams.pageNumber !== undefined) {
    result.pageNumber = apiParams.pageNumber;
  }
  if (apiParams.showLogo !== undefined) result.showLogo = apiParams.showLogo;

  return result;
};

// Build form data for signing
export const buildCertSignFormData = (
  parameters: CertSignParameters,
  file: File,
): FormData =>
  objectToFormData(certSignToApiParams(parameters), {
    fileInput: file,
    ...certSignFiles(parameters),
  });

// Static configuration object
export const certSignOperationConfig = {
  toolType: ToolType.singleFile,
  buildFormData: buildCertSignFormData,
  toApiParams: certSignToApiParams,
  fromApiParams: certSignFromApiParams,
  operationType: "certSign",
  endpoint: ENDPOINT,
  multiFileEndpoint: false,
  defaultParameters,
} as const;

export const useCertSignOperation = () => {
  const { t } = useTranslation();

  return useToolOperation<CertSignParameters>({
    ...certSignOperationConfig,
    getErrorMessage: createStandardErrorHandler(
      t(
        "certSign.error.failed",
        "An error occurred while processing signatures.",
      ),
    ),
  });
};
