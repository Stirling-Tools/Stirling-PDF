

class DragDropManager {
    dragContainer;
    movePageTo;
    pageDragging;
    draggelEl;
    draggedImageEl;
    hoveredEl;

    constructor(id) {
        this.dragContainer = document.getElementById(id);
        this.pageDragging = false;
        this.hoveredEl = undefined;
        this.draggelEl = undefined
        this.draggedImageEl = undefined;

        this.startDraggingPage = this.startDraggingPage.bind(this);
        this.onDragEl = this.onDragEl.bind(this);
        this.stopDraggingPage = this.stopDraggingPage.bind(this);
    }

    startDraggingPage(div, imageSrc) {
        this.pageDragging = true;
        this.draggedEl = div;
        div.classList.add('dragging');
        const imgEl = document.createElement('img');
        imgEl.classList.add('dragged-img');
        imgEl.src = imageSrc;
        this.draggedImageEl = imgEl;
        this.draggedImageEl.style.left = screenX;
        this.draggedImageEl.style.right = screenY;
        this.dragContainer.appendChild(imgEl);
        window.addEventListener('mouseup', this.stopDraggingPage)
        window.addEventListener('mousemove', this.onDragEl)
    }

    onDragEl(mouseEvent) {
        const { clientX, clientY } = mouseEvent;
        if(this.draggedImageEl) {
            this.draggedImageEl.style.left = `${clientX}px`;
            this.draggedImageEl.style.top = `${clientY}px`;
        }
    }

    
    stopDraggingPage() {
        window.removeEventListener('mousemove', this.onDragEl);
        window.removeEventListener('mouseup', this.stopDraggingPage)
        this.draggedImageEl = undefined;
        this.pageDragging = false;
        this.draggedEl.classList.remove('dragging');
        this.hoveredEl.classList.remove('draghover');
        this.dragContainer.childNodes.forEach((dragChild) => {
            this.dragContainer.removeChild(dragChild);
        })
        this.movePageTo(this.draggedEl, this.hoveredEl);
    }

    setActions({ movePageTo }) {
        this.movePageTo = movePageTo;
    }


    adapt(div) {
        const onDragStart = () => {
            this.startDraggingPage(div, div.querySelector('img').src);
        }
        
        const onMouseEnter = () => {
            if (this.pageDragging) {
                this.hoveredEl = div;
                div.classList.add('draghover');
            }
        }

        const onMouseLeave = () => {
            this.hoveredEl = undefined
            div.classList.remove('draghover');
        }

        div.addEventListener('dragstart', onDragStart);
        div.addEventListener('mouseenter', onMouseEnter);
        div.addEventListener('mouseleave', onMouseLeave);

        return div;
    }
}

export default DragDropManager;