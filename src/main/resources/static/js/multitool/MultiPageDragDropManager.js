class DragDropManager {
  constructor(id, wrapperId) {
    this.dragContainer = document.getElementById(id);
    this.pageDirection = document.documentElement.getAttribute("dir");
    this.wrapper = document.getElementById(wrapperId);
    this.hoveredEl = undefined;
    this.draggedImageEl = undefined;
    this.selectedPageElements = []; // Store selected pages

    var styleElement = document.createElement("link");
    styleElement.rel = "stylesheet";
    styleElement.href = "css/dragdrop.css";
    document.head.appendChild(styleElement);

    const div = document.createElement("div");
    div.classList.add("drag-manager_endpoint");
    div.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" class="bi bi-file-earmark-arrow-down" viewBox="0 0 16 16">
            <path d="M8.5 6.5a.5.5 0 0 0-1 0v3.793L6.354 9.146a.5.5 0 1 0-.708.708l2 2a.5.5 0 0 0 .708 0l2-2a.5.5 0 0 0-.708-.708L8.5 10.293V6.5z"/>
            <path d="M14 14V4.5L9.5 0H4a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2zM9.5 3A1.5 1.5 0 0 0 11 4.5h2V14a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V2a1 1 0 0 1 1-1h5.5v2z"/>
        </svg>`;
    this.endInsertionElement = div;

    this.startDraggingPage = this.startDraggingPage.bind(this);
    this.onDragEl = this.onDragEl.bind(this);
    this.stopDraggingPage = this.stopDraggingPage.bind(this);

    this.adapt(div);
  }
  startDraggingPage() {
    // Retrieve selected pages based on indices in window.selectedPages
    this.selectedPageElements = window.selectedPages.map(index => {
      const pageEl = document.getElementById(`page-container-${index}`);
      if (pageEl) {
        // Store the initial transform position before dragging
        pageEl.initialTransform = pageEl.style.transform || "translate(0px, 0px)";
      }
      return pageEl;
    }).filter(Boolean); // Filters out any null or undefined elements

    if (this.selectedPageElements.length === 0) return; // No pages selected to drag

    this.pageDragging = true;

    // Display a drag preview indicating multiple items
    this.draggedImageEl = document.createElement("div");
    this.draggedImageEl.classList.add("dragged-img");
    this.draggedImageEl.textContent = `${this.selectedPageElements.length} pages selected`;
    this.draggedImageEl.style.visibility = "hidden";
    this.dragContainer.appendChild(this.draggedImageEl);
    this.draggedImageEl.style.backgroundColor = "rgba(0, 0, 0, 0.8)";

    // Add necessary event listeners and styles for dragging
    window.addEventListener("mouseup", this.stopDraggingPage);
    window.addEventListener("mousemove", this.onDragEl);
    this.wrapper.classList.add("drag-manager_dragging-container");
    this.wrapper.appendChild(this.endInsertionElement);
  }


  onDragEl(mouseEvent) {
    const { clientX, clientY } = mouseEvent;
    if (this.draggedImageEl) {
      this.draggedImageEl.style.visibility = "visible";
      this.draggedImageEl.style.left = `${clientX}px`;
      this.draggedImageEl.style.top = `${clientY}px`;
    }
  }

  stopDraggingPage() {
    window.removeEventListener("mousemove", this.onDragEl);
    this.wrapper.classList.remove("drag-manager_dragging-container");
    this.wrapper.removeChild(this.endInsertionElement);
    window.removeEventListener("mouseup", this.stopDraggingPage);

    // Remove the draggedImageEl preview if it exists
    if (this.draggedImageEl) {
      this.dragContainer.removeChild(this.draggedImageEl);
      this.draggedImageEl = undefined;
    }

    if (!this.hoveredEl) {
      // No valid drop target, reset elements to original position
      this.selectedPageElements.forEach((pageEl) => {
        pageEl.style.transform = pageEl.initialTransform || "translate(0px, 0px)";
        pageEl.classList.remove("drag-manager_dragging");
      });
    } else {
      // Drop all selected pages at the target location
      this.selectedPageElements.forEach((pageEl) => {
        pageEl.classList.remove("drag-manager_dragging");
        if (this.hoveredEl === this.endInsertionElement) {
          this.movePageTo(pageEl); // Move each selected page to the end
        } else {
          this.movePageTo(pageEl, this.hoveredEl); // Move to hovered element's position
        }
      });
    }

    this.pageDragging = false;
    this.selectedPageElements = [];
  }


  setActions({ movePageTo }) {
    this.movePageTo = movePageTo;
  }


  adapt(div) {
    const onDragStart = (e) => {
      e.preventDefault();
      this.startDraggingPage();
    };


    const onMouseEnter = () => {
      if (this.pageDragging) {
        this.hoveredEl = div;
        div.classList.add("drag-manager_draghover");
      }
    };

    const onMouseLeave = () => {
      this.hoveredEl = undefined;
      div.classList.remove("drag-manager_draghover");
    };

    div.addEventListener("dragstart", onDragStart);
    div.addEventListener("mouseenter", onMouseEnter);
    div.addEventListener("mouseleave", onMouseLeave);
    return div;
  }
}
export default DragDropManager;
