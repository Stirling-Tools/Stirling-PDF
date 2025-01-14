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
  }
}

function updateFavoritesSection() {
  const favoritesContainer = document.getElementById('groupFavorites').querySelector('.feature-group-container');
  favoritesContainer.innerHTML = '';
  const cards = Array.from(document.querySelectorAll('.feature-card:not(.duplicate)'));
  const addedCardIds = new Set();
  let favoritesAmount = 0;

  cards.forEach((card) => {
    if (localStorage.getItem(card.id) === 'favorite' && !addedCardIds.has(card.id)) {
      const duplicate = card.cloneNode(true);
      duplicate.classList.add('duplicate');
      favoritesContainer.appendChild(duplicate);
      addedCardIds.add(card.id);
      favoritesAmount++;
    }
  });

  if (favoritesAmount === 0) {
    document.getElementById('groupFavorites').style.display = 'none';
  } else {
    document.getElementById('groupFavorites').style.display = 'flex';
  }
  reorderCards(favoritesContainer);
  favoritesContainer.style.maxHeight = favoritesContainer.scrollHeight + 'px';
}

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

function syncFavorites() {
  const cards = Array.from(document.querySelectorAll('.dropdown-item'));
  cards.forEach((card) => {
    const isFavorite = localStorage.getItem(card.id) === 'favorite';
    const starIcon = card.querySelector('.favorite-icon span.material-symbols-rounded');
    if (starIcon) {
      if (isFavorite) {
        starIcon.classList.remove('no-fill');
        starIcon.classList.add('fill');
        card.classList.add('favorite');
      } else {
        starIcon.classList.remove('fill');
        starIcon.classList.add('no-fill');
        card.classList.remove('favorite');
      }
    }
  });
  updateFavoritesSection();
  updateFavoritesDropdown();
  filterCards();
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

function reorderAllCards() {
  const containers = Array.from(document.querySelectorAll('.feature-group-container'));
  containers.forEach(function (container) {
    reorderCards(container);
  });
}

function initializeCards() {
  var cards = document.querySelectorAll('.dropdown-item');
  cards.forEach(function (card) {
    var cardId = card.id;
    var span = card.querySelector('.favorite-icon span.material-symbols-rounded');
    if (localStorage.getItem(cardId) === 'favorite') {
      // span.classList.remove('no-fill');
      // span.classList.add('fill');
      // card.classList.add('favorite');
    }
  });
  reorderAllCards();
  updateFavoritesSection();
  updateFavoritesDropdown();
  filterCards();
}

function showFavoritesOnly() {
  const groups = Array.from(document.querySelectorAll('.feature-group'));
  if (localStorage.getItem('favoritesOnly') === 'true') {
    groups.forEach((group) => {
      if (group.id !== 'groupFavorites') {
        group.style.display = 'none';
      }
    });
  } else {
    groups.forEach((group) => {
      if (group.id !== 'groupFavorites') {
        group.style.display = 'flex';
      }
    });
  }
}

function toggleFavoritesOnly() {
  if (localStorage.getItem('favoritesOnly') === 'true') {
    localStorage.setItem('favoritesOnly', 'false');
  } else {
    localStorage.setItem('favoritesOnly', 'true');
  }
  showFavoritesOnly();
}

window.onload = function () {
  initializeCards();
  syncFavorites(); // Ensure everything is in sync on page load
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

  showFavoritesOnly();
});
