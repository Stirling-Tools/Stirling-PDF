function updateFavoritesDropdown() {
  const favoritesList = JSON.parse(localStorage.getItem('favoritesList')) || [];

  for (var i = 0; i < localStorage.length; i++) {
    var key = localStorage.key(i);
    var value = localStorage.getItem(key);

    if (value === 'favorite') {
      const index = favoritesList.indexOf(key);
      if (index === -1) {
        favoritesList.push(key);
        localStorage.removeItem(key);
        console.log(`Added to favorites: ${key}`);
      }
    }
  }

  var dropdown = document.querySelector('#favoritesDropdown');

  if (!dropdown) {
    console.error('Dropdown element with ID "favoritesDropdown" not found!');
    return;
  }
  dropdown.innerHTML = '';

  var hasFavorites = false;
  var addedFeatures = new Set();

  for (var i = 0; i < favoritesList.length; i++) {
    var value = favoritesList[i];
    if (value) {
      var navbarEntry = document.querySelector(`a[data-bs-link='${value}']`);
      if (navbarEntry) {
        var featureName = navbarEntry.textContent.trim();

        if (!addedFeatures.has(featureName)) {
          var dropdownItem = document.createElement('div');
          dropdownItem.className = 'dropdown-item d-flex justify-content-between align-items-center';

          // Create a wrapper for the original content
          var contentWrapper = document.createElement('div');
          contentWrapper.className = 'd-flex align-items-center flex-grow-1';
          contentWrapper.style.textDecoration = 'none';
          contentWrapper.style.color = 'inherit';

          // Clone the original content
          var originalContent = navbarEntry.querySelector('div').cloneNode(true);
          contentWrapper.appendChild(originalContent);

          // Create the remove button
          var removeButton = document.createElement('button');
          removeButton.className = 'btn btn-sm btn-link p-0 ml-2';
          removeButton.innerHTML = '<i class="material-symbols-rounded close-icon" style="font-size: 18px;">close</i>';
          removeButton.onclick = function (itemKey, event) {
            event.preventDefault();
            event.stopPropagation();
            addToFavorites(itemKey);
            updateFavoritesDropdown();
          }.bind(null, value);

          // Add click event to the content wrapper
          contentWrapper.onclick = function (itemHref, event) {
            event.preventDefault();
            window.location.href = itemHref;
          }.bind(null, navbarEntry.href);

          dropdownItem.appendChild(contentWrapper);
          dropdownItem.appendChild(removeButton);
          dropdown.appendChild(dropdownItem);
          hasFavorites = true;
          addedFeatures.add(featureName);
        }
      }
    } else {
      console.warn(`Navbar entry not found for : ${value}`);
    }
  }

  if (!hasFavorites) {
    var defaultItem = document.createElement('a');
    defaultItem.className = 'dropdown-item';
    defaultItem.textContent = noFavourites || 'No favorites added';
    dropdown.appendChild(defaultItem);
  }
}

function updateFavoriteIcons() {
  const favoritesList = JSON.parse(localStorage.getItem('favoritesList')) || [];

  // Select all favorite icons
  document.querySelectorAll('.favorite-icon').forEach((icon) => {
    const endpoint = icon.getAttribute('data-endpoint');
    const parent = icon.closest('.dropdown-item');

    // Determine if the icon belongs to groupRecent or groupFavorites
    const isInGroupRecent = parent?.closest('#groupRecent') !== null;
    const isInGroupFavorites = parent?.closest('#groupFavorites') !== null;

    if (isInGroupRecent) {
      icon.style.display = 'none';
    } else if (isInGroupFavorites) {
      icon.textContent = 'close_small';
      icon.style.color = 'palevioletred';
    } else {
      icon.textContent = favoritesList.includes(endpoint) ? 'close_small' : 'add';
      icon.className = favoritesList.includes(endpoint)
        ? 'material-symbols-rounded favorite-icon close-icon'
        : 'material-symbols-rounded favorite-icon add-icon';
    }
  });
}

function addToFavorites(entryId) {
  if (entryId) {
    const favoritesList = JSON.parse(localStorage.getItem('favoritesList')) || [];
    const index = favoritesList.indexOf(entryId);

    if (index === -1) {
      favoritesList.push(entryId);
      console.log(`Added to favorites: ${entryId}`);
    } else {
      favoritesList.splice(index, 1);
      console.log(`Removed from favorites: ${entryId}`);
    }

    localStorage.setItem('favoritesList', JSON.stringify(favoritesList));
    updateFavoritesDropdown();
    updateFavoriteIcons();
 
      initializeCards();
  }
}
