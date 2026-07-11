import { isValidElement, useState } from "react";
import ReactMarkdown, {
  defaultUrlTransform,
  type Components,
} from "react-markdown";
import remarkGfm from "remark-gfm";
import { Button } from "@app/ui";

// Keep our internal `doc:` scheme; sanitize every other URL as react-markdown
// would by default (it strips unknown protocols, which would kill doc: links).
function urlTransform(url: string): string {
  return url.startsWith("doc:") ? url : defaultUrlTransform(url);
}

/**
 * Renders a doc's normalised markdown. Internal cross-doc links carry the
 * `doc:` scheme (see the sync transform) and are intercepted here so they
 * navigate within the portal instead of leaving the app.
 */

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <Button
      variant="tertiary"
      size="sm"
      className="portal-docs__md-copy"
      onClick={() =>
        void navigator.clipboard.writeText(text).then(() => {
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        })
      }
    >
      {copied ? "✓ Copied" : "Copy"}
    </Button>
  );
}

function buildComponents(onNavigate: (docId: string) => void): Components {
  return {
    a: ({ href, children }) => {
      if (href?.startsWith("doc:")) {
        const id = href.slice(4);
        return (
          <a
            href={`#${id}`}
            onClick={(e) => {
              e.preventDefault();
              onNavigate(id);
            }}
          >
            {children}
          </a>
        );
      }
      const external = /^https?:/i.test(href ?? "");
      return (
        <a
          href={href}
          target={external ? "_blank" : undefined}
          rel={external ? "noopener noreferrer" : undefined}
        >
          {children}
        </a>
      );
    },
    img: ({ node: _node, ...props }) => (
      <img {...props} loading="lazy" className="portal-docs__md-img" />
    ),
    pre: ({ children }) => {
      const code = isValidElement(children)
        ? String(
            (children.props as { children?: unknown }).children ?? "",
          ).replace(/\n$/, "")
        : String(children ?? "");
      return (
        <div className="portal-docs__md-pre">
          <pre>{children}</pre>
          <CopyButton text={code} />
        </div>
      );
    },
    table: ({ children }) => (
      <div className="portal-docs__md-tablewrap">
        <table>{children}</table>
      </div>
    ),
  };
}

export function MarkdownDoc({
  markdown,
  onNavigate,
}: {
  markdown: string;
  onNavigate: (docId: string) => void;
}) {
  return (
    <div className="portal-docs__md">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        urlTransform={urlTransform}
        components={buildComponents(onNavigate)}
      >
        {markdown}
      </ReactMarkdown>
    </div>
  );
}
