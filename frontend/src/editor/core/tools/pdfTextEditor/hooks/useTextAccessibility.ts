import { useCallback, useMemo } from "react";
import { ACCESSIBILITY_EDITING } from "@editor/constants/featureFlags";
import type { Command } from "@editor/tools/pdfTextEditor/commands/Command";
import { CompositeCommand } from "@editor/tools/pdfTextEditor/commands/CompositeCommand";
import { RetagInnerCommand } from "@editor/tools/pdfTextEditor/commands/RetagInnerCommand";
import { RetagTextCommand } from "@editor/tools/pdfTextEditor/commands/RetagTextCommand";
import { SetInnerLanguageCommand } from "@editor/tools/pdfTextEditor/commands/SetInnerLanguageCommand";
import {
  SetTextLanguageCommand,
  type LanguageTarget,
} from "@editor/tools/pdfTextEditor/commands/SetTextLanguageCommand";
import { TagTextCommand } from "@editor/tools/pdfTextEditor/commands/TagTextCommand";
import {
  rangeTagTypes,
  TagTextRangeCommand,
} from "@editor/tools/pdfTextEditor/commands/TagTextRangeCommand";
import type { StructureType } from "@editor/tools/pdfTextEditor/model/structureTypes";
import type { TextLanguage } from "@editor/tools/pdfTextEditor/model/languageTag";
import type {
  EditorStore,
  EditorViewState,
} from "@editor/tools/pdfTextEditor/store/EditorStore";
import type {
  SelectionState,
  TextRange,
  TextRunSnapshot,
} from "@editor/tools/pdfTextEditor/types";
import type { EditorDocument } from "@editor/tools/pdfTextEditor/model/EditorDocument";
import {
  innerTags,
  sharedTextTag,
  textTag,
  type InnerTag,
  type TextTag,
} from "@editor/tools/pdfTextEditor/util/textAccessibility";

/** The tags marking parts of the selected text, and the selection inside it. */
export interface InnerTagsControl {
  tags: readonly InnerTag[];
  /** The tag whose text is exactly what is selected inside the run. */
  active: number | null;
  onSelect: (index: number) => void;
  /** Retags tag `index`, or removes it with null. */
  onSet: (index: number, type: StructureType | null) => void;
  /** What the characters selected inside the run can be tagged as; null when nothing new is selected. */
  newTagTypes: readonly StructureType[] | null;
  onTagSelection: (type: StructureType) => void;
  /** Sets the language of tag `index`, or clears it with null. */
  onSetLanguage: (index: number, lang: string | null) => void;
  /** Tags the characters selected inside the run as a Span in `lang`; null when they cannot take one. */
  onLanguageSelection: ((lang: string) => void) | null;
}

/** The language the selected text's blocks are read in, and a way to change it. */
export interface TextLanguageControl {
  /** The language the blocks share; undefined when they differ. */
  language: TextLanguage | undefined;
  onSet: (lang: string | null) => void;
}

/**
 * The tag of the selected text, the one shared by every selected run (null
 * unless only runs are selected), and a way to set it on all of them. For one
 * run, also the tags marking parts of it and ways to change them: a selection
 * inside the text that is exactly one inner tag's text picks that tag; any
 * other is offered as new text to tag.
 */
