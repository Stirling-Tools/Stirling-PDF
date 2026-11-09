import i18n from "i18next";
import {
  RolledBackError,
  type Command,
} from "@editor/tools/pdfTextEditor/commands/Command";
import type { EditorDocument } from "@editor/tools/pdfTextEditor/model/EditorDocument";

/** Text a language is set for: the block the content `mcid` marks belongs to. */
export interface LanguageTarget {
  pageIndex: number;
  mcid: number;
}

/**
 * Set or, with null, remove the language of each target's block, as one
 * step: a letter set in French is often several paragraphs. Held on the
 * document and written by the save as each block's /Lang; the page content
 * keeps its marks, so it is never regenerated.
 */
export class SetTextLanguageCommand implements Command {
  readonly type = "set-text-language";
  private readonly targets: readonly LanguageTarget[];
  private readonly lang: string | null;
  private previous: (string | null)[] | null = null;

  constructor(opts: {
    targets: readonly LanguageTarget[];
    lang: string | null;
  }) {
    this.targets = opts.targets;
    this.lang = opts.lang;
  }

  apply(doc: EditorDocument): void {
    const refused = this.targets.some(
      ({ pageIndex, mcid }) =>
        doc.structure(pageIndex).cannotSetLanguage(mcid) !== null,
    );
    if (refused) {
      throw new RolledBackError(
        new Error(
          i18n.t(
            "pdfTextEditor.inspector.language.cannotSetText",
            "This text's language can't be changed.",
          ),
        ),
      );
    }
    // Read before any is set: two targets in one block share its language.
    this.previous ??= this.targets.map(
      ({ pageIndex, mcid }) => doc.textLanguage(pageIndex, mcid)!.own,
    );
    for (const { pageIndex, mcid } of this.targets) {
      doc.setTextLanguage(pageIndex, mcid, this.lang);
      doc.page(pageIndex).bumpRevision();
    }
  }

  revert(doc: EditorDocument): void {
    if (!this.previous) return;
    for (let i = this.targets.length - 1; i >= 0; i--) {
      const { pageIndex, mcid } = this.targets[i];
      doc.setTextLanguage(pageIndex, mcid, this.previous[i]);
      doc.page(pageIndex).bumpRevision();
    }
  }
}
