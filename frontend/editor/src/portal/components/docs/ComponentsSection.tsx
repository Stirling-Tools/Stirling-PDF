import { useTranslation } from "react-i18next";
import { Card, Chip, CodeBlock } from "@app/ui";
import type { EmbedComponent } from "@portal/api/docs";
import { DocsSection } from "@portal/components/docs/DocsSection";

export function ComponentsSection({
  components,
}: {
  components: EmbedComponent[];
}) {
  const { t } = useTranslation();
  return (
    <DocsSection
      id="component-library"
      eyebrow={t("portal.docs.components.eyebrow")}
      title={t("portal.docs.components.title")}
      lead={t("portal.docs.components.lead")}
    >
      <div className="portal-docs__component-grid">
        {components.map((c) => (
          <Card key={c.name} padding="default">
            <div className="portal-docs__component-head">
              <code className="portal-docs__component-name">{c.name}</code>
              <Chip tone="purple" size="sm">
                {c.tag}
              </Chip>
            </div>
            <p className="portal-docs__component-blurb">{c.blurb}</p>
          </Card>
        ))}
      </div>
      <CodeBlock
        lang="typescript"
        caption={t("portal.docs.components.codeCaption")}
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
