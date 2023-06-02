var toggleCount = 0;
var lastToggleTime = Date.now();

function toggleDarkMode() {
	var currentTime = Date.now();
	if (currentTime - lastToggleTime < 1000) {
		toggleCount++;
	} else {
		toggleCount = 1;
	}
	lastToggleTime = currentTime;

	var lightModeStyles = document.getElementById("light-mode-styles");
	var darkModeStyles = document.getElementById("dark-mode-styles");
	var rainbowModeStyles = document.getElementById("rainbow-mode-styles");
	var darkModeIcon = document.getElementById("dark-mode-icon");

	if (toggleCount >= 18) {
		localStorage.setItem("dark-mode", "rainbow");
		lightModeStyles.disabled = true;
		darkModeStyles.disabled = true;
		rainbowModeStyles.disabled = false;
		darkModeIcon.src = "rainbow.svg";
	} else if (localStorage.getItem("dark-mode") == "on") {
		localStorage.setItem("dark-mode", "off");
		lightModeStyles.disabled = false;
		darkModeStyles.disabled = true;
		rainbowModeStyles.disabled = true;
		darkModeIcon.src = "sun.svg";
	} else {
		localStorage.setItem("dark-mode", "on");
		lightModeStyles.disabled = true;
		darkModeStyles.disabled = false;
		rainbowModeStyles.disabled = true;
		darkModeIcon.src = "moon.svg";
	}
}

document.addEventListener("DOMContentLoaded", function() {
	var lightModeStyles = document.getElementById("light-mode-styles");
	var darkModeStyles = document.getElementById("dark-mode-styles");
	var rainbowModeStyles = document.getElementById("rainbow-mode-styles");
	var darkModeIcon = document.getElementById("dark-mode-icon");

	if (localStorage.getItem("dark-mode") == "on") {
		lightModeStyles.disabled = true;
		darkModeStyles.disabled = false;
		rainbowModeStyles.disabled = true;
		darkModeIcon.src = "moon.svg";
	} else if (localStorage.getItem("dark-mode") == "off") {
		lightModeStyles.disabled = false;
		darkModeStyles.disabled = true;
		rainbowModeStyles.disabled = true;
		darkModeIcon.src = "sun.svg";
	} else if (localStorage.getItem("dark-mode") == "rainbow") {
		lightModeStyles.disabled = true;
		darkModeStyles.disabled = true;
		rainbowModeStyles.disabled = false;
		darkModeIcon.src = "rainbow.svg";
	} else {
		if (window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches) {
			darkModeStyles.disabled = false;
			rainbowModeStyles.disabled = true;
			darkModeIcon.src = "moon.svg";
		} else {
			darkModeStyles.disabled = true;
			rainbowModeStyles.disabled = true;
			darkModeIcon.src = "sun.svg";
		}
	}

	document.getElementById("dark-mode-toggle").addEventListener("click", function(event) {
		event.preventDefault();
		toggleDarkMode();
	});
});