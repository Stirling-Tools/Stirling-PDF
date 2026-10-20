/**
 * Byte-level PDF object access for the viewer's layer scanning.
 *
 * Deliberately narrow: cross-reference tables and streams, object streams,
 * FlateDecode, the standard security handler (R2-R6), and enough raw-span
 * access to splice a rewritten object back into the file. It is not a general
 * PDF library.
 *
 * AES paths use WebCrypto, which browsers expose only in secure contexts;
 * RC4-encrypted documents work without it.
 */

const WHITESPACE = new Set([0x00, 0x09, 0x0a, 0x0c, 0x0d, 0x20]);
const DELIMITERS = new Set([
  0x28, 0x29, 0x3c, 0x3e, 0x5b, 0x5d, 0x7b, 0x7d, 0x2f, 0x25,
]);

const latin1 = new TextDecoder("latin1");

function isWhitespace(byte: number): boolean {
  return WHITESPACE.has(byte);
}

function isDelimiter(byte: number): boolean {
  return DELIMITERS.has(byte);
}

function isRegular(byte: number): boolean {
  return !isWhitespace(byte) && !isDelimiter(byte);
}

export interface PdfRef {
  num: number;
  gen: number;
}

export type PdfValue =
  | { kind: "null" }
  | { kind: "bool"; value: boolean }
  | { kind: "number"; value: number }
  | { kind: "name"; name: string }
  /** `bytes` are the string's content bytes; `plain` marks already-decrypted content. */
  | {
      kind: "string";
      bytes: Uint8Array;
      plain: boolean;
      objNum: number;
      gen: number;
    }
  | { kind: "ref"; ref: PdfRef }
  | { kind: "array"; items: PdfValue[] }
  | { kind: "dict"; map: Map<string, PdfValue> }
  | {
      kind: "stream";
      dict: Map<string, PdfValue>;
      objNum: number;
      gen: number;
      start: number;
      end: number;
    };

export class PdfStructureError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PdfStructureError";
  }
}

interface XrefEntry {
  gen: number;
  /** Byte offset of the object, or the address of its entry in an object stream. */
  offset?: number;
  streamNum?: number;
  streamIndex?: number;
}

interface RawSpan {
  /** Buffer holding the object's raw syntax. */
  buffer: Uint8Array;
  start: number;
  end: number;
  inStream: boolean;
}

interface ParsedObject {
  value: PdfValue;
  span: RawSpan;
}

function skipSpace(bytes: Uint8Array, pos: number): number {
  let p = pos;
  while (p < bytes.length) {
    const byte = bytes[p];
    if (isWhitespace(byte)) {
      p += 1;
    } else if (byte === 0x25) {
      // '%' comment runs to the end of the line.
      while (p < bytes.length && bytes[p] !== 0x0a && bytes[p] !== 0x0d) p += 1;
    } else {
      break;
    }
  }
  return p;
}

function parseName(
  bytes: Uint8Array,
  pos: number,
): { name: string; end: number } {
  let p = pos + 1;
  const out: number[] = [];
  while (p < bytes.length && isRegular(bytes[p])) {
    if (bytes[p] === 0x23 && p + 2 < bytes.length) {
      const hi = hexDigit(bytes[p + 1]);
      const lo = hexDigit(bytes[p + 2]);
      if (hi >= 0 && lo >= 0) {
        out.push(hi * 16 + lo);
        p += 3;
        continue;
      }
    }
    out.push(bytes[p]);
    p += 1;
  }
  return { name: latin1.decode(Uint8Array.from(out)), end: p };
}

function hexDigit(byte: number): number {
  if (byte >= 0x30 && byte <= 0x39) return byte - 0x30;
  if (byte >= 0x41 && byte <= 0x46) return byte - 0x41 + 10;
  if (byte >= 0x61 && byte <= 0x66) return byte - 0x61 + 10;
  return -1;
}

function parseLiteralString(
  bytes: Uint8Array,
  pos: number,
): { content: Uint8Array; end: number } {
  let p = pos + 1;
  let depth = 1;
  const out: number[] = [];
  while (p < bytes.length) {
    const byte = bytes[p];
    if (byte === 0x5c) {
      // Backslash escape.
      p += 1;
      const esc = bytes[p];
      switch (esc) {
        case 0x6e:
          out.push(0x0a);
          p += 1;
          break;
        case 0x72:
          out.push(0x0d);
          p += 1;
          break;
        case 0x74:
          out.push(0x09);
          p += 1;
          break;
        case 0x62:
          out.push(0x08);
          p += 1;
          break;
        case 0x66:
          out.push(0x0c);
          p += 1;
          break;
        case 0x0a:
          p += 1;
          break;
        case 0x0d:
          p += 1;
          if (bytes[p] === 0x0a) p += 1;
          break;
        case 0x28:
        case 0x29:
        case 0x5c:
          out.push(esc);
          p += 1;
          break;
        default: {
          let value = 0;
          let digits = 0;
          while (digits < 3 && p < bytes.length) {
            const digit = bytes[p] - 0x30;
            if (digit < 0 || digit > 7) break;
            value = value * 8 + digit;
            digits += 1;
            p += 1;
          }
          if (digits > 0) {
            out.push(value & 0xff);
          } else {
            out.push(esc);
            p += 1;
          }
          break;
        }
      }
      continue;
    }
    if (byte === 0x28) {
      depth += 1;
      out.push(byte);
      p += 1;
      continue;
    }
    if (byte === 0x29) {
      depth -= 1;
      if (depth === 0) {
        p += 1;
        break;
      }
      out.push(byte);
      p += 1;
      continue;
    }
    out.push(byte);
    p += 1;
  }
  return { content: Uint8Array.from(out), end: p };
}

function parseHexString(
  bytes: Uint8Array,
  pos: number,
): { content: Uint8Array; end: number } {
  let p = pos + 1;
  const digits: number[] = [];
  while (p < bytes.length && bytes[p] !== 0x3e) {
    const digit = hexDigit(bytes[p]);
    if (digit >= 0) digits.push(digit);
    p += 1;
  }
  if (bytes[p] === 0x3e) p += 1;
  const out = new Uint8Array(Math.ceil(digits.length / 2));
  for (let i = 0; i < out.length; i++) {
    const hi = digits[i * 2];
    const lo = i * 2 + 1 < digits.length ? digits[i * 2 + 1] : 0;
    out[i] = hi * 16 + lo;
  }
  return { content: out, end: p };
}

function parseNumberToken(
  bytes: Uint8Array,
  pos: number,
): { value: number; end: number; isInteger: boolean } {
  let p = pos;
  let signed = false;
  if (bytes[p] === 0x2b || bytes[p] === 0x2d) {
    signed = true;
    p += 1;
  }
  let sawDigit = false;
  let sawDot = false;
  while (p < bytes.length) {
    const byte = bytes[p];
    if (byte >= 0x30 && byte <= 0x39) {
      sawDigit = true;
      p += 1;
    } else if (byte === 0x2e && !sawDot) {
      sawDot = true;
      p += 1;
    } else {
      break;
    }
  }
  if (!sawDigit) throw new PdfStructureError("malformed number");
  const text = latin1.decode(bytes.subarray(pos, p));
  return {
    value: Number(text),
    end: p,
    isInteger: !signed && !sawDot,
  };
}

interface ParseOptions {
  /** When set, `plain` strings carry the object identity the security handler needs. */
  decryptable?: { objNum: number; gen: number };
}

interface TokenPosition {
  value: PdfValue;
  end: number;
}

/**
 * Parses one value at `pos`. Strings are captured as raw content; decryption
 * happens lazily so the parser stays synchronous (WebCrypto AES is async).
 */
