import { useId, useMemo, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Card } from "@editor/ui/Card";
import { Icon, type IconName } from "@editor/ui/Icon";
import { InfoTooltip } from "@editor/ui/InfoTooltip";
import { SectionHeader } from "@editor/ui/SectionHeader";
import { Chip } from "@editor/ui/Chip";
import { ChecksRing } from "@editor/components/tools/checkAccessibility/ChecksRing";
import { AccessibilityIssueItem } from "@editor/components/tools/checkAccessibility/AccessibilityIssueItem";
import {
  basicLabel,
  basicTip,
  categoryLabel,
  categoryTip,
  checksLabel,
  figuresSummary,
  resultLabel,
  resultSummary,
} from "@editor/utils/accessibilityReportContent";
import type { AccessibilityReport } from "@editor/types/checkAccessibility";
import {
  assessAccessibilityReport,
  type AccessibilityBasicId,
  type AccessibilityCategoryId,
  type AccessibilityResult,
} from "@editor/utils/accessibilityAssessment";

const CATEGORY_ICON: Record<AccessibilityCategoryId, IconName> = {
  structure: "layers",
  altText: "image",
  language: "globe",
  metadata: "file-text",
  fonts: "type",
  links: "link",
};

const BASIC_ICON: Record<AccessibilityBasicId, IconName> = {
  tagged: "tags",
  title: "file-pen",
  displaysTitle: "eye",
  language: "globe",
  fonts: "type",
  declares: "shield-check",
  notEncrypted: "lock-open",
};

/** Every result word stacked in one cell, so each pill is as wide as the longest in any language. */
function ResultWord({ result }: { result: AccessibilityResult }) {
  const { t } = useTranslation();
  const words: Record<AccessibilityResult, string> = {
    pass: t("checkAccessibility.result.pass", "Pass"),
    partial: t("checkAccessibility.result.partial", "Partial"),
    fail: t("checkAccessibility.result.fail", "Fail"),
  };
  return (
    <span className="a11y-result-word">
      {(Object.keys(words) as AccessibilityResult[]).map((key) => (
        <span
          key={key}
          data-active={key === result}
          aria-hidden={key !== result}
        >
          {words[key]}
        </span>
      ))}
    </span>
  );
}

interface BreakdownRowProps {
  icon: IconName;
  label: string;
  tip: string;
  passes: boolean;
  /** Turns the label into a toggle for the details below the row. */
  toggle?: { open: boolean; controls: string; onToggle: () => void };
}

function BreakdownRow({ icon, label, tip, passes, toggle }: BreakdownRowProps) {
  const content: ReactNode = (
    <>
      <Icon name={icon} size={16} />
      <span className="a11y-breakdown__label">{label}</span>
    </>
  );
  return (
    <div className="a11y-area__row">
      {toggle ? (
        <button
          type="button"
          className="a11y-area__toggle a11y-area__toggle--button"
          aria-expanded={toggle.open}
          aria-controls={toggle.controls}
          onClick={toggle.onToggle}
        >
          <Icon
            name="chevron-down"
            size={16}
            strokeWidth={2}
            className="a11y-area__chevron"
          />
          {content}
        </button>
      ) : (
        <span className="a11y-area__toggle">
          <span className="a11y-area__chevron" />
          {content}
        </span>
      )}
      <InfoTooltip label={tip} />
      <Chip
        className="a11y-area__status"
        accent={passes ? "success" : "danger"}
        size="xs"
      >
        <ResultWord result={passes ? "pass" : "fail"} />
      </Chip>
    </div>
  );
}

interface AccessibilityReportViewProps {
  report: AccessibilityReport;
}

export function AccessibilityReportView({
  report,
}: AccessibilityReportViewProps) {
  const { t } = useTranslation();
  const { result, areas, basics, checks } = useMemo(
    () => assessAccessibilityReport(report),
    [report],
  );
  const [showLimits, setShowLimits] = useState(false);
  const [openAreas, setOpenAreas] = useState<
    ReadonlySet<AccessibilityCategoryId>
  >(() => new Set());
  const idPrefix = useId();
  const toggleArea = (id: AccessibilityCategoryId) =>
    setOpenAreas((current) => {
      const next = new Set(current);
      if (!next.delete(id)) next.add(id);
      return next;
    });
  const figures = figuresSummary(t, report);

  return (
    <div className="a11y-report" data-testid="a11y-report">
      <Card padding="default" className="a11y-hero">
        <ChecksRing
          passed={checks.passed}
          total={checks.total}
          result={result}
          label={checksLabel(t, checks)}
        />
        <div className="a11y-hero__text">
          <span className={`a11y-hero__result a11y-result--${result}`}>
            {resultLabel(t, result)}
          </span>
          <span className="a11y-hero__summary">{resultSummary(t, result)}</span>
          <span className="a11y-hero__sub">
            {t(
              "checkAccessibility.score.subtitle",
              "{{profile}} · {{count}} pages",
              { profile: report.profile, count: report.summary.pages },
            )}
            {" · "}
            {report.issues.length === 0
              ? t("checkAccessibility.score.noIssues", "No issues found")
              : t("checkAccessibility.score.issues", "{{count}} issues", {
                  count: report.issues.length,
                })}
          </span>
        </div>
      </Card>

      <section className="a11y-section">
        <SectionHeader
          title={t("checkAccessibility.sections.breakdown", "Breakdown")}
        />
        <ul className="a11y-breakdown">
          {areas.map((area) => {
            const passes = area.issues.length === 0;
            const note = area.id === "altText" ? figures : null;
            const open = openAreas.has(area.id);
            const bodyId = `${idPrefix}-area-${area.id}`;
            const expandable = !passes || note !== null;
            return (
              <li key={area.id} className="a11y-area">
                <BreakdownRow
                  icon={CATEGORY_ICON[area.id]}
                  label={categoryLabel(t, area.id)}
                  tip={categoryTip(t, area.id)}
                  passes={passes}
                  toggle={
                    expandable
                      ? {
                          open,
                          controls: bodyId,
                          onToggle: () => toggleArea(area.id),
                        }
                      : undefined
                  }
                />
                {expandable && (
                  <div
                    id={bodyId}
                    className="sui-collapsible__body"
                    data-open={open}
                    inert={!open}
                  >
                    <div className="sui-collapsible__body-inner a11y-area__body">
                      {!passes && (
                        <div className="a11y-issues">
                          {area.issues.map((issue) => (
                            <AccessibilityIssueItem
                              key={`${issue.clause}-${issue.testNumber}`}
                              issue={issue}
                            />
                          ))}
                        </div>
                      )}
                      {note && (
                        <p className="a11y-note a11y-inline">
                          <Icon name="image" size={14} />
                          {note}
                        </p>
                      )}
                    </div>
                  </div>
                )}
              </li>
            );
          })}
          {basics.map((basic) => (
            <li key={basic.id} className="a11y-area">
              <BreakdownRow
                icon={BASIC_ICON[basic.id]}
                label={basicLabel(t, basic.id)}
                tip={basicTip(t, basic.id)}
                passes={basic.ok}
              />
            </li>
          ))}
        </ul>
      </section>

      {report.humanChecks.length > 0 && (
        <section className="a11y-section">
          <SectionHeader
            title={t(
              "checkAccessibility.sections.limits",
              "What this tool can't check",
            )}
            collapsible
            expanded={showLimits}
            onToggle={() => setShowLimits((value) => !value)}
          />
          {showLimits && (
            <ul className="a11y-manual">
              {report.humanChecks.map((check) => (
                <li key={check}>
                  <Icon name="user-check" size={14} />
                  <span>{check}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
    </div>
  );
}
