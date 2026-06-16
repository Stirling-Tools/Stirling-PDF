import { useState } from "react";
import { Button, CodeBlock, Tabs, type TabItem } from "@shared/components";
import type { CodeSnippet, SnippetLang } from "@portal/api/gettingStarted";

/**
 * Step 3 — go live. Reveals the sandbox API key and copy-paste snippets in
 * Python / Node / cURL behind a language tab switch, plus the final CTA.
 *
 * The key is masked until the user reveals it, matching how production secrets
 * are surfaced elsewhere — it's a sandbox key, but the affordance is the habit
 * we want developers to keep.
 */
export interface GoLivePanelProps {
  sampleKey: string;
  snippets: CodeSnippet[];
  /** Fired by the "Go to dashboard" CTA. */
  onDone: () => void;
}

function maskKey(key: string): string {
  const tail = key.slice(-4);
  return `${key.slice(0, 8)}${"•".repeat(12)}${tail}`;
}

export function GoLivePanel({ sampleKey, snippets, onDone }: GoLivePanelProps) {
  const [revealed, setRevealed] = useState(false);
  const [copied, setCopied] = useState(false);
  const [lang, setLang] = useState<SnippetLang>(snippets[0]?.lang ?? "python");

  const current = snippets.find((s) => s.lang === lang) ?? snippets[0];
  const items: TabItem<SnippetLang>[] = snippets.map((s) => ({
    key: s.lang,
    label: s.label,
  }));

  async function copyKey() {
    try {
      await navigator.clipboard.writeText(sampleKey);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Non-secure contexts — silently fall through.
    }
  }

  return (
    <div className="portal-gs__golive">
      <div className="portal-gs__key">
        <span className="portal-gs__key-label">Your sandbox API key</span>
        <code className="portal-gs__key-value">
          {revealed ? sampleKey : maskKey(sampleKey)}
        </code>
        <div className="portal-gs__key-actions">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setRevealed((r) => !r)}
          >
            {revealed ? "Hide" : "Reveal"}
          </Button>
          <Button variant="outline" size="sm" onClick={copyKey}>
            {copied ? "Copied" : "Copy key"}
          </Button>
        </div>
      </div>

      <div className="portal-gs__snippet">
        <Tabs
          items={items}
          activeKey={lang}
          onChange={setLang}
          ariaLabel="Snippet language"
        />
        {current && (
          <CodeBlock
            code={current.code}
            lang={current.lang === "node" ? "javascript" : current.lang}
            caption={`first-request.${
              current.lang === "python"
                ? "py"
                : current.lang === "node"
                  ? "ts"
                  : "sh"
            }`}
          />
        )}
      </div>

      <div className="portal-gs__golive-foot">
        <Button
          variant="gradient"
          onClick={onDone}
          trailingIcon={<span aria-hidden>→</span>}
        >
          Done — go to dashboard
        </Button>
      </div>
    </div>
  );
}
