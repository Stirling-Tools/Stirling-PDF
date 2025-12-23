import { Command } from "./command.js";

/**
 * Toggles selection state of a single page via its checkbox.
 */
export class SelectPageCommand extends Command {
  /**
   * @param {number} pageNumber - 1-based page number.
   * @param {HTMLInputElement} checkbox - Checkbox linked to the page.
   */
  constructor(pageNumber, checkbox) {
    super();
    this.pageNumber = pageNumber;
    this.selectCheckbox = checkbox;
  }

  /** Execute: apply current checkbox state to global selection. */
  execute() {
    if (this.selectCheckbox.checked) {
      window.selectedPages.push(this.pageNumber);
    } else {
      const index = window.selectedPages.indexOf(this.pageNumber);
      if (index !== -1) window.selectedPages.splice(index, 1);
    }

    if (window.selectedPages.length > 0 && !window.selectPage) {
      window.toggleSelectPageVisibility();
    }
    if (window.selectedPages.length === 0 && window.selectPage) {
      window.toggleSelectPageVisibility();
    }

    window.updateSelectedPagesDisplay();
  }

  /** Undo: invert checkbox and apply same logic as execute. */
  undo() {
    this.selectCheckbox.checked = !this.selectCheckbox.checked;
    this.execute();
  }

  /** Redo: invert again then execute. */
  redo() {
    this.selectCheckbox.checked = !this.selectCheckbox.checked;
    this.execute();
  }
}