export function useTextAccessibility(
  store: EditorStore,
  state: EditorViewState,
  selection: SelectionState,
) {
  // One memo over the pages: a retag changes no snapshot of the run, only
  // republishes them.
  const languageTargets = useMemo(
    () =>
      store.document
        ? textLanguageTargets(store.document, state, selection)
        : null,
    [store, state, selection],
  );
  const { run, targets, tag, inner, newTagTypes } = useMemo(() => {
    const doc = store.document;
    const ids = new Set(selection.runIds);
    const selected =
      ACCESSIBILITY_EDITING &&
      selection.imageIds.length === 0 &&
      selection.shapeIds.length === 0
        ? state.pages.flatMap((page) => page.runs).filter((r) => ids.has(r.id))
        : [];
    if (!doc || selected.length === 0) {
      return {
        run: null,
        targets: [],
        tag: null,
        inner: [],
        newTagTypes: null,
      };
    }
    const targets = selected.map((r) => ({ run: r, tag: textTag(doc, r) }));
    const shared = sharedTextTag(targets.map((target) => target.tag));
    const only = selected.length === 1 ? selected[0] : null;
    if (!only) {
      return { run: null, targets, tag: shared, inner: [], newTagTypes: null };
    }
    const tags = innerTags(doc, only);
    const range = selection.textRange;
    const picksTag = tags.some((t) => sameRange(t, range));
    return {
      run: only,
      targets,
      tag: shared,
      inner: tags,
      newTagTypes: range && !picksTag ? tagTypesFor(doc, only, range) : null,
    };
  }, [store, state.pages, selection]);

  const activeInner = useMemo(
    () => inner.findIndex((t) => sameRange(t, selection.textRange)),
    [inner, selection.textRange],
  );

  /**
   * Retags each selected run's block, or gives its untagged text an element of
   * its own, as one undo step.
   */
  const setTag = useCallback(
    (type: StructureType) => {
      const command = setTextTagCommand(targets, type);
      if (command) store.dispatch(command);
    },
    [store, targets],
  );

  /** Selects inner tag `index`'s text. */
  const selectInner = useCallback(
    (index: number) => {
      const picked = inner[index];
      if (!run || !picked) return;
      store.selection.setTextRange(run.id, {
        start: picked.start,
        end: picked.end,
      });
    },
    [store, run, inner],
  );

  /** Retags inner tag `index`, or removes it with null. */
  const setInnerTag = useCallback(
    (index: number, type: StructureType | null) => {
      const picked = inner[index];
      if (!run || !picked) return;
      store.dispatch(
        new RetagInnerCommand({
          pageIndex: run.pageIndex,
          key: picked.key,
          type,
        }),
      );
      if (type === null) store.selection.setTextRange(run.id, null);
    },
    [store, run, inner],
  );

  /** Tags the characters selected inside the run as an element of their own. */
  const tagSelectedText = useCallback(
    (type: StructureType) => {
      const range = selection.textRange;
      if (!run || !range) return;
      store.dispatch(
        new TagTextRangeCommand({
          pageIndex: run.pageIndex,
          runId: run.id,
          ...range,
          as: type,
        }),
      );
      // The cut redraws the text, so the range no longer names what it did.
      store.selection.setTextRange(run.id, null);
    },
    [store, run, selection.textRange],
  );

  const setInnerLanguage = useCallback(
    (index: number, lang: string | null) => {
      const picked = inner[index];
      if (!run || !picked) return;
      store.dispatch(
        new SetInnerLanguageCommand({
          pageIndex: run.pageIndex,
          key: picked.key,
          lang,
        }),
      );
    },
    [store, run, inner],
  );

  const spansSelection = newTagTypes?.includes("Span") ?? false;
  const setSelectionLanguage = useCallback(
    (lang: string) => {
      const range = selection.textRange;
      if (!run || !range) return;
      store.dispatch(
        new TagTextRangeCommand({
          pageIndex: run.pageIndex,
          runId: run.id,
          ...range,
          as: "Span",
          lang,
        }),
      );
      store.selection.setTextRange(run.id, null);
    },
    [store, run, selection.textRange],
  );

  const innerControl = useMemo(
    (): InnerTagsControl => ({
      tags: inner,
      active: activeInner < 0 ? null : activeInner,
      onSelect: selectInner,
      onSet: setInnerTag,
      newTagTypes,
      onTagSelection: tagSelectedText,
      onSetLanguage: setInnerLanguage,
      onLanguageSelection: spansSelection ? setSelectionLanguage : null,
    }),
    [
      inner,
      activeInner,
      selectInner,
      setInnerTag,
      newTagTypes,
      tagSelectedText,
      setInnerLanguage,
      spansSelection,
      setSelectionLanguage,
    ],
  );

  const language = useMemo((): TextLanguageControl | null => {
    const doc = store.document;
    if (!doc || !languageTargets) return null;
    const [first, ...rest] = languageTargets.map(({ pageIndex, mcid }) =>
      doc.textLanguage(pageIndex, mcid),
    );
    const shared = rest.every(
      (l) => l?.own === first?.own && l?.inherited === first?.inherited,
    );
    return {
      language: shared && first ? first : undefined,
      onSet: (lang) =>
        store.dispatch(
          new SetTextLanguageCommand({ targets: languageTargets, lang }),
        ),
    };
    // state.pages: a language change republishes the pages, not the targets.
  }, [store, languageTargets, state.pages]);

  return { tag, setTag, inner: innerControl, language };
}

/**
 * The text the selection's runs are tagged as, for setting their blocks'
 * language; null unless only runs are selected and every one can take one.
 */
function textLanguageTargets(
  doc: EditorDocument,
  state: EditorViewState,
  selection: SelectionState,
): LanguageTarget[] | null {
  if (
    !ACCESSIBILITY_EDITING ||
    selection.runIds.length === 0 ||
    selection.imageIds.length > 0 ||
    selection.shapeIds.length > 0
  ) {
    return null;
  }
  const ids = new Set(selection.runIds);
  const runs = state.pages
    .flatMap((page) => page.runs)
    .filter((r) => ids.has(r.id));
  const targets = runs.flatMap((r) =>
    r.mcid !== undefined &&
    !r.inForm &&
    doc.structure(r.pageIndex).cannotSetLanguage(r.mcid) === null
      ? [{ pageIndex: r.pageIndex, mcid: r.mcid }]
      : [],
  );
  return targets.length > 0 && targets.length === ids.size ? targets : null;
}

/**
 * One undo step setting `type` on every run whose tag can be set; null when
 * none can.
 */
export function setTextTagCommand(
  targets: readonly { run: TextRunSnapshot; tag: TextTag }[],
  type: StructureType,
): Command | null {
  const commands = targets.flatMap(({ run, tag }) => {
    const command = runTagCommand(run, tag, type);
    return command ? [command] : [];
  });
  if (commands.length <= 1) return commands[0] ?? null;
  return new CompositeCommand(commands);
}

function runTagCommand(
  run: TextRunSnapshot,
  tag: TextTag,
  type: StructureType,
): Command | null {
  if (tag.kind === "tagged" && run.mcid !== undefined) {
    return new RetagTextCommand({
      pageIndex: run.pageIndex,
      mcid: run.mcid,
      type,
    });
  }
  if (tag.kind === "untagged" && tag.taggable) {
    return new TagTextCommand({
      pageIndex: run.pageIndex,
      runId: run.id,
      as: type,
    });
  }
  return null;
}

function sameRange(a: TextRange, b: TextRange | null): boolean {
  return b !== null && a.start === b.start && a.end === b.end;
}

/**
 * The tags the selected characters can take; null when they are all of the
 * run's text, which the run's own tag already offers.
 */
function tagTypesFor(
  doc: EditorDocument,
  run: TextRunSnapshot,
  { start, end }: TextRange,
): StructureType[] | null {
  if (end > run.text.length) return null;
  if (run.text.slice(start, end).trim() === run.text.trim()) return null;
  return rangeTagTypes(doc, run.pageIndex, run.id, start, end);
}
