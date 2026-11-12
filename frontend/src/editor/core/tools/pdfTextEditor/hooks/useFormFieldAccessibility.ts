import { useCallback, useMemo } from "react";
import { SetFormFieldTooltipCommand } from "@editor/tools/pdfTextEditor/commands/SetFormFieldTooltipCommand";
import { TagFormFieldCommand } from "@editor/tools/pdfTextEditor/commands/TagFormFieldCommand";
import type {
  EditorStore,
  EditorViewState,
} from "@editor/tools/pdfTextEditor/store/EditorStore";
import type { SelectionState } from "@editor/tools/pdfTextEditor/types";
import {
  formFieldAccessibility,
  type FormFieldAccessibility,
} from "@editor/tools/pdfTextEditor/util/formFieldAccessibility";

interface SelectedFormField {
  pageIndex: number;
  accessibility: FormFieldAccessibility;
}

/** The accessibility of the selected form field, null when none is selected. */
export function useFormFieldAccessibility(
  store: EditorStore,
  state: EditorViewState,
  selection: SelectionState,
) {
  const { formFieldId } = selection;
  const selected = useMemo((): SelectedFormField | null => {
    const doc = store.document;
    if (!doc || formFieldId === null) return null;
    for (const page of state.pages) {
      const box = page.annotations?.find((a) => a.id === formFieldId);
      if (box) {
        const { pageIndex } = page;
        const accessibility = formFieldAccessibility(doc, pageIndex, box.index);
        return { pageIndex, accessibility };
      }
    }
    return null;
  }, [store, state.pages, formFieldId]);

  const tag = useCallback(() => {
    const field = editableField(selected);
    if (!field || field.tagged) return;
    store.dispatch(
      new TagFormFieldCommand({
        pageIndex: field.pageIndex,
        annotation: field.widget.annotation,
      }),
    );
  }, [store, selected]);

  const setDescription = useCallback(
    (text: string) => {
      const field = editableField(selected);
      if (!field) return;
      // An emptied field removes the description rather than saving an empty one.
      store.dispatch(
        new SetFormFieldTooltipCommand({
          pageIndex: field.pageIndex,
          annotation: field.widget.annotation,
          tooltip: text === "" ? null : text,
        }),
      );
    },
    [store, selected],
  );

  return {
    accessibility: selected?.accessibility ?? null,
    tag,
    setDescription,
  };
}

function editableField(selected: SelectedFormField | null) {
  if (selected?.accessibility.kind !== "editable") return null;
  return { pageIndex: selected.pageIndex, ...selected.accessibility };
}
