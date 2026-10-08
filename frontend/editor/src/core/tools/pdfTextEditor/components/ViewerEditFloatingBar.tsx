import {
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { createPortal } from "react-dom";
import {
  ColorInput,
  ColorPicker,
  Divider,
  Group,
  Menu,
  NumberInput,
  Popover,
  Stack,
  Text,
} from "@mantine/core";
import { Tooltip } from "@app/components/shared/Tooltip";
import { useTranslation } from "react-i18next";
import { Icon, type IconName } from "@app/ui/Icon";
import type {
  EditorStore,
  EditorViewState,
} from "@app/tools/pdfTextEditor/store/EditorStore";
import type { SelectionState } from "@app/tools/pdfTextEditor/types";
import type { Controller } from "@app/tools/pdfTextEditor/components/toolbar/toolbarShared";
import {
  ArrangePanel,
  TransformPanel,
} from "@app/tools/pdfTextEditor/components/toolbar/ArrangePanel";
import { BUILT_IN_FONT_FAMILIES } from "@app/tools/pdfTextEditor/components/FontFamilySelect";
import {
  groupByFamily,
  isLocalFontAccessSupported,
  listLocalFonts,
  loadedLocalFonts,
  subscribeLocalFonts,
} from "@app/tools/pdfTextEditor/util/localFonts";
import { useSelectionActions } from "@app/tools/pdfTextEditor/hooks/useSelectionActions";
import { useSelectionGeometry } from "@app/tools/pdfTextEditor/hooks/useSelectionGeometry";
import { useParagraphActions } from "@app/tools/pdfTextEditor/hooks/useParagraphActions";
import { PointsInput } from "@app/tools/pdfTextEditor/components/inspector/InspectorPrimitives";
import { parseCssColor, toCssHex } from "@app/tools/pdfTextEditor/model/Color";
import { familyOf } from "@app/tools/pdfTextEditor/util/fontFamily";
import { modShortcut } from "@app/utils/hotkeys";
import "@app/components/viewer/TextSelectionMenu.css";
import "@app/tools/pdfTextEditor/components/ViewerEditFloatingBar.css";

const GAP_PX = 10;
const EDGE_PX = 12;
/** Room the bar needs above the selection before it flips underneath. */
const FLIP_ROOM_PX = 56;
const MIN_FONT_SIZE = 4;
const MAX_FONT_SIZE = 144;
const SIZE_PRESETS = [8, 9, 10, 11, 12, 14, 16, 18, 20, 24, 30, 36, 48, 72];
const SWATCHES = [
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

interface Placement {
  left: number;
  top: number;
  below: boolean;
}

function selectedElements(selection: SelectionState): HTMLElement[] {
  const ids = [
    ...selection.runIds.map((id) => `pdf-editor-run-${id}`),
    ...selection.imageIds.map((id) => `pdf-editor-image-${id}`),
  ];
  return ids
    .map((id) =>
      document.querySelector<HTMLElement>(`[data-testid="${CSS.escape(id)}"]`),
    )
    .filter((el): el is HTMLElement => el !== null);
}

function scrollParent(el: HTMLElement): HTMLElement | null {
  for (let node = el.parentElement; node; node = node.parentElement) {
    if (/auto|scroll/.test(getComputedStyle(node).overflowY)) return node;
  }
  return null;
}

/**
 * Follows the selection every frame: the viewer scrolls, zooms and reflows
 * the run while the user types, and none of those announce themselves.
 * Null while the selection is off-screen or not laid out.
 */
function useSelectionPlacement(
  selection: SelectionState,
  barRef: React.RefObject<HTMLDivElement | null>,
): Placement | null {
  const [placement, setPlacement] = useState<Placement | null>(null);
  const active = selection.runIds.length + selection.imageIds.length > 0;

  useEffect(() => {
    if (!active) {
      setPlacement(null);
      return;
    }
    let frame = 0;
    let last = "";
    const tick = () => {
      frame = requestAnimationFrame(tick);
      const els = selectedElements(selection);
      let next: Placement | null = null;
      if (els.length > 0) {
        let top = Infinity;
        let bottom = -Infinity;
        let left = Infinity;
        let right = -Infinity;
        for (const el of els) {
          const r = el.getBoundingClientRect();
          top = Math.min(top, r.top);
          bottom = Math.max(bottom, r.bottom);
          left = Math.min(left, r.left);
          right = Math.max(right, r.right);
        }
        const clip = scrollParent(els[0])?.getBoundingClientRect();
        const visible =
          !clip ||
          (bottom > clip.top && top < clip.bottom && right > clip.left);
        if (visible && right > left) {
          const floor = clip ? clip.top : 0;
          const below = top - floor < FLIP_ROOM_PX;
          const width = barRef.current?.offsetWidth ?? 0;
          const centre = (left + right) / 2;
          const half = width / 2;
          next = {
            left: Math.min(
              Math.max(centre, EDGE_PX + half),
              window.innerWidth - EDGE_PX - half,
            ),
            top: below ? bottom + GAP_PX : top - GAP_PX,
            below,
          };
        }
      }
      const key = next
        ? `${Math.round(next.left)}|${Math.round(next.top)}|${next.below}`
        : "";
      if (key !== last) {
        last = key;
        setPlacement(next);
      }
    };
    tick();
    return () => cancelAnimationFrame(frame);
  }, [active, selection, barRef]);

  return placement;
}

interface Tip {
  title: string;
  shortcut?: string;
}

/** Placement for every tooltip on the bar: away from the selection. */
type TipSide = "top" | "bottom";

/**
 * The app's standard tooltip around a span. The span keeps a disabled button
 * (which takes no pointer events) explainable, and gives a Menu or Popover
 * target a plain element to attach to instead of the tooltip itself.
 */
function PillTooltip({
  tip,
  side,
  disabled = false,
  children,
}: {
  tip: Tip;
  side: TipSide;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <Tooltip
      content={tip.shortcut ? `${tip.title} (${tip.shortcut})` : tip.title}
      position={side}
      offset={10}
      arrow
      portalTarget={document.body}
      disabled={disabled}
      openOnFocus={false}
    >
      <span className="pdf-edit-pill__tip-target">{children}</span>
    </Tooltip>
  );
}

function PillButton({
  icon,
  tip,
  side,
  onClick,
  active = false,
  danger = false,
  disabled = false,
  testId,
}: {
  icon: IconName;
  tip: Tip;
  side: TipSide;
  onClick?: () => void;
  active?: boolean;
  danger?: boolean;
  disabled?: boolean;
  testId?: string;
}) {
  const classes = ["embedpdf-floating-btn"];
  if (active) classes.push("embedpdf-floating-btn-active");
  if (danger) classes.push("embedpdf-floating-btn-danger");
  return (
    <PillTooltip tip={tip} side={side}>
      <button
        type="button"
        className={classes.join(" ")}
        onClick={onClick}
        disabled={disabled}
        aria-label={tip.title}
        aria-pressed={active || undefined}
        data-testid={testId}
      >
        <Icon name={icon} size={18} />
      </button>
    </PillTooltip>
  );
}

/**
 * Every dropdown on the bar, so they all open, look and close alike: a caret on
 * the trigger says it opens something rather than acting at once, the trigger
 * stays marked while open, and its tooltip stands down so it never covers the
 * dropdown. Lists of choices are menus (arrow keys move through them); groups
 * of controls or actions are panels.
 */
function PillDropdown({
  kind,
  open,
  onOpenChange,
  position,
  side,
  tip,
  label,
  testId,
  className,
  caret = true,
  trigger,
  children,
}: {
  kind: "menu" | "panel";
  open: boolean;
  onOpenChange: (open: boolean) => void;
  position: "top" | "bottom" | "top-start" | "bottom-start";
  side: TipSide;
  tip: Tip;
  label: string;
  testId?: string;
  className?: string;
  caret?: boolean;
  trigger: React.ReactNode;
  children: React.ReactNode;
}) {
  // A panel leaves focus on the page, and Mantine hears Escape only inside its
  // dropdown. From outside it, Escape is caught here so it shuts the panel and
  // not also the selection; from inside, Mantine closes it and hands focus back
  // to the text, which is what keeps the selection.
  useEffect(() => {
    if (kind !== "panel" || !open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (document.activeElement?.closest(".pdf-edit-pill__dropdown")) return;
      e.stopPropagation();
      onOpenChange(false);
    };
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [kind, open, onOpenChange]);

  const button = (
    <span className="pdf-edit-pill__tip-target">
      <PillTooltip side={side} disabled={open} tip={tip}>
        <button
          type="button"
          className={[
            "embedpdf-floating-btn",
            "pdf-edit-pill__trigger",
            className,
          ]
            .filter(Boolean)
            .join(" ")}
          data-open={open ? "true" : undefined}
          aria-expanded={open}
          aria-label={label}
          data-testid={testId}
          // A menu's target toggles itself; a controlled popover's does not.
          onClick={kind === "panel" ? () => onOpenChange(!open) : undefined}
        >
          {trigger}
          {caret && (
            <Icon
              name="chevron-down"
              size={12}
              className="pdf-edit-pill__caret"
            />
          )}
        </button>
      </PillTooltip>
    </span>
  );
  // Clicks inside a dropdown must not read as a press on the bare page.
  const dropdownProps = {
    className: "pdf-edit-pill__dropdown",
    onMouseDown: (e: React.MouseEvent) => e.stopPropagation(),
  };
  return kind === "menu" ? (
    <Menu
      opened={open}
      onChange={onOpenChange}
      position={position}
      shadow="md"
      withinPortal
    >
      <Menu.Target>{button}</Menu.Target>
      <Menu.Dropdown {...dropdownProps}>{children}</Menu.Dropdown>
    </Menu>
  ) : (
    <Popover
      opened={open}
      onChange={onOpenChange}
      position={position}
      shadow="md"
      withinPortal
    >
      <Popover.Target>{button}</Popover.Target>
      <Popover.Dropdown {...dropdownProps}>{children}</Popover.Dropdown>
    </Popover>
  );
}

/** Leading slot marking the current option, as the app's other menus do. */
function currentMark(current: boolean) {
  return current ? (
    <Icon name="check" size="1rem" />
  ) : (
    <span style={{ display: "inline-block", width: "1rem" }} />
  );
}

/** CSS stack that previews a built-in family in a face the browser has. */
function previewStyle(family: string): React.CSSProperties {
  const bold = /bold/i.test(family);
  const italic = /italic/i.test(family);
  let stack = `"${family}", sans-serif`;
  if (family.startsWith("Helvetica")) stack = "Helvetica, Arial, sans-serif";
  else if (family.startsWith("Times"))
    stack = '"Times New Roman", Times, serif';
  else if (family.startsWith("Courier"))
    stack = '"Courier New", Courier, monospace';
  return {
    fontFamily: stack,
    fontWeight: bold ? 700 : undefined,
    fontStyle: italic ? "italic" : undefined,
  };
}

/**
 * Font families as a plain menu, each named in its own face: one click from
 * the chip to the list, where a select inside a popover took two.
 */
function FontMenuItems({
  current,
  onPick,
}: {
  current: string | null;
  onPick: (family: string) => void;
}) {
  const { t } = useTranslation();
  const supported = useMemo(() => isLocalFontAccessSupported(), []);
  const localFonts = useSyncExternalStore(
    subscribeLocalFonts,
    loadedLocalFonts,
    loadedLocalFonts,
  );
  const deviceFamilies = useMemo(() => {
    if (!localFonts) return [];
    const builtIn = new Set(
      BUILT_IN_FONT_FAMILIES.map((o) => o.value.toLowerCase()),
    );
    return groupByFamily(localFonts)
      .map((f) => f.family)
      .filter((f) => !builtIn.has(f.toLowerCase()));
  }, [localFonts]);
  const known =
    !!current &&
    (BUILT_IN_FONT_FAMILIES.some((o) => o.value === current) ||
      deviceFamilies.includes(current));

  return (
    <div className="pdf-edit-pill__fonts">
      {current && !known && (
        <>
          <Menu.Label>
            {t("pdfTextEditor.fontPicker.documentGroup", "Document font")}
          </Menu.Label>
          {/* Listed so the user sees what the text is; there are no bytes to
              re-apply it, so picking it is not offered. */}
          <Menu.Item disabled leftSection={currentMark(true)}>
            {current === "Unknown"
              ? t("pdfTextEditor.floatingBar.embeddedFont", "Embedded font")
              : current}
          </Menu.Item>
        </>
      )}
      <Menu.Label>
        {t("pdfTextEditor.fontPicker.builtInGroup", "Built-in fonts")}
      </Menu.Label>
      {BUILT_IN_FONT_FAMILIES.map((option) => (
        <Menu.Item
          key={option.value}
          onClick={() => onPick(option.value)}
          leftSection={currentMark(option.value === current)}
          style={previewStyle(option.value)}
        >
          {option.label}
        </Menu.Item>
      ))}
      {deviceFamilies.length > 0 && (
        <>
          <Menu.Label>
            {t("pdfTextEditor.fontPicker.deviceGroup", "Device fonts")}
          </Menu.Label>
          {deviceFamilies.map((family) => (
            <Menu.Item
              key={family}
              onClick={() => onPick(family)}
              leftSection={currentMark(family === current)}
              style={{ fontFamily: `"${family}", sans-serif` }}
            >
              {family}
            </Menu.Item>
          ))}
        </>
      )}
      {supported && deviceFamilies.length === 0 && (
        <>
          <Menu.Divider />
          <Menu.Item
            leftSection={<Icon name="case-sensitive" size="1rem" />}
            closeMenuOnClick={false}
            onClick={() => {
              void listLocalFonts();
            }}
          >
            {t("pdfTextEditor.fontPicker.useDeviceFonts", "Use device fonts")}
          </Menu.Item>
        </>
      )}
    </div>
  );
}

/** Glyph outline, under the fill colour it frames. */
function OutlineControls({ controller }: { controller: Controller }) {
  const { t } = useTranslation();
  const { state, onChangeOutline } = controller;
  const width = state.strokeWidth ?? 0;
  const hex = state.stroke ? toCssHex(state.stroke) : "#000000";
  return (
    <Stack gap={6}>
      <Text size="xs" fw={500}>
        {t("pdfTextEditor.floatingBar.outline", "Outline")}
      </Text>
      <Group gap="xs" wrap="nowrap">
        <ColorInput
          size="xs"
          w={130}
          value={hex}
          withEyeDropper={false}
          onChangeEnd={(next) => {
            if (!next || !parseCssColor(next)) return;
            // Picking a colour turns the outline on.
            onChangeOutline(next, width > 0 ? width : 0.5);
          }}
          aria-label={t(
            "pdfTextEditor.toolbar.outlineColour",
            "Outline colour",
          )}
          data-testid="pdf-editor-outline-colour"
        />
        <NumberInput
          size="xs"
          w={86}
          min={0}
          max={12}
          step={0.25}
          decimalScale={2}
          suffix=" pt"
          value={width}
          disabled={state.strokeWidth === null}
          onChange={(value) => {
            const next = typeof value === "number" ? value : Number(value);
            if (!Number.isFinite(next) || next < 0) return;
            if (next > 0 && state.mixed.stroke) return;
            onChangeOutline(next > 0 ? hex : null, next);
          }}
          aria-label={t(
            "pdfTextEditor.toolbar.outlineWidth",
            "Outline width (0 = none)",
          )}
          data-testid="pdf-editor-outline-width"
        />
      </Group>
    </Stack>
  );
}

/** Exact placement in points; size too for an image, whose box is its own. */
function PositionFields({
  geometry,
  isImage,
}: {
  geometry: NonNullable<ReturnType<typeof useSelectionGeometry>["single"]>;
  isImage: boolean;
}) {
  const { t } = useTranslation();
  const field = (label: string, node: React.ReactNode) => (
    <Stack gap={2} style={{ minWidth: 0, flex: 1 }}>
      <Text size="xs" c="dimmed">
        {label}
      </Text>
      {node}
    </Stack>
  );
  return (
    <Stack gap="xs" w={220}>
      <Group gap="xs" wrap="nowrap" align="flex-start">
        {field(
          "X",
          <PointsInput
            value={geometry.bounds.x}
            onCommit={geometry.setX}
            label={t("pdfTextEditor.inspector.x", "X")}
            testId="pdf-editor-pos-x"
          />,
        )}
        {field(
          "Y",
          <PointsInput
            value={geometry.bounds.y}
            onCommit={geometry.setY}
            label={t("pdfTextEditor.inspector.y", "Y")}
            testId="pdf-editor-pos-y"
          />,
        )}
      </Group>
      {isImage && geometry.setHeight ? (
        <Group gap="xs" wrap="nowrap" align="flex-start">
          {field(
            t("pdfTextEditor.inspector.width", "Width"),
            <PointsInput
              value={geometry.bounds.width}
              onCommit={geometry.setWidth}
              min={1}
              label={t("pdfTextEditor.inspector.width", "Width")}
              testId="pdf-editor-size-w"
            />,
          )}
          {field(
            t("pdfTextEditor.inspector.height", "Height"),
            <PointsInput
              value={geometry.bounds.height}
              onCommit={geometry.setHeight}
              min={1}
              label={t("pdfTextEditor.inspector.height", "Height")}
              testId="pdf-editor-size-h"
            />,
          )}
        </Group>
      ) : (
        <Text size="xs" c="dimmed">
          {t("pdfTextEditor.floatingBar.positionHint", {
            defaultValue:
              "Points from the bottom-left corner. Text is {{width}} × {{height}} pt, set by its type.",
            width: geometry.bounds.width.toFixed(0),
            height: geometry.bounds.height.toFixed(0),
          })}
        </Text>
      )}
    </Stack>
  );
}

interface ViewerEditFloatingBarProps {
  store: EditorStore;
  state: EditorViewState;
  selection: SelectionState;
  controller: Controller;
}

type DropdownId =
  | "font"
  | "size"
  | "colour"
  | "case"
  | "position"
  | "transform"
  | "arrange";

/**
 * The selection's own tools, floating beside it on the page: the viewer's
 * text-selection bubble, carrying the editor's formatting instead of markup.
 */
export function ViewerEditFloatingBar({
  store,
  state: viewState,
  selection,
  controller,
}: ViewerEditFloatingBarProps) {
  const { t } = useTranslation();
  const barRef = useRef<HTMLDivElement | null>(null);
  const placement = useSelectionPlacement(selection, barRef);
  const sel = useSelectionActions(store);
  const geometry = useSelectionGeometry(store, viewState, selection);
  const paragraph = useParagraphActions(store);
  const canMerge = selection.runIds.length >= 2;
  const canSplit = (() => {
    if (selection.runIds.length !== 1) return false;
    const run = viewState.pages
      .flatMap((p) => p.runs)
      .find((r) => r.id === selection.runIds[0]);
    return !!run && (run.paragraphLineCount ?? 0) > 1;
  })();
  // One dropdown open at a time, whichever kind it is.
  const [openMenu, setOpenMenu] = useState<DropdownId | null>(null);
  const dropdown = (id: DropdownId) => ({
    open: openMenu === id,
    onOpenChange: (open: boolean) =>
      setOpenMenu((current) => (open ? id : current === id ? null : current)),
  });
  const [pendingColour, setPendingColour] = useState<string | null>(null);

  const {
    state,
    hasRunSelection,
    hasImageSelection,
    selectionAllLocked,
    selectionCount,
  } = controller;

  // A fresh selection drops whatever a previous one left half-open.
  const selectionKey = [...selection.runIds, ...selection.imageIds].join(",");
  useEffect(() => {
    setOpenMenu(null);
    setPendingColour(null);
  }, [selectionKey]);

  if (!placement || selectionCount === 0) return null;

  const fontSize = state.mixed.fontSize
    ? null
    : Math.round((state.fontSize ?? 12) * 10) / 10;
  const fillHex =
    pendingColour ?? (state.fill ? toCssHex(state.fill) : "#000000");
  const family = state.fontFamily ? familyOf(state.fontFamily) : null;
  const tipSide: TipSide = placement.below ? "bottom" : "top";
  const dropSide = placement.below ? "bottom" : "top";
  const embedded = !state.mixed.fontFamily && (!family || family === "Unknown");
  const familyLabel = state.mixed.fontFamily
    ? t("pdfTextEditor.fontPicker.mixed", "Mixed")
    : !family || family === "Unknown"
      ? t("pdfTextEditor.floatingBar.embeddedFont", "Embedded font")
      : family;
  const stepSize = (delta: number) => {
    const base = fontSize ?? 12;
    const next = Math.min(MAX_FONT_SIZE, Math.max(MIN_FONT_SIZE, base + delta));
    controller.onChangeFontSize(next);
  };

  const fontLabel = t("pdfTextEditor.floatingBar.font", "Font");
  const sizeLabel = t("pdfTextEditor.toolbar.fontSize", "Font size");
  const colourLabel = t("pdfTextEditor.floatingBar.colour", "Text colour");
  const caseLabel = t("pdfTextEditor.toolbar.changeCase", "Change case");
  const positionLabel = t(
    "pdfTextEditor.floatingBar.position",
    "Position and size",
  );
  const transformLabel = t(
    "pdfTextEditor.floatingBar.transform",
    "Rotate and flip",
  );
  const arrangeLabel = t("pdfTextEditor.floatingBar.arrange", "Arrange");

  return createPortal(
    <div
      ref={barRef}
      className="pdf-edit-pill"
      data-below={placement.below ? "true" : "false"}
      data-testid="pdf-editor-floating-bar"
      style={{ left: placement.left, top: placement.top }}
      // Keeps the caret in the run being edited while a control is pressed.
      onMouseDown={(e) => e.preventDefault()}
    >
      <div className="embedpdf-floating-menu pdf-edit-pill__menu">
        {hasRunSelection && (
          <>
            <PillDropdown
              kind="menu"
              {...dropdown("font")}
              position={placement.below ? "bottom-start" : "top-start"}
              side={tipSide}
              tip={{
                title: embedded
                  ? t(
                      "pdfTextEditor.floatingBar.fontEmbedded",
                      "Font (embedded in this PDF)",
                    )
                  : fontLabel,
              }}
              label={fontLabel}
              className="pdf-edit-pill__chip"
              testId="pdf-editor-floating-font"
              trigger={
                <span className="pdf-edit-pill__chip-label">{familyLabel}</span>
              }
            >
              <FontMenuItems
                current={state.mixed.fontFamily ? null : family}
                onPick={controller.onChangeFontFamily}
              />
            </PillDropdown>

            <div className="pdf-edit-pill__stepper">
              <PillButton
                side={tipSide}
                icon="minus"
                tip={{
                  title: t(
                    "pdfTextEditor.floatingBar.smaller",
                    "Decrease size",
                  ),
                }}
                onClick={() => stepSize(-1)}
                disabled={fontSize !== null && fontSize <= MIN_FONT_SIZE}
                testId="pdf-editor-floating-size-down"
              />
              {/* The stepper's value opens its presets; a caret there would
                  read as a fourth control squeezed between − and +. */}
              <PillDropdown
                kind="menu"
                {...dropdown("size")}
                position={dropSide}
                side={tipSide}
                tip={{ title: sizeLabel }}
                label={sizeLabel}
                className="pdf-edit-pill__size"
                testId="pdf-editor-floating-size"
                caret={false}
                trigger={fontSize ?? "–"}
              >
                <div className="pdf-edit-pill__sizes">
                  {SIZE_PRESETS.map((size) => (
                    <Menu.Item
                      key={size}
                      onClick={() => controller.onChangeFontSize(size)}
                      data-current={size === fontSize ? "true" : undefined}
                    >
                      {size}
                    </Menu.Item>
                  ))}
                </div>
              </PillDropdown>
              <PillButton
                side={tipSide}
                icon="plus"
                tip={{
                  title: t("pdfTextEditor.floatingBar.larger", "Increase size"),
                }}
                onClick={() => stepSize(1)}
                disabled={fontSize !== null && fontSize >= MAX_FONT_SIZE}
                testId="pdf-editor-floating-size-up"
              />
            </div>

            <PillDropdown
              kind="panel"
              {...dropdown("colour")}
              position={dropSide}
              side={tipSide}
              tip={{ title: colourLabel }}
              label={colourLabel}
              testId="pdf-editor-floating-colour"
              trigger={
                <span
                  className="pdf-edit-pill__swatch"
                  style={{ background: fillHex }}
                />
              }
            >
              <Stack gap="sm">
                <ColorPicker
                  format="hex"
                  value={fillHex}
                  swatches={SWATCHES}
                  swatchesPerRow={6}
                  size="sm"
                  // Preview while dragging; one undoable change on release.
                  onChange={setPendingColour}
                  onChangeEnd={(next) => {
                    setPendingColour(null);
                    controller.onChangeFill(next);
                  }}
                />
                <Divider />
                <OutlineControls controller={controller} />
              </Stack>
            </PillDropdown>

            <PillButton
              side={tipSide}
              icon="italic"
              tip={{
                title: state.canItalic
                  ? t("pdfTextEditor.toolbar.italic", "Italic")
                  : t(
                      "pdfTextEditor.toolbar.italicUnavailable",
                      "This font has no italic version. Load your device fonts or pick another font family.",
                    ),
              }}
              onClick={controller.onToggleItalic}
              active={state.italic}
              disabled={!state.canItalic}
              testId="pdf-editor-floating-italic"
            />

            <PillDropdown
              kind="menu"
              {...dropdown("case")}
              position={dropSide}
              side={tipSide}
              tip={{ title: caseLabel }}
              label={caseLabel}
              testId="pdf-editor-floating-case"
              trigger={<Icon name="case-sensitive" size={18} />}
            >
              <Menu.Label>{caseLabel}</Menu.Label>
              <Menu.Item onClick={() => controller.onChangeCase("upper")}>
                {t("pdfTextEditor.toolbar.caseUpper", "UPPERCASE")}
              </Menu.Item>
              <Menu.Item onClick={() => controller.onChangeCase("lower")}>
                {t("pdfTextEditor.toolbar.caseLower", "lowercase")}
              </Menu.Item>
              <Menu.Item onClick={() => controller.onChangeCase("title")}>
                {t("pdfTextEditor.toolbar.caseTitle", "Title Case")}
              </Menu.Item>
              <Menu.Item onClick={() => controller.onChangeCase("sentence")}>
                {t("pdfTextEditor.toolbar.caseSentence", "Sentence case")}
              </Menu.Item>
            </PillDropdown>

            {/* Paragraph structure, offered only when it applies. */}
            {canMerge && (
              <PillButton
                side={tipSide}
                icon="merge"
                tip={{
                  title: t(
                    "pdfTextEditor.floatingBar.merge",
                    "Merge into paragraph",
                  ),
                  shortcut: modShortcut("M"),
                }}
                onClick={paragraph.mergeSelection}
                testId="pdf-editor-group"
              />
            )}
            {canSplit && (
              <PillButton
                side={tipSide}
                icon="split"
                tip={{
                  title: t(
                    "pdfTextEditor.floatingBar.split",
                    "Split into lines",
                  ),
                }}
                onClick={paragraph.ungroupSelection}
                testId="pdf-editor-ungroup"
              />
            )}

            <span className="embedpdf-floating-divider" />
          </>
        )}

        {hasImageSelection && !hasRunSelection && (
          <>
            <PillButton
              side={tipSide}
              icon="image"
              tip={{
                title: t(
                  "pdfTextEditor.floatingBar.replaceImage",
                  "Replace image",
                ),
              }}
              onClick={controller.onReplaceImage}
              disabled={selectionCount !== 1}
              testId="pdf-editor-floating-replace-image"
            />
            {selectionCount === 1 && (
              <PillDropdown
                kind="panel"
                {...dropdown("transform")}
                position={dropSide}
                side={tipSide}
                tip={{ title: transformLabel }}
                label={transformLabel}
                testId="pdf-editor-floating-transform"
                trigger={<Icon name="rotate-cw" size={18} />}
              >
                <TransformPanel controller={controller} />
              </PillDropdown>
            )}
            <span className="embedpdf-floating-divider" />
          </>
        )}

        {geometry.single && (
          <PillDropdown
            kind="panel"
            {...dropdown("position")}
            position={dropSide}
            side={tipSide}
            tip={{ title: positionLabel }}
            label={positionLabel}
            testId="pdf-editor-floating-position"
            trigger={<Icon name="move" size={18} />}
          >
            <PositionFields
              geometry={geometry.single}
              isImage={hasImageSelection}
            />
          </PillDropdown>
        )}

        {hasRunSelection && selectionCount === 1 && (
          <PillButton
            side={tipSide}
            icon="copy"
            tip={{
              title: t("pdfTextEditor.floatingBar.duplicate", "Duplicate"),
              shortcut: modShortcut("D"),
            }}
            onClick={sel.duplicateFirstSelected}
            testId="pdf-editor-floating-duplicate"
          />
        )}

        <PillDropdown
          kind="panel"
          {...dropdown("arrange")}
          position={dropSide}
          side={tipSide}
          tip={{ title: arrangeLabel }}
          label={arrangeLabel}
          testId="pdf-editor-floating-arrange"
          trigger={<Icon name="layers" size={18} />}
        >
          <ArrangePanel controller={controller} />
        </PillDropdown>

        <PillButton
          side={tipSide}
          // The icon names the action: a padlock to lock, an open one to unlock.
          icon={selectionAllLocked ? "lock-open" : "lock"}
          tip={
            selectionAllLocked
              ? {
                  title: t("pdfTextEditor.floatingBar.unlock", "Unlock"),
                }
              : {
                  title: t("pdfTextEditor.floatingBar.lock", "Lock"),
                }
          }
          onClick={() => {
            controller.onToggleLock();
            // A locked item takes no clicks, so keeping it selected would
            // leave this bar stranded over something it can no longer edit.
            // Dropping the selection closes the bar and leaves the lock badge.
            if (!selectionAllLocked) store.selection.clear();
          }}
          active={selectionAllLocked}
          testId="pdf-editor-floating-lock"
        />
        <PillButton
          side={tipSide}
          icon="trash"
          tip={{
            title: t("pdfTextEditor.floatingBar.delete", "Delete"),
            shortcut: "Del",
          }}
          onClick={controller.onDelete}
          danger
          testId="pdf-editor-floating-delete"
        />
      </div>
    </div>,
    document.body,
  );
}
