/**
 * Minimal reader for PostScript / PDF object syntax.
 *
 * Shared by the two Adobe migration importers, which both consume files
 * written in this syntax:
 * - Distiller `.joboptions` - a `<< … >> setdistillerparams` dictionary
 * - Acrobat `.fdf` form data - `1 0 obj << /FDF << … >> >> endobj`
 *
 * This is deliberately not a PDF parser: there is no xref, no stream
 * decoding and no indirect-reference resolution. It reads the object
 * *syntax* - dictionaries, arrays, names, strings, numbers - which is all
 * either format needs.
 *
 * Strings are returned as raw bytes widened to one char each (latin1), so
 * callers can detect a UTF-16 BOM and re-decode. Feed it latin1-decoded text
 * for byte fidelity.
 */

/** A PostScript/PDF name (`/Bicubic`), kept distinct from a `(string)`. */
export class PsName {
  constructor(public readonly name: string) {}
  toString(): string {
    return this.name;
  }
}

/**
 * A PDF indirect reference (`8 0 R`). Only FDF uses these; resolve them with
 * the `indirect` map from {@link readObjects}.
 */
export class PsRef {
  constructor(
    public readonly objectNumber: number,
    public readonly generation: number,
  ) {}
}

export type PsValue =
  | string
  | number
  | boolean
  | null
  | PsName
  | PsRef
  | PsValue[]
  | PsDict;

export interface PsDict {
  [key: string]: PsValue;
}

type Token =
  | { kind: "dictOpen" }
  | { kind: "dictClose" }
  | { kind: "arrayOpen" }
  | { kind: "arrayClose" }
  | { kind: "name"; value: string }
  | { kind: "string"; value: string }
  | { kind: "number"; value: number }
  | { kind: "boolean"; value: boolean }
  | { kind: "null" }
  | { kind: "operator"; value: string };

const isWhitespace = (ch: string): boolean =>
  ch === " " ||
  ch === "\t" ||
  ch === "\r" ||
  ch === "\n" ||
  ch === "\f" ||
  ch === "\0";

const isDelimiter = (ch: string): boolean =>
  ch === "(" ||
  ch === ")" ||
  ch === "<" ||
  ch === ">" ||
  ch === "[" ||
  ch === "]" ||
  ch === "{" ||
  ch === "}" ||
  ch === "/" ||
  ch === "%";

/**
 * Read a `(...)` literal string, honouring nested parentheses and the
 * backslash escapes both PostScript and PDF allow (including `\ddd` octal).
 */
function readLiteralString(src: string, start: number): [string, number] {
  let depth = 1;
  let i = start;
  let out = "";
  while (i < src.length && depth > 0) {
    const ch = src[i];
    if (ch === "\\") {
      const next = src[i + 1];
      i += 2;
      switch (next) {
        case "n":
          out += "\n";
          break;
        case "r":
          out += "\r";
          break;
        case "t":
          out += "\t";
          break;
        case "b":
          out += "\b";
          break;
        case "f":
          out += "\f";
          break;
        case "(":
        case ")":
        case "\\":
          out += next;
          break;
        case "\n":
          break; // line continuation
        case "\r":
          if (src[i] === "\n") i++;
          break;
        default:
          if (next >= "0" && next <= "7") {
            let octal = next;
            while (octal.length < 3 && src[i] >= "0" && src[i] <= "7") {
              octal += src[i];
              i++;
            }
            out += String.fromCharCode(parseInt(octal, 8));
          } else {
            out += next ?? "";
          }
      }
      continue;
    }
    if (ch === "(") depth++;
    if (ch === ")") {
      depth--;
      if (depth === 0) {
        i++;
        break;
      }
    }
    out += ch;
    i++;
  }
  return [out, i];
}

/** Read a `<...>` hex string into its decoded bytes. */
function readHexString(src: string, start: number): [string, number] {
  let i = start;
  let hex = "";
  while (i < src.length && src[i] !== ">") {
    if (!isWhitespace(src[i])) hex += src[i];
    i++;
  }
  i++; // consume '>'
  // An odd digit count is padded with a trailing zero, per the PDF spec.
  if (hex.length % 2 === 1) hex += "0";
  let out = "";
  for (let j = 0; j + 1 < hex.length; j += 2) {
    const code = parseInt(hex.slice(j, j + 2), 16);
    if (!Number.isNaN(code)) out += String.fromCharCode(code);
  }
  return [out, i];
}

