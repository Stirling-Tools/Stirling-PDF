import { type RefObject } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@app/ui";
import type { FlowOutcome } from "@portal/api/processorFlow";
import { OutcomeIcon } from "@portal/components/processor-flow/FlowIcons";

interface FlowOutcomesProps {
  outcomes: FlowOutcome[];
  /** One ref slot per outcome, in order, for geometry measurement. */
  outRefs: RefObject<(HTMLElement | null)[]>;
  onOpen: () => void;
}

/** Right column: terminal audit outcomes (delivered / failed). */
export function FlowOutcomes({ outcomes, outRefs, onOpen }: FlowOutcomesProps) {
  const { t } = useTranslation();
  return (
    <section
      className="portal-pf__col portal-pf__col--outcomes"
      aria-label={t("portal.processorFlow.outcomes.heading")}
    >
      <span className="portal-pf__col-head">
        {t("portal.processorFlow.outcomes.heading")}
      </span>
      {outcomes.map((outcome, j) => (
        <Button
          key={outcome.key}
          variant="quiet"
          justify="start"
          fullWidth
          px="sm"
          py="sm"
          className={
            "portal-pf__node portal-pf__node--outcome portal-pf__node--" +
            outcome.key
          }
          onClick={onOpen}
          ref={(el: HTMLButtonElement | null) => {
            outRefs.current[j] = el;
          }}
          leftSection={
            <span className="portal-pf__node-icon" aria-hidden>
              <OutcomeIcon outcome={outcome.key} />
            </span>
          }
        >
          <span className="portal-pf__node-text">
            <strong>{t(outcome.labelKey)}</strong>
            <span>
              {t("portal.processorFlow.outcomes.count", {
                n: outcome.count24h,
              })}
            </span>
          </span>
        </Button>
      ))}
    </section>
  );
}
