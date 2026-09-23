/**
 * Minimal content-stream tokeniser.
 *
 * Just enough structure to find operators and their operands, treating
 * strings, dictionaries and arrays as opaque single tokens so a `(` inside a
 * text string can never be mistaken for syntax.
 */

const WHITESPACE = new Set([" ", "\t", "\r", "\n", "\f", "\0"]);
const DELIMITER = new Set(["(", ")", "<", ">", "[", "]", "{", "}", "/", "%"]);

export interface ContentToken {
  text: string;
  start: number;
  end: number;
}

export interface ContentOp {
  /** Operator name, e.g. `Tj`, `cm`, `sh`. */
  op: string;
  operands: string[];
  /** Byte offset of the first operand (or the operator when it has none). */
  start: number;
  /** Byte offset one past the operator. */
  end: number;
}

/**
 * Hand-scanned rather than regex-driven: PDF literal strings nest their
 * parentheses, which no regular expression can follow, and getting that
 * wrong turns the rest of a stream into nonsense.
 */
export function tokenize(content: string): ContentToken[] {
  const out: ContentToken[] = [];
  let i = 0;
  while (i < content.length) {
    const ch = content[i];
    if (WHITESPACE.has(ch)) {
      i += 1;
      continue;
    }
    const start = i;
    if (ch === "%") {
      while (i < content.length && content[i] !== "\n" && content[i] !== "\r") {
        i += 1;
      }
      continue;
    }
    if (ch === "(") {
      i += 1;
      let depth = 1;
      while (i < content.length && depth > 0) {
        const c = content[i];
        if (c === "\\") {
          i += 2;
          continue;
        }
        if (c === "(") depth += 1;
        else if (c === ")") depth -= 1;
        i += 1;
      }
    } else if (ch === "<" && content[i + 1] === "<") {
      i += 2;
    } else if (ch === ">" && content[i + 1] === ">") {
      i += 2;
    } else if (ch === "<") {
      const close = content.indexOf(">", i);
      i = close < 0 ? content.length : close + 1;
    } else if (ch === "/") {
      i += 1;
      while (
        i < content.length &&
        !WHITESPACE.has(content[i]) &&
        !DELIMITER.has(content[i])
      ) {
        i += 1;
      }
    } else if (DELIMITER.has(ch)) {
      i += 1;
    } else {
      while (
        i < content.length &&
        !WHITESPACE.has(content[i]) &&
        !DELIMITER.has(content[i])
      ) {
        i += 1;
      }
    }
    out.push({ text: content.slice(start, i), start, end: i });
  }
  return out;
}

const IS_OPERATOR = /^[A-Za-z'"][A-Za-z0-9*'"]*$/;
const NON_OPERATOR = new Set(["true", "false", "null", "R"]);

/** Group tokens into operator invocations. */
export function parseOps(content: string): ContentOp[] {
  const tokens = tokenize(content);
  const ops: ContentOp[] = [];
  let operands: string[] = [];
  let operandStart = -1;
  let inlineImage = false;
  for (const t of tokens) {
    // Inline images carry raw binary between ID and EI that must not be
    // lexed at all.
    if (inlineImage) {
      if (t.text !== "EI") continue;
      inlineImage = false;
      ops.push({ op: "EI", operands: [], start: t.start, end: t.end });
      operands = [];
      operandStart = -1;
      continue;
    }
    if (IS_OPERATOR.test(t.text) && !NON_OPERATOR.has(t.text)) {
      ops.push({
        op: t.text,
        operands,
        start: operandStart < 0 ? t.start : operandStart,
        end: t.end,
      });
      if (t.text === "BI" || t.text === "ID") inlineImage = true;
      operands = [];
      operandStart = -1;
      continue;
    }
    if (operandStart < 0) operandStart = t.start;
    operands.push(t.text);
  }
  return ops;
}

/** Operators that show text. */
export const TEXT_SHOWING = new Set(["Tj", "TJ", "'", '"']);

/** Path-painting operators, all of which also end the current path. */
export const PATH_PAINTING = new Set([
  "S",
  "s",
  "f",
  "F",
  "f*",
  "B",
  "B*",
  "b",
  "b*",
  "n",
]);

/** Path construction operators. */
export const PATH_CONSTRUCTION = new Set(["m", "l", "c", "v", "y", "h", "re"]);

/** Operators that only mutate graphics state. */
export const STATE_ONLY = new Set([
  "q",
  "Q",
  "cm",
  "gs",
  "w",
  "J",
  "j",
  "M",
  "d",
  "ri",
  "i",
  "cs",
  "CS",
  "sc",
  "scn",
  "SC",
  "SCN",
  "g",
  "G",
  "rg",
  "RG",
  "k",
  "K",
  "W",
  "W*",
]);
