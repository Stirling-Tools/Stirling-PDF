import { useState, type ReactNode } from "react";
import { Button } from "@app/ui/Button";
import "@app/ui/CodeBlock.css";

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
  code: string;
  /** Shown in the chrome bar. Syntax highlighting is not included — wire Shiki/Prism at the call site. */
  lang?: CodeLang;
  /** Caption in the chrome bar (e.g. a file path). */
  caption?: ReactNode;
  /** Defaults to true. */
  copyable?: boolean;
  /** Longer content scrolls vertically. */
  maxHeight?: number;
  className?: string;
}

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
          <Button
            variant="tertiary"
            shape="circle"
            className="sui-code__copy"
            onClick={copy}
            aria-label="Copy code"
          >
            {copied ? "Copied" : "Copy"}
          </Button>
        )}
      </div>
      <pre className="sui-code__pre" style={{ maxHeight }}>
        <code>{code}</code>
      </pre>
    </div>
  );
}
