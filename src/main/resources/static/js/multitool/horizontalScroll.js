const scrollDivHorizontally = (id) => {
  var scrollDelta = 0; // variable to store the accumulated scroll delta
  var isScrolling = false; // variable to track if scroll is already in progress
  const divToScrollHorizontally = document.getElementById(id);
  function scrollLoop() {
    // Scroll the div horizontally by a fraction of the accumulated scroll delta
    divToScrollHorizontally.scrollLeft += scrollDelta * 0.1;

    // Reduce the accumulated scroll delta by a fraction
    scrollDelta *= 0.9;

    // If scroll delta is still significant, continue the scroll loop
    if (Math.abs(scrollDelta) > 0.1) {
      requestAnimationFrame(scrollLoop);
    } else {
      isScrolling = false; // Reset scroll in progress flag
    }
  }

  divToScrollHorizontally.addEventListener("wheel", function (e) {
    e.preventDefault(); // prevent default mousewheel behavior

    // Accumulate the horizontal scroll delta
    scrollDelta -= e.deltaX || e.wheelDeltaX || -e.deltaY || -e.wheelDeltaY;

    // If scroll is not already in progress, start the scroll loop
    if (!isScrolling) {
      isScrolling = true;
      requestAnimationFrame(scrollLoop);
    }
  });
};

export default scrollDivHorizontally;
