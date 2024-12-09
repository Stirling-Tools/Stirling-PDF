
window.onload = function () {
  var items = document.querySelectorAll(".dropdown-item, .nav-link");
  var dummyContainer = document.createElement("div");
  dummyContainer.style.position = "absolute";
  dummyContainer.style.visibility = "hidden";
  dummyContainer.style.whiteSpace = "nowrap"; // Ensure we measure full width
  document.body.appendChild(dummyContainer);

  var maxWidth = 0;

  items.forEach(function (item) {
    var clone = item.cloneNode(true);
    dummyContainer.appendChild(clone);
    var width = clone.offsetWidth;
    if (width > maxWidth) {
      maxWidth = width;
    }
    dummyContainer.removeChild(clone);
  });

  document.body.removeChild(dummyContainer);

  // Store max width for later use
  window.navItemMaxWidth = maxWidth;
};

// Show search results as user types in search box
document.querySelector("#navbarSearchInput").addEventListener("input", function (e) {
  var searchText = e.target.value.trim().toLowerCase(); // Trim whitespace and convert to lowercase
  var items = document.querySelectorAll('a.dropdown-item[data-bs-tags]');
  var resultsBox = document.querySelector("#searchResults");

  // Clear any previous results
  resultsBox.innerHTML = "";
  if (searchText !== "") {
  items.forEach(function (item) {
    var titleElement = item.querySelector(".icon-text");
    var iconElement = item.querySelector(".material-symbols-rounded, .icon");
    var itemHref = item.getAttribute("href");
    var tags = item.getAttribute("data-bs-tags") || ""; // If no tags, default to empty string

      if (titleElement && iconElement && itemHref !== "#") {
        var title = titleElement.innerText;
        if (
          (title.toLowerCase().indexOf(searchText) !== -1 || tags.toLowerCase().indexOf(searchText) !== -1) &&
          !resultsBox.querySelector(`a[href="${itemHref}"]`)
        ) {
          var result = document.createElement("a");
          result.href = itemHref;
          result.classList.add("dropdown-item");

        var resultIcon = document.createElement("span");
        resultIcon.classList.add("material-symbols-rounded");
        resultIcon.textContent = iconElement.textContent;
        result.appendChild(resultIcon);

          var resultText = document.createElement("span");
          resultText.textContent = title;
          resultText.classList.add("icon-text");
          result.appendChild(resultText);

          resultsBox.appendChild(result);
        }
      }
    });
  }

  // Set the width of the search results box to the maximum width
  resultsBox.style.width = window.navItemMaxWidth + "px";
});

const searchDropdown = document.getElementById('searchDropdown');
const searchInput = document.getElementById('navbarSearchInput');
const dropdownMenu = searchDropdown.querySelector('.dropdown-menu');

// Handle dropdown shown event
searchDropdown.addEventListener('shown.bs.dropdown', function () {
    searchInput.focus();
});

// Handle hover opening
searchDropdown.addEventListener('mouseenter', function () {
    const dropdownInstance = new bootstrap.Dropdown(searchDropdown);
    dropdownInstance.show();

    setTimeout(() => {
        searchInput.focus();
    }, 100);
});

// Handle mouse leave
searchDropdown.addEventListener('mouseleave', function () {
    // Check if current value is empty (including if user typed and then deleted)
    if (searchInput.value.trim().length === 0) {
        searchInput.blur();
        const dropdownInstance = new bootstrap.Dropdown(searchDropdown);
        dropdownInstance.hide();
    }
});

searchDropdown.addEventListener('hidden.bs.dropdown', function () {
    if (searchInput.value.trim().length === 0) {
        searchInput.blur();
    }
});
