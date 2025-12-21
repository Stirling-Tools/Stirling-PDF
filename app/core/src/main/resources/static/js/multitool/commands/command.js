export class Command {
  execute() {}
  undo() {}
  redo() {}
}

/**
 * Base class that provides anchor capture and reinsertion helpers
 * to avoid storing custom state on DOM nodes.
 */
export class CommandWithAnchors extends Command {
  constructor() {
    super();
    /** @type {{ el: HTMLElement, nextSibling: ChildNode|null, index: number }[]} */
    this._anchors = [];
  }

  /**
   * Returns the child index of an element in a container.
   * @param {HTMLElement} container
   * @param {HTMLElement} el
   * @returns {number}
   */
  _indexOf(container, el) {
    return Array.prototype.indexOf.call(container.children, el);
  }

  /**
   * Captures an anchor for later reinsertion.
   * @param {HTMLElement} el
   * @param {HTMLElement} container
   * @returns {{ el: HTMLElement, nextSibling: ChildNode|null, index: number }}
   */
  captureAnchor(el, container) {
    return {
      el,
      nextSibling: el.nextSibling,
      index: this._indexOf(container, el),
    };
  }

  /**
   * Reinserts an element using a previously captured anchor.
   * Prefers stored nextSibling when still valid; otherwise falls back to index.
   * @param {HTMLElement} container
   * @param {{ el: HTMLElement, nextSibling: ChildNode|null, index: number }} anchor
   */
  insertWithAnchor(container, anchor) {
    const { el, nextSibling, index } = anchor;
    const nextValid = nextSibling && nextSibling.parentNode === container;

    let ref = null;
    if (nextValid) {
      ref = nextSibling;
    } else if (
      Number.isInteger(index) &&
      index >= 0 &&
      index < container.children.length
    ) {
      ref = container.children[index] || null;
    }

    container.insertBefore(el, ref || null);
  }
}
