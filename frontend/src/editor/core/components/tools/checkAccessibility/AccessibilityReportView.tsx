import { useId, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Card } from "@editor/ui/Card";
import { Icon, type IconName } from "@editor/ui/Icon";
import { InfoTooltip } from "@editor/ui/InfoTooltip";
import { ProgressBar } from "@editor/ui/ProgressBar";
import { SectionHeader } from "@editor/ui/SectionHeader";
import { Chip } from "@editor/ui/Chip";
import { AccessibilityIssueItem } from "@editor/components/tools/checkAccessibility/AccessibilityIssueItem";
import {
  categoryLabel,
  categoryTip,
  documentBasics,
  figuresSummary,
  resultLabel,
  resultSummary,
} from "@editor/utils/accessibilityReportContent";
import type { AccessibilityReport } from "@editor/types/checkAccessibility";
import {
  assessAccessibilityReport,
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

const RESULT_ICON: Record<AccessibilityResult, IconName> = {
  pass: "circle-check",
  partial: "circle-alert",
  fail: "circle-x",
};

interface AccessibilityReportViewProps {
  report: AccessibilityReport;
}

export function AccessibilityReportView({
  report,
}: AccessibilityReportViewProps) {
  const { t } = useTranslation();
  const { result, areas } = useMemo(
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

  const basics = documentBasics(t, report);
  const basicsMet = basics.filter((fact) => fact.ok).length;
  const figures = figuresSummary(t, report);

  return (
    <div className="a11y-report" data-testid="a11y-report">
      <Card padding="default" className="a11y-hero">
        <Icon
          name={RESULT_ICON[result]}
          size={40}
          className={`a11y-result a11y-result--${result}`}
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
          title={t("checkAccessibility.sections.basics", "Document basics")}
        />
        <ul className="a11y-basics">
          {basics.map((fact) => (
            <li key={fact.label} className="a11y-fact">
              <Icon
                name={fact.ok ? "circle-check" : "circle-x"}
                size={16}
                style={{
                  color: fact.ok ? "var(--c-success)" : "var(--c-danger)",
                }}
                title={
                  fact.ok
                    ? t("checkAccessibility.result.pass", "Pass")
                    : t("checkAccessibility.result.fail", "Fail")
                }
              />
              <span>{fact.label}</span>
            </li>
          ))}
          <li className="a11y-basics__progress">
            <span className="a11y-note">
              {t("checkAccessibility.basics.met", "{{met}} of {{total}} met", {
                met: basicsMet,
                total: basics.length,
              })}
            </span>
            <ProgressBar
              value={basicsMet / basics.length}
              height={4}
              color={
                basicsMet === basics.length
                  ? "var(--c-success)"
                  : "var(--c-warning)"
              }
              label={t("checkAccessibility.sections.basics", "Document basics")}
            />
          </li>
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
            const label = (
              <>
                <Icon name={CATEGORY_ICON[area.id]} size={16} />
                <span className="a11y-breakdown__label">
                  {categoryLabel(t, area.id)}
                </span>
              </>
            );
            return (
              <li key={area.id} className="a11y-area">
                <div className="a11y-area__row">
                  {passes && !note ? (
                    <span className="a11y-area__toggle">
                      <span className="a11y-area__chevron" />
                      {label}
                    </span>
                  ) : (
                    <button
                      type="button"
                      className="a11y-area__toggle a11y-area__toggle--button"
                      aria-expanded={open}
                      aria-controls={bodyId}
                      onClick={() => toggleArea(area.id)}
                    >
                      <Icon
                        name="chevron-down"
                        size={16}
                        strokeWidth={2}
                        className="a11y-area__chevron"
                      />
                      {label}
                    </button>
                  )}
                  <InfoTooltip label={categoryTip(t, area.id)} />
                  <Chip
                    className="a11y-area__status"
                    accent={passes ? "success" : "danger"}
                    size="xs"
                  >
                    {passes
                      ? t("checkAccessibility.result.pass", "Pass")
                      : t("checkAccessibility.result.fail", "Fail")}
                  </Chip>
                </div>
                {(!passes || note) && (
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
        </ul>
      </section>
    </div>
  );
}