function parseValue(
  bytes: Uint8Array,
  pos: number,
  options: ParseOptions = {},
): TokenPosition {
  const p = skipSpace(bytes, pos);
  if (p >= bytes.length) throw new PdfStructureError("unexpected end of data");
  const byte = bytes[p];

  if (byte === 0x2f) {
    const { name, end } = parseName(bytes, p);
    return { value: { kind: "name", name }, end };
  }
  if (byte === 0x28) {
    const { content, end } = parseLiteralString(bytes, p);
    return {
      value: {
        kind: "string",
        bytes: content,
        plain: options.decryptable === undefined,
        objNum: options.decryptable?.objNum ?? 0,
        gen: options.decryptable?.gen ?? 0,
      },
      end,
    };
  }
  if (byte === 0x3c) {
    if (bytes[p + 1] === 0x3c) {
      return parseDict(bytes, p, options);
    }
    const { content, end } = parseHexString(bytes, p);
    return {
      value: {
        kind: "string",
        bytes: content,
        plain: options.decryptable === undefined,
        objNum: options.decryptable?.objNum ?? 0,
        gen: options.decryptable?.gen ?? 0,
      },
      end,
    };
  }
  if (byte === 0x5b) {
    const items: PdfValue[] = [];
    let q = p + 1;
    for (;;) {
      q = skipSpace(bytes, q);
      if (q >= bytes.length) throw new PdfStructureError("unterminated array");
      if (bytes[q] === 0x5d) {
        q += 1;
        break;
      }
      const next = parseValue(bytes, q, options);
      items.push(next.value);
      q = next.end;
    }
    return { value: { kind: "array", items }, end: q };
  }
  if (
    byte === 0x2b ||
    byte === 0x2d ||
    (byte >= 0x30 && byte <= 0x39) ||
    byte === 0x2e
  ) {
    const first = parseNumberToken(bytes, p);
    // "n g R" is a reference; only integer tokens can start one.
    if (first.isInteger) {
      const afterFirst = skipSpace(bytes, first.end);
      const secondByte = bytes[afterFirst];
      if (
        secondByte !== undefined &&
        secondByte >= 0x30 &&
        secondByte <= 0x39
      ) {
        const second = parseNumberToken(bytes, afterFirst);
        if (second.isInteger) {
          const afterSecond = skipSpace(bytes, second.end);
          if (bytes[afterSecond] === 0x52) {
            const end = afterSecond + 1;
            const boundary = bytes[end];
            if (boundary === undefined || !isRegular(boundary)) {
              return {
                value: {
                  kind: "ref",
                  ref: { num: first.value, gen: second.value },
                },
                end,
              };
            }
          }
        }
      }
    }
    return { value: { kind: "number", value: first.value }, end: first.end };
  }
  if (byte === 0x74 && latin1.decode(bytes.subarray(p, p + 4)) === "true") {
    return { value: { kind: "bool", value: true }, end: p + 4 };
  }
  if (byte === 0x66 && latin1.decode(bytes.subarray(p, p + 5)) === "false") {
    return { value: { kind: "bool", value: false }, end: p + 5 };
  }
  if (byte === 0x6e && latin1.decode(bytes.subarray(p, p + 4)) === "null") {
    return { value: { kind: "null" }, end: p + 4 };
  }
  throw new PdfStructureError(
    `unexpected token at ${p}: ${latin1.decode(bytes.subarray(p, p + 12))}`,
  );
}

function parseDict(
  bytes: Uint8Array,
  pos: number,
  options: ParseOptions,
): TokenPosition {
  const map = new Map<string, PdfValue>();
  let q = pos + 2;
  for (;;) {
    q = skipSpace(bytes, q);
    if (q >= bytes.length) throw new PdfStructureError("unterminated dict");
    if (bytes[q] === 0x3e && bytes[q + 1] === 0x3e) {
      q += 2;
      break;
    }
    if (bytes[q] !== 0x2f)
      throw new PdfStructureError("dict key is not a name");
    const key = parseName(bytes, q);
    const next = parseValue(bytes, key.end, options);
    map.set(key.name, next.value);
    q = next.end;
  }
  return { value: { kind: "dict", map }, end: q };
}

export function decodeStringText(bytes: Uint8Array): string {
  if (bytes.length >= 2 && bytes[0] === 0xfe && bytes[1] === 0xff) {
    let out = "";
    for (let i = 2; i + 1 < bytes.length; i += 2) {
      out += String.fromCharCode((bytes[i] << 8) | bytes[i + 1]);
    }
    return out;
  }
  return latin1.decode(bytes);
}

function rotateLeft(value: number, shift: number): number {
  return ((value << shift) | (value >>> (32 - shift))) >>> 0;
}

const MD5_SHIFTS = [
  7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 5, 9, 14, 20, 5,
  9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20, 4, 11, 16, 23, 4, 11, 16, 23, 4, 11,
  16, 23, 4, 11, 16, 23, 6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15,
  21,
];

const MD5_SINES = Array.from({ length: 64 }, (_, i) =>
  Math.floor(Math.abs(Math.sin(i + 1)) * 4294967296),
);

/** RFC 1321 MD5. WebCrypto has no MD5, and R2-R4 key derivation needs it. */
function md5(input: Uint8Array): Uint8Array {
  const message = new Uint8Array((((input.length + 8) >> 6) + 1) * 64);
  message.set(input);
  message[input.length] = 0x80;
  const bitLength = input.length * 8;
  const view = new DataView(message.buffer);
  view.setUint32(message.length - 8, bitLength >>> 0, true);
  view.setUint32(message.length - 4, Math.floor(bitLength / 4294967296), true);

  let a0 = 0x67452301;
  let b0 = 0xefcdab89;
  let c0 = 0x98badcfe;
  let d0 = 0x10325476;

  const m = new Uint32Array(16);
  for (let chunk = 0; chunk < message.length; chunk += 64) {
    for (let i = 0; i < 16; i++) m[i] = view.getUint32(chunk + i * 4, true);
    let a = a0;
    let b = b0;
    let c = c0;
    let d = d0;
    for (let i = 0; i < 64; i++) {
      let f: number;
      let g: number;
      if (i < 16) {
        f = (b & c) | (~b & d);
        g = i;
      } else if (i < 32) {
        f = (d & b) | (~d & c);
        g = (5 * i + 1) % 16;
      } else if (i < 48) {
        f = b ^ c ^ d;
        g = (3 * i + 5) % 16;
      } else {
        f = c ^ (b | ~d);
        g = (7 * i) % 16;
      }
      f = (f + a + MD5_SINES[i] + m[g]) >>> 0;
      a = d;
      d = c;
      c = b;
      b = (b + rotateLeft(f, MD5_SHIFTS[i])) >>> 0;
    }
    a0 = (a0 + a) >>> 0;
    b0 = (b0 + b) >>> 0;
    c0 = (c0 + c) >>> 0;
    d0 = (d0 + d) >>> 0;
  }

  const digest = new Uint8Array(16);
  const out = new DataView(digest.buffer);
  out.setUint32(0, a0, true);
  out.setUint32(4, b0, true);
  out.setUint32(8, c0, true);
  out.setUint32(12, d0, true);
  return digest;
}

/** RC4 (ARC4) keystream cipher; used by R2-R4 documents. */
function rc4(key: Uint8Array, data: Uint8Array): Uint8Array {
  const s = new Uint8Array(256);
  for (let i = 0; i < 256; i++) s[i] = i;
  let j = 0;
  for (let i = 0; i < 256; i++) {
    j = (j + s[i] + key[i % key.length]) & 0xff;
    const tmp = s[i];
    s[i] = s[j];
    s[j] = tmp;
  }
  const out = new Uint8Array(data.length);
  let i = 0;
  j = 0;
  for (let k = 0; k < data.length; k++) {
    i = (i + 1) & 0xff;
    j = (j + s[i]) & 0xff;
    const tmp = s[i];
    s[i] = s[j];
    s[j] = tmp;
    out[k] = data[k] ^ s[(s[i] + s[j]) & 0xff];
  }
  return out;
}

