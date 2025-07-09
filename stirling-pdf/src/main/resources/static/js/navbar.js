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

function initializeChevrons() {
  // Find all nav items that have nested content (Tools, Favorites, etc.)
  document.querySelectorAll('.nav-item').forEach(item => {
    const nestedContent = item.querySelector('ul, .dropdown-content');
    if (nestedContent) {
      // Add has-dropdown class to parent
      item.classList.add('has-dropdown');

      // Add chevron if it doesn't exist
      const link = item.querySelector('a');
      if (link && !item.querySelector('.sidebar-chevron')) {
        const chevron = document.createElement('i');
        chevron.className = 'bi bi-chevron-down sidebar-chevron';
        link.appendChild(chevron);
      }

      // Toggle chevron and content on click
      const chevron = item.querySelector('.sidebar-chevron');
      if (chevron) {
        item.addEventListener('click', (e) => {
          const isExpanded = nestedContent.classList.contains('show');
          chevron.classList.toggle('expanded', !isExpanded);
          // The actual toggling of the content should be handled by your existing dropdown logic
        });
      }
    }
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
      customTooltip.style.display = 'block';
      customTooltip.style.left = `${event.pageX + 10}px`; // Position tooltip slightly away from the cursor
      customTooltip.style.top = `${event.pageY + 10}px`;
    });

    // Update the position of the tooltip as the user moves the mouse
    element.addEventListener('mousemove', (event) => {
      customTooltip.style.left = `${event.pageX + 10}px`;
      customTooltip.style.top = `${event.pageY + 10}px`;
    });

    // Hide the tooltip when the mouse leaves
    element.addEventListener('mouseleave', () => {
      customTooltip.style.display = 'none';
    });
  });
};
document.addEventListener('DOMContentLoaded', () => {
  tooltipSetup();
  initializeChevrons();
});
