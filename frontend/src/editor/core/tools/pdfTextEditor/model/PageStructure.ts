import type {
  StructureRole,
  StructureType,
} from "@editor/tools/pdfTextEditor/model/structureTypes";

/** One structure element as the page sees it, read once when the page is first asked about. */
export interface StructureElement extends StructureRole {
  /** The element's StructureBlock key: equal to `block.key` when it is a block itself. */
  key: string;
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
 * types (ISO 32000-1 14.8.4.4, plus PDF 2.0's Em, Strong and Sub), the two
 * halves of a list item, and NonStruct, whose content is processed as if it
 * were its parent's (14.8.4.2).
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
  "NonStruct",
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
  const inline = own.type !== null && isInlineType(own.type);
  const grouping = parent?.type != null && GROUPING_TYPES.has(parent.type);
  return parent !== null && inline && !grouping ? parent.block : own;
}

export function isInlineType(type: StructureType): boolean {
  return INLINE_TYPES.has(type);
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

/** What a whole element's text can be retagged as. Lbl and Span only tag part of one (TEXT_RANGE_TYPES). */
export const TEXT_BLOCK_TYPES = [
  "P",
  "H1",
  "H2",
  "H3",
  "H4",
  "H5",
  "H6",
  "Quote",
  "Note",
  "Code",
] as const satisfies readonly StructureType[];

/**
 * What part of an element's text can be tagged as: an inline type joins the
 * element, and any other splits the element around it.
 */
export const TEXT_RANGE_TYPES = [
  "P",
  "H1",
  "H2",
  "H3",
  "H4",
  "H5",
  "H6",
  "Lbl",
  "Span",
  "Quote",
  "Note",
  "Code",
] as const satisfies readonly StructureType[];

/** What an inline element of the file's own can be retagged as: changing it to a block would split its block. */
const INLINE_RANGE_TYPES: readonly StructureType[] =
  TEXT_RANGE_TYPES.filter(isInlineType);

const RETAGGABLE_TYPES: ReadonlySet<StructureType> = new Set<StructureType>([
  ...TEXT_BLOCK_TYPES,
  "H",
]);

/**
 * Why text cannot be retagged. "not-text" is a block holding more than text,
 * such as a list item or table cell, whose retagging would break the
 * structure around it.
 */
export type RetagBlocker = "untagged" | "not-text" | ReadOnlyReason;

/** The type the session has retagged a block as, by block key; null when it has not. */
export type RetagLookup = (key: string) => StructureType | null;

type AddedStructureElement = StructureElement & { type: StructureType };

/**
 * Text the session cut out of an element into a new one. An inline type
 * joins the element it was cut from; any other splits it, the cut becoming
 * a sibling.
 */
export interface ContentCut {
  /**
   * The MCIDs the text was cut from, in reading order: consecutive kids of
   * one element. All of their content is in the cut but for the parts
   * `before` and `after` mark.
   */
  from: readonly number[];
  /**
   * The MCID of the content cut from that is read before the cut: the first
   * of `from`, or one the cut gave it. Null when there is none.
   */
  before: number | null;
  /** As `before`, for the content read after the cut, and the last of `from`. */
  after: number | null;
}

/** The MCIDs a cut gave to the content it was cut from. */
function givenMcids(cut: ContentCut): number[] {
  return [cut.before, cut.after].filter(
    (mcid): mcid is number => mcid !== null && !cut.from.includes(mcid),
  );
}

/** An element the session cut out of another's text. */
export interface CutElement {
  mcid: number;
  /** Null once removed: the save gives the text back to the element it was cut from. */
  type: StructureType | null;
  alt: string | null;
  cut: ContentCut;
}

/** What an element marking part of a block's text can be changed to. */
export interface InnerOptions {
  /** Empty when its type cannot be changed. */
  types: readonly StructureType[];
  removable: boolean;
}

/** A change to one of the file's elements marking part of a block's text. */
export interface InnerElementEdit {
  mcid: number;
  /** Null removes the element, its content joining its parent. */
  type: StructureType | null;
}

/** An element the session adds for content the file leaves untagged. */
export interface AddedElement {
  mcid: number;
  type: StructureType;
  /** The /Alt to save; null for none. */
  alt: string | null;
}

/**
 * The structure elements of one page plus the session's unsaved edits to
 * them, and the elements it adds. Edits are keyed by element rather than MCID,
 * so an element that owns several MCIDs has one description however it was
 * addressed.
 */
export class PageStructure {
  readonly elements: readonly StructureElement[];
  private readonly byMcid = new Map<number, StructureElement>();
  private readonly edits = new Map<StructureElement, StructureElementEdit>();
  private readonly added = new Map<number, AddedStructureElement>();
  /** By the new element's MCID, in the order made: a later cut can take text from an earlier one. */
  private readonly cuts = new Map<
    number,
    { cut: ContentCut; owner: StructureElement }
  >();
  private readonly fileElements: ReadonlySet<StructureElement>;
  /** Changes to the file's inner elements: null for one the session removed. */
  private readonly innerChanges = new Map<
    StructureElement,
    StructureType | null
  >();
  /**
   * What a removed inner element's text belongs to, by block key, where the
   * block owns no content of its own on the page to stand for it.
   */
  private readonly standIns = new Map<string, StructureElement>();

  /** Why the save cannot write descriptions for this page, or null when it can. */
  readonly readOnly: ReadOnlyReason | null;
  /**
   * The length of the page's ParentTree array, so the first MCID it has no
   * slot for; null when the page has no array to add an element to.
   */
  private readonly slotCount: number | null;
  private readonly retaggedAs: RetagLookup;

  constructor(
    elements: readonly StructureElement[],
    readOnly: ReadOnlyReason | null = null,
    slotCount: number | null = null,
    retaggedAs: RetagLookup = () => null,
  ) {
    this.elements = elements;
    this.readOnly = readOnly;
    this.slotCount = slotCount;
    this.retaggedAs = retaggedAs;
    this.fileElements = new Set(elements);
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

  /**
   * The block the content `mcid` marks belongs to, as the session has
   * retagged it; null when no element owns it.
   */
  block(mcid: number): StructureBlock | null {
    const block = this.element(mcid)?.block;
    if (!block) return null;
    const type = this.retaggedAs(block.key);
    return type ? { key: block.key, role: type, type } : block;
  }

  /** Why the block the text `mcid` marks belongs to cannot be retagged, or null when it can. */
  cannotRetag(mcid: number): RetagBlocker | null {
    const el = this.element(mcid);
    if (!el) return "untagged";
    if (this.readOnly) return this.readOnly;
    // A custom role's meaning is unknown, and giving it a standard one is the fix.
    if (el.block.type !== null && !RETAGGABLE_TYPES.has(el.block.type)) {
      return "not-text";
    }
    return null;
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
   * does, and for an added element, whose content is retagged instead.
   */
  setDecorative(mcid: number, decorative: boolean): void {
    if (this.added.has(mcid)) {
      throw new Error(`MCID ${mcid} is an added element`);
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

  /** Edits to the file's elements; added elements are listed by addedElements. */
  pendingEdits(): StructureElementEdit[] {
    const added = new Set<StructureElement>(this.added.values());
    return [...this.edits]
      .filter(([el]) => !added.has(el))
      .map(([, edit]) => edit);
  }

  /** Why untagged content on this page cannot be given an element, or null when it can. */
  cannotAddElement(): DescriptionBlocker | null {
    if (this.readOnly) return this.readOnly;
    return this.slotCount === null ? "untagged" : null;
  }

  /**
   * An MCID no slot or added element on the page uses, above `contentMax`: the
   * highest MCID the page's content carries, -1 for none.
   */
  freeMcid(contentMax: number): number {
    const used = [
      ...this.added.keys(),
      ...this.cuts.keys(),
      ...this.cutGivenMcids(),
    ];
    return Math.max(
      this.slotCount ?? 0,
      contentMax + 1,
      ...used.map((mcid) => mcid + 1),
    );
  }

  /** The MCIDs cuts gave to content read before or after them. */
  private cutGivenMcids(): number[] {
    return [...this.cuts.values()].flatMap(({ cut }) => givenMcids(cut));
  }

  isAdded(mcid: number): boolean {
    return this.added.has(mcid);
  }

  /** Give the content `mcid` marks a new element. Throws when an element already owns it. */
  addElement(mcid: number, type: StructureType): void {
    if (this.byMcid.has(mcid)) {
      throw new Error(`MCID ${mcid} already has an element`);
    }
    this.putAdded(mcid, type);
  }

  /**
   * Give the text `cut` takes from an element its own element of `type`,
   * the content it took now marked `mcid`. Throws when `mcid` already has an
   * element or no element owns the content it was cut from.
   */
  addCut(mcid: number, type: StructureType, cut: ContentCut): void {
    const owner = this.element(cut.from[0]);
    if (!owner)
      throw new Error(`No structure element owns MCID ${cut.from[0]}`);
    if (this.byMcid.has(mcid)) {
      throw new Error(`MCID ${mcid} already has an element`);
    }
    this.cuts.set(mcid, { cut, owner });
    this.putAdded(mcid, type);
    for (const given of givenMcids(cut)) this.byMcid.set(given, owner);
  }

  /** Change the type of the element added for `mcid`. Throws when none was added. */
  setAddedType(mcid: number, type: StructureType): void {
    const previous = this.added.get(mcid);
    if (!previous) throw new Error(`MCID ${mcid} was not added`);
    const edit = this.edits.get(previous);
    this.edits.delete(previous);
    const element = this.putAdded(mcid, type);
    if (edit) this.edits.set(element, edit);
  }

  private putAdded(mcid: number, type: StructureType): AddedStructureElement {
    const key = addedKey(mcid);
    const owner = this.cuts.get(mcid)?.owner;
    const own = { key, role: type, type };
    const element: AddedStructureElement = {
      role: type,
      type,
      alt: null,
      actualText: null,
      mcids: [mcid],
      onlyMarkedContent: true,
      key,
      block: owner ? containingBlock(own, owner) : own,
    };
    this.added.set(mcid, element);
    this.byMcid.set(mcid, element);
    return element;
  }

  /** Drop an added element, its description, and the cut it was made by. */
  removeElement(mcid: number): void {
    const element = this.added.get(mcid);
    if (!element && !this.cuts.has(mcid)) return;
    this.added.delete(mcid);
    this.byMcid.delete(mcid);
    if (element) this.edits.delete(element);
    const cut = this.cuts.get(mcid)?.cut;
    this.cuts.delete(mcid);
    for (const given of cut ? givenMcids(cut) : []) this.byMcid.delete(given);
  }

  /** Elements added for untagged content; cutElements lists the rest. */
  addedElements(): AddedElement[] {
    return [...this.added.keys()]
      .filter((mcid) => !this.cuts.has(mcid))
      .map((mcid) => this.addedElement(mcid));
  }

  /** Elements cut from others' text, in the order they were cut. */
  cutElements(): CutElement[] {
    return [...this.cuts].map(([mcid, { cut }]) => ({
      mcid,
      type: this.added.get(mcid)?.type ?? null,
      alt: this.alt(mcid),
      cut,
    }));
  }

  /** True when the element is a block of text, which a block cut out of it can split. */
  canSplit(el: StructureElement): boolean {
    return el.block.key === el.key && this.cannotRetag(el.mcids[0]) === null;
  }

  /**
   * The role element `key` has as the session has it, one marking part of a
   * block's text; null once the session removed it. Throws when the page has
   * no such element.
   */
  innerType(key: string): StructureRole | null {
    const cut = this.cutMcid(key);
    if (cut !== null) {
      const type = this.added.get(cut)?.type;
      return type ? { role: type, type } : null;
    }
    const el = this.fileElement(key);
    const change = this.innerChanges.get(el);
    if (change === undefined) return el;
    return change === null ? null : { role: change, type: change };
  }

  /** What element `key` can be changed to. Throws as innerType does. */
  innerOptions(key: string): InnerOptions {
    if (this.readOnly) return { types: [], removable: false };
    const cut = this.cutMcid(key);
    if (cut !== null) {
      const { owner } = this.cuts.get(cut)!;
      const types = this.canSplit(owner)
        ? TEXT_RANGE_TYPES
        : INLINE_RANGE_TYPES;
      return { types, removable: true };
    }
    const el = this.fileElement(key);
    // In a list item or table cell the element is part of that structure:
    // an LI's Lbl must stay one.
    if (el.key === el.block.key || this.cannotRetag(el.mcids[0]) !== null) {
      return { types: [], removable: false };
    }
    const inline = el.type !== null && INLINE_RANGE_TYPES.includes(el.type);
    return {
      types: inline ? INLINE_RANGE_TYPES : [],
      // Only marked content can join the parent without re-parenting
      // annotations or child elements.
      removable: el.type !== null && el.onlyMarkedContent,
    };
  }

  /**
   * Retag element `key`, or remove it with null, its text read as its
   * block's again. Throws as innerType does, and for a change innerOptions
   * does not offer, but for going back to the file's type: one the save
   * cannot write would fail every later save.
   */
  setInnerType(key: string, type: StructureType | null): void {
    const cut = this.cutMcid(key);
    const el = cut === null ? this.fileElement(key) : null;
    const options = this.innerOptions(key);
    const allowed =
      type === null
        ? options.removable
        : type === el?.type || options.types.includes(type);
    if (!allowed) throw new Error(`Element ${key} cannot become ${type}`);
    if (!el) {
      this.setCutType(cut!, type);
      return;
    }
    const holder = type === null ? this.standIn(el) : el;
    for (const mcid of el.mcids) this.byMcid.set(mcid, holder);
    if (type === el.type) this.innerChanges.delete(el);
    else this.innerChanges.set(el, type);
  }

  /** Changes to the file's inner elements, for the save. */
  innerEdits(): InnerElementEdit[] {
    return [...this.innerChanges].map(([el, type]) => ({
      mcid: el.mcids[0],
      type,
    }));
  }

  private setCutType(mcid: number, type: StructureType | null): void {
    if (type !== null) {
      if (this.added.has(mcid)) this.setAddedType(mcid, type);
      else this.putAdded(mcid, type);
      return;
    }
    const element = this.added.get(mcid);
    if (element) this.edits.delete(element);
    this.added.delete(mcid);
    this.byMcid.set(mcid, this.cuts.get(mcid)!.owner);
  }

  private cutMcid(key: string): number | null {
    for (const mcid of this.cuts.keys()) {
      if (addedKey(mcid) === key) return mcid;
    }
    return null;
  }

  private fileElement(key: string): StructureElement {
    const el = this.elements.find((candidate) => candidate.key === key);
    if (!el) throw new Error(`No element ${key} on the page`);
    return el;
  }

  /** The element a removed inner element's text belongs to: its block. */
  private standIn(el: StructureElement): StructureElement {
    const block = this.elements.find((other) => other.key === el.block.key);
    if (block) return block;
    const made = this.standIns.get(el.block.key) ?? {
      ...el.block,
      alt: null,
      actualText: null,
      mcids: el.mcids,
      onlyMarkedContent: true,
      block: el.block,
    };
    this.standIns.set(el.block.key, made);
    return made;
  }

  private addedElement(mcid: number): AddedElement {
    return { mcid, type: this.added.get(mcid)!.type, alt: this.alt(mcid) };
  }

  /** The MCID of the element the session added that is block `key`; null for a block the file has. */
  addedBlockMcid(key: string): number | null {
    for (const [mcid, element] of this.added) {
      if (element.key === key && element.block.key === key) return mcid;
    }
    return null;
  }

  /**
   * An MCID the file's own tree resolves to the element holding `mcid`'s
   * content, or for text cut into an inline element, to the element it was
   * cut from. Null for text in an element the session added.
   */
  fileMcid(mcid: number): number | null {
    const cut = this.cuts.get(mcid);
    const el = cut ? cut.owner : this.element(mcid);
    if (!el) return null;
    // A stand-in's MCIDs still name the removed element in the file, whose
    // block the save climbs to.
    if (this.fileElements.has(el) || this.isStandIn(el)) return el.mcids[0];
    return cut ? this.fileMcid(el.mcids[0]) : null;
  }

  private isStandIn(el: StructureElement): boolean {
    return this.standIns.get(el.key) === el;
  }
}

function addedKey(mcid: number): string {
  return `added:${mcid}`;
}
