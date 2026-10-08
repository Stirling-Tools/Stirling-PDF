import { useEffect, useMemo, useRef, useState } from "react";
import {
  Anchor,
  ColorPicker,
  Divider,
  Group,
  Menu,
  Popover,
  Stack,
  Text,
} from "@mantine/core";
import { useTranslation } from "react-i18next";
import { Button } from "@app/ui/Button";
import { Icon, type IconName } from "@app/ui/Icon";
import { Tooltip } from "@app/components/shared/Tooltip";
import flowClasses from "@app/components/tools/shared/createToolFlow.module.css";
import ToolStep, {
  ToolStepProvider,
} from "@app/components/tools/shared/ToolStep";
import { modShortcut } from "@app/utils/hotkeys";
import type {
  EditorStore,
  EditorViewState,
} from "@app/tools/pdfTextEditor/store/EditorStore";
import type { SelectionState } from "@app/tools/pdfTextEditor/types";
import { familyOf } from "@app/tools/pdfTextEditor/util/fontFamily";
import {
  analyzePageFonts,
  type PageFont,
} from "@app/tools/pdfTextEditor/util/pageFonts";
import {
  describeStep,
  relativeTime,
  stepTime,
} from "@app/tools/pdfTextEditor/util/historySteps";
import "@app/tools/pdfTextEditor/components/ViewerEditPanel.css";
import { BUILT_IN_FONT_FAMILIES } from "@app/tools/pdfTextEditor/components/FontFamilySelect";
import { useDocumentActions } from "@app/tools/pdfTextEditor/hooks/useDocumentActions";
import { ensureAllPagesRead } from "@app/tools/pdfTextEditor/hooks/useDocumentLoader";
import { toCssHex } from "@app/tools/pdfTextEditor/model/Color";

export interface ViewerEditPanelProps {
  store: EditorStore;
  state: EditorViewState;
  selection: SelectionState;
  onSave: () => void;
  onDownload: () => void;
}

/** Groups inside a step, a divider between each, as Compress lays them out. */
function Groups({ children }: { children: React.ReactNode[] }) {
  const shown = children.filter(Boolean);
  return (
    <Stack gap="md">
      {shown.map((child, i) => (
        <Stack key={i} gap="md">
          {i > 0 && <Divider />}
          {child}
        </Stack>
      ))}
    </Stack>
  );
}

function Caption({ children }: { children: React.ReactNode }) {
  return (
    <Text size="xs" c="dimmed" lh={1.4}>
      {children}
    </Text>
  );
}

/**
 * The text editor's tool panel while editing on the viewer's pages.
 *
 * Holds only what neither bar can: the edit history as a list to step back
 * through, exact numbers, paragraph structure, image transforms, the
 * document's fonts and settings, and saving. The floating bar formats the
 * selection and the top bar carries the file, undo/redo, inserting and find,
 * so none of those repeat here. Built from the same steps as other tool panels.
 */
