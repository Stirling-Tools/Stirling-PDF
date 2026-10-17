/** One structure element as the page sees it, read once when the page is first asked about. */
export interface StructureElement {
  /** The element's /S after the /RoleMap: "Figure", "P", or an unmapped custom role. */
  type: string;
  alt: string | null;
  actualText: string | null;
  /**
   * The MCIDs the element owns on this page. The PDFium fallback cannot tell
   * pages apart, so there it can also list other pages' MCIDs.
   */
  mcids: number[];
}

/** An unsaved change to an element, and the MCID the save addresses it by. */
export interface StructureElementEdit {
  mcid: number;
  /** The new /Alt; null removes it. */
  alt: string | null;
}

/**
 * Types whose /Alt stands in for the content. On any other element it would
 * replace text a reader speaks, so a description there is refused.
 */
const DESCRIBABLE_TYPES = new Set(["Figure", "Formula"]);

/**
 * The structure elements of one page plus the session's unsaved edits to
 * them. Edits are keyed by element rather than MCID, so an element that owns
 * several MCIDs has one description however it was addressed.
 */
export class PageStructure {
  readonly elements: readonly StructureElement[];
  private readonly byMcid = new Map<number, StructureElement>();
  private readonly edits = new Map<StructureElement, StructureElementEdit>();

  /** Why the save cannot write descriptions for this page, or null when it can. */
  readonly readOnly: string | null;

  constructor(
    elements: readonly StructureElement[],
    readOnly: string | null = null,
  ) {
    this.elements = elements;
    this.readOnly = readOnly;
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

  /** Why the content `mcid` marks cannot take a description, or null when it can. */
  cannotDescribe(mcid: number): string | null {
    const el = this.element(mcid);
    if (!el) return "no structure element owns it";
    if (this.readOnly) return this.readOnly;
    if (!DESCRIBABLE_TYPES.has(el.type)) {
      return `it belongs to a ${el.type || "untyped"} element, whose description would replace its text`;
    }
    return null;
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

  /** Throws when no element owns `mcid`: a command must not record an edit the save cannot address. */
  setEdit(mcid: number, edit: StructureElementEdit | null): void {
    const el = this.element(mcid);
    if (!el) throw new Error(`No structure element owns MCID ${mcid}`);
    if (edit) this.edits.set(el, edit);
    else this.edits.delete(el);
  }

  pendingEdits(): StructureElementEdit[] {
    return [...this.edits.values()];
  }
}
