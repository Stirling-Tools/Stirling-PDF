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
