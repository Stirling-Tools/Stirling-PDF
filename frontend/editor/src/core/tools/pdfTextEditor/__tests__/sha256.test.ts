import { describe, expect, it } from "vitest";
import { createHash } from "node:crypto";

import { sha256Hex } from "@app/tools/pdfTextEditor/util/sha256";

// The pure-JS SHA-256 fingerprints embedded font programs so the backend can
// match the EXACT subset font a charcode request targets.
describe("sha256Hex", () => {
  it("matches the FIPS 180-4 vectors", () => {
    expect(sha256Hex(new Uint8Array(0))).toBe(
      "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
    );
    expect(sha256Hex(new TextEncoder().encode("abc"))).toBe(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    );
    expect(
      sha256Hex(
        new TextEncoder().encode(
          "abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq",
        ),
      ),
    ).toBe("248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1");
  });

  it("agrees with node:crypto across block-boundary and large inputs", () => {
    // Deterministic pseudo-random bytes; lengths straddle the 64-byte block
    // size plus a large buffer like a real font program.
    const lengths = [1, 55, 56, 63, 64, 65, 127, 128, 1000, 70_000];
    for (const len of lengths) {
      const data = new Uint8Array(len);
      let seed = 0x12345678 ^ len;
      for (let i = 0; i < len; i++) {
        seed = (seed * 1103515245 + 12345) >>> 0;
        data[i] = seed & 0xff;
      }
      const expected = createHash("sha256").update(data).digest("hex");
      expect(sha256Hex(data), `length ${len}`).toBe(expected);
    }
  });
});
