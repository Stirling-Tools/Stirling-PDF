import { Command } from "./command.js";

export class SplitFileCommand extends Command {
  constructor(element, splitClass) {
    super();
    this.element = element;
    this.splitClass = splitClass;
  }

  execute() {
    this.element.classList.toggle(this.splitClass);
  }

  undo() {
    this.element.classList.toggle(this.splitClass);
  }

  redo() {
    this.execute();
  }
}

export class SplitAllCommand extends Command {
  constructor(elements, isSelectedInWindow, selectedPages, splitClass) {
    super();
    this.elements = elements;
    this.isSelectedInWindow = isSelectedInWindow;
    this.selectedPages = selectedPages;
    this.splitClass = splitClass;
  }

  execute() {
    if (!this.isSelectedInWindow) {
      const hasSplit = this._hasSplit(this.elements, this.splitClass);
      if (hasSplit) {
        this.elements.forEach((page) => {
          page.classList.remove(this.splitClass);
        });
      } else {
        this.elements.forEach((page) => {
          page.classList.add(this.splitClass);
        });
      }
      return;
    }

    this.elements.forEach((page, index) => {
      const pageIndex = index;
      if (this.isSelectedInWindow && !this.selectedPages.includes(pageIndex))
        return;

      if (page.classList.contains(this.splitClass)) {
        page.classList.remove(this.splitClass);
      } else {
        page.classList.add(this.splitClass);
      }
    });
  }

  _hasSplit() {
    if (!this.elements || this.elements.length == 0) return false;

    for (const node of this.elements) {
      if (node.classList.contains(this.splitClass)) return true;
    }

    return false;
  }

  undo() {
    if (!this.isSelectedInWindow) {
      const hasSplit = this._hasSplit(this.elements, this.splitClass);
      if (hasSplit) {
        this.elements.forEach((page) => {
          page.classList.remove(this.splitClass);
        });
      } else {
        this.elements.forEach((page) => {
          page.classList.add(this.splitClass);
        });
      }
      return;
    }

    this.elements.forEach((page, index) => {
      const pageIndex = index;
      if (this.isSelectedInWindow && !this.selectedPages.includes(pageIndex))
        return;

      if (page.classList.contains(this.splitClass)) {
        page.classList.remove(this.splitClass);
      } else {
        page.classList.add(this.splitClass);
      }
    });
  }

  redo() {
    this.execute();
  }
}
