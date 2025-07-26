function toolsManager() {
  const convertToPDF = document.querySelector('#groupConvertTo');
  const convertFromPDF = document.querySelector('#groupConvertFrom');

  if (convertToPDF && convertFromPDF) {
    const itemsTo = Array.from(convertToPDF.querySelectorAll('.dropdown-item')).filter(
      (item) => !item.querySelector('hr.dropdown-divider')
    );
    const itemsFrom = Array.from(convertFromPDF.querySelectorAll('.dropdown-item')).filter(
      (item) => !item.querySelector('hr.dropdown-divider')
    );

    const totalItems = itemsTo.length + itemsFrom.length;

    if (totalItems > 12) {
      document.querySelectorAll('#convertGroup').forEach((element) => (element.style.display = 'none'));
      document.querySelectorAll('#groupConvertTo').forEach((element) => (element.style.display = 'flex'));
      document.querySelectorAll('#groupConvertFrom').forEach((element) => (element.style.display = 'flex'));
    } else {
      document.querySelectorAll('#convertGroup').forEach((element) => (element.style.display = 'flex'));
      document.querySelectorAll('#groupConvertTo').forEach((element) => (element.style.display = 'none'));
      document.querySelectorAll('#groupConvertFrom').forEach((element) => (element.style.display = 'none'));
    }
  }

  document.querySelectorAll('.navbar-item').forEach((element) => {
    if (!element.closest('#stacked')) {
      const dropdownItems = element.querySelectorAll('.dropdown-item');
      const items = Array.from(dropdownItems).filter((item) => !item.querySelector('hr.dropdown-divider'));

      if (items.length === 0) {
        if (
          element.previousElementSibling &&
          element.previousElementSibling.classList.contains('navbar-item') &&
          element.previousElementSibling.classList.contains('nav-item-separator')
        ) {
          element.previousElementSibling.remove();
        }
        element.remove();
      }
    }
  });
}

function setupDropdowns() {
  const dropdowns = document.querySelectorAll('.navbar-nav > .nav-item.dropdown');

  dropdowns.forEach((dropdown) => {
    const toggle = dropdown.querySelector('[data-bs-toggle="dropdown"]');
    if (!toggle) return;

    // Skip search dropdown, it has its own logic
    if (toggle.id === 'searchDropdown') {
      return;
    }

    dropdown.addEventListener('show.bs.dropdown', () => {
      // Find all other open dropdowns and hide them
      const openDropdowns = document.querySelectorAll('.navbar-nav .dropdown-menu.show');
      openDropdowns.forEach((menu) => {
        const parentDropdown = menu.closest('.dropdown');
        if (parentDropdown && parentDropdown !== dropdown) {
          const parentToggle = parentDropdown.querySelector('[data-bs-toggle="dropdown"]');
          if (parentToggle) {
            // Get or create Bootstrap dropdown instance
            let instance = bootstrap.Dropdown.getInstance(parentToggle);
            if (!instance) {
              instance = new bootstrap.Dropdown(parentToggle);
            }
            instance.hide();
          }
        }
      });
    });
  });
}

window.tooltipSetup = () => {
  const tooltipElements = document.querySelectorAll('[title]');

  tooltipElements.forEach((element) => {
    const tooltipText = element.getAttribute('title');
    element.removeAttribute('title');
    element.setAttribute('data-title', tooltipText);
    const customTooltip = document.createElement('div');
    customTooltip.className = 'btn-tooltip';
    customTooltip.textContent = tooltipText;

    document.body.appendChild(customTooltip);

    element.addEventListener('mouseenter', (event) => {
      if (window.innerWidth >= 1200) {
        customTooltip.style.display = 'block';
        customTooltip.style.left = `${event.pageX + 10}px`;
        customTooltip.style.top = `${event.pageY + 10}px`;
      }
    });

    element.addEventListener('mousemove', (event) => {
      if (window.innerWidth >= 1200) {
        customTooltip.style.left = `${event.pageX + 10}px`;
        customTooltip.style.top = `${event.pageY + 10}px`;
      }
    });

    element.addEventListener('mouseleave', () => {
      customTooltip.style.display = 'none';
    });
  });
};

// Override the bootstrap dropdown styles for mobile
function fixNavbarDropdownStyles() {
  if (window.innerWidth < 1200) {
    document.querySelectorAll('.navbar .dropdown-menu').forEach(function(menu) {
      menu.style.transform = 'none';
      menu.style.transformOrigin = 'none';
      menu.style.left = '0';
      menu.style.right = '0';
      menu.style.maxWidth = '95vw';
      menu.style.width = '100vw';
      menu.style.marginBottom = '0';
    });
  } else {
    document.querySelectorAll('.navbar .dropdown-menu').forEach(function(menu) {
      menu.style.transform = '';
      menu.style.transformOrigin = '';
      menu.style.left = '';
      menu.style.right = '';
      menu.style.maxWidth = '';
      menu.style.width = '';
      menu.style.marginBottom = '';
    });
  }
}

document.addEventListener('DOMContentLoaded', () => {
  tooltipSetup();
  setupDropdowns();
  fixNavbarDropdownStyles();
  // Setup logout button functionality
  const logoutButton = document.querySelector('a[href="/logout"]');
  if (logoutButton) {
    logoutButton.addEventListener('click', function(event) {
      event.preventDefault();
      if (window.JWTManager) {
        window.JWTManager.logout();
      } else {
        // Fallback if JWTManager is not available
        window.location.href = '/logout';
      }
    });
  }

});
window.addEventListener('resize', fixNavbarDropdownStyles);
