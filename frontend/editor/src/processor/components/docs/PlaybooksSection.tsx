import { useTranslation } from "react-i18next";
import { Button, Card, Chip } from "@app/ui";
import type { Playbook } from "@processor/api/docs";
import { DocsSection } from "@processor/components/docs/DocsSection";

export function PlaybooksSection({ playbooks }: { playbooks: Playbook[] }) {
  const { t } = useTranslation();
  return (
    <DocsSection
      id="recipes"
      eyebrow={t("processor.docs.recipes.eyebrow")}
      title={t("processor.docs.recipes.title")}
      lead={t("processor.docs.recipes.lead")}
    >
      <div className="processor-docs__playbook-grid">
        {playbooks.map((p) => (
          <Card key={p.title} accent={p.accent} padding="loose" interactive>
            <h2 className="processor-docs__playbook-title">{p.title}</h2>
            <p className="processor-docs__playbook-blurb">{p.blurb}</p>
            <div className="processor-docs__playbook-flow">
              {p.steps.map((step, i) => (
                <span key={step} className="processor-docs__playbook-step">
                  <Chip size="sm" accent="neutral">
                    {step}
                  </Chip>
                  {i < p.steps.length - 1 && (
                    <span
                      className="processor-docs__playbook-arrow"
                      aria-hidden
                    >
                      →
                    </span>
                  )}
                </span>
              ))}
            </div>
            {/* TODO(backend): POST /v1/pipelines/clone-from-playbook to seed a
                draft pipeline from this recipe, then route to the composer. */}
            <Button variant="secondary" accent={p.accent} size="sm">
              {t("processor.docs.recipes.cloneButton")}
            </Button>
          </Card>
        ))}
      </div>
    </DocsSection>
  );
}
