import { Card, Chip, CodeBlock } from "@shared/components";
import type { EmbedComponent } from "@portal/api/docs";
import { DocsSection } from "@portal/components/docs/DocsSection";

export function ComponentsSection({
  components,
}: {
  components: EmbedComponent[];
}) {
  return (
    <DocsSection
      id="component-library"
      eyebrow="COMPONENTS"
      title="Drop-in viewers"
      lead="Embeddable UI for review queues and document inspection. Bring your own styles or use the shipped theme."
    >
      <div className="portal-docs__component-grid">
        {components.map((c) => (
          <Card key={c.name} padding="default">
            <div className="portal-docs__component-head">
              <code className="portal-docs__component-name">{c.name}</code>
              <Chip accent="purple" size="sm">
                {c.tag}
              </Chip>
            </div>
            <p className="portal-docs__component-blurb">{c.blurb}</p>
          </Card>
        ))}
      </div>
      <CodeBlock
        lang="typescript"
        caption="embed the viewer"
        code={`import { DocumentViewer } from "@stirling/react";

<DocumentViewer
  documentId={doc.id}
  endpoint="/v1/invoice"
  onFieldEdit={(field, value) => save(field, value)}
/>`}
      />
    </DocsSection>
  );
}
