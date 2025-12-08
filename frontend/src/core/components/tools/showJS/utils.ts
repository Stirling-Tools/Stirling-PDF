export type ShowJsTokenType = "kw" | "str" | "num" | "com" | "plain";
export type ShowJsToken = { type: ShowJsTokenType; text: string };

const JS_KEYWORDS = new Set([
  "break",
  "case",
  "catch",
  "class",
  "const",
  "continue",
  "debugger",
  "default",
  "delete",
  "do",
  "else",
  "export",
  "extends",
  "finally",
  "for",
  "function",
  "if",
  "import",
  "in",
  "instanceof",
  "let",
  "new",
  "return",
  "super",
  "switch",
  "this",
  "throw",
  "try",
  "typeof",
  "var",
  "void",
  "while",
  "with",
  "yield",
  "await",
  "of",
]);

export function tokenizeToLines(src: string, keywords: Set<string> = JS_KEYWORDS): ShowJsToken[][] {
  const lines: ShowJsToken[][] = [];
  let current: ShowJsToken[] = [];
  let i = 0;
  let inBlockCom = false;
  let inLineCom = false;
  let inString: '"' | "'" | "`" | null = null;
  let escaped = false;

  const push = (type: ShowJsTokenType, s: string) => {
    if (s) {
      current.push({ type, text: s });
    }
  };

  // Named actions for readability
  const advance = (n: number = 1) => {
    i += n;
  };
  const handleNewline = () => {
    lines.push(current);
    current = [];
    inLineCom = false;
    advance();
  };
  const handleInLineCommentChar = (ch: string) => {
    push("com", ch);
    advance();
  };
  const handleBlockCommentEnd = () => {
    push("com", "*/");
    inBlockCom = false;
    advance(2);
  };
  const handleInBlockCommentChar = (ch: string) => {
    push("com", ch);
    advance();
  };
  const handleInStringChar = (ch: string) => {
    push("str", ch);
    if (!escaped) {
      const isEscape = ch === "\\";
      const isStringClose = ch === inString;
      if (isEscape) {
        escaped = true;
      } else if (isStringClose) {
        inString = null;
      }
    } else {
      escaped = false;
    }
    advance();
  };
  const startLineComment = () => {
    push("com", "//");
    inLineCom = true;
    advance(2);
  };
  const startBlockComment = () => {
    push("com", "/*");
    inBlockCom = true;
    advance(2);
  };
  const startString = (ch: '"' | "'" | "`") => {
    inString = ch;
    push("str", ch);
    advance();
  };
  const pushNumberToken = () => {
    let j = i + 1;
    const isNumberContinuation = (c: string) => /[0-9._xobA-Fa-f]/.test(c);
    while (j < src.length && isNumberContinuation(src[j])) {
      j++;
    }
    push("num", src.slice(i, j));
    i = j;
  };
  const pushIdentifierToken = () => {
    let j = i + 1;
    const isIdentContinuation = (c: string) => /[A-Za-z0-9_$]/.test(c);
    while (j < src.length && isIdentContinuation(src[j])) {
      j++;
    }
    const id = src.slice(i, j);
    const isKeyword = keywords.has(id);
    push(isKeyword ? "kw" : "plain", id);
    i = j;
  };
  const pushPlainChar = (ch: string) => {
    push("plain", ch);
    advance();
  };

  while (i < src.length) {
    const ch = src[i];
    const next = src[i + 1];

    // Named conditions
    const isNewline = ch === "\n";
    const isLineCommentStart = ch === "/" && next === "/";
    const isBlockCommentStart = ch === "/" && next === "*";
    const isStringDelimiter = ch === "'" || ch === '"' || ch === "`";
    const isDigit = /[0-9]/.test(ch);
    const isIdentifierStart = /[A-Za-z_$]/.test(ch);

    if (isNewline) {
      handleNewline();
      continue;
    }

    if (inLineCom) {
      handleInLineCommentChar(ch);
      continue;
    }

    if (inBlockCom) {
      const isBlockCommentEnd = ch === "*" && next === "/";
      if (isBlockCommentEnd) {
        handleBlockCommentEnd();
        continue;
      }
      handleInBlockCommentChar(ch);
      continue;
    }

    if (inString) {
      handleInStringChar(ch);
      continue;
    }

    if (isLineCommentStart) {
      startLineComment();
      continue;
    }

    if (isBlockCommentStart) {
      startBlockComment();
      continue;
    }

    if (isStringDelimiter) {
      startString(ch as '"' | "'" | "`");
      continue;
    }

    if (isDigit) {
      pushNumberToken();
      continue;
    }

    if (isIdentifierStart) {
      pushIdentifierToken();
      continue;
    }

    pushPlainChar(ch);
  }

  lines.push(current);
  return lines;
}

