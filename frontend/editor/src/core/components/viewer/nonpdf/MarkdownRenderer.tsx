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
        background: copied ? "var(--color-green-100)" : "var(--bg-muted)",
        border: "1px solid var(--border-default)",
        borderRadius: 3,
        cursor: "pointer",
        fontSize: "0.7em",
        padding: "2px 8px",
        color: copied ? "var(--color-green-700)" : "var(--text-secondary)",
      }}
    >
      {copied ? "✓ Copied" : "Copy"}
    </button>
  );
}

const components: Components = {
  h1: ({ children }) => (
    <h1
      style={{
        color: "var(--text-primary)",
        borderBottom: "1px solid var(--border-default)",
        paddingBottom: "0.3em",
        marginTop: "1.2em",
        marginBottom: "0.6em",
      }}
    >
      {children}
    </h1>
  ),
  h2: ({ children }) => (
    <h2
      style={{
        color: "var(--text-primary)",
        borderBottom: "1px solid var(--border-subtle)",
        paddingBottom: "0.2em",
        marginTop: "1.1em",
        marginBottom: "0.5em",
      }}
    >
      {children}
    </h2>
  ),
  h3: ({ children }) => (
    <h3
      style={{
        color: "var(--text-primary)",
        marginTop: "1em",
        marginBottom: "0.4em",
      }}
    >
      {children}
    </h3>
  ),
  h4: ({ children }) => (
    <h4
      style={{
        color: "var(--text-primary)",
        marginTop: "0.8em",
        marginBottom: "0.3em",
      }}
    >
      {children}
    </h4>
  ),
  h5: ({ children }) => (
    <h5
      style={{
        color: "var(--text-secondary)",
        marginTop: "0.8em",
        marginBottom: "0.3em",
      }}
    >
      {children}
    </h5>
  ),
  h6: ({ children }) => (
    <h6
      style={{
        color: "var(--text-muted)",
        marginTop: "0.8em",
        marginBottom: "0.3em",
      }}
    >
      {children}
    </h6>
  ),
  p: ({ children }) => (
    <p
      style={{
        color: "var(--text-primary)",
        lineHeight: 1.7,
        marginBottom: "0.75em",
      }}
    >
      {children}
    </p>
  ),
  a: ({ children, href }) => (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      style={{
        color: "var(--accent-interactive)",
        textDecoration: "underline",
      }}
    >
      {children}
    </a>
  ),
  strong: ({ children }) => (
    <strong style={{ color: "var(--text-primary)", fontWeight: 600 }}>
      {children}
    </strong>
  ),
  em: ({ children }) => (
    <em style={{ color: "var(--text-secondary)" }}>{children}</em>
  ),
  blockquote: ({ children }) => (
    <blockquote
      style={{
        borderLeft: "3px solid var(--border-strong)",
        margin: "0.75em 0",
        padding: "4px 16px",
        color: "var(--text-secondary)",
        background: "var(--bg-muted)",
        borderRadius: "0 4px 4px 0",
      }}
    >
      {children}
    </blockquote>
  ),
  hr: () => (
    <hr
      style={{
        border: "none",
        borderTop: "1px solid var(--border-default)",
        margin: "1.2em 0",
      }}
    />
  ),
  ul: ({ children }) => (
    <ul
      style={{
        color: "var(--text-primary)",
        paddingLeft: "1.5em",
        marginBottom: "0.75em",
      }}
    >
      {children}
    </ul>
  ),
  ol: ({ children }) => (
    <ol
      style={{
        color: "var(--text-primary)",
        paddingLeft: "1.5em",
        marginBottom: "0.75em",
      }}
    >
      {children}
    </ol>
  ),
  li: ({ children }) => (
    <li
      style={{
        color: "var(--text-primary)",
        lineHeight: 1.6,
        marginBottom: "0.2em",
      }}
    >
      {children}
    </li>
  ),
  code: ({ children, className }) => {
    const isBlock = className?.startsWith("language-");
    if (isBlock) return <code className={className}>{children}</code>;
    return (
      <code
        style={{
          background: "var(--bg-muted)",
          color: "var(--code-kw-color)",
          border: "1px solid var(--border-subtle)",
          borderRadius: 3,
          padding: "1px 5px",
          fontSize: "0.85em",
          fontFamily: "monospace",
        }}
      >
        {children}
      </code>
    );
  },
  pre: ({ children }) => {
    const codeText = React.isValidElement(children)
      ? String((children.props as { children?: unknown }).children ?? "")
      : String(children ?? "");
    return (
      <div style={{ position: "relative", margin: "8px 0" }}>
        <pre
          style={{
            background: "var(--bg-muted)",
            color: "var(--text-primary)",
            border: "1px solid var(--border-default)",
            padding: "10px 52px 10px 14px",
            borderRadius: 4,
            overflowX: "auto",
            fontSize: "0.85em",
            margin: 0,
            fontFamily: "monospace",
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
          color: "var(--text-primary)",
        }}
      >
        {children}
      </table>
    </div>
  ),
  thead: ({ children }) => (
    <thead style={{ background: "var(--bg-muted)" }}>{children}</thead>
  ),
  tbody: ({ children }) => <tbody>{children}</tbody>,
  tr: ({ children }) => (
    <tr
      style={{
        borderBottom: "1px solid var(--border-default)",
      }}
    >
      {children}
    </tr>
  ),
  th: ({ children, style }) => (
    <th
      style={{
        border: "1px solid var(--border-default)",
        padding: "6px 10px",
        background: "var(--bg-raised)",
        color: "var(--text-primary)",
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
        border: "1px solid var(--border-default)",
        padding: "5px 10px",
        color: "var(--text-primary)",
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