const AES_SBOX = new Uint8Array([
  0x63, 0x7c, 0x77, 0x7b, 0xf2, 0x6b, 0x6f, 0xc5, 0x30, 0x01, 0x67, 0x2b, 0xfe,
  0xd7, 0xab, 0x76, 0xca, 0x82, 0xc9, 0x7d, 0xfa, 0x59, 0x47, 0xf0, 0xad, 0xd4,
  0xa2, 0xaf, 0x9c, 0xa4, 0x72, 0xc0, 0xb7, 0xfd, 0x93, 0x26, 0x36, 0x3f, 0xf7,
  0xcc, 0x34, 0xa5, 0xe5, 0xf1, 0x71, 0xd8, 0x31, 0x15, 0x04, 0xc7, 0x23, 0xc3,
  0x18, 0x96, 0x05, 0x9a, 0x07, 0x12, 0x80, 0xe2, 0xeb, 0x27, 0xb2, 0x75, 0x09,
  0x83, 0x2c, 0x1a, 0x1b, 0x6e, 0x5a, 0xa0, 0x52, 0x3b, 0xd6, 0xb3, 0x29, 0xe3,
  0x2f, 0x84, 0x53, 0xd1, 0x00, 0xed, 0x20, 0xfc, 0xb1, 0x5b, 0x6a, 0xcb, 0xbe,
  0x39, 0x4a, 0x4c, 0x58, 0xcf, 0xd0, 0xef, 0xaa, 0xfb, 0x43, 0x4d, 0x33, 0x85,
  0x45, 0xf9, 0x02, 0x7f, 0x50, 0x3c, 0x9f, 0xa8, 0x51, 0xa3, 0x40, 0x8f, 0x92,
  0x9d, 0x38, 0xf5, 0xbc, 0xb6, 0xda, 0x21, 0x10, 0xff, 0xf3, 0xd2, 0xcd, 0x0c,
  0x13, 0xec, 0x5f, 0x97, 0x44, 0x17, 0xc4, 0xa7, 0x7e, 0x3d, 0x64, 0x5d, 0x19,
  0x73, 0x60, 0x81, 0x4f, 0xdc, 0x22, 0x2a, 0x90, 0x88, 0x46, 0xee, 0xb8, 0x14,
  0xde, 0x5e, 0x0b, 0xdb, 0xe0, 0x32, 0x3a, 0x0a, 0x49, 0x06, 0x24, 0x5c, 0xc2,
  0xd3, 0xac, 0x62, 0x91, 0x95, 0xe4, 0x79, 0xe7, 0xc8, 0x37, 0x6d, 0x8d, 0xd5,
  0x4e, 0xa9, 0x6c, 0x56, 0xf4, 0xea, 0x65, 0x7a, 0xae, 0x08, 0xba, 0x78, 0x25,
  0x2e, 0x1c, 0xa6, 0xb4, 0xc6, 0xe8, 0xdd, 0x74, 0x1f, 0x4b, 0xbd, 0x8b, 0x8a,
  0x70, 0x3e, 0xb5, 0x66, 0x48, 0x03, 0xf6, 0x0e, 0x61, 0x35, 0x57, 0xb9, 0x86,
  0xc1, 0x1d, 0x9e, 0xe1, 0xf8, 0x98, 0x11, 0x69, 0xd9, 0x8e, 0x94, 0x9b, 0x1e,
  0x87, 0xe9, 0xce, 0x55, 0x28, 0xdf, 0x8c, 0xa1, 0x89, 0x0d, 0xbf, 0xe6, 0x42,
  0x68, 0x41, 0x99, 0x2d, 0x0f, 0xb0, 0x54, 0xbb, 0x16,
]);
const AES_RCON = [
  0x01, 0x02, 0x04, 0x08, 0x10, 0x20, 0x40, 0x80, 0x1b, 0x36, 0x6c, 0xd8, 0xab,
  0x4d,
];
const AES_INVERSE = new Uint8Array(256);
for (let i = 0; i < 256; i++) AES_INVERSE[AES_SBOX[i]] = i;

const AES_BLOCK = 16;

function xtime(value: number): number {
  return ((value << 1) ^ (value & 0x80 ? 0x1b : 0)) & 0xff;
}

function gmul(a: number, b: number): number {
  let result = 0;
  let x = a & 0xff;
  let y = b & 0xff;
  while (y > 0) {
    if (y & 1) result ^= x;
    x = xtime(x);
    y >>= 1;
  }
  return result;
}

/**
 * AES with 128/192/256-bit keys. WebCrypto is not usable here: its AES-CBC
 * always adds or strips PKCS#7 padding, and ISO 32000-2 needs raw CBC blocks
 * for its key derivations.
 */
class Aes {
  private readonly roundKeys: Uint8Array;

  constructor(key: Uint8Array) {
    const nk = key.length / 4;
    if (key.length !== 16 && key.length !== 24 && key.length !== 32) {
      throw new PdfStructureError("unsupported AES key length");
    }
    const rounds = nk + 6;
    const words = new Uint8Array(4 * (rounds + 1) * 4);
    words.set(key);
    for (let i = nk; i < 4 * (rounds + 1); i++) {
      let temp = words.subarray((i - 1) * 4, i * 4);
      if (i % nk === 0) {
        const rotated = new Uint8Array([temp[1], temp[2], temp[3], temp[0]]);
        for (let j = 0; j < 4; j++) rotated[j] = AES_SBOX[rotated[j]];
        rotated[0] ^= AES_RCON[i / nk - 1];
        temp = rotated;
      } else if (nk > 6 && i % nk === 4) {
        const substituted = new Uint8Array(4);
        for (let j = 0; j < 4; j++) substituted[j] = AES_SBOX[temp[j]];
        temp = substituted;
      }
      for (let j = 0; j < 4; j++) {
        words[i * 4 + j] = words[(i - nk) * 4 + j] ^ temp[j];
      }
    }
    this.roundKeys = words;
    this.rounds = rounds;
  }

  private readonly rounds: number;

  private addRoundKey(state: Uint8Array, round: number): void {
    for (let i = 0; i < 4; i++) {
      for (let j = 0; j < 4; j++) {
        state[j * 4 + i] ^= this.roundKeys[(round * 4 + j) * 4 + i];
      }
    }
  }

  private shiftRows(state: Uint8Array, inverse: boolean): void {
    for (let row = 1; row < 4; row++) {
      const rowBytes = [
        state[row],
        state[4 + row],
        state[8 + row],
        state[12 + row],
      ];
      for (let col = 0; col < 4; col++) {
        const from = inverse ? (col - row + 4) % 4 : (col + row) % 4;
        state[col * 4 + row] = rowBytes[from];
      }
    }
  }

  private mixColumns(state: Uint8Array, inverse: boolean): void {
    for (let col = 0; col < 4; col++) {
      const a = [
        state[col * 4],
        state[col * 4 + 1],
        state[col * 4 + 2],
        state[col * 4 + 3],
      ];
      if (!inverse) {
        state[col * 4] = xtime(a[0]) ^ (a[1] ^ xtime(a[1])) ^ a[2] ^ a[3];
        state[col * 4 + 1] = a[0] ^ xtime(a[1]) ^ (a[2] ^ xtime(a[2])) ^ a[3];
        state[col * 4 + 2] = a[0] ^ a[1] ^ xtime(a[2]) ^ (a[3] ^ xtime(a[3]));
        state[col * 4 + 3] = a[0] ^ xtime(a[0]) ^ a[1] ^ a[2] ^ xtime(a[3]);
      } else {
        state[col * 4] =
          gmul(a[0], 14) ^ gmul(a[1], 11) ^ gmul(a[2], 13) ^ gmul(a[3], 9);
        state[col * 4 + 1] =
          gmul(a[0], 9) ^ gmul(a[1], 14) ^ gmul(a[2], 11) ^ gmul(a[3], 13);
        state[col * 4 + 2] =
          gmul(a[0], 13) ^ gmul(a[1], 9) ^ gmul(a[2], 14) ^ gmul(a[3], 11);
        state[col * 4 + 3] =
          gmul(a[0], 11) ^ gmul(a[1], 13) ^ gmul(a[2], 9) ^ gmul(a[3], 14);
      }
    }
  }

