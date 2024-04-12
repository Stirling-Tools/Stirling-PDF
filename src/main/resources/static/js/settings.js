// Get the download option from local storage, or set it to 'sameWindow' if it doesn't exist
var downloadOption = localStorage.getItem("downloadOption") || "sameWindow";

// Set the selected option in the dropdown
document.getElementById("downloadOption").value = downloadOption;

// Save the selected option to local storage when the dropdown value changes
document.getElementById("downloadOption").addEventListener("change", function () {
  downloadOption = this.value;
  localStorage.setItem("downloadOption", downloadOption);
});

// Get the zipThreshold value from local storage, or set it to 0 if it doesn't exist
var zipThreshold = parseInt(localStorage.getItem("zipThreshold"), 10) || 4;

// Set the value of the slider and the display span
document.getElementById("zipThreshold").value = zipThreshold;
document.getElementById("zipThresholdValue").textContent = zipThreshold;

// Save the selected value to local storage when the slider value changes
document.getElementById("zipThreshold").addEventListener("input", function () {
  zipThreshold = this.value;
  document.getElementById("zipThresholdValue").textContent = zipThreshold;
  localStorage.setItem("zipThreshold", zipThreshold);
});

var boredWaiting = localStorage.getItem("boredWaiting") || "disabled";
document.getElementById("boredWaiting").checked = boredWaiting === "enabled";

document.getElementById("boredWaiting").addEventListener("change", function () {
  boredWaiting = this.checked ? "enabled" : "disabled";
  localStorage.setItem("boredWaiting", boredWaiting);
});

var cacheInputs = localStorage.getItem("cacheInputs") || "disabled";
document.getElementById("cacheInputs").checked = cacheInputs === "enabled";

document.getElementById("cacheInputs").addEventListener("change", function () {
  cacheInputs = this.checked ? "enabled" : "disabled";
  localStorage.setItem("cacheInputs", cacheInputs);
});

