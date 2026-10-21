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

function onePdf(pages: number, t: Translate) {
  return `${t("cutAndTile.outcome.onePdf", "One PDF")} · ${t(
    "cutAndTile.outcome.pages",
    { count: pages },
  )}`;
}

function largeJob(detail: string, outcome: { largeJob: boolean; outputPages: number }, t: Translate) {
  if (!outcome.largeJob) return detail;
  return `${detail} ${t(
    "cutAndTile.outcome.largeJob",
    "This writes {{pages}} pages, which can take a while.",
    { pages: outcome.outputPages },
  )}`;
}

function describe(outcome: CutAndTileOutcome, t: Translate): Summary | null {
  switch (outcome.kind) {
    case "invalid":
      if (outcome.reason === "pages") {
        return {
          tone: "danger",
          title: t("cutAndTile.outcome.badPages", "Check the page numbers"),
          detail: t(
            "cutAndTile.outcome.badPagesHint",
            "Use pages that exist in this document, like 2, 4, 6-8.",
          ),
        };
      }
      if (outcome.reason === "size") {
        return {
          tone: "danger",
          title: t("cutAndTile.outcome.badSize", "Check the paper size"),
          detail: t(
            "cutAndTile.outcome.badSizeHint",
            "Pick one of the sizes this server accepts.",
          ),
        };
      }
      return {
        tone: "danger",
        title: t("cutAndTile.outcome.badValues", "Check the numbers"),
        detail: t(
          "cutAndTile.outcome.badValuesHint",
          "Rows and columns are whole numbers, one or more.",
        ),
      };

    case "unknown":
      return {
        tone: "info",
        title:
          outcome.mode === "grid"
            ? t(
                "cutAndTile.outcome.unknownGrid",
                "Each page → {{pieces}} pieces ({{rows}} × {{columns}})",
                {
                  pieces: outcome.piecesPerPage,
                  rows: outcome.rows,
                  columns: outcome.columns,
                },
              )
            : t(
                "cutAndTile.outcome.unknownPoster",
                "Each page → {{pieces}} poster pages",
                { pieces: outcome.piecesPerPage },
              ),
        detail: t("cutAndTile.outcome.unknown", "Reading the page count…"),
      };

    case "grid": {
      const everyPage = outcome.cutPages === outcome.totalPages;
      const detail =
        outcome.cutPages === 0
          ? t("cutAndTile.outcome.noneCut", "No page matches, so nothing is cut.")
          : outcome.assembled
            ? t(
                "cutAndTile.outcome.assembledHint",
                "Each cut page becomes {{rows}} × {{columns}} pages; the rest stay whole.",
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
                );
      return {
        tone: "info",
        title:
          outcome.cutPages === 0
            ? files(outcome.outputFiles, t)
            : outcome.assembled
              ? onePdf(outcome.outputPages, t)
              : files(outcome.outputFiles, t),
        detail: largeJob(detail, outcome, t),
      };
    }

    case "poster":
      return {
        tone: "info",
        title: onePdf(outcome.outputPages, t),
        detail: largeJob(
          t(
            "cutAndTile.outcome.posterHint",
            "Each page → {{pieces}} tiles ({{rows}} × {{columns}}) scaled to {{size}}.",
            {
              pieces: outcome.tilesPerPage,
              rows: outcome.rows,
              columns: outcome.columns,
              size: outcome.pageSize,
            },
          ),
          outcome,
          t,
        ),
      };

    default:
      return null;
  }
}
