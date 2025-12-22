import { Command } from "./command.js";

/**
 * Toggles a split class on a single page element.
 */
export class SplitFileCommand extends Command {
  /**
   * @param {HTMLElement} element - Target page container.
   * @param {string} splitClass - CSS class to toggle for split markers.
   */
  constructor(element, splitClass) {
    super();
    this.element = element;
    this.splitClass = splitClass;
  }

  /** Execute: toggle split class. */
  execute() {
    this.element.classList.toggle(this.splitClass);
  }

  /** Undo: toggle split class back. */
  undo() {
    this.element.classList.toggle(this.splitClass);
  }

  /** Redo: same as execute. */
  redo() {
    this.execute();
  }
}

/**
 * Toggles split class across a set of elements, optionally limited by selection.
 */
export class SplitAllCommand extends Command {
  /**
   * @param {NodeListOf<HTMLElement>|HTMLElement[]} elements - All page containers.
   * @param {boolean} isSelectedInWindow - Whether multi-select mode is active.
   * @param {number[]} selectedPages - 0-based indices of selected pages (when active).
   * @param {string} splitClass - CSS class used as split marker.
   */
  constructor(elements, isSelectedInWindow, selectedPages, splitClass) {
    super();
    this.elements = elements;
    this.isSelectedInWindow = isSelectedInWindow;
    this.selectedPages = selectedPages;
    this.splitClass = splitClass;
  }

  /** Execute: toggle split for all or selected pages. */
  execute() {
    if (!this.isSelectedInWindow) {
      const hasSplit = this._hasSplit();
      (this.elements || []).forEach((page) => {
        if (hasSplit) {
          page.classList.remove(this.splitClass);
        } else {
          page.classList.add(this.splitClass);
        }
      });
      return;
    }

    this.elements.forEach((page, index) => {
      if (!this.selectedPages.includes(index)) return;
      page.classList.toggle(this.splitClass);
    });
  }

  /** @returns {boolean} true if any element currently has the split class. */
  _hasSplit() {
    if (!this.elements || this.elements.length === 0) return false;
    for (const node of this.elements) {
      if (node.classList.contains(this.splitClass)) return true;
    }
    return false;
  }

  /** Undo mirrors execute logic. */
  undo() {
    this.execute();
  }

  /** Redo mirrors execute logic. */
  redo() {
    this.execute();
  }
}