  encryptBlock(input: Uint8Array): Uint8Array {
    const state = new Uint8Array(input);
    this.addRoundKey(state, 0);
    for (let round = 1; round <= this.rounds; round++) {
      for (let i = 0; i < 16; i++) state[i] = AES_SBOX[state[i]];
      this.shiftRows(state, false);
      if (round !== this.rounds) this.mixColumns(state, false);
      this.addRoundKey(state, round);
    }
    return state;
  }

  decryptBlock(input: Uint8Array): Uint8Array {
    const state = new Uint8Array(input);
    this.addRoundKey(state, this.rounds);
    for (let round = this.rounds - 1; round >= 0; round--) {
      this.shiftRows(state, true);
      for (let i = 0; i < 16; i++) state[i] = AES_INVERSE[state[i]];
      this.addRoundKey(state, round);
      if (round !== 0) this.mixColumns(state, true);
    }
    return state;
  }
}

/** Raw CBC with no padding handling; callers own the padding convention. */
function aesCbcDecryptRaw(
  key: Uint8Array,
  iv: Uint8Array,
  data: Uint8Array,
): Uint8Array {
  if (data.length % AES_BLOCK !== 0) {
    throw new PdfStructureError("malformed AES data");
  }
  const aes = new Aes(key);
  const out = new Uint8Array(data.length);
  let previous = iv;
  for (let offset = 0; offset < data.length; offset += AES_BLOCK) {
    const cipherBlock = data.subarray(offset, offset + AES_BLOCK);
    const plain = aes.decryptBlock(cipherBlock);
    for (let i = 0; i < AES_BLOCK; i++)
      out[offset + i] = plain[i] ^ previous[i];
    previous = cipherBlock;
  }
  return out;
}

function aesCbcEncryptRaw(
  key: Uint8Array,
  iv: Uint8Array,
  data: Uint8Array,
): Uint8Array {
  if (data.length % AES_BLOCK !== 0) {
    throw new PdfStructureError("malformed AES data");
  }
  const aes = new Aes(key);
  const out = new Uint8Array(data.length);
  let previous = iv;
  for (let offset = 0; offset < data.length; offset += AES_BLOCK) {
    const block = new Uint8Array(AES_BLOCK);
    for (let i = 0; i < AES_BLOCK; i++)
      block[i] = data[offset + i] ^ previous[i];
    const cipherBlock = aes.encryptBlock(block);
    out.set(cipherBlock, offset);
    previous = cipherBlock;
  }
  return out;
}

function stripPkcs7(data: Uint8Array): Uint8Array {
  const padding = data[data.length - 1];
  if (padding >= 1 && padding <= AES_BLOCK && padding <= data.length) {
    return data.subarray(0, data.length - padding);
  }
  return data;
}

function padPkcs7(data: Uint8Array): Uint8Array {
  const padding = AES_BLOCK - (data.length % AES_BLOCK);
  const out = new Uint8Array(data.length + padding);
  out.set(data);
  out.fill(padding, data.length);
  return out;
}

/** Decrypts a PDF string or stream payload: IV prefix, PKCS#7 padding. */
function aesCbcDecrypt(key: Uint8Array, data: Uint8Array): Uint8Array {
  if (data.length < 2 * AES_BLOCK || data.length % AES_BLOCK !== 0) {
    throw new PdfStructureError("malformed AES data");
  }
  const iv = data.subarray(0, AES_BLOCK);
  return stripPkcs7(aesCbcDecryptRaw(key, iv, data.subarray(AES_BLOCK)));
}

