import i18n from "i18next";
import { RolledBackError } from "@editor/tools/pdfTextEditor/commands/Command";

export function unsafeRtlEditMessage(): string {
  return i18n.t(
    "pdfTextEditor.error.unsafeRtlEdit",
    "Can't make this edit: the editor can't redraw this line's right-to-left text without changing it.",
  );
}

/**
 * Refuses a command that would redraw, rescale, restyle, regroup or copy the
 * text of a line the reader could not read back faithfully. Call it before
 * anything is changed: the refusal reports the document as intact. Moving,
 * deleting and recolouring a run leave its drawn text alone and need no check.
 */
export function refuseRedrawOfReadOnlyText(run: {
  textReadOnly: boolean;
}): void {
  if (run.textReadOnly)
    throw new RolledBackError(new Error(unsafeRtlEditMessage()));
}
