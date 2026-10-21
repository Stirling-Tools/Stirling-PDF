import { webcrypto } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  PdfFileReader,
  appendIncrementalUpdate,
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

describe("pdfObjectReader streams and trailers", () => {
  function buildPdf(objects: string[]): Uint8Array {
    const encoder = new TextEncoder();
    const header = "%PDF-1.4\n";
    let body = "";
    const offsets: number[] = [];
    objects.forEach((object, index) => {
      offsets.push(header.length + body.length);
      body += `${index + 1} 0 obj\n${object}\nendobj\n`;
    });
    const xrefOffset = header.length + body.length;
    const entries = offsets
      .map((offset) => `${String(offset).padStart(10, "0")} 00000 n \n`)
      .join("");
    const xref = `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${entries}`;
    const trailer = `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;
    return encoder.encode(header + body + xref + trailer);
  }

  it("strips the EOL before endstream when /Length is indirect", async () => {
    const reader = await PdfFileReader.open(
      buildPdf([
        "<< /Type /Catalog /Pages 2 0 R >>",
        "<< /Type /Pages /Kids [] /Count 0 >>",
        "<< /Length 4 0 R >>\nstream\nHELLO\nendstream",
        "5",
      ]),
    );
    const parsed = await reader.getParsed(3);

    expect(parsed?.value.kind).toBe("stream");
    if (parsed?.value.kind === "stream") {
      expect(await reader.streamBytes(parsed.value)).toEqual(
        new TextEncoder().encode("HELLO"),
      );
    }
  });

  it("keeps /Info and /Encrypt in an appended trailer", () => {
    const output = appendIncrementalUpdate(new Uint8Array(0), [], {
      size: 6,
      root: { num: 1, gen: 0 },
      prev: 0,
      id: null,
      info: { num: 4, gen: 0 },
      encrypt: { kind: "ref", ref: { num: 5, gen: 0 } },
    });
    const text = new TextDecoder().decode(output);

    expect(text).toContain("/Info 4 0 R");
    expect(text).toContain("/Encrypt 5 0 R");
  });
});
