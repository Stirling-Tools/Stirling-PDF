function updateFavoritesDropdown() {
	var dropdown = document.querySelector('#favoritesDropdown');
	dropdown.innerHTML = '';  // Clear the current favorites



	var hasFavorites = false;

	for (var i = 0; i < localStorage.length; i++) {
		var key = localStorage.key(i);
		if (localStorage.getItem(key) === 'favorite') {
			// Find the corresponding navbar entry
			var navbarEntry = document.querySelector(`a[href='${key}']`);
			if (navbarEntry) {
				// Create a new dropdown entry
				var dropdownItem = document.createElement('a');
				dropdownItem.className = 'dropdown-item';
				dropdownItem.href = navbarEntry.href;
				dropdownItem.innerHTML = navbarEntry.innerHTML;
				dropdown.appendChild(dropdownItem);
				hasFavorites = true;
			}
		}
	}

	// Show or hide the default item based on whether there are any favorites
	if (!hasFavorites) {
		var defaultItem = document.createElement('a');
		defaultItem.className = 'dropdown-item';
		defaultItem.textContent = noFavourites;
		dropdown.appendChild(defaultItem);
	}
}
document.addEventListener('DOMContentLoaded', function() {

	updateFavoritesDropdown();
});