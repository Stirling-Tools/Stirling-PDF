function getStoredOrDefaultLocale() {
  const storedLocale = localStorage.getItem("languageCode");
  return storedLocale || getDetailedLanguageCode();
}

function setLanguageForDropdown(dropdownClass) {
  const storedLocale = getStoredOrDefaultLocale();
  const dropdownItems = document.querySelectorAll(dropdownClass);

  dropdownItems.forEach(item => {
      item.classList.toggle("active", item.dataset.bsLanguageCode === storedLocale);
      item.removeEventListener("click", handleDropdownItemClick);
      item.addEventListener("click", handleDropdownItemClick);
  });
}

function updateUrlWithLanguage(languageCode) {
  const currentURL = new URL(window.location.href);
  currentURL.searchParams.set('lang', languageCode);
  window.location.href = currentURL.toString();
}

function handleDropdownItemClick(event) {
  event.preventDefault();
  const languageCode = event.currentTarget.dataset.bsLanguageCode;
  if (languageCode) {
      localStorage.setItem("languageCode", languageCode);
      updateUrlWithLanguage(languageCode);
  } else {
      console.error("Language code is not set for this item.");
  }
}

function checkUserLanguage(defaultLocale) {
  if (!localStorage.getItem("languageCode") || document.documentElement.getAttribute("data-language") != defaultLocale) {
      localStorage.setItem("languageCode", defaultLocale);
      updateUrlWithLanguage(defaultLocale);
  }
}

function initLanguageSettings() {
  document.addEventListener("DOMContentLoaded", function () {
      setLanguageForDropdown(".lang_dropdown-item");

      const defaultLocale = getStoredOrDefaultLocale();
      checkUserLanguage(defaultLocale);

      const dropdownItems = document.querySelectorAll(".lang_dropdown-item");
      dropdownItems.forEach(item => {
          item.classList.toggle("active", item.dataset.bsLanguageCode === defaultLocale);
      });
  });
}

function removeElements() {
  document.addEventListener("DOMContentLoaded", function () {
      document.querySelectorAll(".navbar-item").forEach((element) => {
          const dropdownItems = element.querySelectorAll(".dropdown-item");
          const items = Array.from(dropdownItems).filter(item => !item.querySelector("hr.dropdown-divider"));

          if (items.length <= 2) {
              if (
                  element.previousElementSibling &&
                  element.previousElementSibling.classList.contains("navbar-item") &&
                  element.previousElementSibling.classList.contains("nav-item-separator")
              ) {
                  element.previousElementSibling.remove();
              }
              element.remove();
          }
      });
  });
}

function sortLanguageDropdown() {
  document.addEventListener("DOMContentLoaded", function () {
      const dropdownMenu = document.querySelector('.dropdown-menu .dropdown-item.lang_dropdown-item').parentElement;
      if (dropdownMenu) {
        const items = Array.from(dropdownMenu.children).filter(child => child.matches('a'));
        items.sort((a, b) => a.dataset.bsLanguageCode.localeCompare(b.dataset.bsLanguageCode))
          .forEach(node => dropdownMenu.appendChild(node));
      }
  });
}

sortLanguageDropdown();
