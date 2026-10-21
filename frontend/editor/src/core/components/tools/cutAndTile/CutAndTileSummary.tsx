import { useTranslation } from "react-i18next";
import { OutcomePanel } from "@app/components/shared/OutcomePanel";
import type { CutAndTileOutcome } from "@app/components/tools/cutAndTile/cutAndTileOutcome";

interface CutAndTileSummaryProps {
  outcome: CutAndTileOutcome;
}

/** True when the outcome is an error the run must not start with. */
export function cutAndTileBlocksRun(outcome: CutAndTileOutcome): boolean {
  return outcome.kind === "invalid";
}

export function CutAndTileSummary({ outcome }: CutAndTileSummaryProps) {
  const { t } = useTranslation();
  const summary = describe(outcome, t);

  return (
    <OutcomePanel
      tone={summary?.tone ?? "info"}
      title={summary?.title}
      detail={summary?.detail}
      testId="cut-and-tile-outcome"
    />
  );
}

type Translate = ReturnType<typeof useTranslation>["t"];

interface Summary {
  tone: "info" | "danger";
  title: string;
  detail?: string;
}

function files(count: number, t: Translate) {
  return t("cutAndTile.outcome.files", { count });
}

function describe(outcome: CutAndTileOutcome, t: Translate): Summary | null {
  switch (outcome.kind) {
    case "invalid":
      return outcome.reason === "pages"
        ? {
            tone: "danger",
            title: t("cutAndTile.outcome.badPages", "Check the page numbers"),
            detail: t(
              "cutAndTile.outcome.badPagesHint",
              "Use pages that exist in this document, like 2, 4, 6-8.",
            ),
          }
        : {
            tone: "danger",
            title: t("cutAndTile.outcome.badValues", "Check the numbers"),
            detail: t(
              "cutAndTile.outcome.badValuesHint",
              "Rows and columns are whole numbers, one or more.",
            ),
          };

    case "grid": {
      const everyPage = outcome.cutPages === outcome.totalPages;
      return {
        tone: "info",
        title: outcome.assembled
          ? t("cutAndTile.outcome.assembled", "One PDF")
          : files(outcome.files, t),
        detail:
          outcome.cutPages === 0
            ? t(
                "cutAndTile.outcome.noneCut",
                "No page matches, so nothing is cut.",
              )
            : outcome.assembled
              ? t(
                  "cutAndTile.outcome.assembledHint",
                  "Reassembled: each cut page becomes {{rows}} × {{columns}} pieces.",
                  { rows: outcome.rows, columns: outcome.columns },
                )
              : everyPage
                ? t(
                    "cutAndTile.outcome.everyPage",
                    "Every page → {{pieces}} pieces ({{rows}} × {{columns}}).",
                    {
                      pieces: outcome.piecesPerPage,
                      rows: outcome.rows,
                      columns: outcome.columns,
                    },
                  )
                : t(
                    "cutAndTile.outcome.somePages",
                    "{{cut}} of {{total}} pages → {{pieces}} pieces each; the rest stay whole.",
                    {
                      cut: outcome.cutPages,
                      total: outcome.totalPages,
                      pieces: outcome.piecesPerPage,
                    },
                  ),
      };
    }

    case "poster":
      return {
        tone: "info",
        title: files(outcome.files, t),
        detail: t(
          "cutAndTile.outcome.posterHint",
          "Each page → {{pieces}} tiles ({{rows}} × {{columns}}) at {{size}}.",
          {
            pieces: outcome.tilesPerPage,
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
