import i18n from "i18next";
import {
  RolledBackError,
  type Command,
} from "@editor/tools/pdfTextEditor/commands/Command";
import { collectMemberPtrs } from "@editor/tools/pdfTextEditor/commands/editTextHelpers";
import type { EditorDocument } from "@editor/tools/pdfTextEditor/model/EditorDocument";
import type { StructureType } from "@editor/tools/pdfTextEditor/model/structureTypes";
import type { TextRun } from "@editor/tools/pdfTextEditor/model/TextRun";
import {
  addTagMark,
  highestMcid,
  innermostMcid,
  readTagMarks,
  removeTagMark,
  type TagMark,
} from "@editor/tools/pdfTextEditor/pdfium/PdfiumTagMarks";
import { canTagText } from "@editor/tools/pdfTextEditor/util/textAccessibility";

/**
 * Tag untagged text as a new element of `as`. Like tagging an image this
 * changes the text's marks, so the save regenerates the page's content; the
 * save pass then gives the element its place in the tree. Every object
 * backing the run carries the one MCID, and the save's repair gives each
 * sequence PDFium writes for them its own.
 */
export class TagTextCommand implements Command {
  readonly type = "tag-text";
  private readonly pageIndex: number;
  private readonly runId: string;
  private readonly as: StructureType;
  /** Chosen on first apply, so a redo reuses it. */
  private mcid: number | null = null;

  constructor(opts: { pageIndex: number; runId: string; as: StructureType }) {
    this.pageIndex = opts.pageIndex;
    this.runId = opts.runId;
    this.as = opts.as;
  }

  apply(doc: EditorDocument): void {
    const page = doc.page(this.pageIndex);
    const run = page.runs.find((r) => r.id === this.runId);
    const members = run ? collectMemberPtrs(run) : [];
    // Only the untagged objects: an artifact bullet beside the text stays one.
    const ptrs = members.filter(
      (ptr) => readTagMarks(doc.module, ptr).length === 0,
    );
    if (
      !run ||
      !canTagText(doc, run.snapshot()) ||
      members.includes(0) ||
      ptrs.length === 0
    ) {
      throw new RolledBackError(
        new Error(
          i18n.t(
            "pdfTextEditor.inspector.accessibility.cannotRetag",
            "This text's tag can't be changed.",
          ),
        ),
      );
    }
    const structure = doc.structure(this.pageIndex);
    this.mcid ??= structure.freeMcid(highestMcid(doc.module, page.pagePtr));
    const tag = { name: this.as, mcid: this.mcid };
    const marked: number[] = [];
    for (const ptr of ptrs) {
      if (!addTagMark(doc.module, doc.docPtr, ptr, tag)) {
        for (const done of marked) removeTagMark(doc.module, done, this.as);
        throw new Error("PDFium could not tag the text");
      }
      marked.push(ptr);
    }
    run.tagMarks = [tag];
    structure.addElement(this.mcid, this.as);
    page.markDirty();
    page.markNeedsGenerate();
  }

  revert(doc: EditorDocument): void {
    if (this.mcid === null) return;
    const page = doc.page(this.pageIndex);
    const run = page.runs.find((r) => r.id === this.runId);
    if (!run) return;
    untag(doc, run, { name: this.as, mcid: this.mcid });
    doc.structure(this.pageIndex).removeElement(this.mcid);
    page.markDirty();
    page.markNeedsGenerate();
  }
}

function untag(doc: EditorDocument, run: TextRun, tag: TagMark): void {
  for (const ptr of collectMemberPtrs(run)) {
    if (innermostMcid(readTagMarks(doc.module, ptr)) === tag.mcid) {
      removeTagMark(doc.module, ptr, tag.name);
    }
  }
  run.tagMarks = [];
}
