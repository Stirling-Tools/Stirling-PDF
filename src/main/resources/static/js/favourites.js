function updateFavoritesDropdown() {
  var dropdown = document.querySelector("#favoritesDropdown");

  // Check if dropdown exists
  if (!dropdown) {
    console.error('Dropdown element with ID "favoritesDropdown" not found!');
    return; // Exit the function
  }
  dropdown.innerHTML = ""; // Clear the current favorites

  var hasFavorites = false;

  for (var i = 0; i < localStorage.length; i++) {
    var key = localStorage.key(i);
    if (localStorage.getItem(key) === "favorite") {
      // Find the corresponding navbar entry
      var navbarEntry = document.querySelector(`a[href='${key}']`);
      if (navbarEntry) {
        // Create a new dropdown entry
        var dropdownItem = document.createElement("a");
        dropdownItem.className = "dropdown-item";
        dropdownItem.href = navbarEntry.href;
        dropdownItem.innerHTML = navbarEntry.innerHTML;
        dropdown.appendChild(dropdownItem);
        hasFavorites = true;
      } else {
        console.warn(`Navbar entry not found for key: ${key}`);
      }
    }
  }

  // Show or hide the default item based on whether there are any favorites
  if (!hasFavorites) {
    var defaultItem = document.createElement("a");
    defaultItem.className = "dropdown-item";
    defaultItem.textContent = noFavourites;
    dropdown.appendChild(defaultItem);
  }
}

// Ensure that the DOM content has been fully loaded before calling the function
document.addEventListener("DOMContentLoaded", function () {
  console.log("DOMContentLoaded event fired");
  updateFavoritesDropdown();
});
