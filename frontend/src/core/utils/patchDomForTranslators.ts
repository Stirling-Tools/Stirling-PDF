// Browser page translators (Edge, Chrome, extensions) wrap text nodes in
// injected <font> elements, reparenting nodes React is holding. React's commit
// phase then throws NotFoundError on removeChild/insertBefore and the
// ErrorBoundary unmounts the app. https://github.com/facebook/react/issues/11538
//
// We watch for translator fingerprints (Google Translate's translated-* class
// on <html>, or any injected <font>) and install guards on Node.prototype only
// once one appears, so native DOM semantics are preserved when no translator
// is active.

declare global {
  interface Node {
    __stirlingTranslatorPatched?: boolean;
  }
}

let patchApplied = false;

function isGoogleTranslateActive(): boolean {
  const cls = document.documentElement.classList;
  return cls.contains("translated-ltr") || cls.contains("translated-rtl");
}

function applyDomPatch(trigger: string): void {
  if (patchApplied) return;
  if (typeof Node === "undefined" || !Node.prototype) return;
  if (Node.prototype.__stirlingTranslatorPatched) return;
  patchApplied = true;
  Node.prototype.__stirlingTranslatorPatched = true;

  console.warn(
    `[dom-patch] Browser page translator detected (${trigger}). ` +
      "Installing removeChild/insertBefore guards to prevent React crashes. " +
      "The UI may show minor glitches while the translator is active.",
  );

  const originalRemoveChild = Node.prototype.removeChild;
  Node.prototype.removeChild = function patchedRemoveChild<T extends Node>(
    this: Node,
    child: T,
  ): T {
    if (child.parentNode !== this) return child;
    return originalRemoveChild.call(this, child) as T;
  } as typeof Node.prototype.removeChild;

  const originalInsertBefore = Node.prototype.insertBefore;
  Node.prototype.insertBefore = function patchedInsertBefore<T extends Node>(
    this: Node,
    newNode: T,
    referenceNode: Node | null,
  ): T {
    if (referenceNode && referenceNode.parentNode !== this) return newNode;
    return originalInsertBefore.call(this, newNode, referenceNode) as T;
  } as typeof Node.prototype.insertBefore;
}

export function armTranslatorDetector(): void {
  if (typeof window === "undefined" || typeof MutationObserver === "undefined") return;
  if (typeof document === "undefined" || !document.documentElement) return;

  // Edge case: class already set (e.g., bfcache restore).
  if (isGoogleTranslateActive()) {
    applyDomPatch("html class was already translated-* on arm");
    return;
  }

  const observer = new MutationObserver((mutations) => {
    for (const m of mutations) {
      if (m.type === "attributes" && m.target === document.documentElement && isGoogleTranslateActive()) {
        applyDomPatch("<html> translated-* class appeared");
        observer.disconnect();
        return;
      }
      if (m.type === "childList") {
        for (const n of m.addedNodes) {
          if (n.nodeName === "FONT") {
            applyDomPatch("<font> element injected into DOM");
            observer.disconnect();
            return;
          }
        }
      }
    }
  });

  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["class"],
    childList: true,
    subtree: true,
  });
}

armTranslatorDetector();
