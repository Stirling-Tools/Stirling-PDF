import type {
  StructureRole,
  StructureType,
} from "@editor/tools/pdfTextEditor/model/structureTypes";

/** One structure element as the page sees it, read once when the page is first asked about. */
export interface StructureElement extends StructureRole {
  alt: string | null;
  actualText: string | null;
  /**
   * The MCIDs the element owns on this page. The PDFium fallback cannot tell
   * pages apart, so there it can also list other pages' MCIDs.
   */
  mcids: number[];
  /**
   * True when the element's content is all marked content on its pages: no
   * child elements, annotations or form XObject content.
   */
  onlyMarkedContent: boolean;
  block: StructureBlock;
}

/**
 * The block-level element content belongs to: the element itself, or for an
 * inline one (a Link in a P, an Lbl in an LI) its nearest block ancestor.
 * Text is grouped by block, so a link does not split its paragraph.
 */
export interface StructureBlock extends StructureRole {
  /** Distinguishes blocks within one read of the tree; not stable across reads. */
  key: string;
}

/**
 * Elements that sit inside a block rather than being one: the inline-level
 * types (ISO 32000-1 14.8.4.4, plus PDF 2.0's Em, Strong and Sub) and the
 * two halves of a list item.
 */
const INLINE_TYPES: ReadonlySet<StructureType> = new Set<StructureType>([
  "Span",
  "Quote",
  "Note",
  "Reference",
  "BibEntry",
  "Code",
  "Link",
  "Annot",
  "Ruby",
  "RB",
  "RT",
  "RP",
  "Warichu",
  "WT",
  "WP",
  "Em",
  "Strong",
  "Sub",
  "Lbl",
  "LBody",
]);

/**
 * Elements that hold blocks rather than text. An inline type placed directly
 * in one is used as a block (a Code listing in a Sect), so it is its own.
 */
const GROUPING_TYPES: ReadonlySet<StructureType> = new Set<StructureType>([
  "Document",
  "DocumentFragment",
  "Part",
  "Art",
  "Sect",
  "Div",
  "BlockQuote",
  "Aside",
  "NonStruct",
  "Private",
  "TOC",
  "Index",
  "L",
  "Table",
  "THead",
  "TBody",
  "TFoot",
  "TR",
]);

/**
 * The block an element belongs to, given itself as a block and its parent,
 * null at the top of the tree. A custom role is neither inline nor grouping:
 * nothing says what it holds.
 */
export function containingBlock(
  own: StructureBlock,
  parent: { type: StructureType | null; block: StructureBlock } | null,
): StructureBlock {
  const inline = own.type !== null && INLINE_TYPES.has(own.type);
  const grouping = parent?.type != null && GROUPING_TYPES.has(parent.type);
  return parent !== null && inline && !grouping ? parent.block : own;
}

/** An unsaved change to an element, and the MCID the save addresses it by. */
export interface StructureElementEdit {
  mcid: number;
  /** The /Alt to save; null removes it. */
  alt: string | null;
  /** Turn the element's content into an artifact and drop the element. */
  decorative: boolean;
}

/**
 * Types whose /Alt stands in for the content. On any other element it would
 * replace text a reader speaks, so a description there is refused.
 */
const DESCRIBABLE_TYPES: ReadonlySet<StructureType> = new Set<StructureType>([
  "Figure",
  "Formula",
]);

/** Why the save cannot write descriptions for a page. */
export type ReadOnlyReason = "encrypted" | "unreadable";

/** Why content cannot take a description. */
export type DescriptionBlocker = "untagged" | "not-figure" | ReadOnlyReason;

/** Why content cannot be marked decorative. */
export type DecorativeBlocker = DescriptionBlocker | "mixed-content";

/** A Figure the session adds for content the file leaves untagged. */
export interface AddedFigure {
  mcid: number;
  /** The /Alt to save; null for none. */
  alt: string | null;
}

/**
 * The structure elements of one page plus the session's unsaved edits to
 * them, and the figures it adds. Edits are keyed by element rather than MCID,
 * so an element that owns several MCIDs has one description however it was
 * addressed.
 */
export class PageStructure {
  readonly elements: readonly StructureElement[];
  private readonly byMcid = new Map<number, StructureElement>();
  private readonly edits = new Map<StructureElement, StructureElementEdit>();
  private readonly added = new Map<number, StructureElement>();

  /** Why the save cannot write descriptions for this page, or null when it can. */
  readonly readOnly: ReadOnlyReason | null;
  /**
   * The length of the page's ParentTree array, so the first MCID it has no
   * slot for; null when the page has no array to add a figure to.
   */
  private readonly slotCount: number | null;

  constructor(
    elements: readonly StructureElement[],
    readOnly: ReadOnlyReason | null = null,
    slotCount: number | null = null,
  ) {
    this.elements = elements;
    this.readOnly = readOnly;
    this.slotCount = slotCount;
    for (const el of elements) {
      for (const mcid of el.mcids) this.byMcid.set(mcid, el);
    }
  }

