import { Card } from "@shared/components";
import type { AgentSkill } from "@portal/api/docs";
import { DocsSection } from "@portal/components/docs/DocsSection";

export function SkillsSection({ skills }: { skills: AgentSkill[] }) {
  return (
    <DocsSection
      id="skill-catalog"
      eyebrow="SKILLS"
      title="Agent skills"
      lead="Bundled, named capabilities your agent invokes as a single tool. Each skill is a deterministic op chain with evals attached."
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
