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

/**
 * The subject's other attributes, to tell apart certificates that share a name.
 *
 * <p>The backend sends the RFC 2253 form, in which Java writes an attribute it has no keyword
 * for as hex-encoded DER: `2.5.4.97=#0c0f...`, the organization identifier on Spanish
 * representative certificates. Those are decoded. The common name is left out, since it is
 * already the row's title.
 */
export const subjectDetails = (cert: HardwareCertificateInfo): string =>
  distinguishedNameParts(cert.subject)
    .filter(({ type }) => type.toUpperCase() !== "CN")
    .map(({ value }) => value)
    .filter(Boolean)
    .join(" · ");

/** DER string tags a certificate name uses, and how their bytes decode. */
const DER_STRING_ENCODINGS: Record<number, string> = {
  0x0c: "utf-8", // UTF8String
  0x13: "latin1", // PrintableString
  0x14: "latin1", // TeletexString
  0x16: "latin1", // IA5String
  0x1e: "utf-16be", // BMPString
};

function distinguishedNameParts(
  dn: string,
): Array<{ type: string; value: string }> {
  const parts: string[] = [];
  let current = "";
  for (let i = 0; i < dn.length; i++) {
    const ch = dn[i];
    if (ch === "\\" && i + 1 < dn.length) {
      current += ch + dn[++i];
    } else if (ch === "," || ch === "+") {
      parts.push(current);
      current = "";
    } else {
      current += ch;
    }
  }
  parts.push(current);
  return parts.flatMap((part) => {
    const equals = part.indexOf("=");
    if (equals <= 0) return [];
    const raw = part.slice(equals + 1).trim();
    const value = raw.startsWith("#")
      ? (decodeDerString(raw.slice(1)) ?? raw)
      : raw.replace(/\\(.)/g, "$1");
    return [{ type: part.slice(0, equals).trim(), value }];
  });
}

function decodeDerString(hex: string): string | null {
  const pairs = hex.match(/^(?:[0-9a-f]{2})+$/i) ? hex.match(/../g) : null;
  if (!pairs || pairs.length < 2) return null;
  const bytes = Uint8Array.from(pairs, (pair) => parseInt(pair, 16));
  const encoding = DER_STRING_ENCODINGS[bytes[0]];
  if (!encoding) return null;
  let length = bytes[1];
  let offset = 2;
  if (length & 0x80) {
    const lengthBytes = length & 0x7f;
    length = 0;
    for (let i = 0; i < lengthBytes; i++) length = length * 256 + bytes[2 + i];
    offset += lengthBytes;
  }
  if (offset + length !== bytes.length) return null;
  return new TextDecoder(encoding).decode(bytes.subarray(offset));
}

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
