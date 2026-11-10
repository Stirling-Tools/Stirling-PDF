interface Tlv {
  tag: number;
  start: number;
  contentEnd: number;
  end: number;
}

export interface CmsSignatureFacts {
  signerName: string | null;
  digest: Uint8Array | null;
}

const OID_COMMON_NAME = "2.5.4.3";
const OID_MESSAGE_DIGEST = "1.2.840.113549.1.9.4";
const OID_TIMESTAMP_TOKEN_INFO = "1.2.840.113549.1.9.16.1.4";

function readTlv(
  bytes: Uint8Array,
  offset: number,
  limit = bytes.length,
  depth = 0,
): Tlv | null {
  if (offset + 2 > limit || depth > 32) return null;
  const tag = bytes[offset];
  let length = bytes[offset + 1];
  let start = offset + 2;
  if (length === 0x80) {
    let cursor = start;
    while (
      cursor + 2 <= limit &&
      !(bytes[cursor] === 0 && bytes[cursor + 1] === 0)
    ) {
      const child = readTlv(bytes, cursor, limit, depth + 1);
      if (!child) return null;
      cursor = child.end;
    }
    return cursor + 2 > limit
      ? null
      : { tag, start, contentEnd: cursor, end: cursor + 2 };
  }
  if (length & 0x80) {
    const count = length & 0x7f;
    if (count > 4 || start + count > limit) return null;
    length = 0;
    for (let i = 0; i < count; i++) length = length * 256 + bytes[start + i];
    start += count;
  }
  const end = start + length;
  return end > limit ? null : { tag, start, contentEnd: end, end };
}

function children(bytes: Uint8Array, parent: Tlv): Tlv[] {
  const out: Tlv[] = [];
  let offset = parent.start;
  while (offset < parent.contentEnd) {
    const child = readTlv(bytes, offset, parent.contentEnd);
    if (!child) break;
    out.push(child);
    offset = child.end;
  }
  return out;
}

function oid(bytes: Uint8Array, node: Tlv): string {
  const parts: number[] = [];
  let value = 0;
  for (let i = node.start; i < node.contentEnd; i++) {
    value = value * 128 + (bytes[i] & 0x7f);
    if (!(bytes[i] & 0x80)) {
      if (parts.length === 0)
        parts.push(
          value < 80 ? Math.floor(value / 40) : 2,
          value < 80 ? value % 40 : value - 80,
        );
      else parts.push(value);
      value = 0;
    }
  }
  return parts.join(".");
}

function sameBytes(bytes: Uint8Array, a: Tlv, b: Tlv): boolean {
  if (a.contentEnd - a.start !== b.contentEnd - b.start) return false;
  for (let i = 0; i < a.contentEnd - a.start; i++)
    if (bytes[a.start + i] !== bytes[b.start + i]) return false;
  return true;
}

function commonName(bytes: Uint8Array, name: Tlv): string | null {
  let found: string | null = null;
  for (const rdn of children(bytes, name))
    for (const attribute of children(bytes, rdn)) {
      const [type, value] = children(bytes, attribute);
      if (type?.tag === 0x06 && value && oid(bytes, type) === OID_COMMON_NAME)
        found = new TextDecoder().decode(
          bytes.subarray(value.start, value.contentEnd),
        );
    }
  return found;
}

function certificateSerialAndSubject(bytes: Uint8Array, certificate: Tlv) {
  const [tbs] = children(bytes, certificate);
  if (!tbs) return null;
  const fields = children(bytes, tbs);
  const offset = fields[0]?.tag === 0xa0 ? 1 : 0;
  const serial = fields[offset];
  const subject = fields[offset + 4];
  return serial && subject ? { serial, subject } : null;
}

function attributeValue(
  bytes: Uint8Array,
  attributes: Tlv,
  wanted: string,
): Tlv | null {
  for (const attribute of children(bytes, attributes)) {
    const [type, values] = children(bytes, attribute);
    if (type?.tag === 0x06 && values && oid(bytes, type) === wanted)
      return children(bytes, values)[0] ?? null;
  }
  return null;
}

function timestampImprint(
  bytes: Uint8Array,
  encapsulated: Tlv,
): Uint8Array | null {
  const [type, explicit] = children(bytes, encapsulated);
  if (!type || oid(bytes, type) !== OID_TIMESTAMP_TOKEN_INFO || !explicit)
    return null;
  const octets = children(bytes, explicit)[0];
  const info = octets && readTlv(bytes, octets.start, octets.contentEnd);
  const imprint = info && children(bytes, info)[2];
  const hashed = imprint && children(bytes, imprint)[1];
  return hashed?.tag === 0x04
    ? bytes.slice(hashed.start, hashed.contentEnd)
    : null;
}

export function readCmsSignatureFacts(contents: Uint8Array): CmsSignatureFacts {
  const none = { signerName: null, digest: null };
  const contentInfo = readTlv(contents, 0);
  const signedDataWrapper = contentInfo && children(contents, contentInfo)[1];
  const signedData =
    signedDataWrapper && children(contents, signedDataWrapper)[0];
  if (!signedData) return none;
  const fields = children(contents, signedData);
  const certificates = fields.find((f) => f.tag === 0xa0);
  const signerInfos = fields.filter((f) => f.tag === 0x31).at(-1);
  const signerInfo = signerInfos && children(contents, signerInfos)[0];
  if (!signerInfo) return none;
  const [, sid, , signedAttributes] = children(contents, signerInfo);
  const sidSerial = sid?.tag === 0x30 ? children(contents, sid)[1] : undefined;
  const certs = certificates
    ? children(contents, certificates).map((c) =>
        certificateSerialAndSubject(contents, c),
      )
    : [];
  const signerCert =
    certs.find(
      (c) => c && sidSerial && sameBytes(contents, c.serial, sidSerial),
    ) ?? certs[0];
  const imprint = fields[2] ? timestampImprint(contents, fields[2]) : null;
  const digestNode =
    signedAttributes?.tag === 0xa0
      ? attributeValue(contents, signedAttributes, OID_MESSAGE_DIGEST)
      : null;
  const digest =
    imprint ??
    (digestNode?.tag === 0x04
      ? contents.slice(digestNode.start, digestNode.contentEnd)
      : null);
  return {
    signerName: signerCert ? commonName(contents, signerCert.subject) : null,
    digest,
  };
}