export function computeBlocks(src: string): Array<{ start: number; end: number }> {
  const res: Array<{ start: number; end: number }> = [];
  let i = 0;
  let line = 0;
  let inBlock = false;
  let inLine = false;
  let str: '"' | "'" | "`" | null = null;
  let esc = false;
  const stack: number[] = [];

  // Actions
  const advance = (n: number = 1) => {
    i += n;
  };
  const handleNewline = () => {
    line++;
    inLine = false;
    advance();
  };
  const startLineComment = () => {
    inLine = true;
    advance(2);
  };
  const startBlockComment = () => {
    inBlock = true;
    advance(2);
  };
  const endBlockComment = () => {
    inBlock = false;
    advance(2);
  };
  const startString = (delim: '"' | "'" | "`") => {
    str = delim;
    advance();
  };
  const handleStringChar = (ch: string) => {
    if (!esc) {
      const isEscape = ch === "\\";
      const isClose = ch === str;
      if (isEscape) {
        esc = true;
      } else if (isClose) {
        str = null;
      }
    } else {
      esc = false;
    }
    advance();
  };
  const pushOpenBrace = () => {
    stack.push(line);
    advance();
  };
  const handleCloseBrace = () => {
    const s = stack.pop();
    if (s != null && line > s) {
      res.push({ start: s, end: line });
    }
    advance();
  };

  while (i < src.length) {
    const ch = src[i];
    const nx = src[i + 1];

    // Conditions
    const isNewline = ch === "\n";
    const isLineCommentStart = ch === "/" && nx === "/";
    const isBlockCommentStart = ch === "/" && nx === "*";
    const isBlockCommentEnd = ch === "*" && nx === "/";
    const isStringDelimiter = ch === "'" || ch === '"' || ch === "`";
    const isOpenBrace = ch === "{";
    const isCloseBrace = ch === "}";

    if (isNewline) {
      handleNewline();
      continue;
    }
    if (inLine) {
      advance();
      continue;
    }
    if (inBlock) {
      if (isBlockCommentEnd) {
        endBlockComment();
      } else {
        advance();
      }
      continue;
    }
    if (str) {
      handleStringChar(ch);
      continue;
    }
    if (isLineCommentStart) {
      startLineComment();
      continue;
    }
    if (isBlockCommentStart) {
      startBlockComment();
      continue;
    }
    if (isStringDelimiter) {
      startString(ch as '"' | "'" | "`");
      continue;
    }
    if (isOpenBrace) {
      pushOpenBrace();
      continue;
    }
    if (isCloseBrace) {
      handleCloseBrace();
      continue;
    }
    advance();
  }
  return res;
}

export function computeSearchMatches(
  lines: ShowJsToken[][],
  query: string,
): Array<{ line: number; start: number; end: number }> {
  if (!query) {
    return [];
  }
  const q = query.toLowerCase();
  const list: Array<{ line: number; start: number; end: number }> = [];
  lines.forEach((toks, ln) => {
    const raw = toks.map((t) => t.text).join("");
    let idx = 0;
    while (true) {
      const pos = raw.toLowerCase().indexOf(q, idx);
      if (pos === -1) {
        break;
      }
      list.push({
        line: ln,
        start: pos,
        end: pos + q.length,
      });
      idx = pos + Math.max(1, q.length);
    }
  });
  return list;
}

export async function copyTextToClipboard(text: string, fallbackElement?: HTMLElement | null): Promise<boolean> {
  try {
    if (typeof navigator !== "undefined" && navigator.clipboard) {
      await navigator.clipboard.writeText(text || "");
      return true;
    }
  } catch {
    // fall through to fallback
  }
  if (typeof document === "undefined" || !fallbackElement) return false;
  const selection = window.getSelection();
  const range = document.createRange();
  range.selectNodeContents(fallbackElement);
  selection?.removeAllRanges();
  selection?.addRange(range);
  try {
    document.execCommand("copy");
    return true;
  } finally {
    selection?.removeAllRanges();
  }
}

export function triggerDownload(url: string, filename: string): void {
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}
