import { useTranslation } from "react-i18next";
import { Button, Card, Chip } from "@shared/components";
import type { Playbook } from "@portal/api/docs";
import { DocsSection } from "@portal/components/docs/DocsSection";

export function PlaybooksSection({ playbooks }: { playbooks: Playbook[] }) {
  const { t } = useTranslation();
  return (
    <DocsSection
      id="recipes"
      eyebrow={t("docs.recipes.eyebrow")}
      title={t("docs.recipes.title")}
      lead={t("docs.recipes.lead")}
    >
      <div className="portal-docs__playbook-grid">
        {playbooks.map((p) => (
          <Card key={p.title} accent={p.accent} padding="loose" interactive>
            <h3 className="portal-docs__playbook-title">{p.title}</h3>
            <p className="portal-docs__playbook-blurb">{p.blurb}</p>
            <div className="portal-docs__playbook-flow">
              {p.steps.map((step, i) => (
                <span key={step} className="portal-docs__playbook-step">
                  <Chip size="sm" tone="neutral">
                    {step}
                  </Chip>
                  {i < p.steps.length - 1 && (
                    <span className="portal-docs__playbook-arrow" aria-hidden>
                      →
                    </span>
                  )}
                </span>
              ))}
            </div>
            {/* TODO(backend): POST /v1/pipelines/clone-from-playbook to seed a
                draft pipeline from this recipe, then route to the composer. */}
            <Button variant="outline" accent={p.accent} size="sm">
              {t("docs.recipes.cloneButton")}
            </Button>
          </Card>
        ))}
      </div>
    </DocsSection>
  );
}
