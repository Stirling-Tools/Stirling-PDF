function filterCards() {
  var input = document.getElementById("searchBar");
  var filter = input.value.toUpperCase();

  let featureGroups = document.querySelectorAll(".feature-group");
  const collapsedGroups = getCollapsedGroups();

  for (const featureGroup of featureGroups) {
    var cards = featureGroup.querySelectorAll(".feature-card");

    let groupMatchesFilter = false;
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
        groupMatchesFilter = true;
      } else {
        card.style.display = "none";
      }
    }

    if (!groupMatchesFilter) {
      featureGroup.style.display = "none";
    } else {
      featureGroup.style.display = "";
      resetOrTemporarilyExpandGroup(featureGroup, filter, collapsedGroups);
    }
  }
}

function getCollapsedGroups() {
  return localStorage.getItem("collapsedGroups") ? JSON.parse(localStorage.getItem("collapsedGroups")) : [];
}

function resetOrTemporarilyExpandGroup(featureGroup, filterKeywords = "", collapsedGroups = []) {
  const shouldResetCollapse = filterKeywords.trim() === "";
  if (shouldResetCollapse) {
    // Resetting the group's expand/collapse to its original state (as in collapsed groups)
    const isCollapsed = collapsedGroups.indexOf(featureGroup.id) != -1;
    expandCollapseToggle(featureGroup, !isCollapsed);
  } else {
    // Temporarily expands feature group without affecting the actual/stored collapsed groups
    featureGroup.classList.remove("collapsed");
    featureGroup.querySelector(".header-expand-button").classList.remove("collapsed");
  }
}

function updateFavoritesSection() {
  const favoritesContainer = document.getElementById("groupFavorites").querySelector(".feature-group-container");
  favoritesContainer.style.maxHeight = "none";
  favoritesContainer.innerHTML = ""; // Clear the container first
  const cards = Array.from(document.querySelectorAll(".feature-card:not(.duplicate)"));
  const addedCardIds = new Set(); // To keep track of added card IDs
  let favoritesAmount = 0;

  cards.forEach(card => {
    if (localStorage.getItem(card.id) === "favorite" && !addedCardIds.has(card.id)) {
      const duplicate = card.cloneNode(true);
      duplicate.classList.add("duplicate");
      favoritesContainer.appendChild(duplicate);
      addedCardIds.add(card.id); // Mark this card as added
      favoritesAmount++;
    }
  });

  if (favoritesAmount === 0) {
    document.getElementById("groupFavorites").style.display = "none";
  } else {
    document.getElementById("groupFavorites").style.display = "flex";
  }
  reorderCards(favoritesContainer);
  favoritesContainer.style.maxHeight = favoritesContainer.scrollHeight + "px";
}

function toggleFavorite(element) {
  var span = element.querySelector("span.material-symbols-rounded");
  var card = element.closest(".feature-card");
  var cardId = card.id;

  // Prevent the event from bubbling up to parent elements
  event.stopPropagation();

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

  // Use setTimeout to ensure this runs after the current call stack is clear
  setTimeout(() => {
    reorderCards(card.parentNode);
    updateFavoritesSection();
    updateFavoritesDropdown();
    filterCards();
  }, 0);
}

function syncFavorites() {
  const cards = Array.from(document.querySelectorAll(".feature-card"));
  cards.forEach(card => {
    const isFavorite = localStorage.getItem(card.id) === "favorite";
    const starIcon = card.querySelector(".favorite-icon span.material-symbols-rounded");
    if (starIcon) {
      if (isFavorite) {
        starIcon.classList.remove("no-fill");
        starIcon.classList.add("fill");
        card.classList.add("favorite");
      } else {
        starIcon.classList.remove("fill");
        starIcon.classList.add("no-fill");
        card.classList.remove("favorite");
      }
    }
  });
  updateFavoritesSection();
  updateFavoritesDropdown();
  filterCards();
}

