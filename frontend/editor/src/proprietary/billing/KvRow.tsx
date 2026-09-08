import type { ReactNode } from "react";

/**
 * A cycle fact, as a key-value row.
 *
 * <p>What the usage section is made of. The dot-sentence that used to carry these facts is gone:
 * a row per fact is readable at a glance and cannot smuggle a second claim in beside the first.
 *
 * <p>{@link note} is separated from the value by real whitespace rather than by margin alone, so
 * text extraction and screen readers do not run the two together as "100 users$99.00".
 */
export function KvRow({
  label,
  value,
  note,
  door,
}: {
  label: string;
  value: ReactNode;
  /** A muted qualifier before the value: "392,906 · 1c each", "flat · no meter running". */
  note?: string;
  /** A door at the row's right, e.g. "Update". Rendered after the value. */
  door?: ReactNode;
}) {
  return (
    <div className="billing-kv">
      <span className="billing-kv__label">{label}</span>
      <span className="billing-kv__value">
        {note ? <span className="billing-kv__note">{note} </span> : null}
        {value}
        {door ? <span className="billing-kv__door">{door}</span> : null}
      </span>
    </div>
  );
}