function concatBytes(...parts: Uint8Array[]): Uint8Array {
  const total = parts.reduce((sum, part) => sum + part.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}

const PDF_PASSWORD_PADDING = new Uint8Array([
  0x28, 0xbf, 0x4e, 0x5e, 0x4e, 0x75, 0x8a, 0x41, 0x64, 0x00, 0x4e, 0x56, 0xff,
  0xfa, 0x01, 0x08, 0x2e, 0x2e, 0x00, 0xb6, 0xd0, 0x68, 0x3e, 0x80, 0x2f, 0x0c,
  0xa9, 0xfe, 0x64, 0x53, 0x69, 0x7a,
]);

function padPassword(password: string): Uint8Array {
  const encoded = new TextEncoder().encode(password).subarray(0, 32);
  const out = new Uint8Array(32);
  out.set(encoded);
  out.set(
    PDF_PASSWORD_PADDING.subarray(0, 32 - encoded.length),
    encoded.length,
  );
  return out;
}

interface SecurityHandler {
  revision: number;
  version: number;
  key: Uint8Array;
  encryptMetadata: boolean;
  streamFilter: "RC4" | "AESV2" | "AESV3";
  /** AESV3 uses the file key directly; older revisions derive per object. */
  objectKey(objNum: number, gen: number): Promise<Uint8Array>;
  decryptStream(
    objNum: number,
    gen: number,
    data: Uint8Array,
  ): Promise<Uint8Array>;
  decryptString(
    objNum: number,
    gen: number,
    data: Uint8Array,
  ): Promise<Uint8Array>;
}

async function computeKeyR2ToR4(
  password: Uint8Array,
  ownerEntry: Uint8Array,
  permissions: number,
  id: Uint8Array,
  revision: number,
  keyLength: number,
  encryptMetadata: boolean,
): Promise<Uint8Array> {
  const permissionsBytes = new Uint8Array(4);
  new DataView(permissionsBytes.buffer).setInt32(0, permissions, true);
  const parts = [password, ownerEntry.subarray(0, 32), permissionsBytes, id];
  if (revision >= 4 && !encryptMetadata) {
    parts.push(new Uint8Array([0xff, 0xff, 0xff, 0xff]));
  }
  let digest = md5(concatBytes(...parts));
  if (revision >= 3) {
    for (let i = 0; i < 50; i++) {
      digest = md5(digest.subarray(0, keyLength));
    }
  }
  return digest.subarray(0, keyLength);
}

async function computeUserEntryR2ToR4(
  key: Uint8Array,
  id: Uint8Array,
  revision: number,
): Promise<Uint8Array> {
  if (revision === 2) {
    return rc4(key, PDF_PASSWORD_PADDING);
  }
  const digest = md5(concatBytes(PDF_PASSWORD_PADDING, id));
  let value = rc4(key, digest);
  for (let i = 1; i <= 19; i++) {
    const keyVariant = key.map((byte) => byte ^ i);
    value = rc4(new Uint8Array(keyVariant), value);
  }
  const out = new Uint8Array(32);
  out.set(value);
  // The remaining 16 bytes are arbitrary but the spec recommends fixing them.
  out.set(new Uint8Array(16), 16);
  return out;
}

/** Algorithm 2.B of ISO 32000-2, verified against pdf-lib's PDF20 implementation. */
/**
 * TS types WebCrypto and stream inputs as ArrayBuffer-backed views. Every byte
 * source this module handles is one (it never touches SharedArrayBuffer), so
 * narrow once, here, with the reason recorded.
 */
function inputView(bytes: Uint8Array): Uint8Array<ArrayBuffer> {
  return bytes as Uint8Array<ArrayBuffer>;
}

async function hash2B(
  password: Uint8Array,
  salt: Uint8Array,
  userBytes: Uint8Array,
  revision: number,
): Promise<Uint8Array> {
  const digest = async (
    algorithm: "SHA-256" | "SHA-384" | "SHA-512",
    data: Uint8Array,
  ): Promise<Uint8Array> => {
    const cryptoRef = globalThis.crypto;
    if (!cryptoRef?.subtle) {
      // Only R5/R6 key derivation needs SHA-2; RC4 and AESV2 documents open
      // without WebCrypto.
      throw new PdfStructureError(
        "AES-256 encrypted PDFs need WebCrypto's SHA-2, available only in secure contexts",
      );
    }
    return new Uint8Array(
      await cryptoRef.subtle.digest(algorithm, inputView(data)),
    );
  };

  let k = (await digest("SHA-256", concatBytes(password, salt))).subarray(
    0,
    32,
  );
  if (revision < 6) return k;
  let e: Uint8Array = new Uint8Array([0]);
  let round = 0;
  while (round < 64 || e[e.length - 1] > round - 32) {
    const combined = concatBytes(password, k, userBytes);
    const k1 = new Uint8Array(combined.length * 64);
    for (let i = 0; i < 64; i++) k1.set(combined, i * combined.length);
    e = aesCbcEncryptRaw(k.subarray(0, 16), k.subarray(16, 32), k1);
    // 256 % 3 === 1, so the big-endian number's remainder mod 3 is the sum
    // of its first 16 bytes mod 3, without big-integer math.
    let remainder = 0;
    for (let i = 0; i < 16; i++) remainder = (remainder + e[i]) % 3;
    const algorithm =
      remainder === 0 ? "SHA-256" : remainder === 1 ? "SHA-384" : "SHA-512";
    k = await digest(algorithm, e);
    round += 1;
  }
  return k.subarray(0, 32);
}

export class PdfFileReader {
  readonly bytes: Uint8Array;
  private readonly xref = new Map<number, XrefEntry>();
  private readonly objects = new Map<number, ParsedObject | null>();
  private readonly objectStreams = new Map<
    number,
    {
      buffer: Uint8Array;
      first: number;
      pairs: Array<{ num: number; offset: number }>;
    }
  >();
  private security: SecurityHandler | null = null;
  root: PdfRef | null = null;
  info: PdfRef | null = null;
  encryptValue: PdfValue | null = null;
  trailerId: Uint8Array | null = null;
  startxrefOffset = 0;
  maxObjectNum = 0;

  private constructor(bytes: Uint8Array) {
    this.bytes = bytes;
  }

  static async open(bytes: Uint8Array, password = ""): Promise<PdfFileReader> {
    const reader = new PdfFileReader(bytes);
    const startxref = reader.findStartxref();
    reader.startxrefOffset = startxref;
    await reader.readXrefChain(startxref, password);
    return reader;
  }

  private findStartxref(): number {
    const tailStart = Math.max(0, this.bytes.length - 2048);
    const tail = latin1.decode(this.bytes.subarray(tailStart));
    const match = /startxref\s+(\d+)/g;
    let last: number | null = null;
    for (const found of tail.matchAll(match)) {
      last = Number(found[1]);
    }
    if (last === null) throw new PdfStructureError("no startxref");
    return last;
  }

  private async readXrefChain(offset: number, password: string): Promise<void> {
    const visited = new Set<number>();
    let next: number | null = offset;
    while (next !== null && !visited.has(next)) {
      visited.add(next);
      const section = await this.readXrefSection(next);
      for (const [num, entry] of section.entries) {
        if (!this.xref.has(num)) this.xref.set(num, entry);
        if (num > this.maxObjectNum) this.maxObjectNum = num;
      }
      if (section.trailer) {
        // The newest section that carries these wins for root/id lookups.
        if (!this.root) this.root = takeRef(section.trailer, "Root");
        if (!this.info) this.info = takeRef(section.trailer, "Info");
        if (!this.trailerId) {
          const id = section.trailer.get("ID");
          if (id && id.kind === "array" && id.items[0]?.kind === "string") {
            this.trailerId = id.items[0].bytes;
          }
        }
        if (!this.encryptValue) {
          const encrypt = section.trailer.get("Encrypt");
          if (encrypt) this.encryptValue = encrypt;
        }
      }
      if (section.xrefStm !== null) {
        const hybrid = await this.readXrefSection(section.xrefStm);
        for (const [num, entry] of hybrid.entries) {
          if (!this.xref.has(num)) this.xref.set(num, entry);
          if (num > this.maxObjectNum) this.maxObjectNum = num;
        }
      }
      next = section.prev;
    }
    // Trailer /Encrypt may reference an object in an older xref section, so
    // security can only be initialized after the whole chain is loaded.
    if (this.encryptValue && !this.security) {
      await this.initSecurity(this.encryptValue, password);
    }
  }

  private async readXrefSection(offset: number): Promise<{
    entries: Map<number, XrefEntry>;
    trailer: Map<string, PdfValue> | null;
    prev: number | null;
    xrefStm: number | null;
  }> {
    const entries = new Map<number, XrefEntry>();
    const p = skipSpace(this.bytes, offset);
    if (latin1.decode(this.bytes.subarray(p, p + 4)) === "xref") {
      return this.readXrefTable(p, entries);
    }
    return this.readXrefStream(p, entries);
  }

  private readXrefTable(
    pos: number,
    entries: Map<number, XrefEntry>,
  ): {
    entries: Map<number, XrefEntry>;
    trailer: Map<string, PdfValue> | null;
    prev: number | null;
    xrefStm: number | null;
  } {
    let p = pos + 4;
    for (;;) {
      p = skipSpace(this.bytes, p);
      if (latin1.decode(this.bytes.subarray(p, p + 7)) === "trailer") {
        p += 7;
        const parsed = parseValue(this.bytes, p);
        const trailer = parsed.value.kind === "dict" ? parsed.value.map : null;
        return {
          entries,
          trailer,
          prev: trailer ? takeNumber(trailer, "Prev") : null,
          xrefStm: trailer ? takeNumber(trailer, "XRefStm") : null,
        };
      }
      const start = parseNumberToken(this.bytes, p);
      let q = skipSpace(this.bytes, start.end);
      const count = parseNumberToken(this.bytes, q);
      q = count.end;
      for (let i = 0; i < count.value; i++) {
        q = skipSpace(this.bytes, q);
        const field1 = parseNumberToken(this.bytes, q);
        q = skipSpace(this.bytes, field1.end);
        const field2 = parseNumberToken(this.bytes, q);
        q = skipSpace(this.bytes, field2.end);
        const type = this.bytes[q];
        q = skipSpace(this.bytes, q + 1);
        const num = start.value + i;
        if (!entries.has(num) && type !== 0x66) {
          entries.set(num, { offset: field1.value, gen: field2.value });
        }
      }
      p = q;
    }
  }

  private async readXrefStream(
    pos: number,
    entries: Map<number, XrefEntry>,
  ): Promise<{
    entries: Map<number, XrefEntry>;
    trailer: Map<string, PdfValue> | null;
    prev: number | null;
    xrefStm: number | null;
  }> {
    const parsed = this.parseIndirectAt(pos, true);
    const xrefStream = parsed.value;
    if (xrefStream.kind !== "stream") {
      throw new PdfStructureError("xref stream is not a stream");
    }
    const dict = xrefStream.dict;
    const data = await this.streamBytes(xrefStream);
    const widths = dict.get("W");
    if (!widths || widths.kind !== "array")
      throw new PdfStructureError("xref stream without W");
    const w = widths.items.map((item) =>
      item.kind === "number" ? item.value : 0,
    );
    const size = takeNumber(dict, "Size") ?? 0;
    const index = dict.get("Index");
    const pairs: number[] = [];
    if (index && index.kind === "array") {
      for (const item of index.items) {
        if (item.kind === "number") pairs.push(item.value);
      }
    } else {
      pairs.push(0, size);
    }
    const entrySize = w[0] + w[1] + w[2];
    let cursor = 0;
    for (let pair = 0; pair + 1 < pairs.length; pair += 2) {
      const first = pairs[pair];
      const count = pairs[pair + 1];
      for (let i = 0; i < count; i++) {
        if (cursor + entrySize > data.length) break;
        const type = w[0] === 0 ? 1 : readUint(data, cursor, w[0]);
        const field2 = readUint(data, cursor + w[0], w[1]);
        const field3 = readUint(data, cursor + w[0] + w[1], w[2]);
        cursor += entrySize;
        const num = first + i;
        if (entries.has(num)) continue;
        if (type === 0) continue;
        if (type === 1) {
          entries.set(num, { offset: field2, gen: field3 });
        } else if (type === 2) {
          entries.set(num, { streamNum: field2, streamIndex: field3, gen: 0 });
        }
      }
    }
    return {
      entries,
      trailer: dict,
      prev: takeNumber(dict, "Prev"),
      xrefStm: null,
    };
  }

  private async initSecurity(
    encrypt: PdfValue,
    password: string,
  ): Promise<void> {
    const dictValue = await this.resolveValue(encrypt);
    if (!dictValue || dictValue.kind !== "dict") {
      throw new PdfStructureError("bad /Encrypt dictionary");
    }
    const dict = dictValue.map;
    const filter = dict.get("Filter");
    if (!filter || filter.kind !== "name" || filter.name !== "Standard") {
      throw new PdfStructureError("unsupported encryption filter");
    }
    const revision = takeNumber(dict, "R") ?? 0;
    const version = takeNumber(dict, "V") ?? 0;
    const ownerEntry = takeStringBytes(dict, "O");
    const id = this.trailerId ?? new Uint8Array(0);

    let fileKey: Uint8Array | null = null;
    if (revision <= 4) {
      const keyLength = Math.max(
        5,
        Math.min(16, (takeNumber(dict, "Length") ?? 40) / 8),
      );
      const permissions = takeNumber(dict, "P") ?? -1;
      const encryptMetadata =
        dict.get("EncryptMetadata")?.kind === "bool"
          ? (dict.get("EncryptMetadata") as { value: boolean }).value
          : true;
      const user = padPassword(password);
      const candidate = await computeKeyR2ToR4(
        user,
        ownerEntry,
        permissions,
        id,
        revision,
        keyLength,
        encryptMetadata,
      );
      const expected = takeStringBytes(dict, "U");
      const computed = await computeUserEntryR2ToR4(candidate, id, revision);
      const matches =
        revision === 2
          ? computed.every((byte, i) => byte === expected[i])
          : computed.subarray(0, 16).every((byte, i) => byte === expected[i]);
      if (!matches) {
        throw new PdfStructureError("PDF password required");
      }
      fileKey = candidate;
    } else {
      const userHash = takeStringBytes(dict, "U");
      const empty = new Uint8Array(0);
      const validation = await hash2B(
        empty,
        userHash.subarray(32, 40),
        empty,
        revision,
      );
      const matches = validation.every((byte, i) => byte === userHash[i]);
      if (!matches) throw new PdfStructureError("PDF password required");
      const ue = takeStringBytes(dict, "UE");
      const userKey = await hash2B(
        empty,
        userHash.subarray(40, 48),
        empty,
        revision,
      );
      fileKey = aesCbcDecryptRaw(userKey, new Uint8Array(16), ue);
    }

    let streamFilter: "RC4" | "AESV2" | "AESV3";
    if (version >= 5) {
      streamFilter = "AESV3";
    } else {
      const cf = dict.get("CF");
      let cfm = "V2";
      if (cf && cf.kind === "dict") {
        const std = cf.map.get("StdCF");
        if (std && std.kind === "dict") {
          const name = std.map.get("CFM");
          if (name && name.kind === "name") cfm = name.name;
        }
      }
      streamFilter = cfm === "AESV2" ? "AESV2" : "RC4";
    }

    const key = fileKey;
    const security: SecurityHandler = {
      revision,
      version,
      key,
      encryptMetadata: true,
      streamFilter,
      objectKey: async (objNum: number, gen: number) => {
        if (streamFilter === "AESV3") return key;
        const extra =
          streamFilter === "AESV2"
            ? new Uint8Array([0x73, 0x41, 0x6c, 0x54])
            : new Uint8Array(0);
        const seed = new Uint8Array(5 + extra.length);
        seed[0] = objNum & 0xff;
        seed[1] = (objNum >> 8) & 0xff;
        seed[2] = (objNum >> 16) & 0xff;
        seed[3] = gen & 0xff;
        seed[4] = (gen >> 8) & 0xff;
        seed.set(extra, 5);
        const digest = md5(concatBytes(key, seed));
        return digest.subarray(0, Math.min(key.length + 5, 16));
      },
      decryptStream: async (objNum: number, gen: number, data: Uint8Array) => {
        if (streamFilter === "AESV3") return aesCbcDecrypt(key, data);
        const objectKey = await security.objectKey(objNum, gen);
        return streamFilter === "AESV2"
          ? aesCbcDecrypt(objectKey, data)
          : rc4(objectKey, data);
      },
      decryptString: async (objNum: number, gen: number, data: Uint8Array) => {
        if (streamFilter === "AESV3") return aesCbcDecrypt(key, data);
        const objectKey = await security.objectKey(objNum, gen);
        return streamFilter === "AESV2"
          ? aesCbcDecrypt(objectKey, data)
          : rc4(objectKey, data);
      },
    };
    this.security = security;
  }

  get encrypted(): boolean {
    return this.security !== null;
  }

  async getObject(num: number): Promise<PdfValue | null> {
    const cached = this.objects.get(num);
    if (cached !== undefined) return cached?.value ?? null;
    const parsed = await this.getParsed(num);
    return parsed?.value ?? null;
  }

  async getParsed(num: number): Promise<ParsedObject | null> {
    const cached = this.objects.get(num);
    if (cached !== undefined) return cached;
    const entry = this.xref.get(num);
    if (!entry) {
      this.objects.set(num, null);
      return null;
    }
    let parsed: ParsedObject | null = null;
    try {
      if (entry.offset !== undefined) {
        parsed = this.parseIndirectAt(entry.offset, false, entry.gen);
      } else if (entry.streamNum !== undefined) {
        parsed = await this.parseInObjectStream(
          entry.streamNum,
          entry.streamIndex ?? 0,
          num,
        );
      }
    } catch {
      parsed = null;
    }
    this.objects.set(num, parsed);
    return parsed;
  }

  /** Raw content span of an object, for splicing it back into the file. */
  async getRawSpan(num: number): Promise<RawSpan | null> {
    const parsed = await this.getParsed(num);
    return parsed?.span ?? null;
  }

  private parseIndirectAt(
    offset: number,
    allowAnyKeyword = false,
    expectedGen?: number,
  ): ParsedObject {
    let p = skipSpace(this.bytes, offset);
    const numToken = parseNumberToken(this.bytes, p);
    p = skipSpace(this.bytes, numToken.end);
    const genToken = parseNumberToken(this.bytes, p);
    p = skipSpace(this.bytes, genToken.end);
    const keyword = latin1.decode(this.bytes.subarray(p, p + 3));
    if (keyword !== "obj") {
      if (!allowAnyKeyword) throw new PdfStructureError("missing obj keyword");
    }
    p += 3;
    const valueStart = skipSpace(this.bytes, p);
    const parsed = parseValue(this.bytes, valueStart, {
      decryptable: this.security
        ? { objNum: numToken.value, gen: expectedGen ?? genToken.value }
        : undefined,
    });
    let value = parsed.value;
    let end = parsed.end;
    // Stream?
    const after = skipSpace(this.bytes, end);
    if (latin1.decode(this.bytes.subarray(after, after + 6)) === "stream") {
      let dataStart = after + 6;
      if (this.bytes[dataStart] === 0x0d) dataStart += 1;
      if (this.bytes[dataStart] === 0x0a) dataStart += 1;
      let dataEnd = -1;
      if (value.kind === "dict") {
        const length = value.map.get("Length");
        if (length && length.kind === "number") {
          const candidate = dataStart + length.value;
          // The keyword sits after whitespace that /Length does not cover.
          const probe = skipSpace(this.bytes, candidate);
          if (
            latin1.decode(this.bytes.subarray(probe, probe + 9)) === "endstream"
          ) {
            dataEnd = candidate;
          }
        }
      }
      if (dataEnd < 0) {
        const marker = this.findBytes("endstream", dataStart);
        if (marker < 0) throw new PdfStructureError("unterminated stream");
        let end = marker;
        // The EOL before `endstream` is a delimiter, not stream data.
        if (end > dataStart && this.bytes[end - 1] === 0x0a) end -= 1;
        if (end > dataStart && this.bytes[end - 1] === 0x0d) end -= 1;
        dataEnd = end;
      }
      value = {
        kind: "stream",
        dict: (value as { kind: "dict"; map: Map<string, PdfValue> }).map,
        objNum: numToken.value,
        gen: expectedGen ?? genToken.value,
        start: dataStart,
        end: dataEnd,
      };
      end = dataEnd;
    }
    return {
      value,
      span: {
        buffer: this.bytes,
        start: valueStart,
        end: value.kind === "stream" ? end : parsed.end,
        inStream: false,
      },
    };
  }

  private findBytes(needle: string, from: number): number {
    const bytes = this.bytes;
    const first = needle.charCodeAt(0);
    for (let i = from; i + needle.length <= bytes.length; i++) {
      if (bytes[i] !== first) continue;
      let match = true;
      for (let j = 1; j < needle.length; j++) {
        if (bytes[i + j] !== needle.charCodeAt(j)) {
          match = false;
          break;
        }
      }
      if (match) return i;
    }
    return -1;
  }

  private async parseInObjectStream(
    streamNum: number,
    position: number,
    expectedNum: number,
  ): Promise<ParsedObject | null> {
    let decoded = this.objectStreams.get(streamNum);
    if (!decoded) {
      const streamValue = await this.getObject(streamNum);
      if (!streamValue || streamValue.kind !== "stream") return null;
      const buffer = await this.streamBytes(streamValue);
      const first = takeNumber(streamValue.dict, "First") ?? 0;
      const count = takeNumber(streamValue.dict, "N") ?? 0;
      const header = latin1.decode(buffer.subarray(0, first));
      const pairs: Array<{ num: number; offset: number }> = [];
      for (const token of header.match(/(\d+)\s+(\d+)/g) ?? []) {
        if (pairs.length >= count) break;
        const [num, offset] = token.split(/\s+/).map(Number);
        pairs.push({ num, offset });
      }
      decoded = { buffer, first, pairs };
      this.objectStreams.set(streamNum, decoded);
    }
    // The spec orders header pairs by position, but some writers make the
    // index unreliable, so prefer the pair whose number matches.
    const entry =
      decoded.pairs[position]?.num === expectedNum
        ? decoded.pairs[position]
        : decoded.pairs.find((pair) => pair.num === expectedNum);
    if (!entry) return null;
    const start = decoded.first + entry.offset;
    const parsed = parseValue(decoded.buffer, start);
    return {
      value: parsed.value,
      span: {
        buffer: decoded.buffer,
        start,
        end: parsed.end,
        inStream: true,
      },
    };
  }

  async resolveValue(
    value: PdfValue | undefined,
  ): Promise<PdfValue | undefined> {
    let current = value;
    let hops = 0;
    while (current?.kind === "ref" && hops < 32) {
      current = (await this.getObject(current.ref.num)) ?? undefined;
      hops += 1;
    }
    return current;
  }

  async dictGet(
    dict: Map<string, PdfValue> | undefined,
    key: string,
  ): Promise<PdfValue | undefined> {
    if (!dict) return undefined;
    return await this.resolveValue(dict.get(key));
  }

  /** Decoded text of a string value, decrypting it when needed. */
  async stringText(value: PdfValue): Promise<string | undefined> {
    if (value.kind !== "string") return undefined;
    let bytes = value.bytes;
    if (!value.plain && this.security) {
      bytes = await this.security.decryptString(value.objNum, value.gen, bytes);
    }
    return decodeStringText(bytes);
  }

  /** Decompressed bytes of a stream value. */
  async streamBytes(value: PdfValue): Promise<Uint8Array> {
    if (value.kind !== "stream") throw new PdfStructureError("not a stream");
    let data = this.bytes.subarray(value.start, value.end);
    // ISO 32000: cross-reference streams are never encrypted, even when the
    // rest of the document is.
    if (this.security && takeName(value.dict, "Type") !== "XRef") {
      data = await this.security.decryptStream(value.objNum, value.gen, data);
    }
    const filter = takeName(value.dict, "Filter");
    if (!filter) return data;
    if (filter !== "FlateDecode" && filter !== "Fl") {
      throw new PdfStructureError(`unsupported stream filter ${filter}`);
    }
    let decoded = await inflate(data);
    const parms = value.dict.get("DecodeParms");
    const resolvedParms = await this.resolveValue(parms);
    if (resolvedParms && resolvedParms.kind === "dict") {
      decoded = applyPredictor(decoded, resolvedParms.map);
    }
    return decoded;
  }
}

function takeRef(dict: Map<string, PdfValue>, key: string): PdfRef | null {
  const value = dict.get(key);
  return value?.kind === "ref" ? value.ref : null;
}

function takeNumber(dict: Map<string, PdfValue>, key: string): number | null {
  const value = dict.get(key);
  return value?.kind === "number" ? value.value : null;
}

function takeName(dict: Map<string, PdfValue>, key: string): string | null {
  const value = dict.get(key);
  return value?.kind === "name" ? value.name : null;
}

function takeStringBytes(dict: Map<string, PdfValue>, key: string): Uint8Array {
  const value = dict.get(key);
  return value?.kind === "string" ? value.bytes : new Uint8Array(0);
}

function readUint(bytes: Uint8Array, offset: number, width: number): number {
  let value = 0;
  for (let i = 0; i < width; i++) {
    value = value * 256 + (bytes[offset + i] ?? 0);
  }
  return value;
}

async function inflate(data: Uint8Array): Promise<Uint8Array> {
  const stream = new DecompressionStream("deflate");
  const writer = stream.writable.getWriter();
  const writing = (async () => {
    try {
      await writer.write(inputView(data));
      await writer.close();
    } catch {
      // The read side surfaces the decode error.
    }
  })();
  const reader = stream.readable.getReader();
  const chunks: Uint8Array[] = [];
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) chunks.push(value);
    }
  } catch (cause) {
    throw new PdfStructureError(
      `stream decode failed (${data.length} bytes): ${cause instanceof Error ? cause.message : String(cause)}`,
    );
  } finally {
    await writing;
  }
  return concatBytes(...chunks);
}

