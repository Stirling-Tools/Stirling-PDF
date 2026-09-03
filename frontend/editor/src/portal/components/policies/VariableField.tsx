import { useCallback, useEffect, useId, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import AddRoundedIcon from "@mui/icons-material/AddRounded";
import CheckRoundedIcon from "@mui/icons-material/CheckRounded";
import CloseRoundedIcon from "@mui/icons-material/CloseRounded";
import DataObjectRoundedIcon from "@mui/icons-material/DataObjectRounded";
import ExpandMoreRoundedIcon from "@mui/icons-material/ExpandMoreRounded";
import RedoRoundedIcon from "@mui/icons-material/RedoRounded";
import UndoRoundedIcon from "@mui/icons-material/UndoRounded";
import { ActionIcon, Button } from "@app/ui";
import {
  VARIABLE_GROUPS,
  defForPath,
  openReferenceAt,
  variableLabel,
  variableSuggestions,
  type VariableDef,
  type VariableGroup,
} from "@portal/components/policies/variables";
import "@portal/components/policies/VariableField.css";

/**
 * A text field whose variables are objects rather than syntax.
 *
 * The value is still plain `{{path}}` text - what the pipeline stores and the backend resolves -
 * but nothing on screen says so. A reference draws as a labelled box reading "File name", and that
 * box is a real control: click it to change which variable it is, tab to it, delete it whole. The
 * braces only reappear if the operator asks for them with "Edit as text".
 *
 * There are four ways to add one, deliberately. `@` and `/` are for people who live on the
 * keyboard, the Add variable button is for everyone else, and `{{` still works so nobody who
 * learned the old syntax has to unlearn it. All four open the same list.
 *
 * The editor is a contenteditable managed by hand: React owns the toolbar, the list and the value
 * contract, but re-rendering the editor's children on every keystroke would destroy the caret, so
 * its content is built imperatively and read back with serialise().
 */

/** A closed reference in the stored text. Spaces inside the braces are tolerated, as the backend does. */
const TOKEN = /\{\{\s*([\w.]+)\s*\}\}/g;

const TOKEN_CLASS = "portal-varfield__token";
const REMOVE_CLASS = "portal-varfield__token-remove";
const PREFIX = "portal.policies.variables";

interface VariableFieldProps {
  value: string;
  onChange: (value: string) => void;
  multiline?: boolean;
  rows?: number;
  placeholder?: string;
  "aria-label"?: string;
  /** Set by FormField when it clones the control; the label's htmlFor points at it. */
  id?: string;
  "aria-invalid"?: boolean;
  "aria-describedby"?: string;
  required?: boolean;
  /** The scopes this team can use (see variableGroupsFor); defaults to everything. */
  groups?: VariableGroup[];
}

/** Where the list sits, and what accepting a row should do. */
type Picker =
  | { kind: "trigger"; partial: string; x: number; y: number }
  | { kind: "add"; x: number; y: number }
  | { kind: "change"; path: string; x: number; y: number };

export function VariableField({
  value,
  onChange,
  multiline = false,
  rows = 3,
  placeholder,
  "aria-label": ariaLabel,
  id,
  "aria-invalid": ariaInvalid,
  "aria-describedby": ariaDescribedBy,
  required,
  groups = VARIABLE_GROUPS,
}: VariableFieldProps) {
  const { t, i18n } = useTranslation();
  const listId = useId();

  const wrapRef = useRef<HTMLDivElement | null>(null);
  const editorRef = useRef<HTMLDivElement | null>(null);

  const [picker, setPicker] = useState<Picker | null>(null);
  const [raw, setRaw] = useState(false);
  const [announcement, setAnnouncement] = useState("");

  /** The last value this field emitted, so a prop echo does not re-hydrate under the caret. */
  const emitted = useRef(value);
  /** The caret, remembered across clicks on the toolbar and the list. */
  const caret = useRef<Range | null>(null);
  /** The box the list was opened from, so accepting a row replaces that one. */
  const changing = useRef<HTMLElement | null>(null);
  /** Structural edits only; plain typing keeps the browser's own undo. */
  const undos = useRef<string[]>([]);
  const redos = useRef<string[]>([]);
  const [depth, setDepth] = useState({ undo: 0, redo: 0 });

  const nameFor = useCallback(
    (path: string) => {
      const def = defForPath(path, groups);
      return def ? variableLabel(def, t) : path;
    },
    [groups, t],
  );

  /** Read the editor back as the `{{path}}` text the pipeline stores. */
  const serialise = useCallback((): string => {
    const editor = editorRef.current;
    if (!editor) return "";
    let out = "";
    const walk = (node: Node) => {
      node.childNodes.forEach((child) => {
        if (child.nodeType === Node.TEXT_NODE) {
          out += child.nodeValue ?? "";
        } else if (child instanceof HTMLElement) {
          const path = child.dataset.path;
          if (path) out += `{{${path}}}`;
          else if (child.tagName === "BR") out += "\n";
          else walk(child);
        }
      });
    };
    walk(editor);
    return out;
  }, []);

  /** One box. Built by hand rather than rendered, so React never re-parents it mid-edit. */
  const makeToken = useCallback(
    (path: string): HTMLElement => {
      const def = defForPath(path, groups);
      const name = def ? variableLabel(def, t) : path;
      const step = /^steps\.(\d+)\./.exec(path);

      const box = document.createElement("span");
      box.className = TOKEN_CLASS + (def ? "" : ` ${TOKEN_CLASS}--unnamed`);
      box.contentEditable = "false";
      box.dataset.path = path;
      box.setAttribute("role", "button");
      box.tabIndex = 0;
      box.setAttribute(
        "aria-label",
        t(`${PREFIX}.tokenLabel`, { label: name }),
      );
      box.title = def
        ? `${name}\n{{${path}}}`
        : t(`${PREFIX}.unnamedTitle`, { path });

      // A box that depends on an earlier step carries that step's number: the dependency is the
      // one part of the path worth keeping visible.
      const badge = document.createElement("span");
      badge.className = "portal-varfield__token-source";
      badge.setAttribute("aria-hidden", "true");
      if (step) badge.textContent = step[1];
      box.appendChild(badge);

      const text = document.createElement("span");
      text.className = "portal-varfield__token-label";
      text.textContent = name;
      box.appendChild(text);

      const remove = document.createElement("span");
      remove.className = REMOVE_CLASS;
      remove.setAttribute("role", "button");
      remove.setAttribute(
        "aria-label",
        t(`${PREFIX}.removeToken`, { label: name }),
      );
      remove.textContent = "×";
      box.appendChild(remove);

      return box;
    },
    [groups, t],
  );

  /** `{{path}}` text in, boxes out. Also the paste path and the load path. */
  const toFragment = useCallback(
    (text: string): DocumentFragment => {
      const frag = document.createDocumentFragment();
      let last = 0;
      for (const match of text.matchAll(TOKEN)) {
        if (match.index > last) {
          frag.appendChild(
            document.createTextNode(text.slice(last, match.index)),
          );
        }
        frag.appendChild(makeToken(match[1]));
        last = match.index + match[0].length;
      }
      if (last < text.length) {
        frag.appendChild(document.createTextNode(text.slice(last)));
      }
      return frag;
    },
    [makeToken],
  );

  const hydrate = useCallback(
    (text: string) => {
      editorRef.current?.replaceChildren(toFragment(text));
    },
    [toFragment],
  );

  const emit = useCallback(
    (next: string) => {
      emitted.current = next;
      onChange(next);
    },
    [onChange],
  );

  const commit = useCallback(() => emit(serialise()), [emit, serialise]);

  // First paint: the editor starts empty, so draw whatever came in. Mount only - every later
  // redraw is driven by the value or the language, below.
  const mounted = useRef(false);
  useEffect(() => {
    if (mounted.current) return;
    mounted.current = true;
    hydrate(emitted.current);
  }, [hydrate]);

  // FormField labels its control with <label for>, which does nothing for a contenteditable:
  // a label only binds to a labelable element, so without this the field has no accessible name
  // inside a FormField and clicking its label does not focus it. Both are wired up by hand.
  useEffect(() => {
    const editor = editorRef.current;
    if (!editor || !id) return;
    const selector =
      typeof CSS !== "undefined" && CSS.escape
        ? `label[for="${CSS.escape(id)}"]`
        : `label[for="${id}"]`;
    const label = document.querySelector<HTMLLabelElement>(selector);
    if (!label) return;
    if (!ariaLabel) {
      if (!label.id) label.id = `${id}-label`;
      editor.setAttribute("aria-labelledby", label.id);
    }
    const focus = () => editor.focus();
    label.addEventListener("click", focus);
    return () => label.removeEventListener("click", focus);
  }, [id, ariaLabel, raw]);

  // The field is controlled, but the editor owns its own DOM. Only rebuild it when the value came
  // from somewhere other than this field - a reset, a template, a change upstream.
  useEffect(() => {
    if (value === emitted.current) return;
    emitted.current = value;
    if (!raw) hydrate(value);
  }, [value, raw, hydrate]);

  // Box labels are translated, so a language change has to redraw them. Keyed on the language
  // itself, never on t's identity: useTranslation hands back a fresh t on many renders, and
  // rebuilding the editor's children mid-edit throws away the caret and the box being changed.
  const drawnFor = useRef<string | undefined>(i18n?.language);
  useEffect(() => {
    if (raw || i18n?.language === drawnFor.current) return;
    drawnFor.current = i18n?.language;
    hydrate(emitted.current);
  }, [i18n?.language, raw, hydrate]);

  // The browser's own undo cannot see a box we removed in script, so structural edits snapshot the
  // serialised value instead. Typing is left alone: that undo already works.
  const snapshot = useCallback(() => {
    undos.current.push(serialise());
    if (undos.current.length > 50) undos.current.shift();
    redos.current = [];
    setDepth({ undo: undos.current.length, redo: 0 });
  }, [serialise]);

  const undo = useCallback(() => {
    const previous = undos.current.pop();
    if (previous === undefined) return;
    redos.current.push(serialise());
    hydrate(previous);
    commit();
    setDepth({ undo: undos.current.length, redo: redos.current.length });
    setAnnouncement(t(`${PREFIX}.undone`));
  }, [commit, hydrate, serialise, t]);

  const redo = useCallback(() => {
    const next = redos.current.pop();
    if (next === undefined) return;
    undos.current.push(serialise());
    hydrate(next);
    commit();
    setDepth({ undo: undos.current.length, redo: redos.current.length });
    setAnnouncement(t(`${PREFIX}.redone`));
  }, [commit, hydrate, serialise, t]);

  const remember = useCallback(() => {
    const editor = editorRef.current;
    const selection = window.getSelection();
    if (!editor || !selection?.rangeCount) return;
    if (editor.contains(selection.anchorNode)) {
      caret.current = selection.getRangeAt(0).cloneRange();
    }
  }, []);

  const restore = useCallback((): Range | null => {
    const editor = editorRef.current;
    const selection = window.getSelection();
    if (!editor || !selection) return null;
    const saved = caret.current;
    const range =
      saved && editor.contains(saved.startContainer)
        ? saved.cloneRange()
        : (() => {
            const end = document.createRange();
            end.selectNodeContents(editor);
            end.collapse(false);
            return end;
          })();
    selection.removeAllRanges();
    selection.addRange(range);
    return range;
  }, []);

  /** Where the list should open, in the wrapper's own coordinates. */
  const anchorAt = useCallback(
    (rect: DOMRect | null): { x: number; y: number } => {
      const wrap = wrapRef.current;
      if (!wrap || !rect)
        return { x: 0, y: editorRef.current?.offsetHeight ?? 0 };
      const box = wrap.getBoundingClientRect();
      return { x: rect.left - box.left, y: rect.bottom - box.top + 4 };
    },
    [],
  );

  /** Where the caret is on screen, or null when it cannot be measured. */
  const caretRect = useCallback((): DOMRect | null => {
    const selection = window.getSelection();
    if (!selection?.rangeCount) return null;
    const range = selection.getRangeAt(0).cloneRange();
    range.collapse(true);
    // Not every environment can measure a Range, and a collapsed one sitting between two elements
    // measures as nothing. Either way the list falls back to the field's own box: forcing a
    // measurement means inserting and removing a probe node mid-edit, which can move the caret
    // it was called to locate.
    if (typeof range.getBoundingClientRect !== "function") return null;
    const rect = range.getBoundingClientRect();
    return rect.width || rect.height ? rect : null;
  }, []);

  const selectToken = useCallback((box: HTMLElement | null) => {
    editorRef.current
      ?.querySelectorAll(`.${TOKEN_CLASS}.is-selected`)
      .forEach((node) => node.classList.remove("is-selected"));
    box?.classList.add("is-selected");
  }, []);

  const closePicker = useCallback(() => {
    setPicker(null);
    changing.current = null;
  }, []);

  const openAdd = useCallback(() => {
    setPicker((open) =>
      open?.kind === "add"
        ? null
        : {
            kind: "add",
            ...anchorAt(editorRef.current?.getBoundingClientRect() ?? null),
          },
    );
  }, [anchorAt]);

  const insertToken = useCallback(
    (def: VariableDef, fromTrigger: boolean) => {
      const editor = editorRef.current;
      const range = restore();
      if (!editor || !range) return;
      snapshot();

      // Swallow the typed "@sha" so the trigger never survives as text.
      if (fromTrigger) {
        const node = range.startContainer;
        if (node.nodeType === Node.TEXT_NODE) {
          const before = (node.nodeValue ?? "").slice(0, range.startOffset);
          const open = openReferenceAt(before, before.length);
          if (open) range.setStart(node, open.start);
        }
      }
      range.deleteContents();

      const box = makeToken(def.path);
      range.insertNode(box);

      // A trailing space keeps the caret out of the box, so typing simply continues.
      const space = document.createTextNode(" ");
      box.parentNode?.insertBefore(space, box.nextSibling);
      const after = document.createRange();
      after.setStart(space, 1);
      after.collapse(true);
      const selection = window.getSelection();
      selection?.removeAllRanges();
      selection?.addRange(after);
      caret.current = after.cloneRange();

      editor.focus();
      closePicker();
      commit();
      setAnnouncement(t(`${PREFIX}.added`, { label: variableLabel(def, t) }));
    },
    [closePicker, commit, makeToken, restore, snapshot, t],
  );

  const changeToken = useCallback(
    (def: VariableDef) => {
      const box = changing.current;
      if (!box) return;
      if (box.dataset.path === def.path) {
        closePicker();
        box.focus();
        return;
      }
      snapshot();
      const next = makeToken(def.path);
      box.replaceWith(next);
      selectToken(next);
      next.focus();
      closePicker();
      commit();
      setAnnouncement(t(`${PREFIX}.changed`, { label: variableLabel(def, t) }));
    },
    [closePicker, commit, makeToken, selectToken, snapshot, t],
  );

  const removeToken = useCallback(
    (box: HTMLElement) => {
      const name = nameFor(box.dataset.path ?? "");
      snapshot();
      const after = document.createRange();
      after.setStartAfter(box);
      after.collapse(true);
      box.remove();
      closePicker();
      const selection = window.getSelection();
      selection?.removeAllRanges();
      selection?.addRange(after);
      caret.current = after.cloneRange();
      editorRef.current?.focus();
      commit();
      setAnnouncement(t(`${PREFIX}.removed`, { label: name }));
    },
    [closePicker, commit, nameFor, snapshot, t],
  );

  const openChange = useCallback(
    (box: HTMLElement) => {
      selectToken(box);
      changing.current = box;
      setPicker({
        kind: "change",
        path: box.dataset.path ?? "",
        ...anchorAt(box.getBoundingClientRect()),
      });
    },
    [anchorAt, selectToken],
  );

  const onEditorInput = useCallback(() => {
    remember();
    commit();
    const selection = window.getSelection();
    const node = selection?.anchorNode;
    const closeTrigger = () =>
      setPicker((open) => (open?.kind === "trigger" ? null : open));
    if (!node || node.nodeType !== Node.TEXT_NODE) {
      closeTrigger();
      return;
    }
    const before = (node.nodeValue ?? "").slice(0, selection.anchorOffset);
    const open = openReferenceAt(before, before.length);
    // A trigger with nothing behind it stops being a menu: "@zzz" is just text.
    if (!open || variableSuggestions(open.partial, groups, t).length === 0) {
      closeTrigger();
      return;
    }
    setPicker({
      kind: "trigger",
      partial: open.partial,
      ...anchorAt(caretRect()),
    });
  }, [anchorAt, caretRect, commit, groups, remember, t]);

  const onEditorMouseDown = useCallback(
    (event: React.MouseEvent) => {
      const target = event.target as HTMLElement;
      const box = target.closest<HTMLElement>(`.${TOKEN_CLASS}`);
      if (!box) {
        selectToken(null);
        closePicker();
        return;
      }
      event.preventDefault();
      if (target.closest(`.${REMOVE_CLASS}`)) removeToken(box);
      else openChange(box);
    },
    [closePicker, openChange, removeToken, selectToken],
  );

  const listKeys = useRef<((key: string) => void) | null>(null);

  const onEditorKeyDown = useCallback(
    (event: React.KeyboardEvent) => {
      const box = (event.target as HTMLElement).closest?.<HTMLElement>(
        `.${TOKEN_CLASS}`,
      );

      // A focused box owns its keys, and must not let them reach the editor below: both listen for
      // Delete, and two snapshots of one edit would make the first undo a no-op.
      if (box) {
        if (event.key === "Enter" || event.key === " ") openChange(box);
        else if (event.key === "Delete" || event.key === "Backspace")
          removeToken(box);
        else if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
          const range = document.createRange();
          if (event.key === "ArrowRight") range.setStartAfter(box);
          else range.setStartBefore(box);
          range.collapse(true);
          const selection = window.getSelection();
          selection?.removeAllRanges();
          selection?.addRange(range);
          caret.current = range.cloneRange();
          selectToken(null);
          editorRef.current?.focus();
        } else if (event.key === "Escape") {
          selectToken(null);
          editorRef.current?.focus();
        } else return;
        event.preventDefault();
        event.stopPropagation();
        return;
      }

      if (picker?.kind === "trigger") {
        if (event.key === "Escape") {
          event.preventDefault();
          closePicker();
          return;
        }
        if (
          event.key === "ArrowDown" ||
          event.key === "ArrowUp" ||
          event.key === "Enter" ||
          event.key === "Tab"
        ) {
          event.preventDefault();
          listKeys.current?.(event.key);
          return;
        }
      }

      if (
        (event.key === "z" || event.key === "Z") &&
        (event.ctrlKey || event.metaKey)
      ) {
        event.preventDefault();
        if (event.shiftKey) redo();
        else undo();
        return;
      }

      // Enter in a single-line field would add a line the caller cannot store.
      if (!multiline && event.key === "Enter") {
        event.preventDefault();
        return;
      }

      // Only snapshot when the caret is actually about to swallow a box.
      if (
        (event.key === "Backspace" || event.key === "Delete") &&
        adjacentToken(editorRef.current, event.key === "Backspace")
      ) {
        snapshot();
      }
    },
    [
      closePicker,
      multiline,
      openChange,
      picker,
      redo,
      removeToken,
      selectToken,
      snapshot,
      undo,
    ],
  );

  const onEditorPaste = useCallback(
    (event: React.ClipboardEvent) => {
      event.preventDefault();
      const text = event.clipboardData.getData("text/plain");
      const range = restore();
      if (!range) return;
      snapshot();
      range.deleteContents();
      // Brace text pasted from an older pipeline, or from a colleague, arrives as boxes.
      const frag = toFragment(multiline ? text : text.replace(/\r?\n/g, " "));
      const lastNode = frag.lastChild;
      range.insertNode(frag);
      if (lastNode) {
        const after = document.createRange();
        after.setStartAfter(lastNode);
        after.collapse(true);
        const selection = window.getSelection();
        selection?.removeAllRanges();
        selection?.addRange(after);
        caret.current = after.cloneRange();
      }
      commit();
    },
    [commit, multiline, restore, snapshot, toFragment],
  );

  const onEditorBlur = useCallback(() => {
    remember();
    // Brace text typed by hand becomes a box on the way out, so a deep vendor path someone typed
    // themselves ends up looking like every other variable.
    if ((editorRef.current?.textContent ?? "").includes("{{")) {
      const current = serialise();
      TOKEN.lastIndex = 0;
      if (TOKEN.test(current)) hydrate(current);
    }
    window.setTimeout(
      () => setPicker((open) => (open?.kind === "trigger" ? null : open)),
      150,
    );
  }, [hydrate, remember, serialise]);

  const matches = picker
    ? variableSuggestions(
        picker.kind === "trigger" ? picker.partial : "",
        groups,
        t,
      )
    : [];

  const accept = useCallback(
    (def: VariableDef) => {
      if (picker?.kind === "change") changeToken(def);
      else insertToken(def, picker?.kind === "trigger");
    },
    [changeToken, insertToken, picker],
  );

  // Clicking anywhere else closes the list, the way every menu in the portal does.
  useEffect(() => {
    if (!picker) return;
    const away = (event: MouseEvent) => {
      if (!wrapRef.current?.contains(event.target as Node)) {
        closePicker();
        selectToken(null);
      }
    };
    document.addEventListener("mousedown", away);
    return () => document.removeEventListener("mousedown", away);
  }, [closePicker, picker, selectToken]);

  const toggleRaw = useCallback(() => {
    closePicker();
    selectToken(null);
    if (raw) {
      const text = emitted.current;
      setRaw(false);
      // The editor mounts on the next paint; hydrate once it is there.
      window.setTimeout(() => hydrate(text), 0);
    } else {
      emitted.current = serialise();
      setRaw(true);
    }
  }, [closePicker, hydrate, raw, selectToken, serialise]);

  return (
    <div
      ref={wrapRef}
      className={
        "portal-varfield" + (multiline ? "" : " portal-varfield--single")
      }
    >
      {raw ? (
        <textarea
          className="portal-varfield__raw"
          rows={rows}
          value={value}
          aria-label={t(`${PREFIX}.rawLabel`)}
          spellCheck={false}
          onChange={(e) => emit(e.target.value)}
        />
      ) : (
        <div
          ref={editorRef}
          id={id}
          className="portal-varfield__editor"
          contentEditable
          suppressContentEditableWarning
          role="textbox"
          aria-multiline={multiline}
          aria-label={ariaLabel}
          aria-invalid={ariaInvalid}
          aria-describedby={ariaDescribedBy}
          aria-required={required}
          aria-autocomplete="list"
          aria-controls={picker ? listId : undefined}
          data-placeholder={placeholder}
          style={multiline ? { minHeight: `${rows * 1.9}rem` } : undefined}
          spellCheck={false}
          onInput={onEditorInput}
          onMouseDown={onEditorMouseDown}
          onKeyDown={onEditorKeyDown}
          onKeyUp={remember}
          onMouseUp={remember}
          onPaste={onEditorPaste}
          onBlur={onEditorBlur}
        />
      )}

      {multiline ? (
        <div className="portal-varfield__tools">
          <Button
            variant="tertiary"
            size="sm"
            type="button"
            disabled={raw}
            leftSection={<AddRoundedIcon fontSize="inherit" aria-hidden />}
            onMouseDown={(e) => {
              e.preventDefault();
              remember();
            }}
            onClick={openAdd}
          >
            {t(`${PREFIX}.add`)}
          </Button>
          <Button
            variant="quiet"
            size="sm"
            type="button"
            disabled={raw || depth.undo === 0}
            aria-label={t(`${PREFIX}.undo`)}
            title={t(`${PREFIX}.undo`)}
            leftSection={<UndoRoundedIcon fontSize="inherit" aria-hidden />}
            onClick={undo}
          />
          <Button
            variant="quiet"
            size="sm"
            type="button"
            disabled={raw || depth.redo === 0}
            aria-label={t(`${PREFIX}.redo`)}
            title={t(`${PREFIX}.redo`)}
            leftSection={<RedoRoundedIcon fontSize="inherit" aria-hidden />}
            onClick={redo}
          />
          <span className="portal-varfield__tools-spacer" />
          {/* Neutral, not the accent: adding a variable is the action here, and a second blue
              control beside it would read as an equal choice. */}
          <Button
            variant="quiet"
            accent="neutral"
            size="sm"
            type="button"
            aria-pressed={raw}
            onClick={toggleRaw}
          >
            {t(raw ? `${PREFIX}.editAsBoxes` : `${PREFIX}.editAsText`)}
          </Button>
          <span className="portal-varfield__hint" aria-hidden>
            {t(`${PREFIX}.triggerHint`)}
          </span>
        </div>
      ) : (
        // One line has no room for a toolbar, so the button rides inside the field.
        <ActionIcon
          type="button"
          size="sm"
          variant="secondary"
          className="portal-varfield__inline-add"
          aria-label={t(`${PREFIX}.add`)}
          title={t(`${PREFIX}.add`)}
          onMouseDown={(e) => {
            e.preventDefault();
            remember();
          }}
          onClick={openAdd}
        >
          <AddRoundedIcon fontSize="inherit" aria-hidden />
        </ActionIcon>
      )}

      <div className="sr-only" role="status" aria-live="polite">
        {announcement}
      </div>

      {picker && (
        <VariablePicker
          id={listId}
          matches={matches}
          groups={groups}
          mode={picker.kind}
          current={picker.kind === "change" ? picker.path : undefined}
          x={picker.x}
          y={picker.y}
          registerKeys={(handler) => {
            listKeys.current = handler;
          }}
          onAccept={accept}
          onRemove={
            picker.kind === "change"
              ? () => {
                  const box = changing.current;
                  if (box) removeToken(box);
                }
              : undefined
          }
          onClose={() => {
            const box = changing.current;
            closePicker();
            if (box && editorRef.current?.contains(box)) box.focus();
            else editorRef.current?.focus();
          }}
        />
      )}
    </div>
  );
}

