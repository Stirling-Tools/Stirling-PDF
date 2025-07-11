
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


const searchDropdown = document.getElementById('searchDropdown');
const searchInput = document.getElementById('navbarSearchInput');

// Check if elements exist before proceeding
if (searchDropdown && searchInput) {
    const dropdownMenu = searchDropdown.querySelector('.dropdown-menu');

    // Create a single dropdown instance
    const dropdownInstance = new bootstrap.Dropdown(searchDropdown);

// Function to handle showing the dropdown
function showSearchDropdown() {
    const dropdownMenu = searchDropdown.querySelector('.dropdown-menu');
    if (!dropdownMenu || !dropdownMenu.classList.contains('show')) {
        dropdownInstance.show();
    }
    setTimeout(() => searchInput.focus(), 150); // Focus after animation
}

// Handle click for mobile
searchDropdown.addEventListener('click', function (e) {
    if (window.innerWidth < 1200) {
        // Let Bootstrap's default toggling handle it, but ensure focus
        const dropdownMenu = searchDropdown.querySelector('.dropdown-menu');
        if (!dropdownMenu || !dropdownMenu.classList.contains('show')) {
            // Use a small delay to allow the dropdown to open before focusing
            setTimeout(() => searchInput.focus(), 150);
        }
    } else {
        // On desktop, hover opens the dropdown, so a click shouldn't toggle it.
        e.preventDefault();
    }
});

// Handle hover for desktop
searchDropdown.addEventListener('mouseenter', function () {
    if (window.innerWidth >= 1200) {
        showSearchDropdown();
    }
});

// Handle mouse leave for desktop
searchDropdown.addEventListener('mouseleave', function (e) {
    if (window.innerWidth >= 1200) {
        // A short delay to allow moving mouse from button to menu
        setTimeout(() => {
            const dropdownMenu = searchDropdown.querySelector('.dropdown-menu');
            if (!dropdownMenu) return;

            // Check if either the button or the menu is still hovered
            const isHoveringButton = searchDropdown.matches(':hover');
            const isHoveringMenu = dropdownMenu.matches(':hover');

            if (!isHoveringButton && !isHoveringMenu && searchInput.value.trim().length === 0) {
                dropdownInstance.hide();
            }
        }, 200);
    }
});

// Hide dropdown if it's open and user clicks outside
document.addEventListener('click', function(e) {
    const dropdownMenu = searchDropdown.querySelector('.dropdown-menu');
    if (!searchDropdown.contains(e.target) && dropdownMenu && dropdownMenu.classList.contains('show')) {
        if (searchInput.value.trim().length === 0) {
             dropdownInstance.hide();
        }
    }
});

// Keep dropdown open if search input is clicked
searchInput.addEventListener('click', function (e) {
    e.stopPropagation();
});

} // End of if (searchDropdown && searchInput) block