function applyPredictor(
  data: Uint8Array,
  parms: Map<string, PdfValue>,
): Uint8Array {
  const predictor = takeNumber(parms, "Predictor") ?? 1;
  if (predictor <= 1) return data;
  if (predictor === 2) {
    throw new PdfStructureError("TIFF predictor is not supported");
  }
  const colors = takeNumber(parms, "Colors") ?? 1;
  const bpc = takeNumber(parms, "BitsPerComponent") ?? 8;
  const columns = takeNumber(parms, "Columns") ?? 1;
  const rowLength = Math.ceil((colors * bpc * columns) / 8);
  const rowBytes = rowLength + 1;
  const rows = Math.floor(data.length / rowBytes);
  const out = new Uint8Array(rows * rowLength);
  let prev = new Uint8Array(rowLength);
  for (let r = 0; r < rows; r++) {
    const tag = data[r * rowBytes];
    const row = out.subarray(r * rowLength, (r + 1) * rowLength);
    row.set(data.subarray(r * rowBytes + 1, r * rowBytes + 1 + rowLength));
    for (let i = 0; i < rowLength; i++) {
      const left = i >= colors ? row[i - colors] : 0;
      const up = prev[i];
      const upLeft = i >= colors ? prev[i - colors] : 0;
      switch (tag) {
        case 1:
          row[i] = (row[i] + left) & 0xff;
          break;
        case 2:
          row[i] = (row[i] + up) & 0xff;
          break;
        case 3:
          row[i] = (row[i] + ((left + up) >> 1)) & 0xff;
          break;
        case 4: {
          const p = left + up - upLeft;
          const pa = Math.abs(p - left);
          const pb = Math.abs(p - up);
          const pc = Math.abs(p - upLeft);
          const pred = pa <= pb && pa <= pc ? left : pb <= pc ? up : upLeft;
          row[i] = (row[i] + pred) & 0xff;
          break;
        }
        default:
          break;
      }
    }
    prev = row;
  }
  return out;
}

