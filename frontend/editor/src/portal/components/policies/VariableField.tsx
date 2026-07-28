import { useEffect, useId, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import DataObjectRoundedIcon from "@mui/icons-material/DataObjectRounded";
import ExpandMoreRoundedIcon from "@mui/icons-material/ExpandMoreRounded";
import { Button } from "@app/ui";
import {
  VARIABLE_GROUPS,
  insertVariable,
  openReferenceAt,
  variableSuggestions,
  type VariableDef,
  type VariableGroup,
} from "@portal/components/policies/variables";
import "@portal/components/policies/VariableField.css";

/**
 * A text field that knows about `{{variables}}`.
 *
 * The value is plain text - what the pipeline stores and the backend resolves - but complete
 * references render as pills, the way an automation tool draws them, so a message reading
 * "{{run.policyName}} did {{document.filename}}" looks like two tokens in a sentence rather than
 * brace soup. The trick is two synchronised layers: a transparent-text textarea owns editing,
 * selection and the caret, and a painted layer underneath draws the same characters with the
 * references boxed. Text metrics match exactly, so the caret always lands where the eye expects.
 *
 * Typing `{{` opens a filtered suggestion list of everything the run can substitute - document
 * facts, run facts, earlier steps' answers - and accepting completes the reference at the cursor,
 * braces and all. The operator never has to remember a path or leave the form to look one up.
 */
interface VariableFieldProps {
  value: string;
  onChange: (value: string) => void;
  multiline?: boolean;
  rows?: number;
  placeholder?: string;
  "aria-label"?: string;
  /** The scopes this team can use (see variableGroupsFor); defaults to everything. */
  groups?: VariableGroup[];
}

/** A closed reference, or the plain text between them. */
function segments(text: string): { text: string; token: boolean }[] {
  const out: { text: string; token: boolean }[] = [];
  // Spaces inside the braces are tolerated, matching the backend's resolver.
  const pattern = /\{\{\s*[\w.]+\s*\}\}/g;
  let last = 0;
  for (const match of text.matchAll(pattern)) {
    if (match.index > last) {
      out.push({ text: text.slice(last, match.index), token: false });
    }
    out.push({ text: match[0], token: true });
    last = match.index + match[0].length;
  }
  if (last < text.length) out.push({ text: text.slice(last), token: false });
  return out;
}

export function VariableField({
  value,
  onChange,
  multiline = false,
  rows = 3,
  placeholder,
  "aria-label": ariaLabel,
  groups = VARIABLE_GROUPS,
}: VariableFieldProps) {
  const { t } = useTranslation();
  const menuId = useId();
  const editorRef = useRef<HTMLTextAreaElement | null>(null);
  const renderRef = useRef<HTMLDivElement | null>(null);
  const [open, setOpen] = useState<{ start: number } | null>(null);
  const [matches, setMatches] = useState<VariableDef[]>([]);
  const [highlight, setHighlight] = useState(0);
  // The insertion moves the cursor; React re-renders first, so restore it after.
  const pendingCursor = useRef<number | null>(null);

  useEffect(() => {
    if (pendingCursor.current === null) return;
    const editor = editorRef.current;
    if (editor) {
      editor.focus();
      editor.setSelectionRange(pendingCursor.current, pendingCursor.current);
    }
    pendingCursor.current = null;
  });

  // Keep the active row visible: the menu scrolls rather than truncating the matches.
  useEffect(() => {
    if (!open) return;
    const row = document.getElementById(`${menuId}-opt-${highlight}`);
    row?.scrollIntoView?.({ block: "nearest" });
  }, [open, highlight, menuId]);

  function syncScroll() {
    const editor = editorRef.current;
    const render = renderRef.current;
    if (editor && render) {
      render.scrollTop = editor.scrollTop;
      render.scrollLeft = editor.scrollLeft;
    }
  }

  function refresh(text: string, cursor: number) {
    const ref = openReferenceAt(text, cursor);
    const found = ref ? variableSuggestions(ref.partial, groups) : [];
    if (!ref || found.length === 0) {
      setOpen(null);
      return;
    }
    setOpen({ start: ref.start });
    setMatches(found);
    setHighlight(0);
  }

  function accept(def: VariableDef) {
    if (!open) return;
    const cursor = editorRef.current?.selectionStart ?? value.length;
    const next = insertVariable(value, cursor, open.start, def.path);
    onChange(next.text);
    pendingCursor.current = next.cursor;
    setOpen(null);
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (open && matches.length > 0) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setHighlight((h) => (h + 1) % matches.length);
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setHighlight((h) => (h - 1 + matches.length) % matches.length);
        return;
      }
      if (e.key === "Enter" || e.key === "Tab") {
        e.preventDefault();
        accept(matches[Math.min(highlight, matches.length - 1)]);
        return;
      }
      if (e.key === "Escape") {
        setOpen(null);
        return;
      }
    }
    // Single-line mode uses a textarea for the layered rendering; Enter must not add lines.
    if (!multiline && e.key === "Enter") e.preventDefault();
  }

  const activeId = open ? `${menuId}-opt-${highlight}` : undefined;

  return (
    <div
      className={
        "portal-varfield" + (multiline ? "" : " portal-varfield--single")
      }
    >
      <div className="portal-varfield__box">
        {/* The painted layer: same characters, references boxed. aria-hidden - the textarea is
            the real control and already holds this text. */}
        <div ref={renderRef} className="portal-varfield__render" aria-hidden>
          {segments(value).map((seg, i) =>
            seg.token ? (
              <mark key={i} className="portal-varfield__token">
                {seg.text}
              </mark>
            ) : (
              <span key={i}>{seg.text}</span>
            ),
          )}
          {/* Keeps a trailing blank line the same height as a typed one. */}
          {"​"}
        </div>
        <textarea
          ref={editorRef}
          className="portal-varfield__editor"
          rows={multiline ? rows : 1}
          wrap={multiline ? "soft" : "off"}
          value={value}
          placeholder={placeholder}
          aria-label={ariaLabel}
          // The combobox role is what makes aria-expanded/-controls/-activedescendant apply;
          // a bare textbox does not support them.
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={open !== null}
          aria-controls={open ? menuId : undefined}
          aria-activedescendant={activeId}
          spellCheck={false}
          onChange={(e) => {
            onChange(e.target.value);
            refresh(e.target.value, e.target.selectionStart ?? 0);
          }}
          // Caret movement too: an open menu whose recorded `{{` start no longer matches the
          // cursor would insert the completion at the stale position, corrupting the text.
          onSelect={(e) => {
            const el = e.currentTarget;
            refresh(el.value, el.selectionStart ?? 0);
          }}
          onKeyDown={handleKeyDown}
          onScroll={syncScroll}
          // Blur may be a click landing on the list; let that click run first.
          onBlur={() => setTimeout(() => setOpen(null), 150)}
        />
      </div>

      {open && matches.length > 0 && (
        <ul
          id={menuId}
          className="portal-varfield__menu"
          role="listbox"
          aria-label={t("portal.policies.variables.menuLabel")}
        >
          {/* Options are plain listbox rows, not buttons: focus stays in the editor and the
              active row is conveyed via aria-activedescendant, per the combobox pattern.
              Every match renders (the menu scrolls); arrow-cycling and the rows must never
              disagree about the list. */}
          {matches.map((def, index) => (
            <li
              key={def.path}
              id={`${menuId}-opt-${index}`}
              role="option"
              aria-selected={index === highlight}
              className={
                "portal-varfield__option" +
                (index === highlight ? " is-active" : "")
              }
              // Fires before the editor's blur closes the menu.
              onMouseDown={(e) => {
                e.preventDefault();
                accept(def);
              }}
              onMouseEnter={() => setHighlight(index)}
            >
              <span className="portal-varfield__option-token">{def.path}</span>
              <span className="portal-varfield__option-desc">
                {t(def.descKey)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/**
 * The variables system, explained where it is used.
 *
 * Collapsed to one quiet line until asked for; open, it says how the scopes work (document and
 * run facts fill in per document; steps.N carries an earlier step's answer forward) and lists
 * every variable with what it holds. The same catalogue feeds the autocomplete, so this panel is
 * the honest documentation of exactly what will resolve.
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
  const PREFIX = "portal.policies.variables";

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
                    {"{{"}
                    {group.example.path}
                    {"}}"}
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
