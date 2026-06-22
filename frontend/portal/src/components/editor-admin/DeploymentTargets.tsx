import { useTranslation } from "react-i18next";
import { Button, Card, CodeBlock, StatusBadge } from "@shared/components";
import { TARGET_META, type DeploymentTarget } from "@portal/api/editorDeploy";
import { useTier } from "@portal/contexts/TierContext";

const STATE_BADGE_TONE: Record<
  DeploymentTarget["state"],
  "success" | "info" | "neutral"
> = {
  running: "success",
  available: "info",
  locked: "neutral",
};

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
  const { t } = useTranslation();
  const { tier } = useTier();

  const lockCopy = (target: DeploymentTarget): string =>
    target.requiresTier === "enterprise"
      ? t("editorAdmin.targets.lock.enterprise")
      : t("editorAdmin.targets.lock.paid");

  return (
    <div className="portal-editor__targets">
      {targets.map((target) => {
        const meta = TARGET_META[target.kind];
        const locked = target.state === "locked";
        return (
          <Card
            key={target.kind}
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
                <h3 className="portal-editor__target-name">{target.label}</h3>
                <p className="portal-editor__target-tagline">
                  {target.tagline}
                </p>
              </div>
              <StatusBadge
                tone={STATE_BADGE_TONE[target.state]}
                size="sm"
                pulse={target.state === "running"}
              >
                {t(`editorAdmin.targets.state.${target.state}`)}
              </StatusBadge>
            </div>

            {target.state === "running" && (
              <p className="portal-editor__target-meta">
                v{target.runningVersion} ·{" "}
                {t("editorAdmin.targets.instanceCount", {
                  count: target.instanceCount,
                })}
              </p>
            )}

            {locked ? (
              <div className="portal-editor__lock">
                <p className="portal-editor__lock-copy">{lockCopy(target)}</p>
                <Button
                  size="sm"
                  variant="outline"
                  accent={
                    target.requiresTier === "enterprise" ? "purple" : "blue"
                  }
                  onClick={onUpgrade}
                  disabled={tier === "enterprise"}
                >
                  {target.requiresTier === "enterprise"
                    ? t("editorAdmin.targets.talkToSales")
                    : t("editorAdmin.targets.upgradePlan")}
                </Button>
              </div>
            ) : (
              <CodeBlock
                code={target.snippet}
                lang={target.snippetLang}
                caption={target.label}
                maxHeight={180}
              />
            )}
          </Card>
        );
      })}
    </div>
  );
}
