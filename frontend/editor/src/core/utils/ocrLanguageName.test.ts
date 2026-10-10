import { describe, expect, it } from "vitest";
import { ocrLanguageName } from "@app/utils/ocrLanguageName";

const old = (name: string) => `${name} (antiguo)`;

describe("ocrLanguageName", () => {
  it.each([
    ["spa", "Español"],
    ["cat", "Catalán"],
    ["fra", "Francés"],
    ["afr", "Afrikáans"],
    ["chi_sim", "Chino simplificado"],
  ])("names %s in the app's language", (code, name) => {
    expect(ocrLanguageName(code, "es-ES", old)).toBe(name);
  });

  it("marks the historic models as such", () => {
    expect(ocrLanguageName("spa_old", "es-ES", old)).toBe("Español (antiguo)");
  });

  it("leaves a code the platform cannot name to the caller", () => {
    expect(ocrLanguageName("osd", "es-ES", old)).toBeNull();
  });
});
