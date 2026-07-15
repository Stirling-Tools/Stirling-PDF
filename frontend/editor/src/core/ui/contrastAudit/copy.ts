// Clipboard helper: prefer the async Clipboard API, fall back to a hidden
// textarea + execCommand where it's unavailable or blocked.

function fallbackCopy(text: string, onDone: () => void): void {
  const ta = document.createElement("textarea");
  ta.value = text;
  ta.style.position = "fixed";
  ta.style.opacity = "0";
  document.body.appendChild(ta);
  ta.select();
  try {
    document.execCommand("copy");
    onDone();
  } finally {
    ta.remove();
  }
}

export function copyToClipboard(text: string, onDone: () => void): void {
  if (navigator.clipboard?.writeText) {
    navigator.clipboard.writeText(text).then(onDone, () => fallbackCopy(text, onDone));
  } else {
    fallbackCopy(text, onDone);
  }
}
