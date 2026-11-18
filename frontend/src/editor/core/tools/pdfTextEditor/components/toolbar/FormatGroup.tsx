import { useRef, useState } from "react";
import { Icon } from "@editor/ui/Icon";
import {
  ColorInput,
  Group,
  Menu,
  NumberInput,
  Popover,
  Select,
  Tooltip,
} from "@mantine/core";
import { useTranslation } from "react-i18next";
import { Button } from "@editor/ui/Button";
import {
  parseCssColor,
  toCssHex,
} from "@editor/tools/pdfTextEditor/model/Color";
import { familyOf } from "@editor/tools/pdfTextEditor/util/fontFamily";
import { FontFamilySelect } from "@editor/tools/pdfTextEditor/components/FontFamilySelect";
import { useFontChangeWarning } from "@editor/tools/pdfTextEditor/components/fontPickFailure";
import {
  NO_SHRINK,
  type Controller,
} from "@editor/tools/pdfTextEditor/components/toolbar/toolbarShared";

const WEIGHT_NAMES: Record<number, [string, string]> = {
  100: ["pdfTextEditor.fontPicker.weightThin", "Thin"],
  200: ["pdfTextEditor.fontPicker.weightExtraLight", "Extra light"],
  300: ["pdfTextEditor.fontPicker.weightLight", "Light"],
  400: ["pdfTextEditor.fontPicker.weightRegular", "Regular"],
  500: ["pdfTextEditor.fontPicker.weightMedium", "Medium"],
  600: ["pdfTextEditor.fontPicker.weightSemibold", "Semibold"],
  700: ["pdfTextEditor.fontPicker.weightBold", "Bold"],
  800: ["pdfTextEditor.fontPicker.weightExtraBold", "Extra bold"],
  900: ["pdfTextEditor.fontPicker.weightBlack", "Black"],
};

type TranslatedText = [key: string, fallback: string];

interface ToggleTexts {
  name: TranslatedText;
  /** Why the toggle is off when the text is in the style and its font has no face without it. */
  only: TranslatedText;
  /** Why the toggle is off when the font has no face in the style. */
  unavailable: TranslatedText;
}

const BOLD_TEXTS: ToggleTexts = {
  name: ["pdfTextEditor.toolbar.bold", "Bold"],
  only: ["pdfTextEditor.toolbar.boldOnly", "This font has only a bold version"],
  unavailable: [
    "pdfTextEditor.toolbar.boldUnavailable",
    "No bold version of this font",
  ],
};

const ITALIC_TEXTS: ToggleTexts = {
  name: ["pdfTextEditor.toolbar.italic", "Italic"],
  only: [
    "pdfTextEditor.toolbar.italicOnly",
    "This font has only an italic version",
  ],
  unavailable: [
    "pdfTextEditor.toolbar.italicUnavailable",
    "This font has no italic version. Load your device fonts or pick another font family.",
  ],
};

const NO_BOLD_ITALIC: TranslatedText = [
  "pdfTextEditor.toolbar.noBoldItalic",
  "No bold italic version of this font",
];

/** A style toggle's look: filled when the whole selection has the style, outlined when only some of it does. */
function toggleLook(on: boolean, mixed: boolean) {
  if (mixed) return { variant: "secondary", accent: "default" } as const;
  return on
    ? ({ variant: "primary", accent: "default" } as const)
    : ({ variant: "tertiary", accent: "neutral" } as const);
}

interface FormatGroupProps {
  controller: Controller;
  touch?: boolean;
  /**
   * Set when the controls sit in another popover. Their own dropdowns then
   * render inside it: one portalled out of it reads as a click outside, which
   * closes the popover and the dropdown with it.
   */
  inPopover?: boolean;
}

