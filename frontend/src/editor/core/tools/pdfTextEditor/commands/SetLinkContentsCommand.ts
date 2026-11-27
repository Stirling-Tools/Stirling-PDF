import i18n from "i18next";
import {
  RolledBackError,
  type Command,
} from "@editor/tools/pdfTextEditor/commands/Command";
import type { EditorDocument } from "@editor/tools/pdfTextEditor/model/EditorDocument";

/**
 * Set or, with null, remove the /Contents of link annotations on a page: the
 * description a screen reader gives the link. Touches no page content; the
 * save pass writes it.
 */
export class SetLinkContentsCommand implements Command {
  readonly type = "set-link-contents";
  private readonly pageIndex: number;
  private readonly annotations: readonly number[];
  private readonly contents: string | null;
  /** Each annotation's /Contents before the first apply. */
  private previous: Map<number, string | null> | null = null;

  constructor(opts: {
    pageIndex: number;
    annotations: readonly number[];
    contents: string | null;
  }) {
    this.pageIndex = opts.pageIndex;
    this.annotations = opts.annotations;
    this.contents = opts.contents;
  }

  apply(doc: EditorDocument): void {
    const structure = doc.structure(this.pageIndex);
    const links = new Set(structure.links().map((link) => link.annotation));
    if (structure.readOnly || !this.annotations.every((a) => links.has(a))) {
      throw new RolledBackError(
        new Error(
          i18n.t(
            "pdfTextEditor.inspector.accessibility.cannotDescribeLink",
            "This link's description can't be changed.",
          ),
        ),
      );
    }
    this.previous ??= new Map(
      this.annotations.map((a) => [a, structure.linkContents(a)]),
    );
    for (const annotation of this.annotations) {
      structure.setLinkContents(annotation, this.contents);
    }
    doc.page(this.pageIndex).bumpRevision();
  }

  revert(doc: EditorDocument): void {
    if (!this.previous) return;
    const structure = doc.structure(this.pageIndex);
    for (const [annotation, contents] of this.previous) {
      structure.setLinkContents(annotation, contents);
    }
    doc.page(this.pageIndex).bumpRevision();
  }

  /** Keystrokes in one link's description field collapse into one undo step. */
  coalesceKey(): string {
    return `set-link-contents:${this.pageIndex}:${this.annotations.join(",")}`;
  }
}
