var toggleCount = 0;
var lastToggleTime = Date.now();

var elements = {
  lightModeStyles: null,
  darkModeStyles: null,
  rainbowModeStyles: null,
  darkModeIcon: null,
  searchBar: null,
  formControls: null,
  navIcons: null,
  navDropdownMenus: null,
};

function getElements() {
  elements.lightModeStyles = document.getElementById("light-mode-styles");
  elements.darkModeStyles = document.getElementById("dark-mode-styles");
  elements.rainbowModeStyles = document.getElementById("rainbow-mode-styles");
  elements.darkModeIcon = document.getElementById("dark-mode-icon");
  elements.searchBar = document.getElementById("searchBar");
  elements.formControls = document.querySelectorAll(".form-control");
  elements.navDropdownMenus = document.querySelectorAll(".dropdown-menu");
}
function setMode(mode) {
  var event = new CustomEvent("modeChanged", { detail: mode });
  document.dispatchEvent(event);

  if (elements && elements.lightModeStyles) {
    elements.lightModeStyles.disabled = mode !== "off";
  }
  if (elements && elements.darkModeStyles) {
    elements.darkModeStyles.disabled = mode !== "on";
  }
  if (elements && elements.rainbowModeStyles) {
    elements.rainbowModeStyles.disabled = mode !== "rainbow";
  }

  var jumbotron = document.getElementById("jumbotron");

  if (mode === "on") {
    if (elements && elements.darkModeIcon) {
      elements.darkModeIcon.textContent = "dark_mode";
    }
    var tables = document.querySelectorAll(".table");
    tables.forEach((table) => {
      table.classList.add("table-dark");
    });
  } else if (mode === "off") {
    if (elements && elements.darkModeIcon) {
      elements.darkModeIcon.textContent = "light_mode";
    }
    var tables = document.querySelectorAll(".table-dark");
    tables.forEach((table) => {
      table.classList.remove("table-dark");
    });
  } else if (mode === "rainbow") {
    if (elements && elements.darkModeIcon) {
      elements.darkModeIcon.textContent = "looks";
    }
  }
}

function toggleDarkMode() {
  var currentTime = Date.now();
  if (currentTime - lastToggleTime < 1000) {
    toggleCount++;
  } else {
    toggleCount = 1;
  }
  lastToggleTime = currentTime;

  document.body.classList.add("transition-theme");

  if (toggleCount >= 18) {
    localStorage.setItem("dark-mode", "rainbow");
    setMode("rainbow");
  } else if (localStorage.getItem("dark-mode") == "on") {
    localStorage.setItem("dark-mode", "off");
    setMode("off");
  } else {
    localStorage.setItem("dark-mode", "on");
    setMode("on");
  }
}

document.addEventListener("DOMContentLoaded", function () {
  getElements();

  var currentMode = localStorage.getItem("dark-mode");
  if (currentMode === "on" || currentMode === "off" || currentMode === "rainbow") {
    setMode(currentMode);
  } else if (window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches) {
    setMode("on");
  } else {
    setMode("off");
  }

  var darkModeToggle = document.getElementById("dark-mode-toggle");
  if (darkModeToggle !== null) {
    darkModeToggle.addEventListener("click", function (event) {
      event.preventDefault();
      toggleDarkMode();
    });
  }
});
