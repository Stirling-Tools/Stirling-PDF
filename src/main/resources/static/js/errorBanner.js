var traceVisible = false;

function toggletrace() {
  var traceDiv = document.getElementById("trace");
  if (!traceVisible) {
    traceDiv.style.maxHeight = "500px";
    traceVisible = true;
  } else {
    traceDiv.style.maxHeight = "0px";
    traceVisible = false;
  }
  adjustContainerHeight();
}

function copytrace() {
  var flip = false;
  if (!traceVisible) {
    toggletrace();
    flip = true;
  }
  var traceContent = document.getElementById("traceContent");
  var range = document.createRange();
  range.selectNode(traceContent);
  window.getSelection().removeAllRanges();
  window.getSelection().addRange(range);
  document.execCommand("copy");
  window.getSelection().removeAllRanges();
  if (flip) {
    toggletrace();
  }
}

function dismissError() {
  var errorContainer = document.getElementById("errorContainer");
  errorContainer.style.display = "none";
  errorContainer.style.height = "0";
}

function adjustContainerHeight() {
  var errorContainer = document.getElementById("errorContainer");
  var traceDiv = document.getElementById("trace");
  if (traceVisible) {
    errorContainer.style.height = errorContainer.scrollHeight - traceDiv.scrollHeight + traceDiv.offsetHeight + "px";
  } else {
    errorContainer.style.height = "auto";
  }
}
function showHelp() {
  $("#helpModal").modal("show");
}
