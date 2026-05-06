import React, { useState } from "react";
import ReactMarkdown from "react-markdown";
import type { Components } from "react-markdown";
import remarkGfm from "remark-gfm";

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
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
        background: copied
          ? "var(--mantine-color-green-0)"
          : "var(--mantine-color-gray-0)",
        border: "1px solid var(--mantine-color-gray-3)",
        borderRadius: 3,
        cursor: "pointer",
        fontSize: "0.7em",
        padding: "2px 8px",
        color: copied
          ? "var(--mantine-color-green-7)"
          : "var(--mantine-color-gray-7)",
      }}
    >
      {copied ? "✓ Copied" : "Copy"}
    </button>
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
            background: "var(--mantine-color-gray-1)",
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
        border: "1px solid var(--mantine-color-gray-3)",
        padding: "6px 10px",
        background: "var(--mantine-color-gray-1)",
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
        border: "1px solid var(--mantine-color-gray-3)",
        padding: "5px 10px",
        ...style,
      }}
    >
      {children}
    </td>
  ),
};

export function renderMarkdown(content: string): React.ReactNode[] {
  return [
    <ReactMarkdown key="md" remarkPlugins={[remarkGfm]} components={components}>
      {content}
    </ReactMarkdown>,
  ];
}
