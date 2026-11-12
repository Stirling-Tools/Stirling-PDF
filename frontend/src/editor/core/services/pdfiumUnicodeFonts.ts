import { getFontBaseUrl } from "@editor/services/fontBaseUrl";

/**
 * Noto faces for characters the standard PDF fonts cannot encode, served from /fonts. Text is not
 * shaped, so right-to-left order, Arabic joining and Indic conjuncts come out in basic forms.
 */

/** WinAnsiEncoding's characters above Latin-1, which the standard fonts can also draw. */
const WIN_ANSI_EXTRAS = new Set(
  Array.from("€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ", (char) => char.codePointAt(0)!),
);

export function isWinAnsi(char: string): boolean {
  const code = char.codePointAt(0)!;
  return (
    (code >= 0x20 && code <= 0x7e) ||
    (code >= 0xa0 && code <= 0xff) ||
    code === 0x09 ||
    code === 0x0a ||
    WIN_ANSI_EXTRAS.has(code)
  );
}

const SCRIPT_FACES: ReadonlyArray<{ file: string; script: RegExp }> = [
  {
    file: "NotoSansArabic-Regular.ttf",
    script: /[؀-ۿݐ-ݿࢠ-ࣿﭐ-﷿ﹰ-﻿]/u,
  },
  { file: "NotoSansHebrew-Regular.ttf", script: /[֐-׿יִ-ﭏ]/u },
  { file: "NotoSansThai-Regular.ttf", script: /[฀-๿]/u },
  { file: "NotoSansDevanagari-Regular.ttf", script: /[ऀ-ॿ]/u },
  { file: "NotoSansMalayalam-Regular.ttf", script: /[ഀ-ൿ]/u },
  { file: "NotoSerifTibetan-Regular.ttf", script: /[ༀ-࿿]/u },
  {
    file: "NotoSansKR-Regular.ttf",
    script: /[ᄀ-ᇿ㄰-㆏가-힯]/u,
  },
  { file: "NotoSansJP-Regular.ttf", script: /[぀-ヿ]/u },
];

const HAN = /[⺀-⿿　-〿㐀-䶿一-鿿豈-﫿＀-￯]/u;

/**
 * The face for Chinese characters, which each language draws differently. Japanese is the default:
 * the Simplified Chinese face is variable and renders at its thinnest weight.
 */
export function hanFaceFor(language: string): string {
  const lower = language.toLowerCase();
  if (lower === "zh-tw" || lower === "zh-hk") return "NotoSansTC-Regular.ttf";
  if (lower.startsWith("zh")) return "NotoSansSC-Regular.ttf";
  if (lower.startsWith("ko")) return "NotoSansKR-Regular.ttf";
  return "NotoSansJP-Regular.ttf";
}

/** The face file for a character the standard fonts cannot draw. */
export function faceFileFor(
  char: string,
  bold: boolean,
  hanFile: string,
): string {
  for (const { file, script } of SCRIPT_FACES) {
    if (script.test(char)) return file;
  }
  if (HAN.test(char)) return hanFile;
  return bold ? "NotoSans-Bold.ttf" : "NotoSans-Regular.ttf";
}

/** Every face file `text` needs, in either weight. */
export function faceFilesFor(text: string, hanFile: string): Set<string> {
  const files = new Set<string>();
  for (const char of text) {
    if (isWinAnsi(char)) continue;
    files.add(faceFileFor(char, false, hanFile));
    files.add(faceFileFor(char, true, hanFile));
  }
  return files;
}

const fontBytes = new Map<string, Promise<Uint8Array | null>>();

/** Fetches a face once per session; null when the server does not have it. */
export function fetchFaceBytes(file: string): Promise<Uint8Array | null> {
  const cached = fontBytes.get(file);
  if (cached) return cached;
  const request = fetch(`${getFontBaseUrl()}/${file}`)
    .then(async (response) =>
      response.ok ? new Uint8Array(await response.arrayBuffer()) : null,
    )
    .catch(() => null)
    .then((bytes) => {
      // A failed fetch is retried next time rather than disabling the face for the session.
      if (!bytes) fontBytes.delete(file);
      return bytes;
    });
  fontBytes.set(file, request);
  return request;
}

const registeredFamilies = new Map<string, Promise<void>>();

/**
 * Registers the face with the page so canvas measures text in it, and returns its CSS family.
 * Measurement falls back to the default sans-serif where FontFace is unavailable.
 */
export async function registerFaceForMeasuring(
  file: string,
  bytes: Uint8Array,
): Promise<string> {
  const family = `stirling-pdf-${file.replace(/\.ttf$/, "")}`;
  if (typeof FontFace === "undefined" || typeof document === "undefined") {
    return family;
  }
  let registered = registeredFamilies.get(family);
  if (!registered) {
    const face = new FontFace(family, bytes.slice().buffer);
    registered = face.load().then((loaded) => {
      document.fonts.add(loaded);
    });
    registeredFamilies.set(family, registered);
  }
  await registered.catch(() => undefined);
  return family;
}
