/**
 * Delete, copy and paste for the selected form field, in both create and modify mode.
 */
import { useEffect, useRef } from "react";

import { useFormFill } from "@app/tools/formFill/FormFillContext";
import { isTextEntryTarget } from "@app/tools/formFill/usePageScale";
import {
  pendingIdFrom,
  pendingSelectionName,
} from "@app/tools/formFill/pendingSelection";
import type {
  CreatableFieldType,
  NewFieldDefinition,
} from "@app/tools/formFill/types";

/** Enough offset that the copy is visibly its own field rather than hiding the original. */
const PASTE_OFFSET_PT = 12;

type Copied = Omit<NewFieldDefinition, "name"> & { name?: string };

export function useFieldShortcuts() {
  const {
    mode,
    state,
    selectedFieldName,
    setSelectedField,
    pendingFields,
    addPendingField,
    removePendingField,
    toggleFieldDeleted,
  } = useFormFill();

  const clipboardRef = useRef<Copied | null>(null);

  // Refs, so the listener is installed once instead of on every selection change.
  const latest = useRef({
    mode,
    state,
    selectedFieldName,
    setSelectedField,
    pendingFields,
    addPendingField,
    removePendingField,
    toggleFieldDeleted,
  });
  latest.current = {
    mode,
    state,
    selectedFieldName,
    setSelectedField,
    pendingFields,
    addPendingField,
    removePendingField,
    toggleFieldDeleted,
  };

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const ctx = latest.current;
      if (ctx.mode === "fill") return;
      // Never steal a shortcut from a field the user is typing in.
      if (isTextEntryTarget(event.target)) return;

      const selected = ctx.selectedFieldName;
      const pendingId = pendingIdFrom(selected);
      const copyOrPaste = event.ctrlKey || event.metaKey;

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
        const widget = field?.widgets?.[0];
        if (!field || !widget) return;
        clipboardRef.current = {
          name: field.name,
          type: field.type as CreatableFieldType,
          pageIndex: widget.pageIndex,
          x: widget.x,
          y: widget.y,
          width: widget.width,
          height: widget.height,
          options: field.options ?? undefined,
          required: field.required,
          multiline: field.multiline,
        };
        event.preventDefault();
        return;
      }

      if (copyOrPaste && event.key.toLowerCase() === "v") {
        const copied = clipboardRef.current;
        if (!copied) return;
        // The name is dropped: two fields cannot share one, and the queue names it.
        const { name: _name, ...geometry } = copied;
        const id = ctx.addPendingField({
          ...geometry,
          x: geometry.x + PASTE_OFFSET_PT,
          y: geometry.y - PASTE_OFFSET_PT,
        });
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
