function filterCards() {
  var input = document.getElementById('searchBar');
  var filter = input.value.toUpperCase().trim();

  // Split the input filter into individual words for multi-word matching
  var filterWords = filter.split(/[\s,;.\-]+/);

  let featureGroups = document.querySelectorAll('.feature-group');
  for (const featureGroup of featureGroups) {
    var cards = featureGroup.querySelectorAll('.dropdown-item');

    let groupMatchesFilter = false;
    for (var i = 0; i < cards.length; i++) {
      var card = cards[i];
      var title = card.getAttribute('title') || '';

      // Get the navbar tags associated with the card
      var navbarItem = document.querySelector(`a.dropdown-item[href="${card.id}"]`);
      var navbarTags = navbarItem ? navbarItem.getAttribute('data-bs-tags') : '';
      navbarTags = navbarItem ? navbarTags + ',' + navbarItem.getAttribute('data-bs-title') + ',' + navbarItem.children[0].getAttribute('data-title') : navbarTags;

      var content = (title + ' ' + navbarTags).toUpperCase();

      // Check if all words in the filter match the content
      var matches = filterWords.every((word) => content.includes(word));

      if (matches) {
        card.style.display = '';
        groupMatchesFilter = true;
      } else {
        card.style.display = 'none';
      }
    }

    if (!groupMatchesFilter) {
      featureGroup.style.display = 'none';
    } else {
      featureGroup.style.display = '';
    }
  }
}

function updateFavoritesSection() {
  const favoritesContainer = document.getElementById('groupFavorites').querySelector('.nav-group-container');
  favoritesContainer.innerHTML = '';
  let favoritesAmount = 0;
  const favouritesList = JSON.parse(localStorage.getItem('favoritesList') || '[]');
  const isFavoritesView = JSON.parse(localStorage.getItem('favoritesView') || 'false');

  favouritesList.forEach((value) => {
    var navbarEntry = document.querySelector(`a[data-bs-link='${value}']`);
    if (navbarEntry) {
      const duplicate = navbarEntry.cloneNode(true);
      favoritesContainer.appendChild(duplicate);
    }
    favoritesAmount++;
  });

  if (favoritesAmount === 0 || !isFavoritesView) {
    document.getElementById('groupFavorites').style.display = 'none';
  } else {
    document.getElementById('groupFavorites').style.display = 'flex';
  }
  reorderCards(favoritesContainer);
  //favoritesContainer.style.maxHeight = favoritesContainer.scrollHeight + 'px';
}

function reorderCards(container) {
  var cards = Array.from(container.querySelectorAll('.dropdown-item'));
  cards.forEach(function (card) {
    container.removeChild(card);
  });
  cards.sort(function (a, b) {
    var aIsFavorite = localStorage.getItem(a.id) === 'favorite';
    var bIsFavorite = localStorage.getItem(b.id) === 'favorite';

    if (aIsFavorite && !bIsFavorite) {
      return -1;
    } else if (!aIsFavorite && bIsFavorite) {
      return 1;
    } else {
      return a.id > b.id;
    }
  });
  cards.forEach(function (card) {
    container.appendChild(card);
  });
}

function initializeCards() {
  updateFavoritesSection();
  updateFavoritesView();
  updateFavoritesDropdown();
  filterCards();
}

function updateFavoritesView() {
  const isFavoritesView = JSON.parse(localStorage.getItem('favoritesView') || 'false');
  const iconElement = document.getElementById('toggle-favourites-icon');
  const favoritesGroup = document.querySelector('#groupFavorites');
  const favoritesList = JSON.parse(localStorage.getItem('favoritesList')) || [];

  if (isFavoritesView && favoritesList.length > 0) {
    document.getElementById('favouritesVisibility').style.display = 'flex';
    favoritesGroup.style.display = 'flex';
  } else {
    if (favoritesList.length > 0) {
      document.getElementById('favouritesVisibility').style.display = 'flex';
      favoritesGroup.style.display = 'none';
    } else {
      document.getElementById('favouritesVisibility').style.display = 'none';
    }
  }
}

