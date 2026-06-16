import { Button, Card, CodeBlock, StatusBadge } from "@shared/components";
import { TARGET_META, type DeploymentTarget } from "@portal/api/editorDeploy";
import { useTier } from "@portal/contexts/TierContext";

const STATE_BADGE: Record<
  DeploymentTarget["state"],
  { label: string; tone: "success" | "info" | "neutral" }
> = {
  running: { label: "Running", tone: "success" },
  available: { label: "Available", tone: "info" },
  locked: { label: "Locked", tone: "neutral" },
};

/** Upgrade-nudge copy for a target gated behind a higher tier. */
function lockCopy(target: DeploymentTarget): string {
  return target.requiresTier === "enterprise"
    ? "On-prem and Kubernetes self-hosting are part of Enterprise."
    : "Self-hosting with Docker and Kubernetes unlocks on a paid plan.";
}

interface Props {
  targets: DeploymentTarget[];
  /** Invoked from a locked target's upgrade nudge. */
  onUpgrade?: () => void;
}

/**
 * The three deployment targets (Managed Cloud / Docker / Kubernetes). Unlocked
 * targets show their install/run snippet; locked ones swap it for an upgrade
 * nudge so the value of the higher tier is visible inline.
 */
export function DeploymentTargets({ targets, onUpgrade }: Props) {
  const { tier } = useTier();

  return (
    <div className="portal-editor__targets">
      {targets.map((t) => {
        const meta = TARGET_META[t.kind];
        const badge = STATE_BADGE[t.state];
        const locked = t.state === "locked";
        return (
          <Card
            key={t.kind}
            padding="default"
            className="portal-editor__target"
          >
            <div className="portal-editor__target-head">
              <span
                className={`portal-editor__target-icon portal-editor__target-icon--${meta.tone}`}
                aria-hidden
              >
                {meta.icon}
              </span>
              <div className="portal-editor__target-titles">
                <h3 className="portal-editor__target-name">{t.label}</h3>
                <p className="portal-editor__target-tagline">{t.tagline}</p>
              </div>
              <StatusBadge
                tone={badge.tone}
                size="sm"
                pulse={t.state === "running"}
              >
                {badge.label}
              </StatusBadge>
            </div>

            {t.state === "running" && (
              <p className="portal-editor__target-meta">
                v{t.runningVersion} · {t.instanceCount}{" "}
                {t.instanceCount === 1 ? "instance" : "instances"}
              </p>
            )}

            {locked ? (
              <div className="portal-editor__lock">
                <p className="portal-editor__lock-copy">{lockCopy(t)}</p>
                <Button
                  size="sm"
                  variant="outline"
                  accent={t.requiresTier === "enterprise" ? "purple" : "blue"}
                  onClick={onUpgrade}
                  disabled={tier === "enterprise"}
                >
                  {t.requiresTier === "enterprise"
                    ? "Talk to sales"
                    : "Upgrade plan"}
                </Button>
              </div>
            ) : (
              <CodeBlock
                code={t.snippet}
                lang={t.snippetLang}
                caption={t.label}
                maxHeight={180}
              />
            )}
          </Card>
        );
      })}
    </div>
  );
}