  get tagged(): boolean {
    return this.elements.length > 0;
  }

  element(mcid: number): StructureElement | null {
    return this.byMcid.get(mcid) ?? null;
  }

  /** The block the content `mcid` marks belongs to, or null when no element owns it. */
  block(mcid: number): StructureBlock | null {
    return this.element(mcid)?.block ?? null;
  }

  /** Why the content `mcid` marks cannot take a description, or null when it can. */
  cannotDescribe(mcid: number): DescriptionBlocker | null {
    const el = this.element(mcid);
    if (!el) return "untagged";
    if (this.readOnly) return this.readOnly;
    if (el.type === null || !DESCRIBABLE_TYPES.has(el.type)) {
      return "not-figure";
    }
    return null;
  }

  /** Why the content `mcid` marks cannot be marked decorative, or null when it can. */
  cannotMarkDecorative(mcid: number): DecorativeBlocker | null {
    const blocker = this.cannotDescribe(mcid);
    if (blocker) return blocker;
    return this.element(mcid)!.onlyMarkedContent ? null : "mixed-content";
  }

  /** True when the session has marked the element owning `mcid` decorative. */
  decorative(mcid: number): boolean {
    return this.editFor(mcid)?.decorative ?? false;
  }

  /** The description as it will be saved: the session's edit, else the file's. */
  alt(mcid: number): string | null {
    const el = this.element(mcid);
    if (!el) return null;
    const edit = this.edits.get(el);
    return edit ? edit.alt : el.alt;
  }

  /** The unsaved edit to the element owning `mcid`, for a command to restore on undo. */
  editFor(mcid: number): StructureElementEdit | null {
    const el = this.element(mcid);
    return el ? (this.edits.get(el) ?? null) : null;
  }

  /** Set the description, keeping any decorative mark. Throws as setEdit does. */
  setAlt(mcid: number, alt: string | null): void {
    this.setEdit(mcid, { mcid, alt, decorative: this.decorative(mcid) });
  }

  /**
   * Mark or unmark decorative, keeping the description. Throws as setEdit
   * does, and for an added figure, whose content is retagged instead.
   */
  setDecorative(mcid: number, decorative: boolean): void {
    if (this.added.has(mcid)) {
      throw new Error(`MCID ${mcid} is an added figure`);
    }
    this.setEdit(mcid, { mcid, alt: this.alt(mcid), decorative });
  }

  /** Throws when no element owns `mcid`: a command must not record an edit the save cannot address. */
  setEdit(mcid: number, edit: StructureElementEdit | null): void {
    const el = this.element(mcid);
    if (!el) throw new Error(`No structure element owns MCID ${mcid}`);
    if (edit) this.edits.set(el, edit);
    else this.edits.delete(el);
  }

  /** Edits to the file's elements; added figures are listed by addedFigures. */
  pendingEdits(): StructureElementEdit[] {
    const added = new Set(this.added.values());
    return [...this.edits]
      .filter(([el]) => !added.has(el))
      .map(([, edit]) => edit);
  }

  /** Why untagged content on this page cannot be given a figure, or null when it can. */
  cannotAddFigure(): DescriptionBlocker | null {
    if (this.readOnly) return this.readOnly;
    return this.slotCount === null ? "untagged" : null;
  }

  /**
   * An MCID no slot or added figure on the page uses, above `contentMax`: the
   * highest MCID the page's content carries, -1 for none.
   */
  freeMcid(contentMax: number): number {
    return Math.max(
      this.slotCount ?? 0,
      contentMax + 1,
      ...[...this.added.keys()].map((mcid) => mcid + 1),
    );
  }

  isAdded(mcid: number): boolean {
    return this.added.has(mcid);
  }

  /** Give the content `mcid` marks a new Figure. Throws when an element already owns it. */
  addFigure(mcid: number): void {
    if (this.byMcid.has(mcid)) {
      throw new Error(`MCID ${mcid} already has an element`);
    }
    const figure: StructureElement = {
      role: "Figure",
      type: "Figure",
      alt: null,
      actualText: null,
      mcids: [mcid],
      onlyMarkedContent: true,
      block: { key: `added:${mcid}`, role: "Figure", type: "Figure" },
    };
    this.added.set(mcid, figure);
    this.byMcid.set(mcid, figure);
  }

  /** Drop an added figure and its description. */
  removeFigure(mcid: number): void {
    const figure = this.added.get(mcid);
    if (!figure) return;
    this.added.delete(mcid);
    this.byMcid.delete(mcid);
    this.edits.delete(figure);
  }

  addedFigures(): AddedFigure[] {
    return [...this.added.keys()].map((mcid) => ({
      mcid,
      alt: this.alt(mcid),
    }));
  }
}
