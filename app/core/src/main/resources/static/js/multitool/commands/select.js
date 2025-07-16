import { Command } from "./command.js";

export class SelectPageCommand extends Command {
  constructor(pageNumber, checkbox) {
    super();
    this.pageNumber = pageNumber;
    this.selectCheckbox = checkbox;
  }

  execute() {
    if (this.selectCheckbox.checked) {
      //adds to array of selected pages
      window.selectedPages.push(this.pageNumber);
    } else {
      //remove page from selected pages array
      const index = window.selectedPages.indexOf(this.pageNumber);
      if (index !== -1) {
        window.selectedPages.splice(index, 1);
      }
    }

    if (window.selectedPages.length > 0 && !window.selectPage) {
      window.toggleSelectPageVisibility();
    }
    if (window.selectedPages.length == 0 && window.selectPage) {
      window.toggleSelectPageVisibility();
    }

    window.updateSelectedPagesDisplay();
  }

  undo() {
    this.selectCheckbox.checked = !this.selectCheckbox.checked;
    if (this.selectCheckbox.checked) {
      //adds to array of selected pages
      window.selectedPages.push(this.pageNumber);
    } else {
      //remove page from selected pages array
      const index = window.selectedPages.indexOf(this.pageNumber);
      if (index !== -1) {
        window.selectedPages.splice(index, 1);
      }
    }

    if (window.selectedPages.length > 0 && !window.selectPage) {
      window.toggleSelectPageVisibility();
    }
    if (window.selectedPages.length == 0 && window.selectPage) {
      window.toggleSelectPageVisibility();
    }

    window.updateSelectedPagesDisplay();
  }

  redo() {
    this.selectCheckbox.checked = !this.selectCheckbox.checked;
    this.execute();
  }
}
