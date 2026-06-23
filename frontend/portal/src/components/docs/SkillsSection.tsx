import { useTranslation } from "react-i18next";
import { Card } from "@shared/components";
import type { AgentSkill } from "@portal/api/docs";
import { DocsSection } from "@portal/components/docs/DocsSection";

export function SkillsSection({ skills }: { skills: AgentSkill[] }) {
  const { t } = useTranslation();
  return (
    <DocsSection
      id="skill-catalog"
      eyebrow={t("docs.skills.eyebrow")}
      title={t("docs.skills.title")}
      lead={t("docs.skills.lead")}
    >
      <div className="portal-docs__skill-grid">
        {skills.map((s) => (
          <Card key={s.name} padding="default" interactive>
            <div className="portal-docs__skill-head">
              <span className="portal-docs__skill-glyph" aria-hidden>
                ✷
              </span>
              <h3 className="portal-docs__skill-name">{s.name}</h3>
            </div>
            <p className="portal-docs__skill-blurb">{s.blurb}</p>
            <code className="portal-docs__skill-ops">{s.ops}</code>
          </Card>
        ))}
      </div>
    </DocsSection>
  );
}
