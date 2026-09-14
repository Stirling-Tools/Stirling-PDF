/** The sweep, rendered in place of the workbench canvas with the rails either side.
 *  A takeover, not a registered view: unregistering an active view ejects mid-sweep. */

import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import CheckCircleRoundedIcon from "@mui/icons-material/CheckCircleRounded";
import CloseRoundedIcon from "@mui/icons-material/CloseRounded";
import { ActionIcon } from "@app/ui/ActionIcon";
import { Button } from "@app/ui/Button";
import { BrandMark } from "@app/components/shared/BrandMark";
import { readCachedCredits } from "@app/services/navFooterCache";
import { claimRun } from "@app/components/onboarding/classificationDemo/classificationDemoSession";
import { useClassificationDemo } from "@app/components/onboarding/classificationDemo/useClassificationDemo";
import type { ClassificationDemoViewData } from "@app/components/onboarding/classificationDemo/classificationDemoShared";
import {
  ClassificationDemoBreakdown,
  ClassificationDemoChart,
  useSliceColours,
} from "@app/components/onboarding/classificationDemo/ClassificationDemoChart";
import {
  CategoryTicker,
  FollowUpPanel,
  ProcessingHero,
  useProcessingLabel,
} from "@app/components/onboarding/classificationDemo/classificationDemoSlides";
import styles from "@app/components/onboarding/classificationDemo/classificationDemo.module.css";

export function ClassificationDemoWorkbenchView({
  data,
  onDone,
}: {
  data: ClassificationDemoViewData;
  /** Hands the canvas back. The only way out — see the file header. */
  onDone: () => void;
}) {
  const { t } = useTranslation();
  const trick = useClassificationDemo(true);
  // Re-read when a sweep settles, not once at mount: the first batch spends allowance, so
  // a mount-time snapshot would size the follow-up (and its copy) from credits already gone.
  const [credits, setCredits] = useState(readCachedCredits);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  // Claimed from the session, not a ref: a remount would reset a ref and run the same
  // sweep again from zero, re-reading and re-metering every document.
  useEffect(() => {
    if (!trick.directory) return;
    if (!claimRun(data.runToken)) return;
    setSelectedId(null);
    trick.start(data.limit);
  }, [data.runToken, data.limit, trick]);

  useEffect(() => {
    if (trick.status === "done") setCredits(readCachedCredits());
  }, [trick.status]);

  const processingLabel = useProcessingLabel(
    trick.progress.phase,
    trick.progress.processed,
    trick.progress.total,
  );

  const groups = trick.outcome?.groups ?? [];
  const colours = useSliceColours(groups);
  const selected = groups.find((group) => group.id === selectedId) ?? null;

  // An unknown balance offers everything rather than inventing a cap. The figure is the
  // sidebar's last known wallet, so it can lag a beat; it phrases the offer, never gates it.
  const remaining = trick.outcome?.remaining ?? 0;
  const freeLeft = credits ? Math.max(credits.remaining, 0) : null;
  const batchSize =
    freeLeft !== null ? Math.min(remaining, freeLeft) : remaining;
  const canContinue = remaining > 0 && batchSize > 0;

  // The sweep opens nothing, so it has no workbench state to tear down — and clearing
  // here would close whatever the user already had open.
  const leave = onDone;
  // Safe from any state: cancel is a no-op unless a sweep is actually running.
  const dismiss = () => {
    trick.cancel();
    leave();
  };

  // Every state wears the same close control, so leaving never depends on which one the
  // view happens to be in.
  const shell = (children: React.ReactNode) => (
    <div className={styles.view}>
      <ActionIcon
        className={styles.viewClose}
        variant="tertiary"
        accent="neutral"
        onClick={dismiss}
        aria-label={t("common.close", "Close")}
      >
        <CloseRoundedIcon fontSize="small" />
      </ActionIcon>
      {children}
    </div>
  );

  if (trick.status === "failed") {
    return shell(
      <div className={styles.viewColumn}>
        <BrandMark height="2.25rem" />
        <h2 className={styles.viewHeading}>
          {t("classificationDemo.results.failedTitle", "That did not finish")}
        </h2>
        <p className={styles.viewLead}>
          {t(
            "classificationDemo.results.failedBody",
            "Stirling could not read your Downloads folder. Nothing on your computer was changed.",
          )}
        </p>
        <div className={styles.viewActions}>
          <Button onClick={leave}>
            {t("classificationDemo.buttons.done", "Done")}
          </Button>
        </div>
      </div>,
    );
  }

  if (trick.status === "done" && trick.outcome) {
    return shell(
      <div className={styles.results}>
        <header className={styles.resultsHeader}>
          <BrandMark height="2.25rem" />
          <h2 className={styles.viewHeading}>
            {t("classificationDemo.results.heading", "Your Downloads, sorted")}
          </h2>
          <p className={styles.viewLead}>
            <CheckCircleRoundedIcon
              className={styles.resultTick}
              fontSize="inherit"
            />
            {/* Two pluralised fragments: i18next pluralises on a single `count`, so one
                string with two counts gets one wrong ("read 1 PDFs into 1 types"). */}
            {t("classificationDemo.results.summary", {
              documents: t("classificationDemo.results.documentCount", {
                count: trick.outcome.processed,
              }),
              types: t("classificationDemo.results.typeCount", {
                count: groups.length,
              }),
              defaultValue:
                "Stirling read {{documents}} and sorted them into {{types}}.",
            })}
          </p>
        </header>

        <div className={styles.resultsBody}>
          <ClassificationDemoChart
            groups={groups}
            total={trick.outcome.processed}
            selectedId={selectedId}
            onSelect={setSelectedId}
          />
          <div className={styles.resultsDetail}>
            <CategoryTicker
              groups={groups}
              selectedId={selectedId}
              onSelect={setSelectedId}
            />
            <ClassificationDemoBreakdown
              group={selected}
              colour={selected ? colours.get(selected.id) : undefined}
            />
          </div>
        </div>

        <footer className={styles.resultsFooter}>
          {canContinue && (
            <FollowUpPanel remaining={remaining} batchSize={batchSize} />
          )}
          <div className={styles.viewActions}>
            <Button variant="quiet" accent="neutral" onClick={leave}>
              {canContinue
                ? t("classificationDemo.buttons.notNow", "Not now")
                : t("classificationDemo.buttons.done", "Done")}
            </Button>
            {canContinue && (
              <Button onClick={() => trick.start(batchSize)}>
                {batchSize < remaining
                  ? t(
                      "classificationDemo.followUp.batchCta",
                      "Process another {{count}}",
                      { count: batchSize },
                    )
                  : t(
                      "classificationDemo.followUp.restCta",
                      "Process the rest",
                    )}
              </Button>
            )}
          </div>
        </footer>
      </div>,
    );
  }

  return shell(
    <div className={styles.viewColumn}>
      <ProcessingHero label={processingLabel} />
      <p className={styles.counts}>
        <span className={styles.countsNumber}>{trick.progress.processed}</span>
        {t(
          "classificationDemo.processing.counts",
          "of {{total}} PDFs processed",
          {
            total: trick.progress.total,
          },
        )}
      </p>
      <CategoryTicker groups={trick.progress.groups} />
      <div className={styles.viewActions}>
        <Button variant="quiet" accent="neutral" onClick={dismiss}>
          {t("classificationDemo.buttons.stop", "Stop")}
        </Button>
      </div>
    </div>,
  );
}