/**
 * `#XX` hex escapes are legal inside PDF names (`/A#20B` is "A B"). Harmless
 * to apply to PostScript names, which never contain `#`.
 */
const decodeNameEscapes = (raw: string): string =>
  raw.includes("#")
    ? raw.replace(/#([0-9a-fA-F]{2})/g, (_, hex) =>
        String.fromCharCode(parseInt(hex, 16)),
      )
    : raw;

function tokenize(src: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  while (i < src.length) {
    const ch = src[i];

    if (isWhitespace(ch)) {
      i++;
      continue;
    }

    // Comments run to end of line. `%!PS`, `%FDF-1.2` and `%%EOF` are all
    // just comments.
    if (ch === "%") {
      while (i < src.length && src[i] !== "\n" && src[i] !== "\r") i++;
      continue;
    }

    if (ch === "<" && src[i + 1] === "<") {
      tokens.push({ kind: "dictOpen" });
      i += 2;
      continue;
    }
    if (ch === ">" && src[i + 1] === ">") {
      tokens.push({ kind: "dictClose" });
      i += 2;
      continue;
    }
    if (ch === "<") {
      const [value, next] = readHexString(src, i + 1);
      tokens.push({ kind: "string", value });
      i = next;
      continue;
    }
    if (ch === "[") {
      tokens.push({ kind: "arrayOpen" });
      i++;
      continue;
    }
    if (ch === "]") {
      tokens.push({ kind: "arrayClose" });
      i++;
      continue;
    }
    if (ch === "(") {
      const [value, next] = readLiteralString(src, i + 1);
      tokens.push({ kind: "string", value });
      i = next;
      continue;
    }
    // Procedure braces carry no data; drop the delimiters and let the
    // contents tokenize as ordinary values.
    if (ch === "{" || ch === "}") {
      i++;
      continue;
    }
    if (ch === "/") {
      i++;
      let name = "";
      while (i < src.length && !isWhitespace(src[i]) && !isDelimiter(src[i])) {
        name += src[i];
        i++;
      }
      tokens.push({ kind: "name", value: decodeNameEscapes(name) });
      continue;
    }

    let word = "";
    while (i < src.length && !isWhitespace(src[i]) && !isDelimiter(src[i])) {
      word += src[i];
      i++;
    }
    if (word.length === 0) {
      i++; // unrecognised delimiter, e.g. a stray ')'
      continue;
    }
    if (word === "true" || word === "false") {
      tokens.push({ kind: "boolean", value: word === "true" });
    } else if (word === "null") {
      tokens.push({ kind: "null" });
      // Fractional digits sit inside the optional group so there is only
      // one way to split a digit run: linear, not quadratic.
    } else if (/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i.test(word)) {
      tokens.push({ kind: "number", value: Number(word) });
    } else {
      tokens.push({ kind: "operator", value: word });
    }
  }
  return tokens;
}

interface ParseCursor {
  index: number;
}

/**
 * Detect the `<num> <gen> R` indirect-reference triple. Without this, `8 0 R`
 * would read as the number 8 and the reference would be lost.
 */
function readReferenceAt(
  tokens: Token[],
  index: number,
): { ref: PsRef; next: number } | undefined {
  const first = tokens[index];
  const second = tokens[index + 1];
  const third = tokens[index + 2];
  if (
    first?.kind === "number" &&
    second?.kind === "number" &&
    third?.kind === "operator" &&
    third.value === "R"
  ) {
    return { ref: new PsRef(first.value, second.value), next: index + 3 };
  }
  return undefined;
}

