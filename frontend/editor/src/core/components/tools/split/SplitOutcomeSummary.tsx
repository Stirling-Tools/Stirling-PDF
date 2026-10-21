import { useTranslation } from "react-i18next";
import { OutcomePanel } from "@app/components/shared/OutcomePanel";
import type { SplitOutcome } from "@app/components/tools/split/splitOutcome";

interface SplitOutcomeSummaryProps {
  outcome: SplitOutcome;
}

interface Summary {
  tone: "info" | "danger";
  title: string;
  detail?: string;
}

const MAX_LISTED = 6;

function listNumbers(values: number[]): string {
  const head = values.slice(0, MAX_LISTED).join(", ");
  return values.length > MAX_LISTED ? `${head}…` : head;
}

/** True when the outcome is a real error the run must not start with. */
export function splitOutcomeBlocksRun(outcome: SplitOutcome): boolean {
  return outcome.kind.startsWith("invalid");
}

/**
 * One line stating what the current settings produce. Counts come from the
 * loaded document, so this is a promise, not a guess.
 */
export function SplitOutcomeSummary({ outcome }: SplitOutcomeSummaryProps) {
  const { t } = useTranslation();
  const summary = describe(outcome, t);

  return (
    <OutcomePanel
      tone={summary?.tone ?? "info"}
      title={summary?.title}
      detail={summary?.detail}
      testId="split-outcome"
    />
  );
}

type Translate = ReturnType<typeof useTranslation>["t"];

const files = (count: number, t: Translate) =>
  t("split.outcome.files", { count });

const pagesEach = (count: number, t: Translate) =>
  t("split.outcome.pagesEach", { count });

function describe(outcome: SplitOutcome, t: Translate): Summary | null {
  switch (outcome.kind) {
    case "none":
      return null;

    case "invalid-pages":
      return {
        tone: "danger",
        title: t("split.outcome.invalidPagesTitle", "Check the page numbers"),
        detail: t(
          "split.outcome.invalidPagesDetail",
          "{{token}} is not a page or a range. Try 1, 3, 7-10.",
          { token: outcome.token },
        ),
      };

    case "invalid-page-out-of-range":
      return {
        tone: "danger",
        title: t("split.outcome.outOfRangeTitle", "Page is past the end"),
        detail: t(
          "split.outcome.outOfRangeDetail",
          "Page {{page}} does not exist — this file has {{total}} pages.",
          { page: outcome.page, total: outcome.totalPages },
        ),
      };

    case "invalid-value":
      return {
        tone: "danger",
        title: t("split.outcome.invalidValueTitle", "Check the value"),
        detail: t(
          "split.outcome.invalidValueDetail",
          "Use a whole number, or a size like 10MB.",
        ),
      };

    case "parts":
      return {
        tone: "info",
        title: files(outcome.files, t),
        detail:
          outcome.breaks.length === 0
            ? t(
                "split.outcome.partsNoBreaks",
                "No cut before the end, so the file stays whole.",
              )
            : t("split.outcome.partsDetail", "Cut points: {{breaks}}.", {
                breaks: listNumbers(outcome.breaks),
              }),
      };

    case "uniform":
      return {
        tone: "info",
        title: `${files(outcome.files, t)} · ${pagesEach(outcome.pagesPerFile, t)}`,
        detail:
          outcome.lastFilePages === outcome.pagesPerFile
            ? undefined
            : t("split.outcome.uniformRemainder", {
                count: outcome.lastFilePages,
              }),
      };

    case "even":
      return {
        tone: "info",
        title: files(outcome.files, t),
        detail:
          outcome.distribution.length > 0
            ? t("split.outcome.evenDetail", "Pages per file: {{list}}.", {
                list: listNumbers(outcome.distribution),
              })
            : undefined,
      };

    case "by-size":
      return {
        tone: "info",
        title: t(
          "split.outcome.bySizeTitle",
          "Each file stays under {{size}}",
          {
            size: outcome.size,
          },
        ),
        detail: t(
          "split.outcome.bySizeDetail",
          "The splitter chooses where to break so every file fits.",
        ),
      };

    case "chapters":
      return {
        tone: "info",
        title: t(
          "split.outcome.chaptersTitle",
          "One file per level-{{level}} bookmark",
          { level: outcome.level },
        ),
        detail: t(
          "split.outcome.chaptersDetail",
          "Uses the document's outline; files without bookmarks come out whole.",
        ),
      };

    case "divider":
      return {
        tone: "info",
        title: t("split.outcome.dividerTitle", "One file per divider sheet"),
        detail: t(
          "split.outcome.dividerDetail",
          "Divider pages are removed from the output.",
        ),
      };

    case "pieces": {
      const { rows, columns, piecesPerPage, cutPages, totalPages } = outcome;
      if (outcome.merged) {
        const outputPages = cutPages * piecesPerPage + (totalPages - cutPages);
        return {
          tone: "info",
          title: `${files(1, t)} · ${t("split.outcome.pages", { count: outputPages })}`,
          detail: t(
            "split.outcome.piecesMergedDetail",
            "Reassembled into one file: each cut page becomes {{rows}} × {{columns}} pieces.",
            { rows, columns },
          ),
        };
      }
      return {
        tone: "info",
        title: files(outcome.files, t),
        detail:
          cutPages === 0
            ? t(
                "split.outcome.piecesNoneCut",
                "No page matches the selection, so nothing is cut.",
              )
            : cutPages === totalPages
              ? t(
                  "split.outcome.piecesEveryPage",
                  "Every page → {{pieces}} pieces each ({{rows}} × {{columns}}).",
                  { pieces: piecesPerPage, rows, columns },
                )
              : t(
                  "split.outcome.piecesDetail",
                  "{{cut}} of {{total}} pages → {{pieces}} pieces each ({{rows}} × {{columns}}).",
                  {
                    cut: cutPages,
                    total: totalPages,
                    pieces: piecesPerPage,
                    rows,
                    columns,
                  },
                ),
      };
    }

    case "poster":
      return {
        tone: "info",
        title: files(outcome.files, t),
        detail: t(
          "split.outcome.posterDetail",
          "Each page → {{rows}} × {{columns}} tiles at {{size}}.",
          {
            rows: outcome.rows,
            columns: outcome.columns,
            size: outcome.pageSize,
          },
        ),
      };

    default:
      return null;
  }
}
