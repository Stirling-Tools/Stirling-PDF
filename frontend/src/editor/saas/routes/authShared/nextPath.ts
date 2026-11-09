/** The path an auth page's `?next=` returns to, without its query or hash. */
export function nextPathOf(
  next: string | null | undefined,
): string | undefined {
  return next?.split(/[?#]/)[0];
}
