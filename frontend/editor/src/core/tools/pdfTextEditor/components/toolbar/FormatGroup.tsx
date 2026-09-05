import { useState } from "react";
import {
  ColorInput,
  Group,
  Menu,
  NumberInput,
  Popover,
  Tooltip,
} from "@mantine/core";
import { useTranslation } from "react-i18next";
import { Button } from "@app/ui/Button";
import FormatItalicIcon from "@mui/icons-material/FormatItalic";
import TuneIcon from "@mui/icons-material/TuneOutlined";
import TextFieldsIcon from "@mui/icons-material/TextFields";
import { parseCssColor, toCssHex } from "@app/tools/pdfTextEditor/model/Color";
import { familyOf } from "@app/tools/pdfTextEditor/util/fontFamily";
import { FontFamilySelect } from "@app/tools/pdfTextEditor/components/FontFamilySelect";
import {
  NO_SHRINK,
  type Controller,
} from "@app/tools/pdfTextEditor/components/toolbar/toolbarShared";

/** Character formatting. Text runs only - absent for a pure image selection. */
export function FormatGroup({ controller }: { controller: Controller }) {
  const { t } = useTranslation();
  const {
    state,
    hasRunSelection,
    onChangeFontFamily,
    onChangeFontSize,
    onChangeFill,
    onChangeOutline,
    onToggleItalic,
    onChangeCase,
  } = controller;
  // Mantine only closes the fill picker's dropdown on blur, and it is
  // portalled over the page - so we drive it and close it on a commit.
  const [fillPickerOpen, setFillPickerOpen] = useState(false);
  if (!hasRunSelection) return null;

  const fillHex = state.fill ? toCssHex(state.fill) : "#000000";
  const outlineHex = state.stroke ? toCssHex(state.stroke) : "#000000";
  const outlineWidth = state.strokeWidth ?? 0;
  const fontFamily = state.fontFamily ? familyOf(state.fontFamily) : null;

  return (
    <>
      <FontFamilySelect
        value={fontFamily}
        onChange={onChangeFontFamily}
        mixed={state.mixed.fontFamily}
      />
      <NumberInput
        size="xs"
        w={76}
        min={4}
        max={144}
        // A PDF font size is a float, so 11pt arrives as 11.000000002 and
        // rendered in full. One decimal is all a type size ever needs.
        decimalScale={1}
        // Blank rather than a made-up number when the runs disagree, but still
        // editable: typing a size is how you make a mixed selection uniform.
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
        aria-label={t("pdfTextEditor.toolbar.fontSize", "Font size")}
        data-testid="pdf-editor-font-size"
        style={NO_SHRINK}
      />
      <ColorInput
        size="xs"
        w={fillPickerOpen ? 116 : 74}
        withEyeDropper={false}
        styles={{
          // The swatch is decoration, not a target: left interactive it covers
          // the whole of a narrow input and swallows the click that opens the
          // picker. Clicks fall through to the input, which owns the gesture.
          section: { pointerEvents: "none" },
          input: {
            color: fillPickerOpen ? undefined : "transparent",
            transition: "width 120ms ease-out",
          },
        }}
        value={fillHex}
        // Blur re-emits the last valid colour, which re-applied the fill AFTER
        // an undo. The input is controlled, so there is nothing to fix up.
        fixOnBlur={false}
        onChange={(next) => {
          if (!next) return;
          const rgb = parseCssColor(next);
          if (!rgb) return;
          // Re-emitting the applied colour must not cost a second undo step.
          // Mixed fills (state.fill null) still apply - that unifies them.
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
        // Drag end, swatch click or a committed hex - the deliberate pick.
        // Deferred a frame: a saturation-square pick delivers its value on the
        // NEXT animation frame (use-move), so closing now unmounts the picker
        // first and Firefox loses the pick against a detached 0x0 node.
        onChangeEnd={() =>
          window.requestAnimationFrame(() => setFillPickerOpen(false))
        }
        onFocus={() => setFillPickerOpen(true)}
        onClick={() => setFillPickerOpen(true)}
        onBlur={() => setFillPickerOpen(false)}
        onKeyDown={(event) => {
          // The dropdown's own Escape handler never sees the key - focus stays
          // in the input - so dismiss it here.
          if (event.key === "Escape" || event.key === "Enter") {
            setFillPickerOpen(false);
          }
        }}
        popoverProps={{
          opened: fillPickerOpen,
          onChange: setFillPickerOpen,
          transitionProps: { transition: "fade", duration: 0 },
        }}
        aria-label={t("pdfTextEditor.toolbar.fontColour", "Font colour")}
        data-testid="pdf-editor-colour"
        style={NO_SHRINK}
      />
      <Popover position="bottom-start" withinPortal shadow="md">
        <Popover.Target>
          <Tooltip
            label={t(
              "pdfTextEditor.toolbar.advancedColourTooltip",
              "Advanced colour (glyph outline)",
            )}
          >
            <Button
              variant={outlineWidth > 0 ? "primary" : "tertiary"}
              accent={outlineWidth > 0 ? "default" : "neutral"}
              size="sm"
              aria-label={t(
                "pdfTextEditor.toolbar.advancedColour",
                "Advanced colour",
              )}
              data-testid="pdf-editor-colour-advanced"
              style={NO_SHRINK}
              leftSection={<TuneIcon fontSize="small" />}
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
                // Picking a colour with no width yet is meant as "outline it",
                // so give it a visible default rather than a silent no-op.
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
                // With a mixed colour there is no single hex to apply, so only
                // the "remove the outline" direction is unambiguous.
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
        label={
          !state.canItalic
            ? t(
                "pdfTextEditor.toolbar.italicUnavailable",
                "This font has no italic version. Load your device fonts or pick another font family.",
              )
            : t("pdfTextEditor.toolbar.italic", "Italic")
        }
      >
        <Button
          variant={state.italic ? "primary" : "tertiary"}
          accent={state.italic ? "default" : "neutral"}
          size="sm"
          onClick={onToggleItalic}
          disabled={!state.canItalic}
          aria-label={t("pdfTextEditor.toolbar.italic", "Italic")}
          data-testid="pdf-editor-italic"
          style={NO_SHRINK}
          leftSection={<FormatItalicIcon fontSize="small" />}
        />
      </Tooltip>
      <Menu shadow="md" position="bottom-start" withinPortal>
        <Menu.Target>
          <Tooltip
            label={t(
              "pdfTextEditor.toolbar.changeCaseTooltip",
              "Change case (text runs only)",
            )}
          >
            <Button
              variant="tertiary"
              accent="neutral"
              size="sm"
              aria-label={t("pdfTextEditor.toolbar.changeCase", "Change case")}
              data-testid="pdf-editor-change-case"
              style={NO_SHRINK}
              leftSection={<TextFieldsIcon fontSize="small" />}
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