function parseValue(tokens: Token[], cursor: ParseCursor): PsValue {
  const token = tokens[cursor.index];
  if (!token) return null;
  // A close token means the key had no value; leave it for the caller so the
  // enclosing dictionary/array still terminates correctly.
  if (token.kind === "dictClose" || token.kind === "arrayClose") return null;

  const reference = readReferenceAt(tokens, cursor.index);
  if (reference) {
    cursor.index = reference.next;
    return reference.ref;
  }

  cursor.index++;
  switch (token.kind) {
    case "dictOpen":
      return parseDict(tokens, cursor);
    case "arrayOpen": {
      const items: PsValue[] = [];
      while (cursor.index < tokens.length) {
        const next = tokens[cursor.index];
        if (!next) break;
        if (next.kind === "arrayClose") {
          cursor.index++;
          break;
        }
        if (next.kind === "dictClose") break; // malformed; let the dict close
        items.push(parseValue(tokens, cursor));
      }
      return items;
    }
    case "name":
      return new PsName(token.value);
    case "string":
      return token.value;
    case "number":
      return token.value;
    case "boolean":
      return token.value;
    case "null":
      return null;
    default:
      // A bare operator in value position (`R`, `obj`, …) is not data.
      return new PsName(token.value);
  }
}

/** Parse tokens positioned just after a `<<` up to the matching `>>`. */
function parseDict(tokens: Token[], cursor: ParseCursor): PsDict {
  const dict: PsDict = {};
  while (cursor.index < tokens.length) {
    const token = tokens[cursor.index];
    if (!token) break;
    if (token.kind === "dictClose") {
      cursor.index++;
      break;
    }
    if (token.kind !== "name") {
      // Skip anything that isn't a key - keeps a malformed file from
      // derailing the rest of the dictionary.
      cursor.index++;
      continue;
    }
    cursor.index++;
    dict[token.value] = parseValue(tokens, cursor);
  }
  return dict;
}

export interface PostScriptObjects {
  /**
   * Every dictionary not nested inside another dictionary or array, in file
   * order - so an FDF's `1 0 obj << … >>` body and its `trailer << … >>` each
   * yield one entry, and a `.joboptions` file usually yields exactly one.
   */
  topLevelDicts: PsDict[];
  /**
   * Bodies of `<num> <gen> obj … endobj` definitions, keyed by object number,
   * so {@link PsRef} values can be resolved.
   */
  indirect: Map<number, PsValue>;
}

/** Read every object in the source in a single tokenizing pass. */
export function readObjects(src: string): PostScriptObjects {
  const tokens = tokenize(src);
  const topLevelDicts: PsDict[] = [];
  const indirect = new Map<number, PsValue>();
  const cursor: ParseCursor = { index: 0 };

  while (cursor.index < tokens.length) {
    // `<num> <gen> obj` opens an indirect definition. Capture the number so
    // the body can be looked up, then let the body parse normally.
    const first = tokens[cursor.index];
    const second = tokens[cursor.index + 1];
    const third = tokens[cursor.index + 2];
    if (
      first?.kind === "number" &&
      second?.kind === "number" &&
      third?.kind === "operator" &&
      third.value === "obj"
    ) {
      cursor.index += 3;
      const body = parseValue(tokens, cursor);
      indirect.set(first.value, body);
      const bodyDict = psDict(body);
      if (bodyDict) topLevelDicts.push(bodyDict);
      continue;
    }

    cursor.index++;
    if (first.kind === "dictOpen") {
      topLevelDicts.push(parseDict(tokens, cursor));
    }
  }

  return { topLevelDicts, indirect };
}

/**
 * Convenience wrapper over {@link readObjects} for callers that only need the
 * dictionaries and have no indirect references to resolve.
 */
export function collectTopLevelDicts(src: string): PsDict[] {
  return readObjects(src).topLevelDicts;
}

// ---------------------------------------------------------------------------
// Typed accessors
// ---------------------------------------------------------------------------

export const psBoolean = (value: PsValue): boolean | undefined =>
  typeof value === "boolean" ? value : undefined;

export const psNumber = (value: PsValue): number | undefined =>
  typeof value === "number" && Number.isFinite(value) ? value : undefined;

/** Read a `/Name`, tolerating writers that quote it as a string. */
export const psName = (value: PsValue): string | undefined => {
  if (value instanceof PsName) return value.name;
  if (typeof value === "string") return value;
  return undefined;
};

export const psDict = (value: PsValue): PsDict | undefined =>
  value !== null &&
  typeof value === "object" &&
  !Array.isArray(value) &&
  !(value instanceof PsName) &&
  !(value instanceof PsRef)
    ? (value as PsDict)
    : undefined;

export const psArray = (value: PsValue): PsValue[] | undefined =>
  Array.isArray(value) ? value : undefined;