function toggleFavoritesMode() {
  const favoritesMode = !document.querySelector('.toggle-favourites').classList.contains('active');
  document.querySelector('.toggle-favourites').classList.toggle('active', favoritesMode);

  document.querySelectorAll('.favorite-icon').forEach((icon) => {
    const endpoint = icon.getAttribute('data-endpoint');
    const parent = icon.closest('.dropdown-item');
    const isInGroupRecent = parent.closest('#groupRecent') !== null;
    const isInGroupFavorites = parent.closest('#groupFavorites') !== null;

    if (isInGroupRecent) {
      icon.style.display = 'none';
    } else if (isInGroupFavorites) {
      icon.style.display = favoritesMode ? 'inline-block' : 'none';
      icon.textContent = 'close_small';
    } else {
      icon.style.display = favoritesMode ? 'inline-block' : 'none';

      const favoritesList = JSON.parse(localStorage.getItem('favoritesList')) || [];
      icon.textContent = favoritesList.includes(endpoint) ? 'close_small' : 'add';
    }
  });

  document.querySelectorAll('.dropdown-item').forEach((link) => {
    if (favoritesMode) {
      link.dataset.originalHref = link.getAttribute('href');
      link.setAttribute('href', '#');
      link.classList.add('no-hover');
    } else {
      link.setAttribute('href', link.dataset.originalHref || '#');
      link.classList.remove('no-hover');
    }
  });

  const isFavoritesView = JSON.parse(localStorage.getItem('favoritesView') || 'false');
  if (favoritesMode && !isFavoritesView) {
    toggleFavoritesView();
  }
}

function toggleFavoritesView() {
  const isFavoritesView = JSON.parse(localStorage.getItem('favoritesView') || 'false');
  localStorage.setItem('favoritesView', !isFavoritesView);
  updateFavoritesView();
}
window.onload = function () {
  initializeCards();
};

function sortNavElements(criteria) {
  document.querySelectorAll('.nav-group-container').forEach((container) => {
    const items = Array.from(container.children);

    items.sort((a, b) => {
      if (criteria === 'alphabetical') {
        const titleA = a.querySelector('.icon-text')?.textContent.trim().toLowerCase() || '';
        const titleB = b.querySelector('.icon-text')?.textContent.trim().toLowerCase() || '';
        return titleA.localeCompare(titleB);
      } else if (criteria === 'global') {
        const popularityA = parseInt(a.dataset.popularity, 10) || 1000;
        const popularityB = parseInt(b.dataset.popularity, 10) || 1000;
        return popularityA - popularityB;
      }
      return 0;
    });
    container.innerHTML = '';
    items.forEach((item) => container.appendChild(item));
  });
}

async function fetchPopularityData(url) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`HTTP error! status: ${response.status}`);
  }
  return await response.text();
}

function applyPopularityData(popularityData) {
  document.querySelectorAll('.dropdown-item').forEach((item) => {
    const endpoint = item.getAttribute('data-bs-link');
    const popularity = popularityData['/' + endpoint];
    if (endpoint && popularity !== undefined) {
      item.setAttribute('data-popularity', popularity);
    }
  });
  const currentSort = localStorage.getItem('homepageSort') || 'alphabetical';
  const sortDropdown = document.getElementById('sort-options');
  if (sortDropdown) {
    sortDropdown.value = currentSort;
    ``;
  }
  sortNavElements(currentSort);
}
document.addEventListener('DOMContentLoaded', async function () {
  const sortDropdown = document.getElementById('sort-options');
  if (sortDropdown) {
    sortDropdown.addEventListener('change', (event) => {
      const selectedOption = event.target.value;
      localStorage.setItem('homepageSort', selectedOption);

      sortNavElements(selectedOption);
    });
  }
  try {
    const response = await fetch('files/popularity.txt');
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    const popularityData = await response.json();
    applyPopularityData(popularityData);
  } catch (error) {
    console.error('Error loading popularity data:', error);
  }

  const materialIcons = new FontFaceObserver('Material Symbols Rounded');

  materialIcons
    .load()
    .then(() => {
      document.querySelectorAll('.dropdown-item.hidden').forEach((el) => {
        el.classList.remove('hidden');
      });
    })
    .catch(() => {
      console.error('Material Symbols Rounded font failed to load.');
    });


});
