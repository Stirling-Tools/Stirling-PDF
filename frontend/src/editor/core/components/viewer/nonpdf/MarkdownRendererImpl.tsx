import React, { useState } from "react";
import ReactMarkdown from "react-markdown";
import type { Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import { useTranslation } from "react-i18next";
import { Button } from "@editor/ui/Button";

// The rendered page is a white sheet in both schemes, so syntax surfaces use
// fixed light values instead of Mantine gray tokens that flip in dark mode.
const SHEET_SURFACE = "#f1f3f5";
const SHEET_BORDER = "#dee2e6";
const SHEET_INK = "#212529";
const SHEET_MUTED = "#495057";

function CopyButton({ text }: { text: string }) {
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);
  return (
    <Button
      variant="tertiary"
      onClick={() =>
        navigator.clipboard.writeText(text).then(() => {
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        })
      }
      style={{
        position: "absolute",
        top: 8,
        right: 8,
        background: copied ? "#ebfbee" : "#ffffff",
        border: `1px solid ${SHEET_BORDER}`,
        borderRadius: 3,
        cursor: "pointer",
        fontSize: "0.7em",
        padding: "2px 8px",
        color: copied ? "#1b5e20" : SHEET_MUTED,
      }}
    >
      {copied
        ? `✓ ${t("viewer.nonPdf.copied", "Copied")}`
        : t("common.copy", "Copy")}
    </Button>
  );
}

const components: Components = {
  pre: ({ children }) => {
    const codeText = React.isValidElement(children)
      ? String((children.props as { children?: unknown }).children ?? "")
      : String(children ?? "");
    return (
      <div style={{ position: "relative", margin: "8px 0" }}>
        <pre
          style={{
            background: SHEET_SURFACE,
            color: SHEET_INK,
            padding: "10px 52px 10px 14px",
            borderRadius: 4,
            overflowX: "auto",
            fontSize: "0.85em",
            margin: 0,
          }}
        >
          {children}
        </pre>
        <CopyButton text={codeText} />
      </div>
    );
  },
  table: ({ children }) => (
    <div style={{ overflowX: "auto", margin: "10px 0" }}>
      <table
        style={{
          borderCollapse: "collapse",
          width: "100%",
          fontSize: "0.85em",
        }}
      >
        {children}
      </table>
    </div>
  ),
  th: ({ children, style }) => (
    <th
      style={{
        border: `1px solid ${SHEET_BORDER}`,
        padding: "6px 10px",
        background: SHEET_SURFACE,
        color: SHEET_INK,
        textAlign: "left",
        fontWeight: 600,
        whiteSpace: "nowrap",
        ...style,
      }}
    >
      {children}
    </th>
  ),
  td: ({ children, style }) => (
    <td
      style={{
        border: `1px solid ${SHEET_BORDER}`,
        padding: "5px 10px",
        ...style,
      }}
    >
      {children}
    </td>
  ),
};

/** The actual react-markdown render; loaded on demand by MarkdownRenderer. */
export default function MarkdownRendererImpl({ content }: { content: string }) {
  return (
    <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
      {content}
    </ReactMarkdown>
  );
}
