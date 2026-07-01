import { useState } from "react";
import { CodeBlock, Tabs, type TabItem } from "@shared/components";
import type { CodeSample } from "@portal/api/docs";

/** Tabbed multi-language snippet; CodeBlock owns per-language copy. */
export function LangSnippet({
  samples,
  caption,
}: {
  samples: CodeSample[];
  caption?: string;
}) {
  const [active, setActive] = useState(samples[0]?.key ?? "");
  const current = samples.find((s) => s.key === active) ?? samples[0];
  const items: TabItem<string>[] = samples.map((s) => ({
    key: s.key,
    label: s.label,
  }));
  return (
    <div className="portal-docs__snippet">
      <Tabs items={items} activeKey={active} onChange={setActive} />
      {current && (
        <CodeBlock code={current.code} lang={current.lang} caption={caption} />
      )}
    </div>
  );
}
