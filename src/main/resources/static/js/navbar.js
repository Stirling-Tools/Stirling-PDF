function toolsManager() {
  document.addEventListener('DOMContentLoaded', function () {
    const stackedContainer = document.getElementById('stacked');

    if (stackedContainer) {
      const convertToPDF = stackedContainer.querySelector('.navbar-item:first-child');
      const convertFromPDF = stackedContainer.querySelector('.navbar-item:nth-child(2)');

      if (convertToPDF && convertFromPDF) {
        const dropdownItemsTo = convertToPDF.querySelectorAll('.dropdown-item');
        const dropdownItemsFrom = convertFromPDF.querySelectorAll('.dropdown-item');

        const itemsTo = Array.from(dropdownItemsTo).filter((item) => !item.querySelector('hr.dropdown-divider'));
        const itemsFrom = Array.from(dropdownItemsFrom).filter((item) => !item.querySelector('hr.dropdown-divider'));

        const totalItems = itemsTo.length + itemsFrom.length;

        if (totalItems > 12) {
          stackedContainer.style.flexDirection = 'row';
          stackedContainer.classList.remove('col-lg-2');
          stackedContainer.classList.add('col-lg-4');
          convertToPDF.style.flex = '1 1 50%';
          convertFromPDF.style.flex = '1 1 50%';
        }
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
  });
}
