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

function setupDropdownHovers() {
    const dropdowns = document.querySelectorAll('.navbar-nav > .nav-item.dropdown');

    dropdowns.forEach(dropdown => {
        const toggle = dropdown.querySelector('[data-bs-toggle="dropdown"]');
        if (!toggle) return;

        // Skip search dropdown, it has its own logic
        if (toggle.id === 'searchDropdown') {
            return;
        }

        let timeout;
        const instance = bootstrap.Dropdown.getOrCreateInstance(toggle);

        dropdown.addEventListener('mouseenter', () => {
            if (window.innerWidth >= 1200) {
                clearTimeout(timeout);
                if (!instance._isShown()) {
                    instance.show();
                }
            }
        });

        dropdown.addEventListener('mouseleave', () => {
            if (window.innerWidth >= 1200) {
                timeout = setTimeout(() => {
                    if (instance._isShown()) {
                        instance.hide();
                    }
                }, 200);
            }
        });

        toggle.addEventListener('click', (e) => {
            if (window.innerWidth >= 1200) {
                // On desktop, prevent Bootstrap's default click toggle
                e.preventDefault();
                e.stopPropagation();

                // Still allow navigation if it's a link
                const href = toggle.getAttribute('href');
                if (href && href !== '#') {
                    window.location.href = href;
                }
            }
            // On mobile (< 1200px), this listener does nothing, allowing default click behavior.
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

document.addEventListener('DOMContentLoaded', () => {
  tooltipSetup();
  setupDropdownHovers();
});