export function ViewerEditPanel(props: ViewerEditPanelProps) {
  const { t } = useTranslation();
  const { store, state } = props;
  const fonts = useMemo(() => analyzePageFonts(state.pages), [state.pages]);
  const fontsWithGaps = fonts.filter(
    (f) => f.coverage.known && f.coverage.missing.length > 0,
  );

  const [open, setOpen] = useState({
    history: true,
    document: false,
  });
  const toggle = (key: keyof typeof open) =>
    setOpen((prev) => ({ ...prev, [key]: !prev[key] }));

  if (!state.hasDocument) {
    return (
      <Stack gap="xs" p="md" data-testid="pdf-editor-sidebar-empty">
        <Text size="sm" fw={500}>
          {state.loading
            ? (state.progress?.stage ??
              t("pdfTextEditor.sidebar.opening", "Opening document..."))
            : t("pdfTextEditor.sidebar.noFile", "No file loaded")}
        </Text>
        {!state.loading && (
          <Caption>
            {t(
              "pdfTextEditor.sidebar.noFileHint",
              "Pick a PDF from the Files panel on the left, or drop one in. The editor will open it automatically.",
            )}
          </Caption>
        )}
      </Stack>
    );
  }

  return (
    <Stack gap="sm" p="sm" data-testid="pdf-editor-sidebar-status">
      <ToolStepProvider>
        <ToolStep
          title={t("pdfTextEditor.history.title", "History")}
          showNumber={false}
          isCollapsed={!open.history}
          onCollapsedClick={() => toggle("history")}
        >
          <HistorySection store={store} state={state} />
        </ToolStep>

        <ToolStep
          title={t("pdfTextEditor.document.title", "Whole document")}
          showNumber={false}
          isCollapsed={!(open.document || fontsWithGaps.length > 0)}
          onCollapsedClick={() => toggle("document")}
        >
          <WholeDocumentSection store={store} state={state} fonts={fonts} />
        </ToolStep>
      </ToolStepProvider>

      {/* The other tools' execute footer: pinned while the flow scrolls. */}
      <div className={flowClasses.executeFooter}>
        <Tooltip
          content={t("pdfTextEditor.saveTooltip", {
            defaultValue:
              "Apply changes to the file in your workspace ({{shortcut}})",
            shortcut: modShortcut("S"),
          })}
          position="top"
          arrow
        >
          <Button
            onClick={() => {
              // Saving an earlier point keeps it: the later steps go, so no
              // hidden history outlives the save.
              store.discardRedo();
              props.onSave();
            }}
            disabled={!state.dirty}
            fullWidth
            data-testid="pdf-editor-save"
            style={{
              minHeight: "2.5rem",
              marginInline: "1rem",
              marginTop: "var(--mantine-spacing-md)",
              width: "calc(100% - 2rem)",
            }}
          >
            {!state.dirty
              ? t("pdfTextEditor.panel.noChanges", "No changes to save")
              : store.history.canRedo
                ? t("pdfTextEditor.panel.savePoint", "Save this point")
                : t("pdfTextEditor.panel.saveChanges", "Save changes")}
          </Button>
        </Tooltip>
        <Group justify="center" pb="xs">
          <Button
            variant="tertiary"
            accent="neutral"
            size="sm"
            leftSection={<Icon name="download" size={16} />}
            onClick={props.onDownload}
            data-testid="pdf-editor-download"
          >
            {t("pdfTextEditor.panel.downloadCopy", "Download a copy")}
          </Button>
        </Group>
      </div>
    </Stack>
  );
}

/**
 * Every edit as a timeline from the original document down. Clicking a step
 * previews the document at that point; nothing is lost until the user picks
 * Restore, which drops the later steps, or Back to latest. Saving while on an
 * earlier point restores it first, so no hidden history outlives a save.
 */
