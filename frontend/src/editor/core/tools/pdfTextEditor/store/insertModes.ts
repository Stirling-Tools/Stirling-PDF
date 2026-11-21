import type { InteractionMode } from "@editor/tools/pdfTextEditor/store/EditorStore";
import type { ShapeKind } from "@editor/tools/pdfTextEditor/types";
import type { FormFieldKind } from "@editor/tools/pdfTextEditor/util/formFieldChanges";

export const SHAPE_MODE: Record<ShapeKind, InteractionMode> = {
  line: "addLine",
  rectangle: "addRectangle",
  box: "addBox",
};

export const FIELD_MODE: Record<FormFieldKind, InteractionMode> = {
  text: "addTextField",
  checkbox: "addCheckbox",
  signature: "addSignatureField",
};

function kindOf<K extends string>(modes: Record<K, InteractionMode>) {
  return (mode: InteractionMode): K | null =>
    (Object.keys(modes) as K[]).find((kind) => modes[kind] === mode) ?? null;
}

/** The shape the next page click places, or null. */
export const shapeKindOf = kindOf(SHAPE_MODE);

/** The form field the next page click places, or null. */
export const fieldKindOf = kindOf(FIELD_MODE);