/** The box immediately before (or after) a collapsed caret, or null. */
function adjacentToken(
  editor: HTMLElement | null,
  back: boolean,
): HTMLElement | null {
  const selection = window.getSelection();
  if (!editor || !selection?.rangeCount) return null;
  const range = selection.getRangeAt(0);
  if (!range.collapsed) return null;
  const node = range.startContainer;
  let candidate: ChildNode | null;
  if (node.nodeType === Node.TEXT_NODE) {
    // Mid-text: an ordinary character is going, not a box.
    const offset = range.startOffset;
    if (back ? offset > 0 : offset < (node.nodeValue ?? "").length) return null;
    candidate = back ? node.previousSibling : node.nextSibling;
  } else {
    candidate =
      node.childNodes[back ? range.startOffset - 1 : range.startOffset];
  }
  return candidate instanceof HTMLElement &&
    candidate.classList.contains(TOKEN_CLASS)
    ? candidate
    : null;
}

/**
 * The list of variables, opened by a trigger, by the button, or by a box.
 *
 * The same list in all three cases, because three lists would drift. Opened from a box it says
 * "Change variable", ticks the one in play and starts the highlight there, so Enter re-picks what
 * is already set rather than silently choosing something else.
 */
function VariablePicker({
  id,
  matches,
  groups,
  mode,
  current,
  x,
  y,
  registerKeys,
  onAccept,
  onRemove,
  onClose,
}: {
  id: string;
  matches: VariableDef[];
  groups: VariableGroup[];
  mode: "trigger" | "add" | "change";
  current?: string;
  x: number;
  y: number;
  registerKeys: (handler: ((key: string) => void) | null) => void;
  onAccept: (def: VariableDef) => void;
  onRemove?: () => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const rootRef = useRef<HTMLDivElement | null>(null);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(() => {
    const at = matches.findIndex((def) => def.path === current);
    return at < 0 ? 0 : at;
  });

  const shown =
    mode === "trigger"
      ? matches
      : matches.filter((def) => {
          const q = query.trim().toLowerCase();
          if (!q) return true;
          return (
            def.path.toLowerCase().includes(q) ||
            variableLabel(def, t).toLowerCase().includes(q)
          );
        });

  // Grouped for reading, flat for arrowing: two dozen rows are unscannable without the headings
  // that say which of them come from an earlier step. The flat index is carried on each row so
  // the keyboard and the headings can never disagree about the order.
  const sections: {
    group: VariableGroup;
    rows: { def: VariableDef; index: number }[];
  }[] = [];
  groups.forEach((group) => {
    const rows = group.variables
      .filter((def) => shown.includes(def))
      .map((def) => ({ def, index: shown.indexOf(def) }));
    if (rows.length) sections.push({ group, rows });
  });

  useEffect(() => {
    setActive((a) => Math.min(a, Math.max(0, shown.length - 1)));
  }, [shown.length]);

  // Keep the list inside the field however near an edge its anchor sits.
  useEffect(() => {
    const root = rootRef.current;
    const parent = root?.offsetParent as HTMLElement | null;
    if (!root || !parent) return;
    const max = Math.max(0, parent.offsetWidth - root.offsetWidth);
    root.style.left = `${Math.max(0, Math.min(x, max))}px`;
  }, [x, shown.length]);

  const move = useCallback(
    (delta: number) =>
      setActive((a) =>
        shown.length ? (a + delta + shown.length) % shown.length : 0,
      ),
    [shown.length],
  );

  useEffect(() => {
    registerKeys((key) => {
      if (key === "ArrowDown") move(1);
      else if (key === "ArrowUp") move(-1);
      else if (key === "Enter" || key === "Tab") {
        const def = shown[active];
        if (def) onAccept(def);
      }
    });
    return () => registerKeys(null);
  }, [active, move, onAccept, registerKeys, shown]);

  useEffect(() => {
    document
      .getElementById(`${id}-opt-${active}`)
      ?.scrollIntoView?.({ block: "nearest" });
  }, [active, id]);

  return (
    <div
      ref={rootRef}
      className="portal-varfield__picker"
      style={{ top: `${y}px`, left: `${x}px` }}
    >
      {mode !== "trigger" && (
        <>
          <div className="portal-varfield__picker-head">
            {t(
              mode === "change"
                ? `${PREFIX}.changeTitle`
                : `${PREFIX}.addTitle`,
            )}
          </div>
          <input
            className="portal-varfield__picker-search"
            type="search"
            autoFocus
            value={query}
            placeholder={t(`${PREFIX}.search`)}
            aria-label={t(`${PREFIX}.search`)}
            aria-controls={id}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") {
                e.preventDefault();
                move(1);
              } else if (e.key === "ArrowUp") {
                e.preventDefault();
                move(-1);
              } else if (e.key === "Enter") {
                e.preventDefault();
                const def = shown[active];
                if (def) onAccept(def);
              } else if (e.key === "Escape") {
                e.preventDefault();
                onClose();
              }
            }}
          />
        </>
      )}

      <ul
        id={id}
        className="portal-varfield__picker-list"
        role="listbox"
        aria-label={t(`${PREFIX}.menuLabel`)}
      >
        {shown.length === 0 ? (
          <li className="portal-varfield__picker-empty">
            {t(`${PREFIX}.noMatches`)}
          </li>
        ) : (
          sections.map(({ group, rows }) => (
            <li key={group.id} className="portal-varfield__picker-section">
              {/* The heading is presentational: a listbox may only own options. */}
              <span className="portal-varfield__picker-group" aria-hidden>
                {t(group.labelKey)}
              </span>
              <ul className="portal-varfield__picker-rows" role="none">
                {rows.map(({ def, index }) => (
                  <li
                    key={def.path}
                    id={`${id}-opt-${index}`}
                    role="option"
                    aria-selected={index === active}
                    className={
                      "portal-varfield__picker-option" +
                      (index === active ? " is-active" : "")
                    }
                    // Fires before the editor's blur closes the list.
                    onMouseDown={(e) => {
                      e.preventDefault();
                      onAccept(def);
                    }}
                    onMouseEnter={() => setActive(index)}
                  >
                    <span className="portal-varfield__picker-tick" aria-hidden>
                      {def.path === current ? (
                        <CheckRoundedIcon fontSize="inherit" />
                      ) : null}
                    </span>
                    <span className="portal-varfield__picker-name">
                      {variableLabel(def, t)}
                    </span>
                    <span className="portal-varfield__picker-path">
                      {def.path}
                    </span>
                  </li>
                ))}
              </ul>
            </li>
          ))
        )}
      </ul>

      <div className="portal-varfield__picker-foot">
        <span>
          {t(
            mode === "change"
              ? `${PREFIX}.enterToChange`
              : `${PREFIX}.enterToAdd`,
          )}
        </span>
        {onRemove && (
          <Button
            type="button"
            variant="quiet"
            accent="danger"
            size="sm"
            className="portal-varfield__picker-remove"
            leftSection={<CloseRoundedIcon fontSize="inherit" aria-hidden />}
            // mousedown, not click: the editor's blur would close the list first.
            onMouseDown={(e) => {
              e.preventDefault();
              onRemove();
            }}
          >
            {t(`${PREFIX}.remove`)}
          </Button>
        )}
      </div>
    </div>
  );
}

