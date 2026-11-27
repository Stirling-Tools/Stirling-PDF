import { useEffect, useMemo, useRef, useState } from "react";
import { useSignatureFieldPicker } from "@editor/contexts/SignatureFieldPickerContext";
import { useNavigation } from "@editor/contexts/NavigationContext";
import { useViewer } from "@editor/contexts/ViewerContext";
import type { SignatureLayout } from "@editor/services/signatureFieldLayout";
import type { StirlingFile } from "@editor/types/fileContext";

interface OfferSignatureFieldsOptions {
  /** False withdraws the offer: the page stops outlining fields. */
  enabled: boolean;
  file: StirlingFile | null;
  layout: SignatureLayout | null;
  selected: string | null;
  onSelect: (fieldName: string) => void;
  /** Drawn inside the selected field on the page. */
  preview: string | null;
}

/**
 * Offers `layout`'s empty signature fields on the page: they are outlined and clickable, the
 * selected one shows `preview` and pulses whenever the selection changes. Choosing a field
 * anywhere but the page centres the viewer on it; the first selection does not move the view.
 */
export function useOfferSignatureFields({
  enabled,
  file,
  layout,
  selected,
  onSelect,
  preview,
}: OfferSignatureFieldsOptions): void {
  const { setPick } = useSignatureFieldPicker();
  const { setWorkbench } = useNavigation();
  const { activeFileId, setActiveFileId, scrollActions } = useViewer();
  const fields = useMemo(() => layout?.emptyFields ?? [], [layout]);
  const chosenField = fields.find((field) => field.name === selected);

  const chosenOnPage = useRef<string | null>(null);
  const [flash, setFlash] = useState(0);
  useEffect(() => {
    if (!enabled || !file || fields.length === 0) {
      setPick(null);
      return;
    }
    setPick({
      fileId: file.fileId,
      fieldNames: new Set(fields.map((field) => field.name)),
      selected,
      preview,
      flash,
      choose: (name) => {
        chosenOnPage.current = name;
        onSelect(name);
      },
    });
  }, [enabled, file, fields, selected, preview, flash, onSelect, setPick]);
  useEffect(() => () => setPick(null), [setPick]);

  const shownField = useRef<string | null>(null);
  useEffect(() => {
    if (!chosenField || shownField.current === chosenField.name) return;
    const first = shownField.current === null;
    const fromPage = chosenOnPage.current === chosenField.name;
    shownField.current = chosenField.name;
    chosenOnPage.current = null;
    setFlash((count) => count + 1);
    if (first || fromPage) return;
    if (file && activeFileId !== file.fileId) setActiveFileId(file.fileId);
    setWorkbench("viewer");
    const crop = layout?.cropBoxes[chosenField.pageIndex];
    if (!crop) {
      scrollActions.scrollToPage(chosenField.pageIndex + 1);
      return;
    }
    const { box } = chosenField;
    scrollActions.centrePagePoint(chosenField.pageIndex + 1, {
      x: box.x - crop.x + box.width / 2,
      y: crop.y + crop.height - (box.y + box.height / 2),
    });
  }, [
    layout,
    chosenField,
    file,
    activeFileId,
    setActiveFileId,
    setWorkbench,
    scrollActions,
  ]);
}
