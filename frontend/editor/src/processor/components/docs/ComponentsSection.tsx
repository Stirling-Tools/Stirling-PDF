import { useTranslation } from "react-i18next";
import { Card, Chip, CodeBlock } from "@app/ui";
import type { EmbedComponent } from "@processor/api/docs";
import { DocsSection } from "@processor/components/docs/DocsSection";

export function ComponentsSection({
  components,
}: {
  components: EmbedComponent[];
}) {
  const { t } = useTranslation();
  return (
    <DocsSection
      id="component-library"
      eyebrow={t("processor.docs.components.eyebrow")}
      title={t("processor.docs.components.title")}
      lead={t("processor.docs.components.lead")}
    >
      <div className="processor-docs__component-grid">
        {components.map((c) => (
          <Card key={c.name} padding="default">
            <div className="processor-docs__component-head">
              <code className="processor-docs__component-name">{c.name}</code>
              <Chip accent="premium" size="sm">
                {c.tag}
              </Chip>
            </div>
            <p className="processor-docs__component-blurb">{c.blurb}</p>
          </Card>
        ))}
      </div>
      <CodeBlock
        lang="typescript"
        caption={t("processor.docs.components.codeCaption")}
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