function HistorySection({
  store,
  state,
}: {
  store: EditorStore;
  state: EditorViewState;
}) {
  const { t, i18n } = useTranslation();
  const { done, undone } = store.history.entries();
  const steps = [...done, ...[...undone].reverse()];
  const current = done.length;
  const latest = steps.length;
  const previewing = current < latest;
  const listRef = useRef<HTMLDivElement | null>(null);
  const [now, setNow] = useState(() => Date.now());

  // Relative times drift; a slow tick keeps "2 min ago" honest.
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(id);
  }, []);

  // Keep the current step in view as the list grows or the user steps back.
  useEffect(() => {
    listRef.current
      ?.querySelector<HTMLElement>("[data-current='true']")
      ?.scrollIntoView({ block: "nearest" });
  }, [current, latest]);

  const goTo = (position: number) => {
    for (let i = store.history.entries().done.length; i > position; i--) {
      store.undo();
    }
    for (let i = store.history.entries().done.length; i < position; i++) {
      store.redo();
    }
  };

  if (latest === 0) {
    return (
      <Caption>
        {t(
          "pdfTextEditor.history.empty",
          "Your edits will be listed here. Click one to go back to that point.",
        )}
      </Caption>
    );
  }

  const row = (
    position: number,
    label: string,
    icon: IconName,
    meta: string | null,
  ) => {
    const isCurrent = position === current;
    const isUndone = position > current;
    return (
      <div
        key={position}
        className="pdf-edit-history__row"
        data-current={isCurrent ? "true" : undefined}
        data-undone={isUndone ? "true" : undefined}
        data-last={position === latest ? "true" : undefined}
      >
        <button
          type="button"
          className="pdf-edit-history__hit"
          onClick={() => goTo(position)}
          aria-current={isCurrent ? "step" : undefined}
          data-testid={`pdf-editor-history-${position}`}
        >
          <span className="pdf-edit-history__node" aria-hidden>
            <Icon name={icon} size={13} />
          </span>
          <span className="pdf-edit-history__text">
            <span className="pdf-edit-history__label">{label}</span>
            {meta && <span className="pdf-edit-history__meta">{meta}</span>}
          </span>
        </button>
        {isCurrent && previewing && (
          <Tooltip
            content={t("pdfTextEditor.history.restoreTip", {
              defaultValue:
                "Keep this point and discard the {{count}} later changes",
              count: latest - current,
            })}
            position="left"
            arrow
          >
            <Button
              size="sm"
              className="pdf-edit-history__restore"
              onClick={() => store.discardRedo()}
              data-testid="pdf-editor-history-restore"
            >
              {t("pdfTextEditor.history.restore", "Restore")}
            </Button>
          </Tooltip>
        )}
      </div>
    );
  };

  const rows: React.ReactNode[] = [
    row(
      0,
      t("pdfTextEditor.history.original", "Original document"),
      "file-text",
      t("pdfTextEditor.history.originalMeta", "As opened"),
    ),
  ];
  steps.forEach((cmd, i) => {
    const step = describeStep(cmd, t);
    const meta = [
      step.items !== null
        ? t("pdfTextEditor.history.items", {
            defaultValue: "{{count}} items",
            count: step.items,
          })
        : step.page === null
          ? null
          : t("pdfTextEditor.history.page", {
              defaultValue: "Page {{page}}",
              page: step.page,
            }),
      relativeTime(stepTime(cmd), now, i18n.language),
    ]
      .filter(Boolean)
      .join(" · ");
    rows.push(
      row(
        i + 1,
        step.snippet ? `${step.label}: “${step.snippet}”` : step.label,
        step.icon,
        meta,
      ),
    );
  });

  return (
    <Stack gap={8} data-testid="pdf-editor-history">
      <Caption>
        {previewing ? (
          <>
            {t("pdfTextEditor.history.hidden", {
              defaultValue: "{{count}} later changes hidden",
              count: latest - current,
            })}
            {" · "}
            <Anchor
              component="button"
              type="button"
              size="xs"
              onClick={() => goTo(latest)}
              data-testid="pdf-editor-history-latest"
            >
              {t("pdfTextEditor.history.backToLatest", "Back to latest")}
            </Anchor>
          </>
        ) : state.dirty ? (
          t("pdfTextEditor.history.unsaved", "Unsaved changes")
        ) : (
          t("pdfTextEditor.history.clean", "No unsaved changes")
        )}
      </Caption>
      <div className="pdf-edit-history" ref={listRef}>
        {rows}
      </div>
    </Stack>
  );
}

const FONT_STATUS: Record<PageFont["status"], { label: string; key: string }> =
  {
    standard: { label: "Standard", key: "standard" },
    embedded: { label: "Embedded", key: "embedded" },
    subset: { label: "Partial", key: "subset" },
  };

function fontDisplayName(
  t: ReturnType<typeof useTranslation>["t"],
  name: string,
) {
  const family = familyOf(name);
  return !family || family === "Unknown"
    ? t("pdfTextEditor.floatingBar.embeddedFont", "Embedded font")
    : family;
}

