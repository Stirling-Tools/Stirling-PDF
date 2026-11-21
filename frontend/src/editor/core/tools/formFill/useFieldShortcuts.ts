/**
 * Delete, copy and paste for the selected form field, in both create and modify mode.
 */
import { useEffect, useRef } from "react";

import { useFormFill } from "@editor/tools/formFill/FormFillContext";
import { isTextEntryTarget } from "@editor/tools/formFill/usePageScale";
import {
  pendingIdFrom,
  pendingSelectionName,
} from "@editor/tools/formFill/pendingSelection";
import {
  duplicateInPlace,
  takenFieldNames,
  templateFromField,
  type FieldTemplate,
} from "@editor/tools/formFill/fieldDuplication";

export function useFieldShortcuts() {
  const {
    mode,
    saving,
    state,
    selectedFieldName,
    setSelectedField,
    pendingFields,
    addPendingField,
    removePendingField,
    toggleFieldDeleted,
    modifiedFields,
    undo,
  } = useFormFill();

  const clipboardRef = useRef<FieldTemplate | null>(null);

  // Refs, so the listener is installed once instead of on every selection change.
  const latest = useRef({
    mode,
    saving,
    state,
    selectedFieldName,
    setSelectedField,
    pendingFields,
    addPendingField,
    removePendingField,
    toggleFieldDeleted,
    modifiedFields,
    undo,
  });
  latest.current = {
    mode,
    saving,
    state,
    selectedFieldName,
    setSelectedField,
    pendingFields,
    addPendingField,
    removePendingField,
    toggleFieldDeleted,
    modifiedFields,
    undo,
  };

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const ctx = latest.current;
      if (ctx.mode === "fill" || ctx.saving) return;
      // Never steal a shortcut from a field the user is typing in.
      if (isTextEntryTarget(event.target)) return;

      const selected = ctx.selectedFieldName;
      const pendingId = pendingIdFrom(selected);
      const copyOrPaste = event.ctrlKey || event.metaKey;

      // Undo steps back through the staged edits, newest first.
      if (copyOrPaste && event.key.toLowerCase() === "z" && !event.shiftKey) {
        if (ctx.undo()) event.preventDefault();
        return;
      }

      if (copyOrPaste && event.key.toLowerCase() === "c") {
        if (!selected) return;
        const pending = pendingId
          ? ctx.pendingFields.find((f) => f.id === pendingId)
          : null;
        if (pending) {
          const { id: _id, ...rest } = pending;
          clipboardRef.current = rest;
          event.preventDefault();
          return;
        }
        const field = ctx.state.fields.find((f) => f.name === selected);
        const copied = field
          ? templateFromField(field, ctx.modifiedFields[field.name])
          : null;
        if (!copied) return;
        clipboardRef.current = copied;
        event.preventDefault();
        return;
      }

      if (copyOrPaste && event.key.toLowerCase() === "v") {
        const copied = clipboardRef.current;
        if (!copied) return;
        const taken = takenFieldNames(
          ctx.state.fields,
          ctx.pendingFields,
          ctx.modifiedFields,
        );
        const id = ctx.addPendingField(duplicateInPlace(copied, taken));
        ctx.setSelectedField(pendingSelectionName(id));
        event.preventDefault();
        return;
      }

      if (event.key === "Delete" || event.key === "Backspace") {
        if (!selected) return;
        if (pendingId) {
          ctx.removePendingField(pendingId);
        } else {
          ctx.toggleFieldDeleted(selected);
        }
        ctx.setSelectedField(null);
        event.preventDefault();
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);
}
