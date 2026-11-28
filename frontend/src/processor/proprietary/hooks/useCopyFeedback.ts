import { useEffect, useRef, useState } from "react";
import { copyText } from "@editor/utils/copyText";

/** How long a button reads "Copied" after a successful copy. */
const COPIED_MS = 2000;

/**
 * Copies text and reports `copied` for a moment afterwards, for a button to acknowledge it. `copy`
 * resolves false when the browser refused, so the caller can offer another way.
 */
export function useCopyFeedback() {
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);
  const copy = async (text: string): Promise<boolean> => {
    const ok = await copyText(text);
    if (ok) {
      setCopied(true);
      clearTimeout(timer.current);
      timer.current = setTimeout(() => setCopied(false), COPIED_MS);
    }
    return ok;
  };
  return { copied, copy };
}
