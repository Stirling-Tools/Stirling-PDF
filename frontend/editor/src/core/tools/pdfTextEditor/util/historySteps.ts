import type { TFunction } from "i18next";
import type { IconName } from "@app/ui/Icon";
import type { Command } from "@app/tools/pdfTextEditor/commands/Command";

export interface HistoryStep {
  label: string;
  icon: IconName;
  /** 1-based page the change landed on, when the command records one. */
  page: number | null;
  /** The text a typing step left behind, for telling steps apart. */
  snippet: string | null;
  /** How many items a multi-page sweep changed; null for a local edit. */
  items: number | null;
}

const SNIPPET_CHARS = 40;

/**
 * Commands keep their target page and typed text as plain fields; reading them
 * by shape keeps the history list out of every command's public surface.
 */
function field<T>(
  cmd: Command,
  name: string,
  kind: "number" | "string",
): T | null {
  const value = (cmd as unknown as Record<string, unknown>)[name];
  return typeof value === kind ? (value as T) : null;
}

/** A composite step reads as its most recent part. */
function representative(cmd: Command): Command {
  const last = (cmd as unknown as { last?: Command }).last;
  return cmd.type === "composite" && last ? representative(last) : cmd;
}

/** The parts of a composite step, or just the step itself. */
function parts(cmd: Command): Command[] {
  const children = (cmd as unknown as { commands?: unknown }).commands;
  return cmd.type === "composite" && Array.isArray(children)
    ? (children as Command[]).flatMap(parts)
    : [cmd];
}

export function describeStep(cmd: Command, t: TFunction): HistoryStep {
  const base = representative(cmd);
  const all = parts(cmd);
  const pages = new Set(
    all.map((c) => field<number>(c, "pageIndex", "number")),
  );
  // A sweep across several pages has no one page to name; say how much it
  // touched instead.
  const spread = all.length > 1 && pages.size > 1;
  const pageIndex = spread ? null : field<number>(base, "pageIndex", "number");
  const typed = field<string>(base, "nextText", "string");
  const snippet =
    typed === null
      ? null
      : typed.length > SNIPPET_CHARS
        ? `${typed.slice(0, SNIPPET_CHARS).trimEnd()}…`
        : typed;
  const step = (label: string, icon: IconName): HistoryStep => ({
    label,
    icon,
    page: pageIndex === null ? null : pageIndex + 1,
    snippet: snippet && snippet.trim() ? snippet : null,
    items: spread ? all.length : null,
  });
  switch (base.type) {
    case "edit-text":
      return step(
        t("pdfTextEditor.history.step.editText", "Edited text"),
        "pencil",
      );
    case "insert-text":
      return step(
        t("pdfTextEditor.history.step.insertText", "Added text"),
        "plus",
      );
    case "duplicate-run":
      return step(
        t("pdfTextEditor.history.step.duplicate", "Duplicated text"),
        "copy",
      );
    case "delete-object":
    case "delete-image":
      return step(t("pdfTextEditor.history.step.delete", "Deleted"), "trash");
    case "move-text-run":
    case "set-image-transform":
      return step(t("pdfTextEditor.history.step.move", "Moved"), "move");
    case "reflow-wrap":
      return step(
        t("pdfTextEditor.history.step.rewrap", "Rewrapped text"),
        "pencil",
      );
    case "set-colour":
      return step(
        t("pdfTextEditor.history.step.colour", "Changed colour"),
        "palette",
      );
    case "set-text-outline":
      return step(
        t("pdfTextEditor.history.step.outline", "Changed outline"),
        "palette",
      );
    case "set-font-family":
      return step(t("pdfTextEditor.history.step.font", "Changed font"), "type");
    case "set-font-size":
      return step(t("pdfTextEditor.history.step.size", "Changed size"), "type");
    case "set-lock":
      return step(
        t("pdfTextEditor.history.step.lock", "Locked or unlocked"),
        "lock",
      );
    case "change-z-order":
      return step(
        t("pdfTextEditor.history.step.order", "Changed order"),
        "layers",
      );
    case "align-paragraph-lines":
      return step(
        t("pdfTextEditor.history.step.align", "Aligned lines"),
        "layers",
      );
    case "merge-runs":
      return step(
        t("pdfTextEditor.history.step.merge", "Merged lines"),
        "merge",
      );
    case "ungroup-paragraph":
      return step(
        t("pdfTextEditor.history.step.split", "Split lines"),
        "split",
      );
    case "insert-image":
      return step(
        t("pdfTextEditor.history.step.insertImage", "Added image"),
        "image",
      );
    case "replace-image":
      return step(
        t("pdfTextEditor.history.step.replaceImage", "Replaced image"),
        "image",
      );
    case "transform-image":
      return step(
        t(
          "pdfTextEditor.history.step.transformImage",
          "Rotated or flipped image",
        ),
        "rotate-cw",
      );
    default:
      return step(t("pdfTextEditor.history.step.other", "Changed"), "pencil");
  }
}

/** When each step was first shown: commands carry no timestamp of their own. */
const firstSeen = new WeakMap<Command, number>();

export function stepTime(cmd: Command): number {
  let at = firstSeen.get(cmd);
  if (at === undefined) {
    at = Date.now();
    firstSeen.set(cmd, at);
  }
  return at;
}

/** "just now", "3 min ago", "1 hr ago" in the UI language. */
export function relativeTime(at: number, now: number, locale: string): string {
  const seconds = Math.round((now - at) / 1000);
  const rtf = new Intl.RelativeTimeFormat(locale, {
    numeric: "auto",
    style: "short",
  });
  if (seconds < 45) return rtf.format(0, "second");
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return rtf.format(-minutes, "minute");
  return rtf.format(-Math.round(minutes / 60), "hour");
}
