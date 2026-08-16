import { useTranslation } from "react-i18next";
import {
  useToolOperation,
  defineSingleFileTool,
} from "@app/hooks/tools/shared/useToolOperation";
import {
  objectToFormData,
  type FormDataFiles,
  type ToolApiParams,
  type ToolEndpoint,
} from "@app/hooks/tools/shared/toolApiMapping";
import { createStandardErrorHandler } from "@app/utils/toolErrorHandler";
import { DEVICE_LOCAL_REQUEST } from "@app/constants/deviceLocalEndpoints";
import {
  validateCertSignParameters,
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

    // Sent only when the logo is on: a position with the logo hidden means nothing,
    // and omitting it keeps the request as it was before the option existed.
    if (parameters.showLogo) {
      apiParams.logoPosition = parameters.logoPosition;
    }

    // Only sent when the user actually placed a box. Omitting these keeps the
    // backend's original placement, so the tool still works without drawing one.
    const area = parameters.signatureArea;
    if (area) {
      apiParams.signatureX = area.x;
      apiParams.signatureY = area.y;
      apiParams.signatureWidth = area.width;
      apiParams.signatureHeight = area.height;
    }
    if (parameters.visibleAttributes.length > 0) {
      apiParams.visibleAttributes = parameters.visibleAttributes;
    }
    // Only meaningful alongside a box: without one there is no shape to repeat.
    if (parameters.markAllPages && area) {
      apiParams.markAllPages = true;
    }
  }
  return apiParams;
};

// Select the keystore File uploads for the chosen certificate type. AUTO mode
// (server certificate) uploads no keystore.
const certSignFiles = (parameters: CertSignParameters): FormDataFiles => {
  // The logo has nothing to do with where the certificate comes from, so it rides
  // along in every mode, server certificate included.
  const logo: FormDataFiles =
    parameters.showSignature && parameters.showLogo && parameters.logoImage
      ? { logoImage: parameters.logoImage }
      : {};

  if (parameters.signMode === "AUTO") return logo;

  switch (parameters.certType) {
    case "PEM":
      return {
        ...logo,
        privateKeyFile: parameters.privateKeyFile,
        certFile: parameters.certFile,
      };
    case "PKCS12":
    case "PFX":
      return { ...logo, p12File: parameters.p12File };
    case "JKS":
      return { ...logo, jksFile: parameters.jksFile };
    default:
      return logo;
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
  if (apiParams.logoPosition !== undefined) {
    result.logoPosition = apiParams.logoPosition;
  }

  // A stored step only carries a box if all four values are present; a partial one
  // would silently reposition the signature somewhere the author never chose.
  if (
    apiParams.signatureX !== undefined &&
    apiParams.signatureY !== undefined &&
    apiParams.signatureWidth !== undefined &&
    apiParams.signatureHeight !== undefined
  ) {
    result.signatureArea = {
      x: apiParams.signatureX,
      y: apiParams.signatureY,
      width: apiParams.signatureWidth,
      height: apiParams.signatureHeight,
    };
  }
  if (apiParams.visibleAttributes !== undefined) {
    result.visibleAttributes = apiParams.visibleAttributes;
  }
  if (apiParams.markAllPages !== undefined) {
    result.markAllPages = apiParams.markAllPages;
  }

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

/**
 * Signing with a key held by this machine has to happen on this machine.
 *
 * The endpoint is the same either way, so the path cannot carry the distinction:
 * only the chosen certificate type says whether the key is an uploaded file
 * (which any backend can use) or lives in the Windows store or a plugged-in
 * token (which only the local one can reach). The desktop router honours the
 * mark; every other build ignores it, since there is nowhere else to run.
 */
const certSignRequestConfig = (parameters: CertSignParameters) =>
  parameters.certType === "WINDOWS_STORE" || parameters.certType === "PKCS11"
    ? DEVICE_LOCAL_REQUEST
    : {};

// Static configuration object
export const certSignOperationConfig = defineSingleFileTool({
  validateParams: validateCertSignParameters,
  buildFormData: buildCertSignFormData,
  toApiParams: certSignToApiParams,
  fromApiParams: certSignFromApiParams,
  operationType: "certSign",
  endpoint: ENDPOINT,
  requestConfig: certSignRequestConfig,
  defaultParameters,
});

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
