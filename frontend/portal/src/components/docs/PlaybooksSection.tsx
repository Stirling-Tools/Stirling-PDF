import { Button, Card, Chip } from "@shared/components";
import type { ButtonAccent } from "@shared/components/Button";
import type { Playbook } from "@portal/api/docs";
import { DocsSection } from "@portal/components/docs/DocsSection";

/** Playbook palette accents mapped onto the button's accent set. */
const BUTTON_ACCENT: Record<Playbook["accent"], ButtonAccent> = {
  blue: "neutral",
  purple: "neutral",
  green: "success",
};

export function PlaybooksSection({ playbooks }: { playbooks: Playbook[] }) {
  return (
    <DocsSection
      id="recipes"
      eyebrow="PLAYBOOKS"
      title="Recipes"
      lead="End-to-end patterns that chain sources, operations, and destinations. Each maps to a pipeline you can clone."
    >
      <div className="portal-docs__playbook-grid">
        {playbooks.map((p) => (
          <Card key={p.title} accent={p.accent} padding="loose" interactive>
            <h3 className="portal-docs__playbook-title">{p.title}</h3>
            <p className="portal-docs__playbook-blurb">{p.blurb}</p>
            <div className="portal-docs__playbook-flow">
              {p.steps.map((step, i) => (
                <span key={step} className="portal-docs__playbook-step">
                  <Chip size="sm" accent="neutral">
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
            <Button
              variant="outlined"
              accent={BUTTON_ACCENT[p.accent]}
              size="sm"
            >
              Clone recipe
            </Button>
          </Card>
        ))}
      </div>
    </DocsSection>
  );
}
