import { Menu } from "@mantine/core";
import { useTranslation } from "react-i18next";
import type { IconName } from "@editor/ui/Icon";
import type { InteractionMode } from "@editor/tools/pdfTextEditor/store/EditorStore";
import {
  FIELD_MODE,
  SHAPE_MODE,
  fieldKindOf,
  shapeKindOf,
} from "@editor/tools/pdfTextEditor/store/insertModes";
import type { ShapeKind } from "@editor/tools/pdfTextEditor/types";
import type { FormFieldKind } from "@editor/tools/pdfTextEditor/util/formFieldChanges";
import {
  MenuChoice,
  ToolbarMenu,
} from "@editor/tools/pdfTextEditor/components/toolbar/ToolbarMenu";

type InsertKind = ShapeKind | FormFieldKind;

const ICONS: Record<InsertKind, IconName> = {
  line: "minus",
  rectangle: "square",
  box: "square",
  text: "text-cursor-input",
  checkbox: "square-check",
  signature: "signature",
};

function useInsertNames(): Record<InsertKind, string> {
  const { t } = useTranslation();
  return {
    line: t("pdfTextEditor.shape.line", "Line"),
    rectangle: t("pdfTextEditor.shape.rectangle", "Rectangle"),
    box: t("pdfTextEditor.shape.box", "Filled box"),
    text: t("pdfTextEditor.fields.text", "Text field"),
    checkbox: t("pdfTextEditor.fields.checkbox", "Checkbox"),
    signature: t("pdfTextEditor.fields.signature", "Signature field"),
  };
}

interface InsertProps {
  mode: InteractionMode;
  onToggleMode: (mode: InteractionMode) => void;
}

/** Shapes and form fields as items of a menu the caller owns; each arms the next page click to place it. */
export function InsertMenuItems({ mode, onToggleMode }: InsertProps) {
  const { t } = useTranslation();
  const names = useInsertNames();
  const groups = [
    {
      label: t("pdfTextEditor.insert.shapes", "Shapes"),
      modes: SHAPE_MODE as Record<InsertKind, InteractionMode>,
      testId: "shape",
    },
    {
      label: t(
        "pdfTextEditor.fields.label",
        "Form field · saves your edits first",
      ),
      modes: FIELD_MODE as Record<InsertKind, InteractionMode>,
      testId: "field",
    },
  ];
  return groups.map((group, i) => [
    i > 0 && <Menu.Divider key={`divider-${group.testId}`} />,
    <Menu.Label key={group.testId}>{group.label}</Menu.Label>,
    ...(Object.keys(group.modes) as InsertKind[]).map((kind) => (
      <MenuChoice
        key={kind}
        icon={ICONS[kind]}
        iconFilled={kind === "box"}
        onClick={() => onToggleMode(group.modes[kind])}
        checked={mode === group.modes[kind]}
        testId={`pdf-editor-add-${group.testId}-${kind}`}
      >
        {names[kind]}
      </MenuChoice>
    )),
  ]);
}

/** The Insert toolbar button. */
export function InsertMenu({
  mode,
  onToggleMode,
  disabled,
}: InsertProps & { disabled: boolean }) {
  const { t } = useTranslation();
  const names = useInsertNames();
  const kind = shapeKindOf(mode) ?? fieldKindOf(mode);
  const label = kind
    ? t("pdfTextEditor.insert.clickPage", {
        defaultValue: "Click the page to place: {{item}}",
        item: names[kind],
      })
    : t("pdfTextEditor.insert.menu", "Insert a shape or form field");
  return (
    <ToolbarMenu
      label={label}
      icon="shapes"
      testId="pdf-editor-insert"
      disabled={disabled}
      pressed={kind !== null}
    >
      <InsertMenuItems mode={mode} onToggleMode={onToggleMode} />
    </ToolbarMenu>
  );
}
