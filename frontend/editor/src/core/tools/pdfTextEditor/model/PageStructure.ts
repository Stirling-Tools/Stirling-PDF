/** One structure element as the page sees it, read once when the page is first asked about. */
export interface StructureElement {
  /** The element's /S, before role mapping: "Figure", "P", or a custom role. */
  type: string;
  alt: string | null;
  actualText: string | null;
  /**
   * The MCIDs the element owns. PDFium does not say which page each is on, so
   * an element spanning pages can list another page's here too.
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
 * The structure elements of one page plus the session's unsaved edits to
 * them. Edits are keyed by element rather than MCID, so an element that owns
 * several MCIDs has one description however it was addressed.
 */
export class PageStructure {
  readonly elements: readonly StructureElement[];
  private readonly byMcid = new Map<number, StructureElement>();
  private readonly edits = new Map<StructureElement, StructureElementEdit>();

  constructor(elements: readonly StructureElement[]) {
    this.elements = elements;
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