export { md5, rc4, concatBytes, PDF_PASSWORD_PADDING, padPassword };
export {
  aesCbcDecrypt,
  aesCbcDecryptRaw,
  aesCbcEncryptRaw,
  padPkcs7,
  stripPkcs7,
};

export interface DictEntrySpan {
  key: string;
  entryStart: number;
  valueStart: number;
  valueEnd: number;
}

/**
 * Scans a dict's raw syntax and returns each entry's byte span so callers can
 * splice values while leaving every other byte untouched.
 */
export function scanDictEntries(
  buffer: Uint8Array,
  dictStart: number,
): DictEntrySpan[] {
  const entries: DictEntrySpan[] = [];
  let q = skipSpace(buffer, dictStart + 2);
  for (;;) {
    q = skipSpace(buffer, q);
    if (q + 1 >= buffer.length) break;
    if (buffer[q] === 0x3e && buffer[q + 1] === 0x3e) break;
    if (buffer[q] !== 0x2f)
      throw new PdfStructureError("dict key is not a name");
    const entryStart = q;
    const key = parseName(buffer, q);
    const value = parseValue(buffer, key.end);
    entries.push({
      key: key.name,
      entryStart,
      valueStart: key.end,
      valueEnd: value.end,
    });
    q = value.end;
  }
  return entries;
}

