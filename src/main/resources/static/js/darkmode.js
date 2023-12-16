var toggleCount = 0
var lastToggleTime = Date.now()

var elements = {
  lightModeStyles: null,
  darkModeStyles: null,
  rainbowModeStyles: null,
  darkModeIcon: null,
  searchBar: null,
  formControls: null,
  navbar: null,
  navIcons: null,
  navDropdownMenus: null,
}

function getElements() {
  elements.lightModeStyles = document.getElementById("light-mode-styles")
  elements.darkModeStyles = document.getElementById("dark-mode-styles")
  elements.rainbowModeStyles = document.getElementById("rainbow-mode-styles")
  elements.darkModeIcon = document.getElementById("dark-mode-icon")
  elements.searchBar = document.getElementById("searchBar")
  elements.formControls = document.querySelectorAll(".form-control")
  elements.navbar = document.querySelectorAll("nav.navbar")
  elements.navIcons = document.querySelectorAll("nav .icon, .navbar-icon")
  elements.navDropdownMenus = document.querySelectorAll("nav .dropdown-menu")
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
      elements.darkModeIcon.src = "moon.svg";
    }
    if (elements && elements.searchBar) {
      elements.searchBar.classList.add("dark-mode-search");
    }
    if (elements && elements.formControls) {
      elements.formControls.forEach(input => input.classList.add("bg-dark", "text-white"));
    }
    if (elements && elements.navbar) {
      elements.navbar.forEach(navElement => {
        navElement.classList.remove("navbar-light", "bg-light");
        navElement.classList.add("navbar-dark", "bg-dark");
      });
    }
    if (elements && elements.navDropdownMenus) {
      elements.navDropdownMenus.forEach(menu => menu.classList.add("dropdown-menu-dark"));
    }
    if (elements && elements.navIcons) {
      elements.navIcons.forEach(icon => (icon.style.filter = "invert(1)"));
    }
    var tables = document.querySelectorAll(".table");
    tables.forEach(table => {
      table.classList.add("table-dark");
    });
    if (jumbotron) {
      jumbotron.classList.add("bg-dark");
      jumbotron.classList.remove("bg-light");
    }
  } else if (mode === "off") {
    if (elements && elements.darkModeIcon) {
      elements.darkModeIcon.src = "sun.svg";
    }
    if (elements && elements.searchBar) {
      elements.searchBar.classList.remove("dark-mode-search");
    }
    if (elements && elements.formControls) {
      elements.formControls.forEach(input => input.classList.remove("bg-dark", "text-white"));
    }
    if (elements && elements.navbar) {
      elements.navbar.forEach(navElement => {
        navElement.classList.remove("navbar-dark", "bg-dark");
        navElement.classList.add("navbar-light", "bg-light");
      });
    }
    if (elements && elements.navDropdownMenus) {
      elements.navDropdownMenus.forEach(menu => menu.classList.remove("dropdown-menu-dark"));
    }
    if (elements && elements.navIcons) {
      elements.navIcons.forEach(icon => (icon.style.filter = "none"));
    }
    var tables = document.querySelectorAll(".table-dark");
    tables.forEach(table => {
      table.classList.remove("table-dark");
    });
    if (jumbotron) {
      jumbotron.classList.remove("bg-dark");
      jumbotron.classList.add("bg-light");
    }
  } else if (mode === "rainbow") {
    if (elements && elements.darkModeIcon) {
      elements.darkModeIcon.src = "rainbow.svg";
    }
  }
}

function toggleDarkMode() {
  var currentTime = Date.now()
  if (currentTime - lastToggleTime < 1000) {
    toggleCount++
  } else {
    toggleCount = 1
  }
  lastToggleTime = currentTime

  if (toggleCount >= 18) {
    localStorage.setItem("dark-mode", "rainbow")
    setMode("rainbow")
  } else if (localStorage.getItem("dark-mode") == "on") {
    localStorage.setItem("dark-mode", "off")
    setMode("off")
  } else {
    localStorage.setItem("dark-mode", "on")
    setMode("on")
  }
}

document.addEventListener("DOMContentLoaded", function () {
  getElements()

  var currentMode = localStorage.getItem("dark-mode")
  if (currentMode === "on" || currentMode === "off" || currentMode === "rainbow") {
    setMode(currentMode)
  } else if (window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches) {
    setMode("on")
  } else {
    setMode("off")
  }

  var darkModeToggle = document.getElementById("dark-mode-toggle");
  if (darkModeToggle !== null) {
	  darkModeToggle.addEventListener("click", function (event) {
	    event.preventDefault();
	    toggleDarkMode();
	  });
	}
})
