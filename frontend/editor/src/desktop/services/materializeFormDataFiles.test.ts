import { describe, expect, test } from "vitest";
import { materializeFormDataFiles } from "@app/services/materializeFormDataFiles";

describe("materializeFormDataFiles", () => {
  test("rebuilds File entries as fresh in-memory Files and keeps scalars", async () => {
    const original = new File([new Uint8Array([1, 2, 3, 4])], "demo.p12", {
      type: "application/x-pkcs12",
    });
    const input = new FormData();
    input.append("certType", "PKCS12");
    input.append("p12File", original);
    input.append("showSignature", "true");

    const out = await materializeFormDataFiles(input);

    expect(out.get("certType")).toBe("PKCS12");
    expect(out.get("showSignature")).toBe("true");
    const rebuilt = out.get("p12File");
    expect(rebuilt).toBeInstanceOf(File);
    expect((rebuilt as File).name).toBe("demo.p12");
    expect((rebuilt as File).type).toBe("application/x-pkcs12");
    // Must be a different File instance (fresh backing store).
    expect(rebuilt).not.toBe(original);
    // Round-trip bytes (jsdom File sizing is unreliable; check content instead).
    const bytes = new Uint8Array(await (rebuilt as File).arrayBuffer());
    expect([...bytes.slice(0, 4)]).toEqual([1, 2, 3, 4]);
  });
});
