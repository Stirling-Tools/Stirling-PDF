import i18n from "i18next";
import {
  RolledBackError,
  type Command,
} from "@editor/tools/pdfTextEditor/commands/Command";
import type { EditorDocument } from "@editor/tools/pdfTextEditor/model/EditorDocument";

/**
 * Set or, with null, remove the document's language: the catalog /Lang every
 * text is read in unless its element says otherwise. Held on the document and
 * written by the save, so no page is regenerated for it.
 */
export class SetDocumentLanguageCommand implements Command {
  readonly type = "set-document-language";
  private readonly lang: string | null;
  private previous: string | null | undefined;

  constructor(opts: { lang: string | null }) {
    this.lang = opts.lang;
  }

  apply(doc: EditorDocument): void {
    if (doc.cannotSetDocumentLanguage()) {
      throw new RolledBackError(
        new Error(
          i18n.t(
            "pdfTextEditor.inspector.language.cannotSetDocument",
            "This document's language can't be changed.",
          ),
        ),
      );
    }
    if (this.previous === undefined) this.previous = doc.documentLanguage();
    doc.setDocumentLanguage(this.lang);
  }

  revert(doc: EditorDocument): void {
    if (this.previous === undefined) return;
    doc.setDocumentLanguage(this.previous);
  }
}
