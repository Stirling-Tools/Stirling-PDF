const draggableElement = document.querySelector('.draggable-canvas');

// Variables to store the current position of the draggable element
let offsetX, offsetY, isDragging = false;

draggableElement.addEventListener('mousedown', (e) => {
  // Get the offset when the mouse is clicked inside the element
  offsetX = e.clientX - draggableElement.getBoundingClientRect().left;
  offsetY = e.clientY - draggableElement.getBoundingClientRect().top;

  // Set isDragging to true
  isDragging = true;

  // Add event listeners for mouse movement and release
  document.addEventListener('mousemove', onMouseMove);
  document.addEventListener('mouseup', onMouseUp);
});

function onMouseMove(e) {
  if (isDragging) {
    // Calculate the new position of the element
    const left = e.clientX - offsetX;
    const top = e.clientY - offsetY;

    // Move the element by setting its style
    draggableElement.style.left = `${left}px`;
    draggableElement.style.top = `${top}px`;
  }
}

function onMouseUp() {
  // Stop dragging and remove event listeners
  isDragging = false;
  document.removeEventListener('mousemove', onMouseMove);
  document.removeEventListener('mouseup', onMouseUp);
}
