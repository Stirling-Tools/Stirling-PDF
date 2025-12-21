import { Command } from './command.js';

/**
 * Moves a page (or multiple pages, via PdfContainer wrapper) inside the container.
 */
export class MovePageCommand extends Command {
  /**
   * @param {HTMLElement} startElement - Dragged page container.
   * @param {HTMLElement|null} endElement - Destination reference; insert before this node. Null = append.
   * @param {HTMLElement} pagesContainer - Parent container with all pages.
   * @param {HTMLElement} pagesContainerWrapper - Scrollable wrapper element.
   * @param {boolean} [scrollTo=false] - Whether to apply a subtle scroll after move.
   */
  constructor(startElement, endElement, pagesContainer, pagesContainerWrapper, scrollTo = false) {
    super();

    this.pagesContainer = pagesContainer;
    const childArray = Array.from(this.pagesContainer.childNodes);

    /** @type {number} */
    this.startIndex = childArray.indexOf(startElement);
    /** @type {number} */
    this.endIndex = childArray.indexOf(endElement);

    this.startElement = startElement;
    this.endElement = endElement;

    this.scrollTo = scrollTo;
    this.pagesContainerWrapper = pagesContainerWrapper;
  }

  /** Execute: perform DOM move and optional scroll. */
  execute() {
    // Remove stale page number badge if present (Firefox sometimes misses the event)
    const pageNumberElement = this.startElement.querySelector('.page-number');
    if (pageNumberElement) {
      this.startElement.removeChild(pageNumberElement);
    }

    this.pagesContainer.removeChild(this.startElement);
    if (!this.endElement) {
      this.pagesContainer.append(this.startElement);
    } else {
      this.pagesContainer.insertBefore(this.startElement, this.endElement);
    }

    if (this.scrollTo) {
      const { width } = this.startElement.getBoundingClientRect();
      const vector = this.endIndex !== -1 && this.startIndex > this.endIndex ? 0 - width : width;

      this.pagesContainerWrapper.scroll({
        left: this.pagesContainerWrapper.scrollLeft + vector,
      });
    }
  }

  /** Undo: restore original order and optional scroll back. */
  undo() {
    if (this.startElement) {
      this.pagesContainer.removeChild(this.startElement);
      const previousNeighbour = Array.from(this.pagesContainer.childNodes)[this.startIndex];
      previousNeighbour?.insertAdjacentElement('beforebegin', this.startElement)
        ?? this.pagesContainer.append(this.startElement);
    }

    if (this.scrollTo) {
      const { width } = this.startElement.getBoundingClientRect();
      const vector = this.endIndex === -1 || this.startIndex <= this.endIndex ? 0 - width : width;

      this.pagesContainerWrapper.scroll({
        left: this.pagesContainerWrapper.scrollLeft - vector,
      });
    }
  }

  /** Redo: same as execute. */
  redo() {
    this.execute();
  }
}