function FontRow({
  font,
  uses,
  onReplace,
}: {
  font: PageFont;
  uses: number;
  onReplace: (family: string) => void;
}) {
  const { t } = useTranslation();
  const status = FONT_STATUS[font.status];
  const { known, missing } = font.coverage;
  return (
    <Group justify="space-between" wrap="nowrap" gap="sm" align="flex-start">
      <Stack gap={2} style={{ minWidth: 0 }}>
        <Text
          size="sm"
          title={font.name}
          style={{
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {fontDisplayName(t, font.name)}
        </Text>
        <Caption>
          <span data-testid={`pdf-editor-font-${font.status}`}>
            {t(`pdfTextEditor.panel.fontStatus.${status.key}`, status.label)}
          </span>
          {" · "}
          {t("pdfTextEditor.document.uses", {
            defaultValue: "{{count}} text boxes",
            count: uses,
          })}
          {known && missing.length > 0 && (
            <>
              {" · "}
              {t("pdfTextEditor.panel.coverageMissing", {
                defaultValue: "Missing {{glyphs}}",
                glyphs: missing.slice(0, 8).join(" "),
              })}
            </>
          )}
        </Caption>
      </Stack>
      <FontChoiceMenu
        label={t("pdfTextEditor.document.replace", "Replace")}
        heading={t(
          "pdfTextEditor.document.replaceWith",
          "Replace everywhere with",
        )}
        testId={`pdf-editor-replace-font-${font.key}`}
        onPick={onReplace}
      />
    </Group>
  );
}

/**
 * Changes that sweep the whole document: a font swapped everywhere it is
 * used, every piece of text in one colour recoloured, everything unlocked.
 * The bars only ever act on the selection, so these live here.
 */
function WholeDocumentSection({
  store,
  state,
  fonts,
}: {
  store: EditorStore;
  state: EditorViewState;
  fonts: PageFont[];
}) {
  const { t } = useTranslation();
  const actions = useDocumentActions(store);

  // Pages past the eager read hold no runs yet; read them so counts and
  // swatches describe the whole document, not just what has been scrolled.
  useEffect(() => {
    const id = window.setTimeout(() => ensureAllPagesRead(store), 0);
    return () => window.clearTimeout(id);
  }, [store]);

  const runs = state.pages.flatMap((p) => p.runs);
  const fontUse = (name: string) =>
    runs.filter((r) => r.fontId.endsWith(name)).length;
  const colours = useMemo(() => {
    const counts = new Map<string, number>();
    for (const run of state.pages.flatMap((p) => p.runs)) {
      const hex = toCssHex(run.fill).toLowerCase();
      counts.set(hex, (counts.get(hex) ?? 0) + 1);
    }
    return Array.from(counts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 12);
  }, [state.pages]);
  const lockedCount =
    runs.filter((r) => r.locked).length +
    state.pages.flatMap((p) => p.images).filter((i) => i.locked).length;

  return (
    <div data-testid="pdf-editor-fonts-panel">
      <Groups>
        <Stack gap="sm">
          <Group justify="space-between" wrap="nowrap" gap="sm">
            <Text size="sm" fw={500}>
              {t("pdfTextEditor.document.fonts", "Fonts")}
            </Text>
            {fonts.length > 0 && (
              <FontChoiceMenu
                label={t("pdfTextEditor.document.changeAll", "Change all")}
                heading={t(
                  "pdfTextEditor.document.allFontsTo",
                  "Set all text in",
                )}
                testId="pdf-editor-all-fonts"
                onPick={(family) => void actions.replaceFont(null, family)}
              />
            )}
          </Group>
          {fonts.length === 0 ? (
            <Caption>
              {t(
                "pdfTextEditor.panel.noFonts",
                "No text read on the pages yet.",
              )}
            </Caption>
          ) : (
            fonts.map((font) => (
              <FontRow
                key={font.key}
                font={font}
                uses={fontUse(font.name)}
                onReplace={(family) =>
                  void actions.replaceFont(font.name, family)
                }
              />
            ))
          )}
        </Stack>

        {colours.length > 0 && (
          <Stack gap="sm" data-testid="pdf-editor-document-colours">
            <Group justify="space-between" wrap="nowrap" gap="sm">
              <Text size="sm" fw={500}>
                {t("pdfTextEditor.document.colours", "Text colours")}
              </Text>
              <ColourPicking
                initial={colours[0][0]}
                onChange={(next) => actions.recolour(null, next)}
              >
                {(toggle) => (
                  <Button
                    size="sm"
                    variant="tertiary"
                    accent="neutral"
                    rightSection={<Icon name="chevron-down" size={14} />}
                    onClick={toggle}
                    data-testid="pdf-editor-all-colours"
                  >
                    {t("pdfTextEditor.document.changeAll", "Change all")}
                  </Button>
                )}
              </ColourPicking>
            </Group>
            <Caption>
              {t(
                "pdfTextEditor.document.coloursHint",
                "Click a colour to change only the text using it.",
              )}
            </Caption>
            <Group gap={8}>
              {colours.map(([hex, count]) => (
                <ColourSwatch
                  key={hex}
                  hex={hex}
                  count={count}
                  onChange={(next) => actions.recolour(hex, next)}
                />
              ))}
            </Group>
          </Stack>
        )}

        {lockedCount > 0 && (
          <Group
            justify="space-between"
            wrap="nowrap"
            gap="sm"
            data-testid="pdf-editor-document-locked"
          >
            <Group gap={8} wrap="nowrap">
              <Icon
                name="lock"
                size={16}
                style={{ color: "var(--c-text-muted)" }}
              />
              <Text size="sm">
                {t("pdfTextEditor.document.locked", {
                  defaultValue: "{{count}} locked",
                  count: lockedCount,
                })}
              </Text>
            </Group>
            <Button
              size="sm"
              variant="secondary"
              accent="neutral"
              onClick={actions.unlockAll}
              data-testid="pdf-editor-unlock-all"
            >
              {t("pdfTextEditor.document.unlockAll", "Unlock all")}
            </Button>
          </Group>
        )}
      </Groups>
    </div>
  );
}

/** One colour in use: its swatch opens a picker that recolours it everywhere. */
/** A compact menu of the fonts any text can be set in. */
function FontChoiceMenu({
  label,
  heading,
  testId,
  onPick,
}: {
  label: string;
  heading: string;
  testId: string;
  onPick: (family: string) => void;
}) {
  return (
    <Menu shadow="md" position="bottom-end" withinPortal>
      <Menu.Target>
        <Button
          size="sm"
          variant="tertiary"
          accent="neutral"
          rightSection={<Icon name="chevron-down" size={14} />}
          data-testid={testId}
        >
          {label}
        </Button>
      </Menu.Target>
      <Menu.Dropdown>
        <Menu.Label>{heading}</Menu.Label>
        {BUILT_IN_FONT_FAMILIES.map((option) => (
          <Menu.Item key={option.value} onClick={() => onPick(option.value)}>
            {option.label}
          </Menu.Item>
        ))}
      </Menu.Dropdown>
    </Menu>
  );
}

/**
 * A colour picker behind any trigger: one undoable change when the pick lands,
 * nothing while the user is still dragging.
 */
function ColourPicking({
  initial,
  onChange,
  children,
}: {
  initial: string;
  onChange: (next: string) => void;
  children: (toggle: () => void) => React.ReactNode;
}) {
  const [opened, setOpened] = useState(false);
  return (
    <Popover
      opened={opened}
      onChange={setOpened}
      position="bottom-end"
      shadow="md"
      withinPortal
    >
      <Popover.Target>
        <span className="pdf-edit-panel__swatch-wrap">
          {children(() => setOpened((o) => !o))}
        </span>
      </Popover.Target>
      <Popover.Dropdown>
        <ColorPicker
          format="hex"
          defaultValue={initial}
          swatches={RECOLOUR_SWATCHES}
          swatchesPerRow={6}
          size="sm"
          onChangeEnd={(next) => {
            setOpened(false);
            if (next.toLowerCase() !== initial.toLowerCase()) onChange(next);
          }}
        />
      </Popover.Dropdown>
    </Popover>
  );
}

/** One colour in use: its swatch opens a picker that recolours it everywhere. */
function ColourSwatch({
  hex,
  count,
  onChange,
}: {
  hex: string;
  count: number;
  onChange: (next: string) => void;
}) {
  const { t } = useTranslation();
  const label = t("pdfTextEditor.document.colourUses", {
    defaultValue: "{{hex}} · {{count}} text boxes",
    hex: hex.toUpperCase(),
    count,
  });
  return (
    <ColourPicking initial={hex} onChange={onChange}>
      {(toggle) => (
        <Tooltip content={label} position="top" arrow>
          <button
            type="button"
            className="pdf-edit-panel__swatch"
            style={{ background: hex }}
            aria-label={label}
            onClick={toggle}
            data-testid={`pdf-editor-colour-${hex.slice(1)}`}
          />
        </Tooltip>
      )}
    </ColourPicking>
  );
}

const RECOLOUR_SWATCHES = [
  "#000000",
  "#434343",
  "#8a8a8a",
  "#ffffff",
  "#c0392b",
  "#e67e22",
  "#f1c40f",
  "#27ae60",
  "#16a085",
  "#2980b9",
  "#8e44ad",
  "#d35490",
];
