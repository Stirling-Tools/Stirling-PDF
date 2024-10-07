function updateFavoritesDropdown() {
  var dropdown = document.querySelector("#favoritesDropdown");

  if (!dropdown) {
    console.error('Dropdown element with ID "favoritesDropdown" not found!');
    return;
  }
  dropdown.innerHTML = "";

  var hasFavorites = false;
  var addedFeatures = new Set();

  for (var i = 0; i < localStorage.length; i++) {
    var key = localStorage.key(i);
    var value = localStorage.getItem(key);

    if (value === "favorite") {
      var navbarEntry = document.querySelector(`a[href='${key}']`);
      if (navbarEntry) {
        var featureName = navbarEntry.textContent.trim();

        if (!addedFeatures.has(featureName)) {
          var dropdownItem = document.createElement("div");
          dropdownItem.className = "dropdown-item d-flex justify-content-between align-items-center";

          // Create a wrapper for the original content
          var contentWrapper = document.createElement("div");
          contentWrapper.className = "d-flex align-items-center flex-grow-1";
          contentWrapper.style.textDecoration = "none";
          contentWrapper.style.color = "inherit";

          // Clone the original content
          var originalContent = navbarEntry.querySelector('div').cloneNode(true);
          contentWrapper.appendChild(originalContent);

          // Create the remove button
          var removeButton = document.createElement("button");
          removeButton.className = "btn btn-sm btn-link p-0 ml-2";
          removeButton.innerHTML = '<i class="material-symbols-rounded close-icon" style="font-size: 18px;">close</i>';
          removeButton.onclick = function(itemKey, event) {
            event.preventDefault();
            event.stopPropagation();
            localStorage.removeItem(itemKey);
            updateFavoritesSection();
            updateFavoritesDropdown();
            filterCards();
          }.bind(null, key);

          // Add click event to the content wrapper
          contentWrapper.onclick = function(itemHref, event) {
            event.preventDefault();
            window.location.href = itemHref;
          }.bind(null, navbarEntry.href);

          dropdownItem.appendChild(contentWrapper);
          dropdownItem.appendChild(removeButton);
          dropdown.appendChild(dropdownItem);
          hasFavorites = true;
          addedFeatures.add(featureName);
        }
      } else {
        console.warn(`Navbar entry not found for key: ${key}`);
      }
    }
  }

  if (!hasFavorites) {
    var defaultItem = document.createElement("a");
    defaultItem.className = "dropdown-item";
    defaultItem.textContent = noFavourites || "No favorites added";
    dropdown.appendChild(defaultItem);
  }
}
