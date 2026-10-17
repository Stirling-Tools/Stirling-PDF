import {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import { useTranslation } from "react-i18next";
import {
  Alert,
  Checkbox,
  Group,
  NumberInput,
  Select,
  Stack,
  Text,
  TextInput,
} from "@mantine/core";
import type { BookletImpositionParameters } from "@app/hooks/tools/bookletImposition/useBookletImpositionParameters";
import type { PageLayoutParameters } from "@app/hooks/tools/pageLayout/usePageLayoutParameters";
import { getPagesPerSheetOptions } from "@app/components/tools/pageLayout/constants";
import PageLayoutMarginsBordersSettings from "@app/components/tools/pageLayout/PageLayoutMarginsBordersSettings";
import { computeBoxes } from "@app/components/tools/pageLayout/utils/computeBoxes";
import { useIsPhone } from "@app/hooks/useIsMobile";
import { Z_INDEX_AUTOMATE_DROPDOWN } from "@app/styles/zIndex";
import { Button } from "@app/ui/Button";
import { Collapsible } from "@app/ui/Collapsible";
import { Icon } from "@app/ui/Icon";
import { InfoTooltip } from "@app/ui/InfoTooltip";
import { Modal } from "@app/ui/Modal";
import { SegmentedControl } from "@app/ui/SegmentedControl";
import { ToggleSwitch } from "@app/ui/ToggleSwitch";
import {
  POSTER_MAX_TILES,
  POSTER_MIN_TILES,
  POSTER_PAGE_SIZES,
  PRINT_PRESETS,
  bookletPass,
  bookletSideIndex,
  bookletSides,
  defaultPrintSettings,
  pagesPerSheet,
  printProblem,
  printSummary,
  rangeIsClipped,
  selectionPages,
} from "@app/components/viewer/print/printJob";
import {
  NO_PREVIEW_PAGES,
  type PreviewPageState,
  usePrintPagePosition,
  usePrintPreviewImages,
} from "@app/components/viewer/print/usePrintPreviewImages";
import type {
  Box as LayoutBox,
  Sheet,
} from "@app/components/tools/pageLayout/utils/computeBoxes";
import type {
  BookletSide,
  PrintPreset,
  PrintProblem,
  PrintSettings,
} from "@app/components/viewer/print/printJob";
import "@app/components/viewer/print/PrintDialog.css";

const PRESET_LABELS: Record<PrintPreset, string> = {
  standard: "viewer.print.presetStandard",
  pagesPerSheet: "viewer.print.presetPagesPerSheet",
  booklet: "viewer.print.presetBooklet",
  poster: "viewer.print.presetPoster",
};

/** The message each problem shows, exhaustive so a new reason cannot go unworded. */
const PROBLEM_KEYS: Record<PrintProblem, string> = {
  emptyPageRange: "viewer.print.emptyPageRange",
  invalidLayout: "viewer.print.invalidLayout",
  invalidPageRange: "viewer.print.invalidPageRange",
  invalidTiles: "viewer.print.invalidTiles",
};

/** What each imposed layout asks of the printer dialog the user reaches next. */
const PRESET_NOTES: Partial<Record<PrintPreset, string>> = {
  pagesPerSheet: "viewer.print.notePagesPerSheet",
  poster: "viewer.print.notePoster",
};

/** Shared by the layout selects: a value is always chosen, and the menu portals above the dialog. */
const LAYOUT_SELECT_PROPS = {
  allowDeselect: false,
  comboboxProps: { withinPortal: true, zIndex: Z_INDEX_AUTOMATE_DROPDOWN },
};

/**
 * What to do in the printer dialog, which for a booklet depends on the sides the
 * job prepares: a manual pass is printed single-sided, so the duplex instruction
 * would contradict the output the reader chose.
 */
function scopeNoteKey(settings: PrintSettings): string | null {
  if (settings.preset !== "booklet") {
    return PRESET_NOTES[settings.preset] ?? null;
  }
  switch (bookletPass(settings.booklet)) {
    case "both":
      return "viewer.print.noteBooklet";
    case "fronts":
      return "viewer.print.noteBookletFronts";
    case "backs":
      return "viewer.print.noteBookletBacks";
  }
}

/** The inputs can be emptied mid-edit, and a grid of zero tiles is not drawable. */
const tileCount = (value: number) =>
  Number.isFinite(value)
    ? Math.min(POSTER_MAX_TILES, Math.max(POSTER_MIN_TILES, Math.round(value)))
    : POSTER_MIN_TILES;

/** A framed stage, so a preset's figure reads as part of the panel rather than a stray drawing. */
function PrintPreview({
  label = "viewer.print.previewLabel",
  action,
  children,
}: {
  /** Null where the surface around the figure already names it. */
  label?: string | null;
  action?: ReactNode;
  children: ReactNode;
}) {
  const { t } = useTranslation();

  return (
    <div className="print-preview">
      {label === null && action === undefined ? null : (
        <div className="print-preview__header">
          {label === null ? null : (
            <span className="print-preview__label">{t(label)}</span>
          )}
          {action}
        </div>
      )}
      <div className="print-preview__stage">{children}</div>
    </div>
  );
}

/**
 * Why the settings cannot print yet, under the control that causes it. The live
 * region stays mounted so the reason is announced when it appears.
 */
function ProblemNote({ text }: { text: string | null }) {
  return (
    <div className="print-problem" aria-live="polite">
      {text ? (
        <Text size="sm" c="red">
          {text}
        </Text>
      ) : null}
    </div>
  );
}

/** The label of a collapsed panel, with the facts it is hiding beside it. */
function OptionsToggle({
  label,
  summary,
}: {
  label: string;
  /** The settings a collapsed panel holds, or null when it hides nothing. */
  summary?: string | null;
}) {
  return (
    <span className="print-options-toggle">
      {label}
      {summary ? (
        <span className="print-options-toggle__summary">{summary}</span>
      ) : null}
    </span>
  );
}

/** The settings a collapsed panel is hiding, so a clean form still shows its state. */
const optionSummary = (...facts: (string | null)[]) =>
  facts.filter((fact) => fact !== null).join(", ");

/** A cell's share of its sheet, which is how both figures place themselves. */
const share = (value: number, total: number) => `${(value / total) * 100}%`;

type PageImage = (page: number) => string | null;

/**
 * The sheet as the imposition will build it: every cell holds the page that
 * lands in it, over the sheet's own white where no page lands. A cell past the
 * end of the document is left blank rather than numbered, since the number
 * would claim a page that does not exist.
 */
export const LayoutSheetPreview = memo(function LayoutSheetPreview({
  cells,
  sheet,
  landscape,
  bordered,
  pageImage,
  pageState,
  pageCount,
}: {
  cells: LayoutBox[];
  sheet: Sheet;
  landscape: boolean;
  bordered: boolean;
  pageImage: PageImage;
  pageState?: (page: number) => PreviewPageState;
  pageCount?: number;
}) {
  return (
    <div
      className={`print-preview__sheet${
        landscape ? " print-preview__sheet--landscape" : ""
      }`}
    >
      <div
        className={`print-sheet${landscape ? " print-sheet--landscape" : ""}`}
      >
        {cells.map((cell) => {
          const image = pageImage(cell.label);
          const pending = !image && pageState?.(cell.label) === "loading";
          const named = pageCount === undefined || cell.label <= pageCount;

          return (
            <div
              key={cell.label}
              className={`print-sheet__cell${
                bordered ? " print-sheet__cell--bordered" : ""
              }${pending ? " print-sheet__cell--pending" : ""}`}
              style={{
                left: share(cell.x, sheet.width),
                top: share(cell.y, sheet.height),
                width: share(cell.width, sheet.width),
                height: share(cell.height, sheet.height),
              }}
            >
              {image ? (
                <img className="print-sheet__image" src={image} alt="" />
              ) : null}
              {named ? <span className="print-badge">{cell.label}</span> : null}
            </div>
          );
        })}
      </div>
    </div>
  );
});

/** The grid the tiles are numbered along, which the stylesheet reads. */
type TileGridStyle = CSSProperties & {
  "--print-tiles-columns": number;
  "--print-tiles-rows": number;
};

/**
 * The page with the grid it will be cut along: the page is drawn whole and the
 * tiles are numbered over it, so the figure states the order without inventing
 * cut marks the generated tiles do not carry.
 *
 * The page's own bitmap defines the box the grid is laid over, so a landscape or
 * square page is divided correctly. The paper stand-in is drawn only while the
 * page is missing, since two boxes in the same place cannot both set the shape.
 */
export const PosterTilePreview = memo(function PosterTilePreview({
  columns,
  rows,
  rightToLeft,
  pageImage,
}: {
  columns: number;
  rows: number;
  rightToLeft: boolean;
  pageImage: PageImage;
}) {
  const image = pageImage(1);
  const tiles = Array.from({ length: rows * columns }, (_, index) => {
    const row = Math.floor(index / columns);
    const column = index % columns;

    return rightToLeft ? row * columns + (columns - column) : index + 1;
  });

  const style: TileGridStyle = {
    "--print-tiles-columns": columns,
    "--print-tiles-rows": rows,
  };

  return (
    <div className="print-tiles" style={style}>
      {image ? (
        <img className="print-tiles__page" src={image} alt="" />
      ) : (
        <div className="print-tiles__paper" />
      )}
      <div className="print-tiles__grid">
        {tiles.map((label) => (
          <div key={label} className="print-tiles__tile">
            <span className="print-badge">{label}</span>
          </div>
        ))}
      </div>
    </div>
  );
});

/**
 * The page as it will print, for the presets that impose nothing. Its own
 * bitmap sets the shape, so a Letter or landscape page is drawn as itself
 * rather than forced into the sheet the imposed layouts use.
 *
 * A page that failed is left to the figure's status area, so the reason and its
 * retry are stated once.
 */
export const PagePreview = memo(function PagePreview({
  image,
  state = "ready",
}: {
  image: string | null;
  state?: PreviewPageState;
}) {
  const { t } = useTranslation();

  return (
    <div className="print-page">
      {image ? (
        <img className="print-page__image" src={image} alt="" />
      ) : state === "loading" ? (
        <Text size="xs" c="dimmed">
          {t("viewer.print.previewLoading")}
        </Text>
      ) : null}
    </div>
  );
});

/** The pages a job prints; only the standard preset reads it. */
type PageScope = "all" | "current" | "custom";

/** A folded A4 sheet seen in landscape: two A5 halves carrying one page each. */
const FOLDED_SHEET: Sheet = { x: 0, y: 0, width: 297, height: 210 };

/** The two halves of that sheet, labelled with the pages they carry. */
function bookletCells([left, right]: BookletSide): LayoutBox[] {
  const width = FOLDED_SHEET.width / 2;
  return [
    { x: 0, y: 0, width, height: FOLDED_SHEET.height, label: left },
    { x: width, y: 0, width, height: FOLDED_SHEET.height, label: right },
  ];
}

/** The value that means a hand-made grid rather than a count from the list. */
const CUSTOM_GRID = "CUSTOM";

/** Narrows a value from a control that only speaks strings to one of `values`. */
function isOneOf<T extends string>(values: readonly T[]) {
  return (value: string): value is T => values.some((entry) => entry === value);
}

const isPrintPreset = isOneOf(PRINT_PRESETS);
const isPosterPageSize = isOneOf(POSTER_PAGE_SIZES);

/** The range field names its own reason through `aria-describedby`. */
const RANGE_PROBLEM_ID = "print-page-range-problem";

/** The dialog body is one form, so Enter confirms from any field in it. */
const PRINT_FORM_ID = "print-dialog-form";

/** Whether any margin is set, so the collapsed controls can say so. */
function layoutMarginsSet(parameters: PageLayoutParameters): boolean {
  const margins = [
    parameters.innerMargin,
    parameters.topMargin,
    parameters.bottomMargin,
    parameters.leftMargin,
    parameters.rightMargin,
  ];
  return margins.some((margin) => (margin ?? 0) > 0);
}

/**
 * The pages-per-sheet controls a printing task asks for: how many pages go on a
 * sheet, which way up it is, and the grid's ordering, margins and borders behind
 * one disclosure.
 *
 * The shared page-layout panel leads with Default/Custom, which is configuration
 * machinery rather than a choice anyone makes when printing, so this composes the
 * same parameters into the order the task has.
 */
const LayoutControls = memo(function LayoutControls({
  parameters,
  onParameterChange,
  disabled,
  open,
  onToggle,
  problem,
}: {
  parameters: PageLayoutParameters;
  onParameterChange: <K extends keyof PageLayoutParameters>(
    key: K,
    value: PageLayoutParameters[K],
  ) => void;
  disabled: boolean;
  open: boolean;
  onToggle: () => void;
  problem: string | null;
}) {
  const { t } = useTranslation();
  const custom = parameters.mode === "CUSTOM";
  const facts = optionSummary(
    parameters.arrangement === "BY_ROWS"
      ? t("pageLayout.arrangement.byRows", "By Rows")
      : null,
    parameters.readingDirection === "RTL"
      ? t("pageLayout.readingDirection.rtl", "Right to Left")
      : null,
    layoutMarginsSet(parameters) ? t("viewer.print.marginsSet") : null,
    parameters.addBorder ? t("pageLayout.addBorder", "Add Borders") : null,
  );

  return (
    <Stack gap="sm">
      <Select
        label={t("viewer.print.pagesPerSheetLabel")}
        data={[
          ...getPagesPerSheetOptions(t).map((option) => ({
            value: String(option.value),
            label: option.label,
          })),
          { value: CUSTOM_GRID, label: t("viewer.print.customGrid") },
        ]}
        value={custom ? CUSTOM_GRID : String(parameters.pagesPerSheet)}
        onChange={(value) => {
          if (!value) {
            return;
          }
          if (value === CUSTOM_GRID) {
            onParameterChange("mode", "CUSTOM");
            return;
          }
          onParameterChange("mode", "DEFAULT");
          onParameterChange("pagesPerSheet", Number(value));
        }}
        {...LAYOUT_SELECT_PROPS}
        disabled={disabled}
      />

      {custom ? (
        <Group grow>
          <NumberInput
            label={t("pageLayout.rows", "Rows")}
            value={parameters.rows}
            onChange={(value) => onParameterChange("rows", Number(value))}
            min={1}
            disabled={disabled}
          />
          <NumberInput
            label={t("pageLayout.cols", "Columns")}
            value={parameters.cols}
            onChange={(value) => onParameterChange("cols", Number(value))}
            min={1}
            disabled={disabled}
          />
        </Group>
      ) : null}

      <Select
        label={t("pageLayout.orientation.label", "Orientation:")}
        data={[
          {
            value: "PORTRAIT",
            label: t("pageLayout.orientation.portrait", "Portrait"),
          },
          {
            value: "LANDSCAPE",
            label: t("pageLayout.orientation.landscape", "Landscape"),
          },
        ]}
        value={parameters.orientation}
        onChange={(value) => {
          if (value === "PORTRAIT" || value === "LANDSCAPE") {
            onParameterChange("orientation", value);
          }
        }}
        {...LAYOUT_SELECT_PROPS}
        disabled={disabled}
      />

      <ProblemNote text={problem} />

      <Collapsible
        open={open}
        onToggle={onToggle}
        header={
          <OptionsToggle
            label={t("viewer.print.moreLayoutOptions")}
            summary={facts}
          />
        }
      >
        {open ? (
          <Stack gap="md">
            <Select
              label={t("pageLayout.arrangement.label", "Page arrangement:")}
              data={[
                {
                  value: "BY_ROWS",
                  label: t("pageLayout.arrangement.byRows", "By Rows"),
                },
                {
                  value: "BY_COLUMNS",
                  label: t("pageLayout.arrangement.byColumns", "By Columns"),
                },
              ]}
              value={parameters.arrangement}
              onChange={(value) => {
                if (value === "BY_ROWS" || value === "BY_COLUMNS") {
                  onParameterChange("arrangement", value);
                }
              }}
              {...LAYOUT_SELECT_PROPS}
              disabled={disabled}
            />
            <Select
              label={t(
                "pageLayout.readingDirection.label",
                "Reading Direction:",
              )}
              data={[
                {
                  value: "LTR",
                  label: t("pageLayout.readingDirection.ltr", "Left to Right"),
                },
                {
                  value: "RTL",
                  label: t("pageLayout.readingDirection.rtl", "Right to Left"),
                },
              ]}
              value={parameters.readingDirection}
              onChange={(value) => {
                if (value === "LTR" || value === "RTL") {
                  onParameterChange("readingDirection", value);
                }
              }}
              {...LAYOUT_SELECT_PROPS}
              disabled={disabled}
            />
            <PageLayoutMarginsBordersSettings
              parameters={parameters}
              onParameterChange={onParameterChange}
              disabled={disabled}
            />
          </Stack>
        ) : null}
      </Collapsible>
    </Stack>
  );
});

/**
 * The booklet controls as a printing choice: which sides this run prepares, the
 * edge it binds on, and the extras behind one disclosure.
 *
 * The shared booklet panel offers "Double-sided printing", which reads as though
 * the dialog were configuring the printer. Duplex is decided in the next dialog,
 * so this names the sides the file will carry and leaves the setting to the
 * printer.
 */
const BookletControls = memo(function BookletControls({
  parameters,
  onParameterChange,
  disabled,
  open,
  onToggle,
  problem,
}: {
  parameters: BookletImpositionParameters;
  onParameterChange: <K extends keyof BookletImpositionParameters>(
    key: K,
    value: BookletImpositionParameters[K],
  ) => void;
  disabled: boolean;
  open: boolean;
  onToggle: () => void;
  problem: string | null;
}) {
  const { t } = useTranslation();
  const pass = bookletPass(parameters);
  const facts = optionSummary(
    parameters.addGutter
      ? t("viewer.print.gutterSummary", { size: parameters.gutterSize })
      : null,
    parameters.addBorder
      ? t("bookletImposition.addBorder.label", "Add borders around pages")
      : null,
    parameters.doubleSided && parameters.flipOnShortEdge
      ? t("bookletImposition.flipOnShortEdge.label", "Flip on short edge")
      : null,
  );

  return (
    <Stack gap="sm">
      <div>
        <Group gap="xs" wrap="nowrap" mb={6}>
          <Text size="sm" fw={500}>
            {t("viewer.print.output")}
          </Text>
          <InfoTooltip label={t("viewer.print.outputTooltip")} />
        </Group>
        <SegmentedControl
          options={[
            { value: "both", label: t("viewer.print.outputBothSides") },
            { value: "fronts", label: t("viewer.print.outputFronts") },
            { value: "backs", label: t("viewer.print.outputBacks") },
          ]}
          value={pass}
          onChange={(value) => {
            onParameterChange("doubleSided", value === "both");
            onParameterChange(
              "duplexPass",
              value === "both"
                ? "BOTH"
                : value === "backs"
                  ? "SECOND"
                  : "FIRST",
            );
          }}
          disabled={disabled}
          fullWidth
          ariaLabel={t("viewer.print.output")}
        />
      </div>

      <div>
        <Text size="sm" fw={500} mb={6}>
          {t("viewer.print.binding")}
        </Text>
        <SegmentedControl
          options={[
            { value: "LEFT", label: t("viewer.print.bindingLeft") },
            { value: "RIGHT", label: t("viewer.print.bindingRight") },
          ]}
          value={parameters.spineLocation}
          onChange={(value) => onParameterChange("spineLocation", value)}
          disabled={disabled}
          fullWidth
          ariaLabel={t("viewer.print.binding")}
        />
      </div>

      <ProblemNote text={problem} />

      <Collapsible
        open={open}
        onToggle={onToggle}
        header={
          <OptionsToggle
            label={t("viewer.print.moreBookletOptions")}
            summary={facts}
          />
        }
      >
        {open ? (
          <Stack gap="md">
            <Checkbox
              checked={parameters.addGutter}
              onChange={(event) =>
                onParameterChange("addGutter", event.currentTarget.checked)
              }
              disabled={disabled}
              label={t(
                "bookletImposition.addGutter.label",
                "Add gutter margin",
              )}
            />
            {parameters.addGutter ? (
              <NumberInput
                label={t(
                  "bookletImposition.gutterSize.label",
                  "Gutter size (points)",
                )}
                value={parameters.gutterSize}
                onChange={(value) =>
                  onParameterChange(
                    "gutterSize",
                    typeof value === "number" ? value : 12,
                  )
                }
                min={6}
                max={72}
                step={6}
                size="sm"
                disabled={disabled}
              />
            ) : null}
            <Checkbox
              checked={parameters.addBorder}
              onChange={(event) =>
                onParameterChange("addBorder", event.currentTarget.checked)
              }
              disabled={disabled}
              label={t(
                "bookletImposition.addBorder.label",
                "Add borders around pages",
              )}
            />
            {parameters.doubleSided ? (
              <Group gap="xs" wrap="nowrap">
                <Checkbox
                  checked={parameters.flipOnShortEdge}
                  onChange={(event) =>
                    onParameterChange(
                      "flipOnShortEdge",
                      event.currentTarget.checked,
                    )
                  }
                  disabled={disabled}
                  label={t("bookletImposition.flipOnShortEdge.label")}
                />
                <InfoTooltip
                  label={t("bookletImposition.flipOnShortEdge.tooltip")}
                />
              </Group>
            ) : null}
          </Stack>
        ) : null}
      </Collapsible>
    </Stack>
  );
});

interface PrintDialogProps {
  open: boolean;
  onClose: () => void;
  onPrint: (settings: PrintSettings, pageCount: number) => void;
  /** True while the chosen layout is being prepared or sent to the printer. */
  busy?: boolean;
  error?: string | null;
  /** The document being printed, so the header names what the job is about. */
  fileName?: string | null;
  /**
   * macOS prints through the system dialog, which owns the page range, so the
   * range field is replaced by a note rather than silently ignored.
   */
  systemPrintDialog?: boolean;
  /**
   * False when the document's permissions forbid printing, so the confirm
   * action must not start a job.
   */
  canPrint?: boolean;
  /**
   * Which document the page selection belongs to. Another document starts from
   * a clean selection rather than inheriting a subset of the previous one.
   */
  documentId?: string | null;
}

export function PrintDialog({
  open,
  onClose,
  onPrint,
  busy = false,
  error = null,
  fileName = null,
  systemPrintDialog = false,
  canPrint = true,
  documentId = null,
}: PrintDialogProps) {
  const { t } = useTranslation();
  const isPhone = useIsPhone();
  const [settings, setSettings] = useState<PrintSettings>(defaultPrintSettings);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [enlarged, setEnlarged] = useState(false);
  const [pageScope, setPageScope] = useState<PageScope>("all");

  const update = <K extends keyof PrintSettings>(
    key: K,
    value: PrintSettings[K],
  ) => setSettings((current) => ({ ...current, [key]: value }));

  const updatePoster = (patch: Partial<PrintSettings["poster"]>) =>
    setSettings((current) => ({
      ...current,
      poster: { ...current.poster, ...patch },
    }));

  const { currentPage, pageCount } = usePrintPagePosition(open);

  // The reader can scroll the document behind the dialog, so the current scope
  // follows the page rather than keeping the one it started on.
  useEffect(() => {
    if (pageScope !== "current") {
      return;
    }
    setSettings((current) =>
      current.pageRange === String(currentPage)
        ? current
        : { ...current, pageRange: String(currentPage) },
    );
  }, [pageScope, currentPage]);

  // A blank custom field cannot mean every page any more, so it is refused like
  // any other range the reader has not finished writing. Only the plain preset
  // reads that field, so another preset must not inherit the refusal. Memoized
  // because the viewer's scroll position re-renders this dialog.
  const problem: PrintProblem | null = useMemo(
    () =>
      settings.preset === "standard" &&
      pageScope === "custom" &&
      settings.pageRange.trim() === ""
        ? "invalidPageRange"
        : printProblem(settings, pageCount),
    [settings, pageScope, pageCount],
  );
  const scopeNote = scopeNoteKey(settings);

  // Each scope writes the range the job reads, so the picker and the field
  // cannot disagree about what is printed. Custom starts from the page the
  // reader is on, because an empty field would read as a mistake.
  const chooseScope = (scope: PageScope) => {
    setPageScope(scope);
    if (scope === "all") {
      update("pageRange", "");
      return;
    }
    if (scope === "current" || settings.pageRange.trim() === "") {
      update("pageRange", String(currentPage));
    }
  };

  // The settings panels are memoized, so their handlers keep one identity: a
  // page the reader turns must not rebuild every control in them.
  const onLayoutParameterChange = useCallback(
    <K extends keyof PageLayoutParameters>(
      key: K,
      value: PageLayoutParameters[K],
    ) => {
      setSettings((current) => ({
        ...current,
        layout: { ...current.layout, [key]: value },
      }));
    },
    [],
  );
  const onBookletParameterChange = useCallback(
    <K extends keyof BookletImpositionParameters>(
      key: K,
      value: BookletImpositionParameters[K],
    ) => {
      setSettings((current) => ({
        ...current,
        booklet: { ...current.booklet, [key]: value },
      }));
    },
    [],
  );
  const onToggleAdvanced = useCallback(() => {
    setAdvancedOpen((open) => !open);
  }, []);

  // A4 in points, the sheet the layout is computed on either way up. The
  // figure's inputs are memoized so a memoized figure can bail out when the
  // reader merely turns a page: they belong to the layout, not to the page.
  const { layout } = settings;
  const landscape = layout.orientation === "LANDSCAPE";
  const sheet: Sheet = useMemo(
    () => ({
      x: 0,
      y: 0,
      width: landscape ? 297 : 210,
      height: landscape ? 210 : 297,
    }),
    [landscape],
  );
  const cells = useMemo(() => computeBoxes(sheet, layout), [sheet, layout]);

  // Only the standard preset can honour a range, and a preview of a page the
  // range leaves out would contradict the job, so the figure falls back to the
  // first selected page. A range that selects nothing shows no page at all.
  const selected = useMemo(
    () =>
      settings.preset === "standard"
        ? (selectionPages(settings, pageCount) ?? [])
        : [],
    [settings.preset, settings.pageRange, settings.parity, pageCount],
  );
  const selectionEmpty =
    settings.preset === "standard" && selected.length === 0 && pageCount > 0;

  // The figure shows one output side or one document page, and the reader can
  // step through them: a job whose last side is half full is worth checking, and
  // every page of a booklet is otherwise hidden behind the selection.
  // A cleared grid field reads as zero, which would divide the side count into
  // Infinity and put it in the pager; the settings are refused anyway.
  const perSheet = Math.max(1, pagesPerSheet(layout));
  const sides = Math.max(1, Math.ceil(pageCount / perSheet));
  const bookletSheet = useMemo(
    () => bookletSides(pageCount, settings.booklet.spineLocation),
    [pageCount, settings.booklet.spineLocation],
  );
  const steps =
    settings.preset === "pagesPerSheet"
      ? sides
      : settings.preset === "booklet"
        ? Math.max(bookletSheet.length, 1)
        : settings.preset === "standard"
          ? Math.max(selected.length, 1)
          : 1;
  // Where stepping starts: the side holding the reader's page, that page in the
  // selection, or the page itself. Zero keeps the figure following the viewer.
  const autoStep =
    settings.preset === "pagesPerSheet"
      ? Math.min(
          sides,
          Math.floor((Math.max(currentPage, 1) - 1) / perSheet) + 1,
        )
      : settings.preset === "standard"
        ? Math.max(1, selected.indexOf(currentPage) + 1)
        : settings.preset === "booklet"
          ? bookletSideIndex(bookletSheet, Math.max(currentPage, 1))
          : 1;
  const [step, setStep] = useState(0);
  const shownStep = step === 0 ? autoStep : Math.min(step, steps);

  // The viewer keeps this dialog mounted between opens, so what the reader
  // stepped to or enlarged must not come back the next time they print.
  useEffect(() => {
    if (!open) {
      setStep(0);
      setEnlarged(false);
    }
  }, [open]);

  // A page range and a stepped side belong to the document they were chosen on:
  // a range that happens to stay valid in another document would silently print
  // a subset of it. The layout choices stay, since they describe the reader's
  // intent rather than the document.
  useEffect(() => {
    setPageScope("all");
    setStep(0);
    setSettings((current) =>
      current.pageRange === "" ? current : { ...current, pageRange: "" },
    );
  }, [documentId]);
  const previewPage =
    selected.length > 0 ? selected[shownStep - 1] : currentPage;
  const bookletSide: BookletSide | undefined =
    bookletSheet[shownStep - 1] ?? undefined;
  // A side's cells carry the pages they impose, so a later side numbers its own
  // pages instead of repeating the first side's.
  const sideCells = useMemo(
    () =>
      cells.map((cell) => ({
        ...cell,
        label: cell.label + (shownStep - 1) * perSheet,
      })),
    [cells, shownStep, perSheet],
  );
  // The folded side's halves, memoized so turning a page cannot hand the
  // memoized figure a new array for the same side.
  const bookletFigureCells = useMemo(
    () => (bookletSide === undefined ? null : bookletCells(bookletSide)),
    [bookletSide],
  );
  const previewPages =
    settings.preset === "pagesPerSheet"
      ? sideCells.map((cell) => cell.label)
      : settings.preset === "booklet"
        ? (bookletSide?.filter((page) => page <= pageCount) ?? NO_PREVIEW_PAGES)
        : settings.preset === "poster"
          ? [1]
          : settings.preset === "standard" && selected.length === 0
            ? NO_PREVIEW_PAGES
            : [previewPage];
  const { pageImage, pageState, retry } = usePrintPreviewImages(
    open ? previewPages : NO_PREVIEW_PAGES,
    pageCount,
  );
  // An uncountable or unprintable job has no result to state, and a count from
  // settings that do not validate would contradict the error beside the fields.
  const summary = useMemo(
    () => (problem === null ? printSummary(settings, pageCount) : null),
    [problem, settings, pageCount],
  );
  const loading = previewPages.some((page) => pageState(page) === "loading");
  const failed = previewPages.some((page) => pageState(page) === "failed");

  // A disabled Print button has to say what to fix, so every reason is named.
  const problemText = (reason: PrintProblem) =>
    t(
      PROBLEM_KEYS[reason],
      reason === "emptyPageRange" ? { count: pageCount } : undefined,
    );
  // The permissions are not a setting, so the confirm action is withheld for
  // them separately from the problems the settings can state.
  const permissionProblem = canPrint
    ? null
    : t("encryptedPdfUnlock.printRestricted");

  const figure = (action?: ReactNode, labelled = true) => {
    const label =
      settings.preset === "poster"
        ? "viewer.print.tileLayoutLabel"
        : settings.preset === "standard"
          ? "viewer.print.documentPreviewLabel"
          : undefined;

    const body = (() => {
      switch (settings.preset) {
        case "pagesPerSheet":
          return (
            <LayoutSheetPreview
              cells={sideCells}
              sheet={sheet}
              landscape={landscape}
              bordered={settings.layout.addBorder}
              pageImage={pageImage}
              pageState={pageState}
              pageCount={pageCount}
            />
          );
        case "booklet":
          return bookletFigureCells === null ? (
            <Text size="sm" c="dimmed">
              {t("viewer.print.noPreview")}
            </Text>
          ) : (
            <LayoutSheetPreview
              cells={bookletFigureCells}
              sheet={FOLDED_SHEET}
              landscape
              bordered={settings.booklet.addBorder}
              pageImage={pageImage}
              pageState={pageState}
              pageCount={pageCount}
            />
          );
        case "poster":
          return (
            <PosterTilePreview
              columns={tileCount(settings.poster.xFactor)}
              rows={tileCount(settings.poster.yFactor)}
              rightToLeft={settings.poster.rightToLeft}
              pageImage={pageImage}
            />
          );
        case "standard":
        default:
          return selectionEmpty ? (
            <Text size="sm" c="dimmed">
              {t("viewer.print.noPreview")}
            </Text>
          ) : (
            <PagePreview
              image={pageImage(previewPage)}
              state={pageState(previewPage)}
            />
          );
      }
    })();

    return (
      <PrintPreview action={action} label={labelled ? label : null}>
        {body}
      </PrintPreview>
    );
  };

  const fields = () => {
    switch (settings.preset) {
      case "pagesPerSheet":
        return (
          <LayoutControls
            parameters={settings.layout}
            onParameterChange={onLayoutParameterChange}
            disabled={busy}
            open={advancedOpen}
            onToggle={onToggleAdvanced}
            problem={problem === "invalidLayout" ? problemText(problem) : null}
          />
        );
      case "booklet":
        return (
          <BookletControls
            parameters={settings.booklet}
            onParameterChange={onBookletParameterChange}
            disabled={busy}
            open={advancedOpen}
            onToggle={onToggleAdvanced}
            problem={problem === "invalidLayout" ? problemText(problem) : null}
          />
        );
      case "poster":
        return (
          <Stack gap="sm">
            <Select
              label={t("viewer.print.posterPageSize")}
              value={settings.poster.pageSize}
              onChange={(value) => {
                if (value && isPosterPageSize(value)) {
                  updatePoster({ pageSize: value });
                }
              }}
              data={POSTER_PAGE_SIZES.map((size) => ({
                value: size,
                label: size,
              }))}
              allowDeselect={false}
              disabled={busy}
            />
            <div>
              <Group grow>
                <NumberInput
                  label={t("viewer.print.posterColumns")}
                  value={settings.poster.xFactor}
                  onChange={(value) => updatePoster({ xFactor: Number(value) })}
                  min={POSTER_MIN_TILES}
                  max={POSTER_MAX_TILES}
                  allowDecimal={false}
                  disabled={busy}
                />
                <NumberInput
                  label={t("viewer.print.posterRows")}
                  value={settings.poster.yFactor}
                  onChange={(value) => updatePoster({ yFactor: Number(value) })}
                  min={POSTER_MIN_TILES}
                  max={POSTER_MAX_TILES}
                  allowDecimal={false}
                  disabled={busy}
                />
              </Group>
              <ProblemNote
                text={problem === "invalidTiles" ? problemText(problem) : null}
              />
            </div>
            <Collapsible
              open={advancedOpen}
              onToggle={() => setAdvancedOpen((open) => !open)}
              header={
                <OptionsToggle
                  label={t("viewer.print.morePosterOptions")}
                  summary={
                    settings.poster.rightToLeft
                      ? t("viewer.print.posterRightToLeft")
                      : null
                  }
                />
              }
            >
              {advancedOpen ? (
                <ToggleSwitch
                  checked={settings.poster.rightToLeft}
                  onChange={(checked) => updatePoster({ rightToLeft: checked })}
                  label={t("viewer.print.posterRightToLeft")}
                  disabled={busy}
                />
              ) : null}
            </Collapsible>
          </Stack>
        );
      case "standard":
      default: {
        const rangeProblem =
          problem === "invalidPageRange" || problem === "emptyPageRange";

        return (
          <Stack gap="sm">
            {systemPrintDialog ? (
              <Text size="sm" c="dimmed">
                {t("viewer.print.nativeRangeNote")}
              </Text>
            ) : (
              <div>
                <Text size="sm" fw={500} mb={6}>
                  {t("viewer.print.pageRange")}
                </Text>
                <SegmentedControl
                  options={[
                    { value: "all", label: t("viewer.print.pageScopeAll") },
                    {
                      value: "current",
                      label: t("viewer.print.pageScopeCurrent"),
                    },
                    {
                      value: "custom",
                      label: t("viewer.print.pageScopeCustom"),
                    },
                  ]}
                  value={pageScope}
                  onChange={chooseScope}
                  disabled={busy}
                  fullWidth
                  ariaLabel={t("viewer.print.pageRange")}
                />
                {pageScope === "custom" ? (
                  <TextInput
                    placeholder={t("viewer.print.pageRangePlaceholder")}
                    name="print-page-range"
                    autoComplete="off"
                    autoFocus
                    value={settings.pageRange}
                    onChange={(event) =>
                      update("pageRange", event.currentTarget.value)
                    }
                    disabled={busy}
                    mt={6}
                    // The field owns its reason: TextInput drops an aria-invalid
                    // set directly on it, so the wrapper supplies both the mark
                    // and the described-by link through its own error node.
                    error={
                      rangeProblem && problem ? (
                        <span>{problemText(problem)}</span>
                      ) : undefined
                    }
                    errorProps={{ id: RANGE_PROBLEM_ID }}
                  />
                ) : null}
                <Text size="sm" fw={500} mb={6} mt="sm">
                  {t("viewer.print.parityLabel")}
                </Text>
                <SegmentedControl
                  options={[
                    { value: "all", label: t("viewer.print.parityAll") },
                    { value: "odd", label: t("viewer.print.parityOdd") },
                    { value: "even", label: t("viewer.print.parityEven") },
                  ]}
                  value={settings.parity}
                  onChange={(parity) => update("parity", parity)}
                  disabled={busy}
                  fullWidth
                  ariaLabel={t("viewer.print.parityLabel")}
                />
              </div>
            )}
            {
              // The system dialog decides what reaches the paper too, including
              // whether annotations are flattened, so the toggle would lie.
            }
            {systemPrintDialog ? null : (
              <ToggleSwitch
                checked={settings.includeAnnotations}
                onChange={(checked) => update("includeAnnotations", checked)}
                label={t("viewer.print.includeAnnotations")}
                disabled={busy}
              />
            )}
          </Stack>
        );
      }
    }
  };

  // The imposed presets name their own pages inside the figure, so only the
  // plain preset has to say where the reader is. An empty selection has no page
  // to point at, and its reason is already stated beside the field.
  const showsPosition =
    settings.preset === "standard" && pageCount > 0 && !selectionEmpty;

  const pager =
    steps > 1
      ? settings.preset === "standard"
        ? {
            label: "viewer.print.pagePosition",
            values: { page: previewPage, total: pageCount },
            previous: "viewer.print.previousPage",
            next: "viewer.print.nextPage",
          }
        : {
            label: "viewer.print.outputSide",
            values: {
              side: shownStep,
              total: settings.preset === "booklet" ? steps : sides,
            },
            previous: "viewer.print.previousSide",
            next: "viewer.print.nextSide",
          }
      : null;
  const showsSelection =
    settings.preset === "standard" &&
    selected.length > 0 &&
    // The document line already counts the pages, so a range that takes the
    // whole document has nothing of its own to say.
    selected.length < pageCount;
  const clipped = rangeIsClipped(settings.pageRange, pageCount);

  // The strip's buttons are the only focusable parts of it, so arrow presses
  // arrive here from either one.
  const stepPager = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") {
      return;
    }

    const next = shownStep + (event.key === "ArrowLeft" ? -1 : 1);
    if (next < 1 || next > steps) {
      return;
    }

    event.preventDefault();
    setStep(next);
  };

  const resetSettings = () => {
    setSettings(defaultPrintSettings());
    setPageScope("all");
    setStep(0);
  };

  // The dialog is one form so Enter confirms from any field; the same guard the
  // confirm button carries keeps a refused or in-flight job out of the print
  // path, since a form can be submitted from a field it left enabled.
  const submit = () => {
    if (busy || problem !== null || !canPrint) {
      return;
    }
    onPrint(settings, pageCount);
  };

  // The figure column renders twice: once in the dialog and, larger, in the
  // overlay the Enlarge action opens. The overlay's title names the figure it
  // holds, so only the dialog copy heads it, and only the dialog copy offers
  // Enlarge, because the overlay cannot open itself.
  const previewColumn = (inDialog: boolean) => (
    <>
      {figure(
        inDialog ? (
          <Button
            variant="quiet"
            size="sm"
            onClick={() => setEnlarged(true)}
            aria-label={t("viewer.print.enlargePreview")}
          >
            {t("viewer.print.enlargePreview")}
          </Button>
        ) : undefined,
        inDialog,
      )}
      {pager ? (
        <Group
          gap={0}
          justify="center"
          className="print-preview__pager"
          onKeyDown={stepPager}
        >
          <Button
            variant="quiet"
            size="sm"
            disabled={shownStep <= 1}
            onClick={() => setStep(shownStep - 1)}
            aria-label={t(pager.previous)}
          >
            <Icon name="chevron-left" />
          </Button>
          <Text c="dimmed" className="print-preview__pager-label" role="status">
            {t(pager.label, pager.values)}
          </Text>
          <Button
            variant="quiet"
            size="sm"
            disabled={shownStep >= steps}
            onClick={() => setStep(shownStep + 1)}
            aria-label={t(pager.next)}
          >
            <Icon name="chevron-right" />
          </Button>
        </Group>
      ) : showsPosition ? (
        <Text size="xs" c="dimmed" className="print-preview__caption">
          {t("viewer.print.pagePosition", {
            page: previewPage,
            total: pageCount,
          })}
        </Text>
      ) : null}
      {showsSelection || summary ? (
        <div className="print-preview__output" role="status">
          {showsSelection ? (
            <Text size="xs" c="dimmed" className="print-preview__summary">
              {clipped
                ? t("viewer.print.rangeClipped", {
                    count: selected.length,
                    total: pageCount,
                  })
                : t("viewer.print.rangeSelection", {
                    count: selected.length,
                    total: pageCount,
                  })}
            </Text>
          ) : null}
          {summary?.map((line, index) => (
            <Text
              key={line.key}
              size={index === 0 ? "sm" : "xs"}
              c={index === 0 ? undefined : "dimmed"}
              className={`print-preview__summary${
                index === 0 ? " print-preview__summary--primary" : ""
              }`}
            >
              {t(line.key, line.values)}
            </Text>
          ))}
        </div>
      ) : null}
      {settings.preset === "booklet" ? (
        <Text size="xs" c="dimmed" className="print-preview__note">
          {t("viewer.print.bookletGuideNote")}
        </Text>
      ) : null}
      {settings.preset === "poster" ? (
        <Text size="xs" c="dimmed" className="print-preview__note">
          {t("viewer.print.posterGuideNote")}
        </Text>
      ) : null}
      <div className="print-preview__status" role="status">
        {failed ? (
          <Group gap="xs" justify="center">
            <Text size="sm" c="red">
              {t("viewer.print.previewFailed")}
            </Text>
            <Button variant="tertiary" size="sm" onClick={retry}>
              {t("viewer.print.retry")}
            </Button>
          </Group>
        ) : loading && !showsPosition ? (
          <Text size="xs" c="dimmed">
            {t("viewer.print.previewLoading")}
          </Text>
        ) : null}
      </div>
    </>
  );

  // The enlarged preview is a modal of its own: while it is open Escape belongs
  // to it, so this dialog must not read the same key as its own close.
  return (
    <Modal
      open={open}
      onClose={onClose}
      disableEscapeClose={enlarged}
      title={t("viewer.print.title")}
      width={settings.preset === "standard" ? "md" : "lg"}
      ariaLabel={t("viewer.print.title")}
      footer={
        <Group
          justify={permissionProblem && !isPhone ? "space-between" : "flex-end"}
          gap="sm"
          wrap="wrap"
        >
          {
            // The button names the next step, so only a refused document has
            // something to read here.
          }
          {permissionProblem ? (
            <Text size="xs" c="dimmed" className="print-handoff">
              {permissionProblem}
            </Text>
          ) : null}
          <Group gap="sm">
            <Button variant="tertiary" onClick={onClose}>
              {t("common.cancel")}
            </Button>
            <Button
              variant="primary"
              type="submit"
              form={PRINT_FORM_ID}
              loading={busy}
              disabled={busy || problem !== null || !canPrint}
            >
              {busy ? t("viewer.print.preparing") : t("viewer.print.confirm")}
            </Button>
          </Group>
        </Group>
      }
    >
      <form
        id={PRINT_FORM_ID}
        className={`print-body${
          settings.preset === "standard" ? " print-body--plain" : ""
        }`}
        onSubmit={(event) => {
          event.preventDefault();
          submit();
        }}
      >
        <div className="print-body__document">
          {fileName || pageCount > 0 ? (
            <Text truncate>
              {fileName ? (
                <span className="print-document__name">{fileName}</span>
              ) : null}
              {fileName && pageCount > 0 ? (
                <span className="print-document__meta">, </span>
              ) : null}
              {pageCount > 0 ? (
                <span className="print-document__meta">
                  {t("viewer.print.pageCount", { count: pageCount })}
                </span>
              ) : null}
            </Text>
          ) : null}
        </div>

        <div className="print-body__picker">
          {isPhone ? (
            // Four segments do not fit a phone width, and the clipped one reads
            // as unavailable rather than off screen, so the picker is a select.
            <Select
              label={t("viewer.print.layoutLabel")}
              value={settings.preset}
              onChange={(value) => {
                if (!value || !isPrintPreset(value)) {
                  return;
                }
                setStep(0);
                update("preset", value);
              }}
              data={PRINT_PRESETS.map((preset) => ({
                value: preset,
                label: t(PRESET_LABELS[preset]),
              }))}
              allowDeselect={false}
              disabled={busy}
            />
          ) : (
            <SegmentedControl
              options={PRINT_PRESETS.map((preset) => ({
                value: preset,
                label: t(PRESET_LABELS[preset]),
              }))}
              value={settings.preset}
              onChange={(preset) => {
                setStep(0);
                update("preset", preset);
              }}
              disabled={busy}
              fullWidth
              ariaLabel={t("viewer.print.layoutLabel")}
            />
          )}
        </div>

        <div className="print-body__controls">
          <Stack gap="md">
            <Group justify="space-between" align="center">
              <Text className="print-column__title">
                {t("viewer.print.settingsLabel")}
              </Text>
              <Button
                variant="quiet"
                size="sm"
                onClick={resetSettings}
                disabled={busy}
              >
                {t("viewer.print.reset")}
              </Button>
            </Group>
            {scopeNote && pageCount > 0 ? (
              <Text size="xs" c="dimmed">
                {t(scopeNote)}
              </Text>
            ) : null}
            {fields()}
          </Stack>
        </div>

        <div className="print-body__figure">{previewColumn(true)}</div>
      </form>

      {enlarged ? (
        <Modal
          open
          onClose={() => setEnlarged(false)}
          title={t("viewer.print.previewLabel")}
          width="xl"
        >
          <div className="print-preview--enlarged">{previewColumn(false)}</div>
        </Modal>
      ) : null}

      {error ? (
        <Alert color="red" mt="md">
          {error}
        </Alert>
      ) : null}
    </Modal>
  );
}
