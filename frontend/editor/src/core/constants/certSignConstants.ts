/**
 * Certificate fields the visible signature can display.
 *
 * The identifiers must match the backend's CertificateAttribute enum exactly - they
 * travel over the wire as-is.
 */
export const CERTIFICATE_ATTRIBUTES = [
  "SUBJECT_COMMON_NAME",
  "SUBJECT_ORGANISATION",
  "SUBJECT_ORGANISATIONAL_UNIT",
  "SUBJECT_COUNTRY",
  "SUBJECT_EMAIL",
  "ISSUER_COMMON_NAME",
  "ISSUER_ORGANISATION",
  "SERIAL_NUMBER",
  "VALID_FROM",
  "VALID_UNTIL",
  "SIGNATURE_ALGORITHM",
  "SIGNING_TIME",
  "REASON",
  "LOCATION",
] as const;

export type CertificateAttribute = (typeof CERTIFICATE_ATTRIBUTES)[number];

/** Translation keys for each field's checkbox label. */
export const CERTIFICATE_ATTRIBUTE_LABEL_KEYS: Record<
  CertificateAttribute,
  string
> = {
  SUBJECT_COMMON_NAME: "certSign.attributes.subjectCommonName",
  SUBJECT_ORGANISATION: "certSign.attributes.subjectOrganisation",
  SUBJECT_ORGANISATIONAL_UNIT: "certSign.attributes.subjectOrganisationalUnit",
  SUBJECT_COUNTRY: "certSign.attributes.subjectCountry",
  SUBJECT_EMAIL: "certSign.attributes.subjectEmail",
  ISSUER_COMMON_NAME: "certSign.attributes.issuerCommonName",
  ISSUER_ORGANISATION: "certSign.attributes.issuerOrganisation",
  SERIAL_NUMBER: "certSign.attributes.serialNumber",
  VALID_FROM: "certSign.attributes.validFrom",
  VALID_UNTIL: "certSign.attributes.validUntil",
  SIGNATURE_ALGORITHM: "certSign.attributes.signatureAlgorithm",
  SIGNING_TIME: "certSign.attributes.signingTime",
  REASON: "certSign.attributes.reason",
  LOCATION: "certSign.attributes.location",
};

/**
 * Fields ticked when the user first opens the field picker. Mirrors what the backend
 * draws by default, so ticking nothing and ticking these produce the same signature.
 */
export const DEFAULT_VISIBLE_ATTRIBUTES: CertificateAttribute[] = [
  "SUBJECT_COMMON_NAME",
  "SIGNING_TIME",
  "REASON",
];

/** Size of the box created when the user first enables placement, in PDF points. */
export const DEFAULT_SIGNATURE_BOX = { width: 200, height: 60 } as const;

/**
 * Where the logo can sit inside the signature box.
 *
 * The identifiers must match the backend's SignatureLogoPosition enum exactly - they
 * travel over the wire as-is.
 */
export const SIGNATURE_LOGO_POSITIONS = [
  "LEFT",
  "RIGHT",
  "TOP",
  "BOTTOM",
  "BEHIND",
] as const;

export type SignatureLogoPosition = (typeof SIGNATURE_LOGO_POSITIONS)[number];

/** Matches the backend default, so not choosing and choosing LEFT look the same. */
export const DEFAULT_SIGNATURE_LOGO_POSITION: SignatureLogoPosition = "LEFT";

/** English shown until a locale supplies its own wording. */
export const LOGO_POSITION_FALLBACKS: Record<SignatureLogoPosition, string> = {
  LEFT: "Left of the text",
  RIGHT: "Right of the text",
  TOP: "Above the text",
  BOTTOM: "Below the text",
  BEHIND: "Behind the text (watermark)",
};
