import i18n from "i18next";
import {
  RolledBackError,
  type Command,
} from "@editor/tools/pdfTextEditor/commands/Command";
import type { EditorDocument } from "@editor/tools/pdfTextEditor/model/EditorDocument";
import type { PdfUaPart } from "@editor/tools/pdfTextEditor/pdfdoc/passes/conformanceClaim";

/** Declare the PDF/UA part the saved file conforms to, or with null withdraw the claim (EditorDocument.conformanceClaim). */
export class SetConformanceClaimCommand implements Command {
  readonly type = "set-conformance-claim";
  private captured = false;
  private previous: PdfUaPart | null | undefined;

  constructor(private readonly part: PdfUaPart | null) {}

  apply(doc: EditorDocument): void {
    if (!doc.canSetConformanceClaim()) {
      throw new RolledBackError(
        new Error(
          i18n.t(
            "pdfTextEditor.commands.conformanceClaimLocked",
            "This file's PDF/UA claim can't be changed.",
          ),
        ),
      );
    }
    if (!this.captured) {
      this.previous = doc.conformanceClaimEdit();
      this.captured = true;
    }
    doc.setConformanceClaim(this.part);
  }

  revert(doc: EditorDocument): void {
    if (this.captured) doc.setConformanceClaim(this.previous);
  }

  describe(): string {
    return this.part === null
      ? i18n.t(
          "pdfTextEditor.commands.withdrawConformanceClaim",
          "Withdraw the PDF/UA claim",
        )
      : i18n.t(
          "pdfTextEditor.commands.declareConformanceClaim",
          "Declare PDF/UA-{{part}}",
          { part: this.part },
        );
  }
}
