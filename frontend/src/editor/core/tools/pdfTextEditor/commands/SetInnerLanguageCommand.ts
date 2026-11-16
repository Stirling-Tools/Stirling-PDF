import i18n from "i18next";
import {
  RolledBackError,
  type Command,
} from "@editor/tools/pdfTextEditor/commands/Command";
import type { EditorDocument } from "@editor/tools/pdfTextEditor/model/EditorDocument";

/**
 * Set or, with null, remove the language of element `key`, one marking part
 * of a block's text, such as a French phrase in an English question. Held on
 * the page's structure and written by the save as the element's /Lang.
 */
export class SetInnerLanguageCommand implements Command {
  readonly type = "set-inner-language";
  private readonly pageIndex: number;
  private readonly key: string;
  private readonly lang: string | null;
  private previous: string | null | undefined;

  constructor(opts: { pageIndex: number; key: string; lang: string | null }) {
    this.pageIndex = opts.pageIndex;
    this.key = opts.key;
    this.lang = opts.lang;
  }

  apply(doc: EditorDocument): void {
    const structure = doc.structure(this.pageIndex);
    try {
      const previous = structure.ownLang(this.key);
      structure.setOwnLang(this.key, this.lang);
      if (this.previous === undefined) this.previous = previous;
    } catch (err) {
      throw new RolledBackError(
        new Error(
          i18n.t(
            "pdfTextEditor.inspector.language.cannotSetText",
            "This text's language can't be changed.",
          ),
          {
            cause: err,
          },
        ),
      );
    }
    doc.page(this.pageIndex).bumpRevision();
  }

  revert(doc: EditorDocument): void {
    if (this.previous === undefined) return;
    doc.structure(this.pageIndex).setOwnLang(this.key, this.previous);
    doc.page(this.pageIndex).bumpRevision();
  }
}
