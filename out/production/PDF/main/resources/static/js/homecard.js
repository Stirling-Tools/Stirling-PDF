function filterCards() {
  var input = document.getElementById("searchBar");
  var filter = input.value.toUpperCase();
  var cards = document.querySelectorAll(".feature-card");

  for (var i = 0; i < cards.length; i++) {
    var card = cards[i];
    var title = card.querySelector("h5.card-title").innerText;
    var text = card.querySelector("p.card-text").innerText;

    // Get the navbar tags associated with the card
    var navbarItem = document.querySelector(`a.dropdown-item[href="${card.id}"]`);
    var navbarTags = navbarItem ? navbarItem.getAttribute("data-bs-tags") : "";

    var content = title + " " + text + " " + navbarTags;

    if (content.toUpperCase().indexOf(filter) > -1) {
      card.style.display = "";
    } else {
      card.style.display = "none";
    }
  }
}

function toggleFavorite(element) {
  var span = element.querySelector("span.material-symbols-rounded");
  var card = element.closest(".feature-card");
  var cardId = card.id;
  if (span.classList.contains("no-fill")) {
    span.classList.remove("no-fill");
    span.classList.add("fill");
    card.classList.add("favorite");
    localStorage.setItem(cardId, "favorite");
  } else {
    span.classList.remove("fill");
    span.classList.add("no-fill");
    card.classList.remove("favorite");
    localStorage.removeItem(cardId);
  }
  reorderCards();
  updateFavoritesDropdown();
  filterCards();
}


function reorderCards() {
  var container = document.querySelector(".features-container");
  var cards = Array.from(container.getElementsByClassName("feature-card"));
  cards.sort(function (a, b) {
    var aIsFavorite = localStorage.getItem(a.id) === "favorite";
    var bIsFavorite = localStorage.getItem(b.id) === "favorite";
    if (a.id === "update-link") {
      return -1;
    }
    if (b.id === "update-link") {
      return 1;
    }
    if (aIsFavorite && !bIsFavorite) {
      return -1;
    }
    if (!aIsFavorite && bIsFavorite) {
      return 1;
    }
    return 0;
  });
  cards.forEach(function (card) {
    container.appendChild(card);
  });
}

function initializeCards() {
  var cards = document.querySelectorAll(".feature-card");
  cards.forEach(function (card) {
    var cardId = card.id;
    var span = card.querySelector(".favorite-icon span.material-symbols-rounded");
    if (localStorage.getItem(cardId) === "favorite") {
      span.classList.remove("no-fill");
      span.classList.add("fill");
      card.classList.add("favorite");
    }
  });
  reorderCards();
  updateFavoritesDropdown();
  filterCards();
}

window.onload = initializeCards;

  document.addEventListener("DOMContentLoaded", function() {
    const materialIcons = new FontFaceObserver('Material Symbols Rounded');
    
    materialIcons.load().then(() => {
      document.querySelectorAll('.feature-card.hidden').forEach(el => {
        el.classList.remove('hidden');
      });
    }).catch(() => {
      console.error('Material Symbols Rounded font failed to load.');
    });
  });
