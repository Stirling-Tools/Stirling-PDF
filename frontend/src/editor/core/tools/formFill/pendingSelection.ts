/**
 * A field the user has drawn but not yet applied has no PDF name, so it borrows the selection
 * channel committed fields use. The prefix is readable on purpose - it reaches test ids and logs -
 * and a real field would have to be named this exactly to collide.
 */
const PENDING_PREFIX = "__pending__:";

export function pendingSelectionName(id: string): string {
  return PENDING_PREFIX + id;
}

export function pendingIdFrom(name: string | null | undefined): string | null {
  if (!name || !name.startsWith(PENDING_PREFIX)) return null;
  return name.slice(PENDING_PREFIX.length);
}

/** True for a selection that has no PDF field behind it yet. */
export function isPendingSelection(name: string | null | undefined): boolean {
  return pendingIdFrom(name) != null;
}
