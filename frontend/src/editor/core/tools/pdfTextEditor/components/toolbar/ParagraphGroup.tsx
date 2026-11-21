import type { TFunction } from "i18next";
import type { CSSProperties } from "react";
import { Menu, Tooltip } from "@mantine/core";
import { useTranslation } from "react-i18next";
import { useFontChangeWarning } from "@editor/tools/pdfTextEditor/components/fontPickFailure";
import { Button } from "@editor/ui/Button";
import { Icon, type IconName } from "@editor/ui/Icon";
import type {
  TextAlign,
  TextStyleName,
} from "@editor/tools/pdfTextEditor/commands/paragraphFormat";
import {
  NO_SHRINK,
  type Controller,
} from "@editor/tools/pdfTextEditor/components/toolbar/toolbarShared";
import {
  MenuChoice,
  ToolbarMenu,
} from "@editor/tools/pdfTextEditor/components/toolbar/ToolbarMenu";
import type { ListKind } from "@editor/tools/pdfTextEditor/util/listText";

const ALIGN_ICONS: Record<TextAlign, IconName> = {
  left: "text-align-start",
  center: "text-align-center",
  right: "text-align-end",
};

const LINE_SPACINGS = [1, 1.15, 1.5, 2];

const LISTS: Array<{ kind: ListKind; icon: IconName }> = [
  { kind: "bullet", icon: "list" },
  { kind: "number", icon: "list-ordered" },
];

const STYLE_PREVIEW: Record<TextStyleName, CSSProperties> = {
  title: { fontSize: "1.25rem", fontWeight: 700 },
  heading1: { fontSize: "1.0625rem", fontWeight: 700 },
  heading2: { fontSize: "0.9375rem", fontWeight: 700 },
  body: { fontSize: "0.875rem", fontWeight: 400 },
};

interface ParagraphGroupProps {
  controller: Controller;
  buttonSize: "sm" | "xl";
  inPopover: boolean;
  disabled: boolean;
}

function cannotFormat(t: TFunction): string {
  return t(
    "pdfTextEditor.toolbar.cannotFormat",
    "Not available for rotated or locked text",
  );
}

export function TextStyleMenu({
  controller,
  buttonSize,
  inPopover,
  disabled,
}: ParagraphGroupProps) {
  const { t } = useTranslation();
  const warnAbout = useFontChangeWarning();
  const styleNames: Record<TextStyleName, string> = {
    title: t("pdfTextEditor.toolbar.styleTitle", "Title"),
    heading1: t("pdfTextEditor.toolbar.styleHeading1", "Heading 1"),
    heading2: t("pdfTextEditor.toolbar.styleHeading2", "Heading 2"),
    body: t("pdfTextEditor.toolbar.styleBody", "Body text"),
  };
  return (
    <ToolbarMenu
      label={t("pdfTextEditor.toolbar.textStyle", "Text style")}
      icon="heading"
      testId="pdf-editor-text-style"
      size={buttonSize}
      disabled={disabled}
      inPopover={inPopover}
    >
      {(Object.keys(styleNames) as TextStyleName[]).map((name) => (
        <Menu.Item
          key={name}
          onClick={() =>
            void warnAbout(() => controller.onApplyTextStyle(name))
          }
          data-testid={`pdf-editor-text-style-${name}`}
        >
          <span style={STYLE_PREVIEW[name]}>{styleNames[name]}</span>
        </Menu.Item>
      ))}
    </ToolbarMenu>
  );
}

export function UnderlineToggle({
  controller,
  buttonSize,
  disabled,
}: ParagraphGroupProps) {
  const { t } = useTranslation();
  const on = controller.paragraph.underline;
  return (
    <Tooltip
      label={
        controller.paragraph.canFormat
          ? t("pdfTextEditor.toolbar.underline", "Underline")
          : cannotFormat(t)
      }
    >
      <Button
        variant={on ? "primary" : "tertiary"}
        accent={on ? "default" : "neutral"}
        size={buttonSize}
        onClick={controller.onToggleUnderline}
        disabled={disabled || !controller.paragraph.canFormat}
        aria-label={t("pdfTextEditor.toolbar.underline", "Underline")}
        aria-pressed={on}
        data-testid="pdf-editor-underline"
        style={NO_SHRINK}
        leftSection={<Icon name="underline" size={20} />}
      />
    </Tooltip>
  );
}

export function ParagraphControls({
  controller,
  buttonSize,
  inPopover,
  disabled,
}: ParagraphGroupProps) {
  const { t } = useTranslation();
  const { paragraph, onSetAlign, onSetLineSpacing, onToggleList } = controller;
  const alignNames: Record<TextAlign, string> = {
    left: t("pdfTextEditor.toolbar.textAlignLeft", "Align text left"),
    center: t("pdfTextEditor.toolbar.textAlignCenter", "Centre text"),
    right: t("pdfTextEditor.toolbar.textAlignRight", "Align text right"),
  };
  const menu = { size: buttonSize, inPopover };
  return (
    <>
      <ToolbarMenu
        {...menu}
        label={t("pdfTextEditor.toolbar.textAlign", "Text alignment")}
        tooltip={paragraph.canFormat ? undefined : cannotFormat(t)}
        icon={ALIGN_ICONS[paragraph.align ?? "left"]}
        testId="pdf-editor-text-align"
        disabled={disabled || !paragraph.canFormat}
      >
        {(Object.keys(ALIGN_ICONS) as TextAlign[]).map((align) => (
          <MenuChoice
            key={align}
            icon={ALIGN_ICONS[align]}
            onClick={() => onSetAlign(align)}
            checked={(paragraph.align ?? "left") === align}
            testId={`pdf-editor-text-align-${align}`}
          >
            {alignNames[align]}
          </MenuChoice>
        ))}
      </ToolbarMenu>
      <ToolbarMenu
        {...menu}
        label={t("pdfTextEditor.toolbar.lists", "Lists")}
        icon={paragraph.list === "number" ? "list-ordered" : "list"}
        testId="pdf-editor-list"
        disabled={disabled}
        pressed={paragraph.list !== null}
      >
        {LISTS.map(({ kind, icon }) => (
          <MenuChoice
            key={kind}
            icon={icon}
            onClick={() => onToggleList(kind)}
            checked={paragraph.list === kind}
            testId={`pdf-editor-list-${kind}`}
          >
            {kind === "bullet"
              ? t("pdfTextEditor.toolbar.bulletList", "Bulleted list")
              : t("pdfTextEditor.toolbar.numberedList", "Numbered list")}
          </MenuChoice>
        ))}
      </ToolbarMenu>
      <ToolbarMenu
        {...menu}
        label={t("pdfTextEditor.toolbar.lineSpacing", "Line spacing")}
        tooltip={
          paragraph.canSpace
            ? undefined
            : t(
                "pdfTextEditor.toolbar.lineSpacingNeedsLines",
                "Line spacing needs text of two or more lines",
              )
        }
        icon="between-horizontal-end"
        testId="pdf-editor-line-spacing"
        disabled={disabled || !paragraph.canSpace}
      >
        {LINE_SPACINGS.map((factor) => (
          <MenuChoice
            key={factor}
            onClick={() => onSetLineSpacing(factor)}
            checked={paragraph.lineSpacing === factor}
            testId={`pdf-editor-line-spacing-${factor}`}
          >
            {String(factor)}
          </MenuChoice>
        ))}
      </ToolbarMenu>
    </>
  );
}