export function FormatGroup({
  controller,
  touch = false,
  inPopover = false,
}: FormatGroupProps) {
  const { t } = useTranslation();
  const {
    state,
    scanFont,
    hasRunSelection,
    selectionTextReadOnly,
    onChangeFontFamily,
    onChangeFontSize,
    onChangeFill,
    onChangeOutline,
    onToggleBold,
    onToggleItalic,
    onChangeFontWeight,
    onChangeCase,
  } = controller;
  const warnAbout = useFontChangeWarning();
  const [fillPickerOpen, setFillPickerOpen] = useState(false);
  // What the colour field holds while it has focus. The toolbar can redraw a
  // pick after the model has it, and that late value would replace the text
  // the user is selecting or typing over.
  const [fillDraft, setFillDraft] = useState<string | null>(null);
  const fillFocusedRef = useRef(false);
  if (!hasRunSelection) return null;

  const fillHex = state.fill ? toCssHex(state.fill) : "#000000";
  const outlineHex = state.stroke ? toCssHex(state.stroke) : "#000000";
  const outlineWidth = state.strokeWidth ?? 0;
  const documentFamily = state.fontFamily ? familyOf(state.fontFamily) : null;
  const fontFamily =
    scanFont === undefined ? documentFamily : (scanFont?.family ?? null);
  const inputSize = touch ? "lg" : "xs";
  const buttonSize = touch ? "xl" : "sm";
  const weightName = (weight: number) =>
    WEIGHT_NAMES[weight]
      ? t(...WEIGHT_NAMES[weight])
      : t("pdfTextEditor.fontPicker.weightNumber", "Weight {{weight}}", {
          weight,
        });
  const readOnlyNote = selectionTextReadOnly
    ? t(
        "pdfTextEditor.run.readOnlyOrderTitle",
        "This line's text can't be edited: it mixes right-to-left and left-to-right text in an order the editor can't redraw safely",
      )
    : null;
  const toggleTooltip = (
    texts: ToggleTexts,
    can: boolean,
    needsBoldItalic: boolean,
    on: boolean,
  ) =>
    readOnlyNote ??
    t(
      ...(can
        ? texts.name
        : needsBoldItalic
          ? NO_BOLD_ITALIC
          : on
            ? texts.only
            : texts.unavailable),
    );

  return (
    <>
      <FontFamilySelect
        value={fontFamily}
        fontId={scanFont === undefined ? state.fontFamily : null}
        documentFamilies={state.documentFamilies}
        scanned={
          scanFont === undefined ? undefined : { label: scanFont?.label }
        }
        documentFontId={state.documentFontId}
        onChange={onChangeFontFamily}
        mixed={state.mixed.fontFamily}
        disabled={selectionTextReadOnly}
        touch={touch}
        withinPortal={!inPopover}
      />
      {state.weights.length > 0 && !state.mixed.fontFamily && (
        <Select
          size={inputSize}
          w={touch ? 140 : 104}
          data={state.weights.map((weight) => ({
            value: String(weight),
            label: weightName(weight),
          }))}
          value={state.weight === null ? null : String(state.weight)}
          placeholder={t("pdfTextEditor.fontPicker.mixed", "Mixed")}
          onChange={(next) => {
            if (next) void warnAbout(() => onChangeFontWeight(Number(next)));
          }}
          allowDeselect={false}
          comboboxProps={{ withinPortal: !inPopover }}
          disabled={selectionTextReadOnly}
          aria-label={t("pdfTextEditor.fontPicker.weight", "Font weight")}
          data-testid="pdf-editor-font-weight"
          style={NO_SHRINK}
        />
      )}
      <NumberInput
        size={inputSize}
        w={touch ? 104 : 76}
        min={4}
        max={144}
        decimalScale={1}
        value={
          state.mixed.fontSize
            ? ""
            : Math.round((state.fontSize ?? 12) * 10) / 10
        }
        placeholder={
          state.mixed.fontSize
            ? t("pdfTextEditor.fontPicker.mixed", "Mixed")
            : undefined
        }
        onChange={(value) => {
          const next = typeof value === "number" ? value : Number(value);
          if (Number.isFinite(next) && next > 0) onChangeFontSize(next);
        }}
        disabled={selectionTextReadOnly}
        title={readOnlyNote ?? undefined}
        aria-label={t("pdfTextEditor.toolbar.fontSize", "Font size")}
        data-testid="pdf-editor-font-size"
        style={NO_SHRINK}
      />
      <ColorInput
        size={inputSize}
        w={touch ? (fillPickerOpen ? 150 : 96) : fillPickerOpen ? 116 : 74}
        withEyeDropper={false}
        styles={{
          section: { pointerEvents: "none" },
          input: {
            color: fillPickerOpen ? undefined : "transparent",
            transition: "width 120ms ease-out",
          },
        }}
        value={fillDraft ?? fillHex}
        fixOnBlur={false}
        onChange={(next) => {
          if (fillFocusedRef.current) setFillDraft(next);
          if (!next) return;
          const rgb = parseCssColor(next);
          if (!rgb) return;
          if (
            state.fill &&
            rgb.r === state.fill.r &&
            rgb.g === state.fill.g &&
            rgb.b === state.fill.b
          ) {
            return;
          }
          onChangeFill(next);
        }}
        onChangeEnd={() =>
          window.requestAnimationFrame(() => setFillPickerOpen(false))
        }
        onFocus={() => {
          fillFocusedRef.current = true;
          setFillDraft(fillHex);
          setFillPickerOpen(true);
        }}
        onClick={() => setFillPickerOpen(true)}
        onBlur={() => {
          fillFocusedRef.current = false;
          setFillDraft(null);
          setFillPickerOpen(false);
        }}
        onKeyDown={(event) => {
          if (event.key === "Escape" || event.key === "Enter") {
            setFillPickerOpen(false);
          }
        }}
        popoverProps={{
          withinPortal: !inPopover,
          opened: fillPickerOpen,
          onChange: setFillPickerOpen,
          transitionProps: { transition: "fade", duration: 0 },
        }}
        aria-expanded={fillPickerOpen}
        aria-label={t("pdfTextEditor.toolbar.fontColour", "Font colour")}
        data-testid="pdf-editor-colour"
        style={NO_SHRINK}
      />
      <Popover position="bottom-start" withinPortal={!inPopover} shadow="md">
        <Popover.Target>
          <Tooltip
            label={
              readOnlyNote ??
              t(
                "pdfTextEditor.toolbar.advancedColourTooltip",
                "Advanced colour (glyph outline)",
              )
            }
          >
            <Button
              variant={outlineWidth > 0 ? "primary" : "tertiary"}
              accent={outlineWidth > 0 ? "default" : "neutral"}
              size={buttonSize}
              disabled={selectionTextReadOnly}
              aria-label={t(
                "pdfTextEditor.toolbar.advancedColour",
                "Advanced colour",
              )}
              data-testid="pdf-editor-colour-advanced"
              style={NO_SHRINK}
              leftSection={<Icon name="sliders-horizontal" size={20} />}
            />
          </Tooltip>
        </Popover.Target>
        <Popover.Dropdown>
          <Group gap="xs" align="center" wrap="nowrap">
            <ColorInput
              size="xs"
              w={132}
              value={outlineHex}
              onChange={(next) => {
                if (!next || !parseCssColor(next)) return;
                onChangeOutline(next, outlineWidth > 0 ? outlineWidth : 0.5);
              }}
              aria-label={t(
                "pdfTextEditor.toolbar.outlineColour",
                "Outline colour",
              )}
              data-testid="pdf-editor-outline-colour"
            />
            <NumberInput
              size="xs"
              w={76}
              min={0}
              max={12}
              step={0.25}
              decimalScale={2}
              value={outlineWidth}
              onChange={(value) => {
                const next = typeof value === "number" ? value : Number(value);
                if (!Number.isFinite(next) || next < 0) return;
                if (next > 0 && state.mixed.stroke) return;
                onChangeOutline(next > 0 ? outlineHex : null, next);
              }}
              disabled={state.strokeWidth === null}
              aria-label={t(
                "pdfTextEditor.toolbar.outlineWidth",
                "Outline width (0 = none)",
              )}
              data-testid="pdf-editor-outline-width"
            />
          </Group>
        </Popover.Dropdown>
      </Popover>
      <Tooltip
        label={toggleTooltip(
          BOLD_TEXTS,
          state.canBold,
          state.boldNeedsBoldItalic,
          state.bold,
        )}
      >
        <Button
          {...toggleLook(state.bold, state.mixed.bold)}
          size={buttonSize}
          onClick={() => void warnAbout(onToggleBold)}
          disabled={!state.canBold || selectionTextReadOnly}
          aria-label={t(...BOLD_TEXTS.name)}
          aria-pressed={state.mixed.bold ? "mixed" : state.bold}
          data-testid="pdf-editor-bold"
          style={NO_SHRINK}
          leftSection={<Icon name="bold" size={20} />}
        />
      </Tooltip>
      <Tooltip
        label={toggleTooltip(
          ITALIC_TEXTS,
          state.canItalic,
          state.italicNeedsBoldItalic,
          state.italic,
        )}
      >
        <Button
          {...toggleLook(state.italic, state.mixed.italic)}
          size={buttonSize}
          onClick={() => void warnAbout(onToggleItalic)}
          disabled={!state.canItalic || selectionTextReadOnly}
          aria-label={t(...ITALIC_TEXTS.name)}
          aria-pressed={state.mixed.italic ? "mixed" : state.italic}
          data-testid="pdf-editor-italic"
          style={NO_SHRINK}
          leftSection={<Icon name="italic" size={20} />}
        />
      </Tooltip>
      <Menu shadow="md" position="bottom-start" withinPortal={!inPopover}>
        <Menu.Target>
          <Tooltip
            label={
              readOnlyNote ??
              t(
                "pdfTextEditor.toolbar.changeCaseTooltip",
                "Change case (text runs only)",
              )
            }
          >
            <Button
              variant="tertiary"
              accent="neutral"
              size={buttonSize}
              disabled={selectionTextReadOnly}
              aria-label={t("pdfTextEditor.toolbar.changeCase", "Change case")}
              data-testid="pdf-editor-change-case"
              style={NO_SHRINK}
              leftSection={<Icon name="type" size={20} />}
            />
          </Tooltip>
        </Menu.Target>
        <Menu.Dropdown>
          <Menu.Item
            data-testid="pdf-editor-change-case-upper"
            onClick={() => onChangeCase("upper")}
          >
            {t("pdfTextEditor.toolbar.caseUpper", "UPPERCASE")}
          </Menu.Item>
          <Menu.Item
            data-testid="pdf-editor-change-case-lower"
            onClick={() => onChangeCase("lower")}
          >
            {t("pdfTextEditor.toolbar.caseLower", "lowercase")}
          </Menu.Item>
          <Menu.Item
            data-testid="pdf-editor-change-case-title"
            onClick={() => onChangeCase("title")}
          >
            {t("pdfTextEditor.toolbar.caseTitle", "Title Case")}
          </Menu.Item>
          <Menu.Item
            data-testid="pdf-editor-change-case-sentence"
            onClick={() => onChangeCase("sentence")}
          >
            {t("pdfTextEditor.toolbar.caseSentence", "Sentence case")}
          </Menu.Item>
        </Menu.Dropdown>
      </Menu>
    </>
  );
}
