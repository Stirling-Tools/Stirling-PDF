
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

          var divElement = item.querySelector("div");
          if (divElement) {
            var originalContent = divElement.cloneNode(true);
            contentWrapper.appendChild(originalContent);
          } else {
            // Fallback: create content manually if div is not found
            var fallbackContent = document.createElement("div");
            fallbackContent.innerHTML = item.innerHTML;
            contentWrapper.appendChild(fallbackContent);
          }

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

document.addEventListener('DOMContentLoaded', function () {
  const searchDropdown = document.getElementById('searchDropdown');
  const searchInput = document.getElementById('navbarSearchInput');

  // Check if elements are missing and skip initialization if necessary
  if (!searchDropdown || !searchInput) {
    console.warn('Search dropdown or input not found. Skipping initialization.');
    return;
  }
  const dropdownMenu = searchDropdown.querySelector('.dropdown-menu');
  if (!dropdownMenu) {
    console.warn('Dropdown menu not found within the search dropdown. Skipping initialization.');
    return;
  }

  // Create a single dropdown instance
  const dropdownInstance = new bootstrap.Dropdown(searchDropdown);

  // Handle click for mobile
  searchDropdown.addEventListener('click', function (e) {
    e.preventDefault();
    const isOpen = dropdownMenu.classList.contains('show');
    // Close all other open dropdowns
    document.querySelectorAll('.navbar-nav .dropdown-menu.show').forEach((menu) => {
      if (menu !== dropdownMenu) {
        const parentDropdown = menu.closest('.dropdown');
        if (parentDropdown) {
          const parentToggle = parentDropdown.querySelector('[data-bs-toggle="dropdown"]');
          if (parentToggle) {
            let instance = bootstrap.Dropdown.getInstance(parentToggle);
            if (!instance) {
              instance = new bootstrap.Dropdown(parentToggle);
            }
            instance.hide();
          }
        }
      }
    });
    if (!isOpen) {
      dropdownInstance.show();
      setTimeout(() => searchInput.focus(), 150);
    } else {
      dropdownInstance.hide();
    }
  });

  // Hide dropdown if it's open and user clicks outside
  document.addEventListener('click', function (e) {
    if (!searchDropdown.contains(e.target) && dropdownMenu.classList.contains('show')) {
      dropdownInstance.hide();
    }
  });

  // Keep dropdown open if search input is clicked
  searchInput.addEventListener('click', function (e) {
    e.stopPropagation();
  });

});
