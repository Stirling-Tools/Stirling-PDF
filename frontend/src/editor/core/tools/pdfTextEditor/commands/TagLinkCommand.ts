import i18n from "i18next";
import {
  RolledBackError,
  type Command,
} from "@editor/tools/pdfTextEditor/commands/Command";
import {
  linkTexts,
  type LinkText,
} from "@editor/tools/pdfTextEditor/commands/linkText";
import {
  elementStretches,
  rangeTagTypes,
  TagTextRangeCommand,
} from "@editor/tools/pdfTextEditor/commands/TagTextRangeCommand";
import type { EditorDocument } from "@editor/tools/pdfTextEditor/model/EditorDocument";
import { isInlineType } from "@editor/tools/pdfTextEditor/model/PageStructure";

/**
 * How a link can be tagged: by cutting the text it covers out into a Link,
 * or by giving it to the Link that text already is. `contents` is that text,
 * for a link with no /Contents.
 */
type LinkTagPlan = { text: LinkText; contents: string } & (
  | { kind: "cut" }
  | { kind: "existing"; mcid: number }
);

/** A link TagLinkCommand can tag, and the text it covers. */
export interface TaggableLink {
  annotation: number;
  text: LinkText;
}

interface AppliedPlan {
  cut: TagTextRangeCommand | null;
  /** The MCID of the existing Link, when there is no cut. */
  holder: number | null;
  contents: string;
}

/**
 * Give link annotation `annotation` an element: the text it covers, cut out
 * of the element whose text it is as a Link (TagTextRangeCommand), or the Link
 * that text already is. A link with no /Contents gets that text as one. The
 * page must already be read.
 */
export class TagLinkCommand implements Command {
  readonly type = "tag-link";
  private readonly pageIndex: number;
  private readonly annotation: number;
  /** Chosen on first apply, so a redo cuts the same text with the same MCIDs. */
  private plan: AppliedPlan | null = null;
  private setContents = false;

  constructor(opts: { pageIndex: number; annotation: number }) {
    this.pageIndex = opts.pageIndex;
    this.annotation = opts.annotation;
  }

  apply(doc: EditorDocument): void {
    const plan = (this.plan ??= this.choosePlan(doc));
    const structure = doc.structure(this.pageIndex);
    plan.cut?.apply(doc);
    try {
      structure.holdLink(this.annotation, plan.cut?.cutMcid ?? plan.holder);
    } catch (err) {
      plan.cut?.revert(doc);
      throw new RolledBackError(err);
    }
    this.setContents = structure.linkContents(this.annotation) === null;
    if (this.setContents) {
      structure.setLinkContents(this.annotation, plan.contents);
    }
  }

  revert(doc: EditorDocument): void {
    if (!this.plan) return;
    const structure = doc.structure(this.pageIndex);
    if (this.setContents) structure.setLinkContents(this.annotation, null);
    structure.holdLink(this.annotation, null);
    this.plan.cut?.revert(doc);
  }

  describe(): string {
    return i18n.t("pdfTextEditor.commands.tagLink", "Tag link");
  }

  private choosePlan(doc: EditorDocument): AppliedPlan {
    const plan = planLinkTags(doc, this.pageIndex, [this.annotation]).get(
      this.annotation,
    );
    if (!plan) {
      throw new RolledBackError(
        new Error(
          i18n.t(
            "pdfTextEditor.inspector.accessibility.cannotTagLink",
            "This link can't be tagged.",
          ),
        ),
      );
    }
    if (plan.kind === "existing") {
      return { cut: null, holder: plan.mcid, contents: plan.contents };
    }
    const { runId, start, end } = plan.text;
    return {
      cut: new TagTextRangeCommand({
        pageIndex: this.pageIndex,
        runId,
        start,
        end,
        as: "Link",
      }),
      holder: null,
      contents: plan.contents,
    };
  }
}

/**
 * The links TagLinkCommand can tag on a page, which must already be read;
 * with `runId`, only those over that run's text.
 */
export function taggableLinks(
  doc: EditorDocument,
  pageIndex: number,
  runId?: string,
): TaggableLink[] {
  const structure = doc.structure(pageIndex);
  const untagged = structure
    .links()
    .flatMap(({ annotation }) =>
      structure.linkHeld(annotation) ? [] : [annotation],
    );
  return [...planLinkTags(doc, pageIndex, untagged, runId)].map(
    ([annotation, { text }]) => ({ annotation, text }),
  );
}

/**
 * How each of `annotations` can be tagged, by annotation. Left out when it
 * cannot: an element already holds it, it covers no text of one run, or that
 * text cannot be cut out (rangeTagTypes).
 */
function planLinkTags(
  doc: EditorDocument,
  pageIndex: number,
  annotations: readonly number[],
  runId?: string,
): Map<number, LinkTagPlan> {
  const structure = doc.structure(pageIndex);
  const out = new Map<number, LinkTagPlan>();
  if (structure.cannotAddElement()) return out;
  const wanted = new Set(annotations);
  const links = structure
    .links()
    .filter(
      ({ annotation }) =>
        wanted.has(annotation) && !structure.linkHeld(annotation),
    );
  const page = doc.page(pageIndex);
  for (const [annotation, text] of linkTexts(doc, pageIndex, links)) {
    const run = page.findRun(text.runId);
    if (!run || (runId !== undefined && run.id !== runId)) continue;
    const contents = run.text
      .slice(text.start, text.end)
      .replace(/\s+/g, " ")
      .trim();
    const owner = elementStretches(doc, pageIndex, text.runId).find(
      (stretch) => stretch.start <= text.start && stretch.end >= text.end,
    )?.element;
    if (owner?.type === "Link") {
      const mcid = owner.mcids[0];
      out.set(annotation, { kind: "existing", mcid, text, contents });
      continue;
    }
    const { start, end } = text;
    if (rangeTagTypes(doc, pageIndex, run.id, start, end).some(isInlineType)) {
      out.set(annotation, { kind: "cut", text, contents });
    }
  }
  return out;
}
