import { webcrypto } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  aesCbcDecrypt,
  aesCbcEncryptRaw,
  aesCbcDecryptRaw,
  md5,
  padPkcs7,
  rc4,
  toHex,
} from "@app/utils/pdfObjectReader";

const subtle = webcrypto.subtle;

function bytes(...values: number[]): Uint8Array {
  return Uint8Array.from(values);
}

describe("pdfObjectReader crypto", () => {
  it("matches the RFC 1321 MD5 vectors", () => {
    expect(toHex(md5(new Uint8Array(0)))).toBe(
      "d41d8cd98f00b204e9800998ecf8427e",
    );
    expect(toHex(md5(new TextEncoder().encode("abc")))).toBe(
      "900150983cd24fb0d6963f7d28e17f72",
    );
    expect(toHex(md5(new TextEncoder().encode("message digest")))).toBe(
      "f96b697d7cb7938d525a2f31aaf161d0",
    );
  });

  it("matches the RC4 test vector", () => {
    // Key "Key", plaintext "Plaintext" (RC4 known-answer vector).
    expect(
      toHex(
        rc4(
          new TextEncoder().encode("Key"),
          bytes(0x50, 0x6c, 0x61, 0x69, 0x6e, 0x74, 0x65, 0x78, 0x74),
        ),
      ),
    ).toBe("bbf316e8d940af0ad3");
  });

  it("matches WebCrypto AES-CBC for 128-bit keys", async () => {
    await crossCheck(16);
  });

  it("matches WebCrypto AES-CBC for 256-bit keys", async () => {
    await crossCheck(32);
  });

  async function crossCheck(keyLength: number): Promise<void> {
    const key = Uint8Array.from(
      { length: keyLength },
      (_, i) => (i * 7 + 3) & 0xff,
    );
    const iv = Uint8Array.from({ length: 16 }, (_, i) => (i * 13 + 1) & 0xff);
    const plain = Uint8Array.from(
      { length: 48 },
      (_, i) => (i * 29 + 5) & 0xff,
    );

    const cryptoKey = await subtle.importKey(
      "raw",
      key,
      { name: "AES-CBC" },
      false,
      ["encrypt", "decrypt"],
    );
    const reference = new Uint8Array(
      await subtle.encrypt({ name: "AES-CBC", iv }, cryptoKey, plain),
    );

    // WebCrypto pads the input; the raw block layer must agree once the
    // plaintext carries the same PKCS#7 padding.
    const mine = aesCbcEncryptRaw(key, iv, padPkcs7(plain));
    expect(toHex(mine)).toBe(toHex(reference));

    // And the decrypt side must recover exactly the padded plaintext.
    expect(toHex(aesCbcDecryptRaw(key, iv, reference))).toBe(
      toHex(padPkcs7(plain)),
    );

    // The PDF string/stream convention is an IV prefix plus PKCS#7 padding.
    const payload = new Uint8Array(16 + reference.length);
    payload.set(iv);
    payload.set(reference, 16);
    expect(toHex(aesCbcDecrypt(key, payload))).toBe(toHex(plain));
  }
});
