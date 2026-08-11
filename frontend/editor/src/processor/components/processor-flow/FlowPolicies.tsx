import { type RefObject } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@app/ui";
import { policyCategoryIcon } from "@app/components/policies/policyCategoryIcon";
import type { FlowPolicy } from "@processor/api/processorFlow";

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
    <div className="processor-pf__policies" ref={coreRef}>
      <div className="processor-pf__policies-head">
        <span>{t("processor.processorFlow.policies.heading")}</span>
        <span className="processor-pf__policies-active">
          {t("processor.processorFlow.policies.activeCount", {
            n: activeCount,
          })}
        </span>
      </div>
      {policies.map((policy) => (
        <div
          key={policy.key}
          className={
            "processor-pf__policy processor-pf__policy--" + policy.state
          }
        >
          <div
            className="processor-pf__policy-line"
            ref={(el: HTMLDivElement | null) => {
              if (el) laneRefs.current[policy.key] = el;
              else delete laneRefs.current[policy.key];
            }}
          >
            <span className="processor-pf__policy-icon" aria-hidden>
              {policyCategoryIcon(policy.key, { fontSize: "1.125rem" })}
            </span>
            <span className="processor-pf__policy-label">
              {t(policy.labelKey)}
            </span>
            {policy.state === "active" ? (
              <span className="processor-pf__policy-count">
                {t("processor.processorFlow.policies.count", {
                  n: policy.runs24h,
                })}
              </span>
            ) : policy.state === "off" ? (
              <Button
                size="sm"
                px="sm"
                py="xs"
                fontSize="xs"
                variant="secondary"
                className="processor-pf__setup"
                onClick={() => onSetup(policy.key)}
              >
                {t("processor.processorFlow.policies.setUp")}
              </Button>
            ) : (
              <span className="processor-pf__policy-soon">
                {t("processor.processorFlow.policies.soon")}
              </span>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