const HEX = "0123456789abcdef";

export function toHex(bytes: Uint8Array): string {
  let out = "";
  for (const byte of bytes) {
    out += HEX[byte >> 4] + HEX[byte & 0x0f];
  }
  return out;
}

function escapeName(name: string): string {
  let out = "";
  for (const char of name) {
    const code = char.charCodeAt(0);
    if (code < 0x21 || code > 0x7e || "#()<>[]{}/%".includes(char)) {
      out += "#" + HEX[(code >> 4) & 0x0f] + HEX[code & 0x0f];
    } else {
      out += char;
    }
  }
  return out;
}

/** Serializes a parsed value; strings emit their (decrypted) content bytes. */
export function serializeValue(value: PdfValue): string {
  switch (value.kind) {
    case "null":
      return "null";
    case "bool":
      return value.value ? "true" : "false";
    case "number":
      return String(value.value);
    case "name":
      return "/" + escapeName(value.name);
    case "string":
      return "<" + toHex(value.bytes) + ">";
    case "ref":
      return `${value.ref.num} ${value.ref.gen} R`;
    case "array":
      return "[" + value.items.map(serializeValue).join(" ") + "]";
    case "dict": {
      const parts: string[] = [];
      for (const [key, item] of value.map) {
        parts.push("/" + escapeName(key) + " " + serializeValue(item));
      }
      return "<<" + parts.join(" ") + ">>";
    }
    default:
      throw new PdfStructureError("cannot serialize a stream");
  }
}

/** Whether a value carries a string that would need re-encrypting on write. */
export function containsEncryptedString(
  value: PdfValue,
  encrypted: boolean,
): boolean {
  if (value.kind === "string") return encrypted && !value.plain;
  if (value.kind === "array") {
    return value.items.some((item) => containsEncryptedString(item, encrypted));
  }
  if (value.kind === "dict") {
    for (const item of value.map.values()) {
      if (containsEncryptedString(item, encrypted)) return true;
    }
    return false;
  }
  return false;
}

/**
 * Rewrites a dict found in `buffer`, replacing or deleting the given keys and
 * appending additions that are not present. Untouched values keep their exact
 * bytes, so encrypted strings stay valid for the object number that holds them.
 */
export function rewriteDictBuffer(
  buffer: Uint8Array,
  dictStart: number,
  edits: Map<string, string | null>,
  additions: Array<[string, string]>,
): Uint8Array {
  const entries = scanDictEntries(buffer, dictStart);
  const seen = new Set<string>();
  const chunks: Array<string | Uint8Array> = ["<<"];
  for (const entry of entries) {
    seen.add(entry.key);
    const edit = edits.get(entry.key);
    if (edit === null) continue;
    chunks.push(" ", "/" + escapeName(entry.key), " ");
    if (edit !== undefined) {
      chunks.push(edit);
    } else {
      chunks.push(buffer.subarray(entry.valueStart, entry.valueEnd));
    }
  }
  for (const [key, value] of additions) {
    if (edits.has(key) || seen.has(key)) continue;
    chunks.push(" ", "/" + escapeName(key), " ", value);
  }
  chunks.push(" >>");
  return joinChunks(chunks);
}

function joinChunks(chunks: Array<string | Uint8Array>): Uint8Array {
  const encoder = new TextEncoder();
  const parts = chunks.map((chunk) =>
    typeof chunk === "string" ? encoder.encode(chunk) : chunk,
  );
  const total = parts.reduce((sum, part) => sum + part.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}

export interface ObjectUpdate {
  num: number;
  gen: number;
  body: string | Uint8Array;
}

/**
 * Appends an incremental update section: new object versions plus a classic
 * xref table and trailer chained through /Prev. The trailer repeats /Info and
 * /Encrypt so readers that do not merge trailers still see them.
 */
export function appendIncrementalUpdate(
  original: Uint8Array,
  updates: ObjectUpdate[],
  trailer: {
    size: number;
    root: PdfRef;
    prev: number;
    id: Uint8Array | null;
    info?: PdfRef | null;
    encrypt?: PdfValue | null;
  },
): Uint8Array {
  const chunks: Uint8Array[] = [original];
  if (original.length > 0 && original[original.length - 1] !== 0x0a) {
    chunks.push(new Uint8Array([0x0a]));
  }
  let offset = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const encoder = new TextEncoder();
  const placed: Array<{ num: number; gen: number; offset: number }> = [];
  for (const update of [...updates].sort((a, b) => a.num - b.num)) {
    const header = encoder.encode(`${update.num} ${update.gen} obj\n`);
    const body =
      typeof update.body === "string"
        ? encoder.encode(update.body)
        : update.body;
    const footer = encoder.encode("\nendobj\n");
    placed.push({ num: update.num, gen: update.gen, offset });
    chunks.push(header, body, footer);
    offset += header.length + body.length + footer.length;
  }

  const xrefOffset = offset;
  const lines: string[] = ["xref\n"];
  let index = 0;
  while (index < placed.length) {
    let end = index;
    while (
      end + 1 < placed.length &&
      placed[end + 1].num === placed[end].num + 1
    ) {
      end += 1;
    }
    lines.push(`${placed[index].num} ${end - index + 1}\n`);
    for (let i = index; i <= end; i++) {
      lines.push(
        `${String(placed[i].offset).padStart(10, "0")} ${String(placed[i].gen).padStart(5, "0")} n \n`,
      );
    }
    index = end + 1;
  }
  const id =
    trailer.id && trailer.id.length > 0
      ? ` /ID [<${toHex(trailer.id)}> <${toHex(trailer.id)}>]`
      : "";
  const info = trailer.info
    ? ` /Info ${trailer.info.num} ${trailer.info.gen} R`
    : "";
  const encrypt = trailer.encrypt
    ? ` /Encrypt ${serializeValue(trailer.encrypt)}`
    : "";
  lines.push(
    `trailer\n<< /Size ${trailer.size} /Root ${trailer.root.num} ${trailer.root.gen} R${info}${encrypt} /Prev ${trailer.prev}${id} >>\nstartxref\n${xrefOffset}\n%%EOF\n`,
  );
  chunks.push(encoder.encode(lines.join("")));
  return concatBytes(...chunks);
}
