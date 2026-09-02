import { Fragment } from "react";
import "@app/ui/KeyCombo.css";

export interface KeyComboProps {
  // The shortcut as written by a human: "Ctrl + Z", "Ctrl+Shift+V",
  // "F3 / Ctrl + G", "Ctrl + Click + drag". Both spaced and unspaced "+"
  // parse the same, so no caller has to remember which style this expects.
  combo: string;
  /** Show a "+" between the keys of one combo. Off by default. */
  withPlus?: boolean;
  className?: string;
}

/** Alternative separator: " / " between whole combos, e.g. "F3 / Ctrl+G". */
const ALTERNATIVE = /\s*\/\s*/;
/** Key separator inside one combo: "+" with or without spaces around it. */
const KEY = /\s*\+\s*/;

// A lone "+" IS a key (Discord's "add reaction"), so a combo that is nothing
// but separators has to survive the split.
function splitKeys(combo: string): string[] {
  const trimmed = combo.trim();
  if (trimmed === "+" || trimmed === "") return [trimmed];
  return trimmed
    .split(KEY)
    .map((k) => k.trim())
    .filter((k) => k.length > 0);
}

/** True for keys that read as words rather than as a single glyph or name. */
function isWord(key: string): boolean {
  return /\s/.test(key) || key.length > 5;
}

/**
 * A keyboard shortcut drawn as one tile per key.
 *
 * Every key gets its own cap - "Ctrl" and "Z" are two things you press, so
 * they are two tiles, which is what every app that shows a shortcut list does.
 * Rendering the whole string in one cap ("Ctrl+Shift+V") reads as a single
 * mystery key and makes lists of shortcuts impossible to scan.
 */
export function KeyCombo({
  combo,
  withPlus = false,
  className,
}: KeyComboProps) {
  const alternatives = combo.split(ALTERNATIVE).filter((c) => c.trim() !== "");
  // "/" is also a key on its own ("Cmd + /"), so a string that splits to
  // nothing was a bare separator and is shown verbatim.
  const groups = alternatives.length > 0 ? alternatives : [combo];

  return (
    <span
      className={["sui-keycombo", className ?? ""].filter(Boolean).join(" ")}
      data-testid="sui-key-combo"
    >
      {groups.map((group, groupIndex) => (
        <Fragment key={`${group}-${groupIndex}`}>
          {groupIndex > 0 && (
            <span className="sui-keycombo__or" aria-hidden>
              /
            </span>
          )}
          {splitKeys(group).map((key, keyIndex) => (
            <Fragment key={`${key}-${keyIndex}`}>
              {withPlus && keyIndex > 0 && (
                <span className="sui-keycombo__plus" aria-hidden>
                  +
                </span>
              )}
              <kbd
                className={["sui-keycap", isWord(key) ? "sui-keycap--word" : ""]
                  .filter(Boolean)
                  .join(" ")}
              >
                {key}
              </kbd>
            </Fragment>
          ))}
        </Fragment>
      ))}
    </span>
  );
}
