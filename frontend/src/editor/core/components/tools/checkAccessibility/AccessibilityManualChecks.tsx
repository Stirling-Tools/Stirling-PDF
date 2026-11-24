import { useId, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@editor/ui/Button";
import { Checkbox } from "@editor/ui/Checkbox";
import { Chip } from "@editor/ui/Chip";
import { SectionHeader } from "@editor/ui/SectionHeader";

interface AccessibilityManualChecksProps {
  checks: string[];
  /** Indexes into `checks` the user has ticked. */
  ticked: ReadonlySet<number>;
  onToggle: (index: number) => void;
  /** Ticks every check, or clears them all when `done` is false. */
  onSetAll: (done: boolean) => void;
}

/** The checks only a person can make, collapsed until asked for; the ticks go into the downloaded report. */
export function AccessibilityManualChecks({
  checks,
  ticked,
  onToggle,
  onSetAll,
}: AccessibilityManualChecksProps) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const bodyId = useId();
  const allDone = ticked.size === checks.length;
  return (
    <section
      className="a11y-section a11y-manual-checks"
      data-testid="a11y-manual-checks"
    >
      <SectionHeader
        title={t("checkAccessibility.manual.title", "Manual checks")}
        count={
          <span className="a11y-manual__status">
            {`${ticked.size}/${checks.length}`}
            <Chip
              accent={allDone ? "success" : "warning"}
              size="xs"
              data-testid="a11y-manual-status"
            >
              {allDone
                ? t("checkAccessibility.manual.done", "Done")
                : t("checkAccessibility.manual.inProgress", "In progress")}
            </Chip>
          </span>
        }
        collapsible
        expanded={open}
        onToggle={() => setOpen((value) => !value)}
        controls={bodyId}
      />
      <div
        id={bodyId}
        className="sui-collapsible__body"
        data-open={open}
        inert={!open}
      >
        <div className="sui-collapsible__body-inner a11y-manual__body">
          <p className="a11y-note">
            {t(
              "checkAccessibility.manual.tip",
              "Things only a person can judge, such as reading order and whether image descriptions make sense. Tick each one once you've checked it, and your ticks go into the downloaded report.",
            )}
          </p>
          <ul className="a11y-manual">
            {checks.map((check, index) => (
              <li key={check}>
                <Checkbox
                  label={check}
                  checked={ticked.has(index)}
                  onChange={() => onToggle(index)}
                />
              </li>
            ))}
          </ul>
          <Button
            className="a11y-manual__all"
            variant="secondary"
            size="sm"
            onClick={() => onSetAll(!allDone)}
          >
            {allDone
              ? t("checkAccessibility.manual.clearAll", "Clear all")
              : t("checkAccessibility.manual.markAllDone", "Mark all as done")}
          </Button>
        </div>
      </div>
    </section>
  );
}
