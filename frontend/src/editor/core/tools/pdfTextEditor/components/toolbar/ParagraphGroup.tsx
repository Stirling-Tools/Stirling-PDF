import type { TFunction } from "i18next";
import type { CSSProperties, ReactNode } from "react";
import { Group, Menu, Popover, Stack, Text, Tooltip } from "@mantine/core";
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
  selectionBarMenuProps,
  toggleLook,
  type Controller,
} from "@editor/tools/pdfTextEditor/components/toolbar/toolbarShared";
import {
  MenuChoice,
  ToolbarMenu,
  type ToolbarMenuPosition,
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

const PARAGRAPH_POPOVER_WIDTH = 220;

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

function needsLines(t: TFunction): string {
  return t(
    "pdfTextEditor.toolbar.lineSpacingNeedsLines",
    "Line spacing needs text of two or more lines",
  );
}

function alignNames(t: TFunction): Record<TextAlign, string> {
  return {
    left: t("pdfTextEditor.toolbar.textAlignLeft", "Align text left"),
    center: t("pdfTextEditor.toolbar.textAlignCenter", "Centre text"),
    right: t("pdfTextEditor.toolbar.textAlignRight", "Align text right"),
  };
}

function listName(t: TFunction, kind: ListKind): string {
  return kind === "bullet"
    ? t("pdfTextEditor.toolbar.bulletList", "Bulleted list")
    : t("pdfTextEditor.toolbar.numberedList", "Numbered list");
}

export function TextStyleMenu({
  controller,
  buttonSize,
  inPopover,
  disabled,
  position,
}: ParagraphGroupProps & { position?: ToolbarMenuPosition }) {
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
      position={position}
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

export function ParagraphControls({
  controller,
  buttonSize,
  inPopover,
  disabled,
}: ParagraphGroupProps) {
  const { t } = useTranslation();
  const { paragraph, onSetAlign, onSetLineSpacing, onToggleList } = controller;
  const names = alignNames(t);
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
            {names[align]}
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
            {listName(t, kind)}
          </MenuChoice>
        ))}
      </ToolbarMenu>
      <ToolbarMenu
        {...menu}
        label={t("pdfTextEditor.toolbar.lineSpacing", "Line spacing")}
        tooltip={paragraph.canSpace ? undefined : needsLines(t)}
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

function PopoverSection({
  title,
  note,
  children,
}: {
  title: string;
  note: string | null;
  children: ReactNode;
}) {
  return (
    <Stack gap={4}>
      <Text size="xs" fw={500}>
        {title}
      </Text>
      <Group gap={4} wrap="nowrap">
        {children}
      </Group>
      {note && (
        <Text size="xs" c="dimmed">
          {note}
        </Text>
      )}
    </Stack>
  );
}

export function ParagraphPopover({
  controller,
  disabled,
  dropdownPosition,
}: {
  controller: Controller;
  disabled: boolean;
  dropdownPosition: "top" | "bottom";
}) {
  const { t } = useTranslation();
  const { paragraph, onSetAlign, onSetLineSpacing, onToggleList } = controller;
  const names = alignNames(t);
  const label = t("pdfTextEditor.toolbar.paragraph", "Paragraph");
  const align = paragraph.align ?? "left";
  return (
    <Popover position={dropdownPosition} withinPortal shadow="md" trapFocus>
      <Tooltip label={label}>
        <Popover.Target>
          <Button
            variant="tertiary"
            accent="neutral"
            size="sm"
            disabled={disabled}
            aria-label={label}
            data-testid="pdf-editor-paragraph-menu"
            style={NO_SHRINK}
            leftSection={<Icon name={ALIGN_ICONS[align]} size={20} />}
          />
        </Popover.Target>
      </Tooltip>
      <Popover.Dropdown {...selectionBarMenuProps}>
        <Stack gap="sm" w={PARAGRAPH_POPOVER_WIDTH}>
          <PopoverSection
            title={t("pdfTextEditor.toolbar.textAlign", "Text alignment")}
            note={paragraph.canFormat ? null : cannotFormat(t)}
          >
            {(Object.keys(ALIGN_ICONS) as TextAlign[]).map((choice) => (
              <Tooltip key={choice} label={names[choice]}>
                <Button
                  {...toggleLook(align === choice, false)}
                  size="sm"
                  disabled={!paragraph.canFormat}
                  onClick={() => onSetAlign(choice)}
                  aria-label={names[choice]}
                  aria-pressed={align === choice}
                  data-testid={`pdf-editor-text-align-${choice}`}
                  style={NO_SHRINK}
                  leftSection={<Icon name={ALIGN_ICONS[choice]} size={20} />}
                />
              </Tooltip>
            ))}
          </PopoverSection>
          <PopoverSection
            title={t("pdfTextEditor.toolbar.lists", "Lists")}
            note={null}
          >
            {LISTS.map(({ kind, icon }) => (
              <Tooltip key={kind} label={listName(t, kind)}>
                <Button
                  {...toggleLook(paragraph.list === kind, false)}
                  size="sm"
                  onClick={() => onToggleList(kind)}
                  aria-label={listName(t, kind)}
                  aria-pressed={paragraph.list === kind}
                  data-testid={`pdf-editor-list-${kind}`}
                  style={NO_SHRINK}
                  leftSection={<Icon name={icon} size={20} />}
                />
              </Tooltip>
            ))}
          </PopoverSection>
          <PopoverSection
            title={t("pdfTextEditor.toolbar.lineSpacing", "Line spacing")}
            note={paragraph.canSpace ? null : needsLines(t)}
          >
            {LINE_SPACINGS.map((factor) => {
              const active = paragraph.lineSpacing === factor;
              return (
                <Button
                  key={factor}
                  variant={active ? "secondary" : "tertiary"}
                  accent="neutral"
                  size="sm"
                  disabled={!paragraph.canSpace}
                  onClick={() => onSetLineSpacing(factor)}
                  aria-pressed={active}
                  data-testid={`pdf-editor-line-spacing-${factor}`}
                  leftSection={
                    active ? <Icon name="check" size={14} /> : undefined
                  }
                  style={{ ...NO_SHRINK, paddingInline: "0.375rem" }}
                >
                  {String(factor)}
                </Button>
              );
            })}
          </PopoverSection>
        </Stack>
      </Popover.Dropdown>
    </Popover>
  );
}
