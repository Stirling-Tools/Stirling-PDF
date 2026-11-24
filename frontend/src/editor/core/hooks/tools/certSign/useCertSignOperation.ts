import i18n, { type TFunction } from "i18next";
import { useTranslation } from "react-i18next";
import {
  useToolOperation,
  defineSingleFileTool,
} from "@editor/hooks/tools/shared/useToolOperation";
import {
  objectToFormData,
  type FormDataFiles,
  type ToolApiParams,
  type ToolEndpoint,
} from "@editor/hooks/tools/shared/toolApiMapping";
import { createStandardErrorHandler } from "@editor/utils/toolErrorHandler";
import type { StampLabels } from "@editor/services/signatureStampPreview";
import {
  validateCertSignParameters,
  CertSignParameters,
  defaultParameters,
} from "@editor/hooks/tools/certSign/useCertSignParameters";

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
    case "MACOS_KEYCHAIN":
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

// Name, reason and location go into the signature dictionary, so they are sent
// for invisible signatures too; placement and logo only affect the visible stamp.
const withSignatureAppearance = (
  apiParams: CertSignApiParams,
  parameters: CertSignParameters,
): CertSignApiParams => {
  if (parameters.reason) apiParams.reason = parameters.reason;
  if (parameters.location) apiParams.location = parameters.location;
  if (parameters.name) apiParams.name = parameters.name;
  if (parameters.showSignature) {
    apiParams.showSignature = true;
    apiParams.stampGraphic = parameters.stampGraphic;
    apiParams.showWatermark = parameters.showWatermark;
    if (parameters.fieldName) {
      apiParams.fieldName = parameters.fieldName;
    } else {
      apiParams.pageNumber = parameters.pageNumber;
      if (parameters.stampBox) {
        apiParams.x = parameters.stampBox.x;
        apiParams.y = parameters.stampBox.y;
        apiParams.width = parameters.stampBox.width;
        apiParams.height = parameters.stampBox.height;
      }
    }
  }
  return apiParams;
};

// Select the keystore File uploads for the chosen certificate type. AUTO mode
// (server certificate) uploads no keystore.
const certSignFiles = (parameters: CertSignParameters): FormDataFiles => ({
  ...keystoreFiles(parameters),
  ...(parameters.showSignature && parameters.stampGraphic === "IMAGE"
    ? { signatureImage: parameters.signatureImage }
    : {}),
});

const keystoreFiles = (parameters: CertSignParameters): FormDataFiles => {
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
  // An image graphic cannot be restored without its file, so it comes back as the name.
  if (apiParams.stampGraphic === "NONE") result.stampGraphic = "NONE";
  if (apiParams.showWatermark !== undefined) {
    result.showWatermark = apiParams.showWatermark;
  } else if (apiParams.showLogo !== undefined) {
    result.showWatermark = apiParams.showLogo;
  }
  if (apiParams.fieldName !== undefined) result.fieldName = apiParams.fieldName;
  if (
    apiParams.x !== undefined &&
    apiParams.y !== undefined &&
    apiParams.width !== undefined &&
    apiParams.height !== undefined
  ) {
    result.stampBox = {
      x: apiParams.x,
      y: apiParams.y,
      width: apiParams.width,
      height: apiParams.height,
    };
  }

  return result;
};

/** The stamp's labels in the UI language; the signed-by one keeps the {name} slot the server fills. */
export const stampLabels = (t: TFunction = i18n.t): StampLabels => ({
  signedByLabel: t("certSign.stamp.signedBy", "Digitally signed by {{name}}", {
    name: "{name}",
    interpolation: { escapeValue: false },
  }),
  dateLabel: t("certSign.stamp.date", "Date:"),
  reasonLabel: t("certSign.stamp.reason", "Reason:"),
  locationLabel: t("certSign.stamp.location", "Location:"),
});

// The stamp's words are fixed when signing, in the signer's language and time zone, so they
// are added here rather than stored with the step: a saved automation signs in whoever runs it.
const withStampLanguage = (
  apiParams: CertSignApiParams,
  parameters: CertSignParameters,
): CertSignApiParams =>
  parameters.showSignature
    ? {
        ...apiParams,
        timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        ...stampLabels(),
      }
    : apiParams;

export const buildCertSignFormData = (
  parameters: CertSignParameters,
  file: File,
): FormData =>
  objectToFormData(
    withStampLanguage(certSignToApiParams(parameters), parameters),
    {
      fileInput: file,
      ...certSignFiles(parameters),
    },
  );

// Static configuration object
export const certSignOperationConfig = defineSingleFileTool({
  validateParams: validateCertSignParameters,
  buildFormData: buildCertSignFormData,
  toApiParams: certSignToApiParams,
  fromApiParams: certSignFromApiParams,
  operationType: "certSign",
  endpoint: ENDPOINT,
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
