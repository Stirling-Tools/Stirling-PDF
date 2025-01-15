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
      var navbarTags = navbarItem ? navbarTags + ',' + navbarItem.getAttribute('data-bs-title') : '';

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
    updateFavoritesView();
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
  });

  if (favoritesAmount === 0 || !isFavoritesView) {
    document.getElementById('groupFavorites').style.display = 'none';
  } else {
    document.getElementById('groupFavorites').style.display = 'flex';
  }
  reorderCards(favoritesContainer);
  favoritesContainer.style.maxHeight = favoritesContainer.scrollHeight + 'px';

  function toggleFavorite(element) {
    var span = element.querySelector('span.material-symbols-rounded');
    var card = element.closest('.dropdown-item');
    var cardId = card.id;

    // Prevent the event from bubbling up to parent elements
    event.stopPropagation();

    if (span.classList.contains('no-fill')) {
      span.classList.remove('no-fill');
      span.classList.add('fill');
      card.classList.add('favorite');
      localStorage.setItem(cardId, 'favorite');
    } else {
      span.classList.remove('fill');
      span.classList.add('no-fill');
      card.classList.remove('favorite');
      localStorage.removeItem(cardId);
    }

    // Use setTimeout to ensure this runs after the current call stack is clear
    setTimeout(() => {
      reorderCards(card.parentNode);
      updateFavoritesSection();
      updateFavoritesDropdown();
      filterCards();
    }, 0);
  }
}

function reorderCards(container) {
  var cards = Array.from(container.querySelectorAll('.dropdown-item'));
  cards.forEach(function (card) {
    container.removeChild(card);
  });
  cards.sort(function (a, b) {
    var aIsFavorite = localStorage.getItem(a.id) === 'favorite';
    var bIsFavorite = localStorage.getItem(b.id) === 'favorite';
    if (a.id === 'update-link') {
      return -1;
    }
    if (b.id === 'update-link') {
      return 1;
    }

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
  updateFavoritesDropdown();
  filterCards();
}

function updateFavoritesView() {
  const isFavoritesView = JSON.parse(localStorage.getItem('favoritesView') || 'false');
  const textElement = document.getElementById('toggle-favourites-text');
  const iconElement = document.getElementById('toggle-favourites-icon');
  const favoritesGroup = document.querySelector('#groupFavorites');

  if (isFavoritesView) {
    textElement.textContent = /*[[#{home.hideFavorites}]]*/ 'Hide Favourites';
    iconElement.textContent = 'visibility_off';
    favoritesGroup.style.display = 'flex';
  } else {
    textElement.textContent = /*[[#{home.showFavorites}]]*/ 'Show Favourites';
    iconElement.textContent = 'visibility';
    favoritesGroup.style.display = 'none';
  }
}

function toggleFavoritesMode() {
  favoritesMode = !document.querySelector('.toggle-favourites').classList.contains('active');
  document.querySelector('.toggle-favourites').classList.toggle('active', favoritesMode);
  document.querySelectorAll('.favorite-icon').forEach((icon) => {
    icon.style.display = favoritesMode ? 'inline-block' : 'none';
  });
  document.querySelectorAll('.dropdown-item').forEach((link) => {
    if (favoritesMode) {
      link.dataset.originalHref = link.getAttribute('href'); // Save original href
      link.setAttribute('href', '#');
      link.classList.add('no-hover');
    } else {
      link.setAttribute('href', link.dataset.originalHref);
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

document.addEventListener('DOMContentLoaded', function () {
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

  Array.from(document.querySelectorAll('.feature-group-header')).forEach((header) => {
    const parent = header.parentNode;
    header.onclick = () => {
      expandCollapseToggle(parent);
    };
  });
});
