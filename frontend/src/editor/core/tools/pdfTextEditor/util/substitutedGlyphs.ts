import { clearOnDocumentClose } from "@editor/tools/pdfTextEditor/pdfium/pointerCaches";

const emitted = new Set<number>();
const substitutes = new Set<number>();
clearOnDocumentClose(() => {
  emitted.clear();
  substitutes.clear();
});

export function noteEmitted(ptrs: Iterable<number>): void {
  for (const ptr of ptrs) if (ptr) emitted.add(ptr);
}

export function noteSubstitute(ptr: number): void {
  if (ptr) substitutes.add(ptr);
}

export function isSubstitute(ptr: number): boolean {
  return substitutes.has(ptr);
}

export function forgetEmitted(ptr: number): void {
  emitted.delete(ptr);
  substitutes.delete(ptr);
}

export function drawsSubstitutes(ptrs: Iterable<number>): boolean | undefined {
  let edited = false;
  for (const ptr of ptrs) {
    if (substitutes.has(ptr)) return true;
    if (emitted.has(ptr)) edited = true;
  }
  return edited ? false : undefined;
}
