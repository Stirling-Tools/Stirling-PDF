class DragDropManager {
  constructor(id, wrapperId) {
    this.dragContainer = document.getElementById(id);
    this.pageDirection = document.documentElement.getAttribute('dir');
    this.wrapper = document.getElementById(wrapperId);
    this.pageDragging = false;
    this.hoveredEl = undefined;
    this.draggedImageEl = undefined;
    this.draggedEl = undefined;
    this.selectedPageElements = []; // Store selected pages for multi-page mode
    this.elementTimeouts = new Map();

    // Add CSS dynamically
    const styleElement = document.createElement('link');
    styleElement.rel = 'stylesheet';
    styleElement.href = 'css/dragdrop.css';
    document.head.appendChild(styleElement);

    // Create the endpoint element
    const div = document.createElement('div');
    div.classList.add('page-container');
    div.classList.add('drag-manager_endpoint');
    div.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" class="bi bi-file-earmark-arrow-down" viewBox="0 0 16 16">
            <path d="M8.5 6.5a.5.5 0 0 0-1 0v3.793L6.354 9.146a.5.5 0 1 0-.708.708l2 2a.5.5 0 0 0 .708 0l2-2a.5.5 0 0 0-.708-.708L8.5 10.293V6.5z"/>
            <path d="M14 14V4.5L9.5 0H4a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2zM9.5 3A1.5 1.5 0 0 0 11 4.5h2V14a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V2a1 1 0 0 1 1-1h5.5v2z"/>
        </svg>`;
    this.endInsertionElement = div;

    // Bind methods
    this.startDraggingPage = this.startDraggingPage.bind(this);
    this.onDragEl = this.onDragEl.bind(this);
    this.stopDraggingPage = this.stopDraggingPage.bind(this);

    this.adapt(div);
  }

  startDraggingPage(div) {
    if (window.selectPage) {
      // Multi-page drag logic
      this.selectedPageElements = window.selectedPages
        .map((index) => {
          const pageEl = Array.from(this.wrapper.childNodes)[index];
          if (pageEl) {
            pageEl.initialTransform = pageEl.style.transform || 'translate(0px, 0px)';
            pageEl.classList.add('drag-manager_dragging');
          }
          return pageEl;
        })
        .filter(Boolean);

      if (this.selectedPageElements.length === 0) return;

      this.pageDragging = true;
      this.draggedImageEl = document.createElement('div');
      this.draggedImageEl.classList.add('multidrag');
      this.draggedImageEl.textContent = `${this.selectedPageElements.length} ${window.translations.dragDropMessage}`;
      this.draggedImageEl.style.visibility = 'hidden';

      this.dragContainer.appendChild(this.draggedImageEl);
    } else {
      // Single-page drag logic
      this.pageDragging = true;
      this.draggedEl = div;
      const img = div.querySelector('img');
      div.classList.add('drag-manager_dragging');
      div.classList.remove('moved-element', 'remove');
      const imgEl = document.createElement('img');
      imgEl.classList.add('dragged-img');
      imgEl.src = img.src;
      imgEl.style.visibility = 'hidden';
      imgEl.style.transform = `rotate(${img.style.rotate === '' ? '0deg' : img.style.rotate}) translate(-50%, -50%)`;
      this.draggedImageEl = imgEl;
      this.dragContainer.appendChild(imgEl);
    }

    // Common setup for both modes
    window.addEventListener('mouseup', this.stopDraggingPage);
    window.addEventListener('mousemove', this.onDragEl);
    this.wrapper.classList.add('drag-manager_dragging-container');
    this.wrapper.appendChild(this.endInsertionElement);
  }

  onDragEl(mouseEvent) {
    const { clientX, clientY } = mouseEvent;
    if (this.draggedImageEl) {
      this.draggedImageEl.style.visibility = 'visible';
      this.draggedImageEl.style.left = `${clientX}px`;
      this.draggedImageEl.style.top = `${clientY}px`;
    }
  }

  stopDraggingPage() {
    window.removeEventListener('mousemove', this.onDragEl);
    this.wrapper.classList.remove('drag-manager_dragging-container');
    this.wrapper.removeChild(this.endInsertionElement);
    window.removeEventListener('mouseup', this.stopDraggingPage);

    if (this.draggedImageEl) {
      this.dragContainer.removeChild(this.draggedImageEl);
      this.draggedImageEl = undefined;
    }

    if (window.selectPage) {
      // Multi-page drop logic
      if (
        !this.hoveredEl ||
        !this.hoveredEl.classList.contains('page-container') ||
        this.selectedPageElements.includes(this.hoveredEl)
      ) {
        this.selectedPageElements.forEach((pageEl) => {
          pageEl.style.transform = pageEl.initialTransform || 'translate(0px, 0px)';
          pageEl.classList.remove('drag-manager_dragging');
        });
      } else {
        this.selectedPageElements.forEach((pageEl) => {
          pageEl.classList.remove('drag-manager_dragging');
        });

        this.movePageTo(
          this.selectedPageElements,
          this.hoveredEl === this.endInsertionElement
            ? null
            : this.hoveredEl);

        this.selectedPageElements.forEach((pageEl) => {
          // Handle timeout for the current element
          this.handleTimeoutForElement(pageEl);
        });
      }
      this.selectedPageElements = [];
      window.resetPages();
    } else {
      // Single-page drop logic
      if (
        !this.hoveredEl ||
        !this.hoveredEl.classList.contains('page-container') ||
        this.hoveredEl === this.draggedEl
      ) {
        this.draggedEl.style.transform = this.draggedEl.initialTransform || 'translate(0px, 0px)';
        this.draggedEl.classList.remove('drag-manager_dragging');
        return;
      }

      this.draggedEl.classList.remove('drag-manager_dragging');

      if (this.hoveredEl === this.endInsertionElement) {
        this.movePageTo(this.draggedEl);
      } else {
        this.movePageTo(this.draggedEl, this.hoveredEl);
      }

      // Handle timeout for the current element
      this.handleTimeoutForElement(this.draggedEl);
    }

    this.pageDragging = false;
  }

  // Helper function to manage independent timeouts
  handleTimeoutForElement(element) {
    // Clear existing timeout if present
    if (this.elementTimeouts.has(element)) {
      clearTimeout(this.elementTimeouts.get(element));
    }

    // Add the moved-element class and set a new timeout
    element.classList.remove('remove');
    element.classList.add('moved-element');

    const timeoutId = setTimeout(() => {
      element.classList.add('remove');
      this.elementTimeouts.delete(element); // Cleanup the timeout map
    }, 2000);

    // Store the timeout ID for this element
    this.elementTimeouts.set(element, timeoutId);
  }

  setActions({ movePageTo }) {
    this.movePageTo = movePageTo;
  }

  adapt(div) {
    const onDragStart = (e) => {
      e.preventDefault();
      this.startDraggingPage(div);
    };

    const onMouseEnter = () => {
      if (this.pageDragging) {
        this.hoveredEl = div;
        div.classList.add('drag-manager_draghover');
      }
    };

    const onMouseLeave = () => {
      this.hoveredEl = undefined;
      div.classList.remove('drag-manager_draghover');
    };

    div.addEventListener('dragstart', onDragStart);
    div.addEventListener('mouseenter', onMouseEnter);
    div.addEventListener('mouseleave', onMouseLeave);

    return div;
  }
}

export default DragDropManager;