/**
 * The variables system, explained where it is used.
 *
 * Collapsed to one quiet line until asked for; open, it says how the scopes work (document and run
 * facts fill in per document; an earlier step's answer carries forward) and lists every variable by
 * name with what it holds. The same catalogue feeds the picker, so this panel is the honest
 * documentation of exactly what will resolve.
 */
export function VariablesReference({
  groups = VARIABLE_GROUPS,
}: {
  /** The scopes this team can use (see variableGroupsFor); defaults to everything. */
  groups?: VariableGroup[];
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const bodyId = useId();

  return (
    <div className="portal-varref">
      <Button
        variant="quiet"
        size="sm"
        className="portal-varref__toggle"
        aria-expanded={open}
        aria-controls={open ? bodyId : undefined}
        onClick={() => setOpen((o) => !o)}
        leftSection={<DataObjectRoundedIcon fontSize="inherit" aria-hidden />}
        rightSection={
          <ExpandMoreRoundedIcon
            fontSize="inherit"
            aria-hidden
            className={"portal-varref__chevron" + (open ? " is-open" : "")}
          />
        }
      >
        {t(`${PREFIX}.title`)}
      </Button>

      {open && (
        <div id={bodyId} className="portal-varref__body">
          <p className="portal-varref__intro">{t(`${PREFIX}.intro`)}</p>
          {/* Step 1 has no earlier steps, so the cross-step explainer would only mislead. */}
          {groups.some((group) => group.id === "steps") && (
            <p className="portal-varref__intro">{t(`${PREFIX}.introSteps`)}</p>
          )}
          {groups.map((group) => (
            <section key={group.id} className="portal-varref__group">
              <h5 className="portal-varref__group-title">
                {t(group.labelKey)}
              </h5>
              <p className="portal-varref__group-desc">{t(group.descKey)}</p>
              <ul className="portal-varref__list">
                {group.variables.map((def) => (
                  <li key={def.path} className="portal-varref__row">
                    <span className="portal-varref__name">
                      {variableLabel(def, t)}
                    </span>
                    <code className="portal-varref__code">{def.path}</code>
                    <span className="portal-varref__row-desc">
                      {t(def.descKey)}
                    </span>
                  </li>
                ))}
              </ul>
              {group.example && (
                <div className="portal-varref__example">
                  <span className="portal-varref__example-tag">
                    {t(`${PREFIX}.exampleTag`)}
                  </span>
                  <code className="portal-varref__code">
                    {group.example.path}
                  </code>
                  <span className="portal-varref__row-desc">
                    {t(group.example.descKey)}
                  </span>
                </div>
              )}
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
