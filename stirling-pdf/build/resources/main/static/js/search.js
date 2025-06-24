
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

document.querySelector("#navbarSearchInput").addEventListener("input", function (e) {
  var searchText = e.target.value.trim().toLowerCase();
  var items = document.querySelectorAll("a.dropdown-item[data-bs-tags]");
  var resultsBox = document.querySelector("#searchResults");

  resultsBox.innerHTML = "";

  if (searchText !== "") {
    var addedResults = new Set();

    items.forEach(function (item) {
      var titleElement = item.querySelector(".icon-text");
      var iconElement = item.querySelector(".material-symbols-rounded, .icon");
      var itemHref = item.getAttribute("href");
      var tags = item.getAttribute("data-bs-tags") || "";

      if (titleElement && iconElement && itemHref !== "#") {
        var title = titleElement.innerText.trim();

        if (
          (title.toLowerCase().includes(searchText) || tags.toLowerCase().includes(searchText)) &&
          !addedResults.has(itemHref)
        ) {
          var dropdownItem = document.createElement("div");
          dropdownItem.className = "dropdown-item d-flex justify-content-between align-items-center";

          var contentWrapper = document.createElement("div");
          contentWrapper.className = "d-flex align-items-center flex-grow-1";
          contentWrapper.style.textDecoration = "none";
          contentWrapper.style.color = "inherit";

          var originalContent = item.querySelector("div").cloneNode(true);
          contentWrapper.appendChild(originalContent);

          contentWrapper.onclick = function () {
            window.location.href = itemHref;
          };

          dropdownItem.appendChild(contentWrapper);
          resultsBox.appendChild(dropdownItem);
          addedResults.add(itemHref);
        }
      }
    });
  }

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
