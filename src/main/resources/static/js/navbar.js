function removeElements() {
  document.addEventListener('DOMContentLoaded', function () {
    document.querySelectorAll('.navbar-item').forEach((element) => {
      const dropdownItems = element.querySelectorAll('.dropdown-item');
      const items = Array.from(dropdownItems).filter((item) => !item.querySelector('hr.dropdown-divider'));

      if (items.length == 0) {
        if (
          element.previousElementSibling &&
          element.previousElementSibling.classList.contains('navbar-item') &&
          element.previousElementSibling.classList.contains('nav-item-separator')
        ) {
          element.previousElementSibling.remove();
        }
        element.remove();
      }
    });
  });
}
