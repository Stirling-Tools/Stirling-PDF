// Browser page translators (Edge, Chrome / Google Translate, accessibility
// overlays, extensions) rewrite text nodes by wrapping them in injected <font>
// elements. That changes the parent of text nodes React is holding references
// to, so when React's commit phase later tries to remove or reinsert those
// nodes it throws:
//
//   NotFoundError: Failed to execute 'removeChild' on 'Node':
//     The node to be removed is not a child of this node.
//   NotFoundError: Failed to execute 'insertBefore' on 'Node':
//     The node before which the new node is to be inserted is not a child of this node.
//
// The ErrorBoundary above the app catches the exception and unmounts the whole
// tree, so the user sees "Something went wrong" instead of the app.
// See: https://github.com/facebook/react/issues/11538.
//
// Strategy: DON'T patch Node.prototype eagerly (doing so globally changes DOM
// semantics for every library on the page and could silently hide real bugs).
// Instead, watch for translator fingerprints via a MutationObserver and only
// install the prototype guards once we actually see one. For the overwhelming
// majority of users (no translator active) this module is a no-op beyond a
// passive observer.
//
// Fingerprints we watch for:
//   - <html class="translated-ltr"> / "translated-rtl" — set by Google Translate
//   - <font> element inserted anywhere in the document — both Edge and Chrome
//     translators (and most accessibility overlays) use <font> wrappers; React
//     never emits <font>, so any such node is an external mutation.

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
