import { type RefObject } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@app/ui";
import LocalIcon from "@app/components/shared/LocalIcon";
import type { FlowPolicy } from "@portal/api/processorFlow";
import { ICON_SIZE } from "@portal/components/processor-flow/flowTypes";

interface FlowPoliciesProps {
  policies: FlowPolicy[];
  activeCount: number;
  /** Ref for the core card (measured as the particle waist). */
  coreRef: RefObject<HTMLDivElement | null>;
  /** Per-policy lane-line refs, keyed by policy id, for particle threading. */
  laneRefs: RefObject<Record<string, HTMLElement>>;
  /** Deep-link into that policy's setup wizard. */
  onSetup: (key: string) => void;
}

/** Centre column: the standing-policy catalogue — the particle "waist". */
export function FlowPolicies({
  policies,
  activeCount,
  coreRef,
  laneRefs,
  onSetup,
}: FlowPoliciesProps) {
  const { t } = useTranslation();
  return (
    <div className="portal-pf__policies" ref={coreRef}>
      <div className="portal-pf__policies-head">
        <span>{t("portal.processorFlow.policies.heading")}</span>
        <span className="portal-pf__policies-active">
          {t("portal.processorFlow.policies.activeCount", { n: activeCount })}
        </span>
      </div>
      {policies.map((policy) => (
        <div
          key={policy.key}
          className={"portal-pf__policy portal-pf__policy--" + policy.state}
        >
          <div
            className="portal-pf__policy-line"
            ref={(el: HTMLDivElement | null) => {
              if (el) laneRefs.current[policy.key] = el;
              else delete laneRefs.current[policy.key];
            }}
          >
            <span className="portal-pf__policy-icon" aria-hidden>
              <LocalIcon icon={policy.icon} width={ICON_SIZE} />
            </span>
            <span className="portal-pf__policy-label">
              {t(policy.labelKey)}
            </span>
            {policy.state === "active" ? (
              <span className="portal-pf__policy-count">
                {t("portal.processorFlow.policies.count", {
                  n: policy.runs24h,
                })}
              </span>
            ) : policy.state === "off" ? (
              <Button
                size="sm"
                py="xs"
                variant="primary"
                className="portal-pf__setup"
                onClick={() => onSetup(policy.key)}
              >
                {t("portal.processorFlow.policies.setUp")}
              </Button>
            ) : (
              <span className="portal-pf__policy-soon">
                {t("portal.processorFlow.policies.soon")}
              </span>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
