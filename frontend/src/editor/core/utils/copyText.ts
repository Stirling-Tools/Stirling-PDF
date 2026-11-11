/**
 * Writes text to the clipboard and reports whether it landed.
 *
 * `navigator.clipboard` only exists in secure contexts, so self-hosted servers
 * reached over plain HTTP fall back to `execCommand("copy")`. That fallback only
 * works inside the user gesture: over HTTP it runs before any await, but after a
 * rejected async write the gesture may have expired and it can fail.
 */
export async function copyText(text: string): Promise<boolean> {
  if (!text) return false;
  if (window.isSecureContext && navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      return copyWithExecCommand(text);
    }
  }
  return copyWithExecCommand(text);
}

function copyWithExecCommand(text: string): boolean {
  const previousFocus = document.activeElement as HTMLElement | null;
  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.setAttribute("readonly", "");
  textarea.style.position = "fixed";
  textarea.style.opacity = "0";
  textarea.style.pointerEvents = "none";
  document.body.appendChild(textarea);
  textarea.select();
  try {
    return document.execCommand("copy");
  } catch {
    return false;
  } finally {
    textarea.remove();
    previousFocus?.focus?.({ preventScroll: true });
  }
}
