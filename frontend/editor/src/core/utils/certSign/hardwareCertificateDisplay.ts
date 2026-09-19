import { HardwareCertificateInfo } from "@app/services/hardwareSigningService";

const GUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** A GUID-only name (e.g. Microsoft device certs) is unreadable; prefer a real name. */
export const isGuidish = (s?: string | null): boolean =>
  !s || GUID.test(s.trim());

/** Best human-readable name: the Windows friendly name (alias) beats a GUID subject CN. */
export const displayName = (cert: HardwareCertificateInfo): string => {
  if (cert.subjectCommonName && !isGuidish(cert.subjectCommonName)) {
    return cert.subjectCommonName;
  }
  if (cert.alias && !isGuidish(cert.alias)) {
    return cert.alias;
  }
  return cert.subjectCommonName || cert.alias;
};

/** Expired and not-yet-valid certificates cannot produce a valid signature. */
export const isUsable = (cert: HardwareCertificateInfo): boolean =>
  !cert.expired && !cert.notYetValid;

/** Rank: usable and readable first, system/GUID certs next, unusable ones last. */
export const rank = (cert: HardwareCertificateInfo): number => {
  if (!isUsable(cert)) return 3;
  if (isGuidish(cert.subjectCommonName) && isGuidish(cert.alias)) return 2;
  return 0;
};

/** The order certificates are offered in: most likely to be wanted at the top. */
export const byUsefulness = (
  a: HardwareCertificateInfo,
  b: HardwareCertificateInfo,
): number => rank(a) - rank(b) || displayName(a).localeCompare(displayName(b));

/**
 * The issuer, when it says something the name does not.
 *
 * <p>A self-signed certificate names the same party twice, and "X · X" reads as a defect
 * rather than as information.
 */
export const distinctIssuer = (
  cert: HardwareCertificateInfo,
): string | null => {
  const name = displayName(cert);
  if (
    !cert.issuerCommonName ||
    cert.issuerCommonName === cert.subjectCommonName ||
    cert.issuerCommonName === name
  ) {
    return null;
  }
  return cert.issuerCommonName;
};

/** Validity as a date alone; the time of day is noise at this scale. */
export const expiryDate = (cert: HardwareCertificateInfo): string =>
  cert.notAfter ? cert.notAfter.slice(0, 10) : "";

/** Which of the three validity states a certificate is in. */
export type CertificateValidity = "valid" | "expired" | "notYetValid";

export const validityOf = (
  cert: HardwareCertificateInfo,
): CertificateValidity => {
  if (cert.expired) return "expired";
  if (cert.notYetValid) return "notYetValid";
  return "valid";
};

/** Free-text match over the fields a person would search by. */
export const matches = (
  cert: HardwareCertificateInfo,
  query: string,
): boolean => {
  const needle = query.trim().toLowerCase();
  if (!needle) return true;
  return [
    displayName(cert),
    cert.subject,
    cert.issuer,
    cert.issuerCommonName,
    cert.serialNumber,
  ]
    .filter(Boolean)
    .some((field) => field.toLowerCase().includes(needle));
};
