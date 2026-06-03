import { useState, type ReactNode } from "react";
import "@shared/components/CodeBlock.css";

export type CodeLang =
  | "json"
  | "javascript"
  | "typescript"
  | "python"
  | "bash"
  | "curl"
  | "http"
  | "plain";

export interface CodeBlockProps {
  /** The code content. */
  code: string;
  /** Language label shown in the chrome bar. Highlight wiring is out of scope here — bring Shiki/Prism. */
  lang?: CodeLang;
  /** Optional caption text shown in the chrome bar (e.g. a file path). */
  caption?: ReactNode;
  /** Show a copy-to-clipboard button. Defaults to true. */
  copyable?: boolean;
  /** Max height in pixels; longer content scrolls. */
  maxHeight?: number;
  className?: string;
}

/**
 * Always-dark code block, matched to the prototype's CODE palette.
 *
 * Highlighting is intentionally not wired here — drop in Shiki at the call
 * site and feed pre-highlighted HTML through `dangerouslySetInnerHTML` on a
 * fork of this component if you need it. For most surfaces the raw
 * monospaced text plus copy button is sufficient (and ~80% lighter).
 */
export function CodeBlock({
  code,
  lang = "plain",
  caption,
  copyable = true,
  maxHeight = 400,
  className,
}: CodeBlockProps) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Older browsers / non-secure contexts — silently fall through.
    }
  }

  return (
    <div className={["sui-code", className ?? ""].filter(Boolean).join(" ")}>
      <div className="sui-code__chrome">
        <span className="sui-code__dots" aria-hidden>
          <span />
          <span />
          <span />
        </span>
        {caption && <span className="sui-code__caption">{caption}</span>}
        <span className="sui-code__lang">{lang}</span>
        {copyable && (
          <button
            type="button"
            className="sui-code__copy"
            onClick={copy}
            aria-label="Copy code"
          >
            {copied ? "Copied" : "Copy"}
          </button>
        )}
      </div>
      <pre className="sui-code__pre" style={{ maxHeight }}>
        <code>{code}</code>
      </pre>
    </div>
  );
}
