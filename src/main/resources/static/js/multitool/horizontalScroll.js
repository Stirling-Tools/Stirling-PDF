const scrollDivHorizontally = (id) => {
  var scrollDeltaX = 0; // variable to store the accumulated horizontal scroll delta
  var scrollDeltaY = 0; // variable to store the accumulated vertical scroll delta
  var isScrolling = false; // variable to track if scroll is already in progress
  const divToScroll = document.getElementById(id);

  function scrollLoop() {
    // Scroll the div horizontally and vertically by a fraction of the accumulated scroll delta
    divToScroll.scrollLeft += scrollDeltaX * 0.1;
    divToScroll.scrollTop += scrollDeltaY * 0.1;

    // Reduce the accumulated scroll delta by a fraction
    scrollDeltaX *= 0.9;
    scrollDeltaY *= 0.9;

    // If scroll delta is still significant, continue the scroll loop
    if (Math.abs(scrollDeltaX) > 0.1 || Math.abs(scrollDeltaY) > 0.1) {
      requestAnimationFrame(scrollLoop);
    } else {
      isScrolling = false; // Reset scroll in progress flag
    }
  }

  divToScroll.addEventListener("wheel", function (e) {
    e.preventDefault(); // prevent default mousewheel behavior

    // Accumulate the horizontal and vertical scroll delta
    scrollDeltaX -= e.deltaX || e.wheelDeltaX || -e.deltaY || -e.wheelDeltaY;
    scrollDeltaY -= e.deltaY || e.wheelDeltaY || -e.deltaX || -e.wheelDeltaX;

    // If scroll is not already in progress, start the scroll loop
    if (!isScrolling) {
      isScrolling = true;
      requestAnimationFrame(scrollLoop);
    }
  });
};

export default scrollDivHorizontally;