function reorderCards(container) {
  var cards = Array.from(container.querySelectorAll(".feature-card"));
  cards.forEach(function (card) {
    container.removeChild(card);
  });
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
    else if (!aIsFavorite && bIsFavorite) {
      return 1;
    }
    else {
      return a.id > b.id;
    }
  });
  cards.forEach(function (card) {
    container.appendChild(card);
  });
}

function reorderAllCards() {
  const containers = Array.from(document.querySelectorAll(".feature-group-container"));
  containers.forEach(function (container) {
    reorderCards(container);
  })
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
  reorderAllCards();
  updateFavoritesSection();
  updateFavoritesDropdown();
  filterCards();
}

function showFavoritesOnly() {
  const groups = Array.from(document.querySelectorAll(".feature-group"));
  if (localStorage.getItem("favoritesOnly") === "true") {
    groups.forEach((group) => {
      if (group.id !== "groupFavorites") {
        group.style.display = "none";
      };
    })
  } else {
    groups.forEach((group) => {
      if (group.id !== "groupFavorites") {
        group.style.display = "flex";
      };
    })
  };
}

function toggleFavoritesOnly() {
  if (localStorage.getItem("favoritesOnly") === "true") {
    localStorage.setItem("favoritesOnly", "false");
  } else {
    localStorage.setItem("favoritesOnly", "true");
  }
  showFavoritesOnly();
}

// Expands a feature group on true, collapses it on false and toggles state on null.
function expandCollapseToggle(group, expand = null) {
  if (expand === null) {
    group.classList.toggle("collapsed");
    group.querySelector(".header-expand-button").classList.toggle("collapsed");
  } else if (expand) {
    group.classList.remove("collapsed");
    group.querySelector(".header-expand-button").classList.remove("collapsed");
  } else {
    group.classList.add("collapsed");
    group.querySelector(".header-expand-button").classList.add("collapsed");
  }

  const collapsed = localStorage.getItem("collapsedGroups") ? JSON.parse(localStorage.getItem("collapsedGroups")) : [];
  const groupIndex = collapsed.indexOf(group.id);

  if (group.classList.contains("collapsed")) {
    if (groupIndex === -1) {
      collapsed.push(group.id);
    }
  } else {
    if (groupIndex !== -1) {
      collapsed.splice(groupIndex, 1);
    }
  }

  localStorage.setItem("collapsedGroups", JSON.stringify(collapsed));
}

function expandCollapseAll(expandAll) {
  const groups = Array.from(document.querySelectorAll(".feature-group"));
  groups.forEach((group) => {
    expandCollapseToggle(group, expandAll);
  })
}

window.onload = function() {
  initializeCards();
  syncFavorites(); // Ensure everything is in sync on page load
};

document.addEventListener("DOMContentLoaded", function () {
  const materialIcons = new FontFaceObserver('Material Symbols Rounded');

  materialIcons.load().then(() => {
    document.querySelectorAll('.feature-card.hidden').forEach(el => {
      el.classList.remove('hidden');
    });
  }).catch(() => {
    console.error('Material Symbols Rounded font failed to load.');
  });

  Array.from(document.querySelectorAll(".feature-group-header")).forEach(header => {
    const parent = header.parentNode;
    const container = header.parentNode.querySelector(".feature-group-container");
    if (parent.id !== "groupFavorites") {
      container.style.maxHeight = container.scrollHeight + "px";
    }
    header.onclick = () => {
      expandCollapseToggle(parent);
    };
  })

  const collapsed = localStorage.getItem("collapsedGroups") ? JSON.parse(localStorage.getItem("collapsedGroups")) : [];
  const groupsArray = Array.from(document.querySelectorAll(".feature-group"));

  groupsArray.forEach(group => {
    if (collapsed.indexOf(group.id) !== -1) {
      expandCollapseToggle(group, false);
    }
  })

  // Necessary in order to not fire the transition animation on page load, which looks wrong.
  // The timeout isn't doing anything visible to the user, so it's not making the page load look slower.
  setTimeout(() => {
    groupsArray.forEach(group => {
      const container = group.querySelector(".feature-group-container");
      container.classList.add("animated-group");
    })
  }, 500);

  showFavoritesOnly();
});
