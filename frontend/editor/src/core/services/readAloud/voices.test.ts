import { describe, expect, it } from "vitest";

import {
  baseLanguage,
  groupVoicesByLanguage,
  languageDisplayName,
  resolveVoiceForLanguage,
  voiceMatchesLanguage,
  voicesForLanguage,
} from "@app/services/readAloud/voices";

function voice(
  name: string,
  lang: string,
  options: Partial<SpeechSynthesisVoice> = {},
): SpeechSynthesisVoice {
  return {
    name,
    lang,
    voiceURI: `${name}-${lang}`,
    localService: true,
    default: false,
    ...options,
  };
}

const VOICES = [
  voice("Samantha", "en-US", { default: true }),
  voice("Daniel", "en-GB"),
  voice("Mónica", "es-ES", { default: true }),
  voice("Paulina", "es-MX"),
  voice("Amélie", "fr-FR", { default: true }),
  voice("Ting-Ting", "zh-CN", { default: true }),
  voice("Mei-Jia", "zh-TW"),
  voice("Kyoko", "ja-JP", { default: true }),
];

describe("baseLanguage", () => {
  it.each([
    ["en-US", "en"],
    ["pt_BR", "pt"],
    ["zh-Hant-TW", "zh"],
  ])("normalizes %s", (tag, expected) => {
    expect(baseLanguage(tag)).toBe(expected);
  });
});

describe("voiceMatchesLanguage", () => {
  it("matches the base language and its aliases", () => {
    expect(voiceMatchesLanguage(voice("x", "es-MX"), "es")).toBe(true);
    expect(voiceMatchesLanguage(voice("x", "nb-NO"), "no")).toBe(true);
    expect(voiceMatchesLanguage(voice("x", "en-US"), "es")).toBe(false);
  });
});

describe("resolveVoiceForLanguage", () => {
  it("prefers the reader's region when it has a voice", () => {
    expect(
      resolveVoiceForLanguage("en", VOICES, undefined, "en-GB")?.lang,
    ).toBe("en-GB");
  });

  it("honours an explicit voice choice", () => {
    expect(resolveVoiceForLanguage("es", VOICES, "Paulina-es-MX")?.name).toBe(
      "Paulina",
    );
  });

  it("returns null rather than borrowing an English voice", () => {
    expect(resolveVoiceForLanguage("de", VOICES)).toBeNull();
  });
});

describe("voicesForLanguage", () => {
  it("lists only that language, default voice first", () => {
    const voices = voicesForLanguage("es", VOICES);
    expect(voices.map((item) => item.name)).toEqual(["Mónica", "Paulina"]);
  });
});

describe("groupVoicesByLanguage", () => {
  it("groups and labels languages that have a voice", () => {
    const groups = groupVoicesByLanguage(VOICES, "en-US");
    // Localized labels sort alphabetically: Chinese, English, French, Japanese, Spanish.
    expect(groups.map((group) => group.value)).toEqual([
      "zh",
      "en",
      "fr",
      "ja",
      "es",
    ]);
    expect(groups.find((group) => group.value === "es")?.label).toBe("Spanish");
  });
});

describe("languageDisplayName", () => {
  it("translates a code with the reader's UI language", () => {
    expect(languageDisplayName("es", "en-US")).toBe("Spanish");
  });

  it("falls back to the code when Intl cannot name it", () => {
    expect(languageDisplayName("zz", "en-US")).toBe("ZZ");
  });
});
