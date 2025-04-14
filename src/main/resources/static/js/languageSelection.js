function getStoredOrDefaultLocale() {
  const storedLocale = localStorage.getItem('languageCode');
  return storedLocale || getDetailedLanguageCode();
}

function setLanguageForDropdown(dropdownClass) {
  const storedLocale = getStoredOrDefaultLocale();
  const dropdownItems = document.querySelectorAll(dropdownClass);

  dropdownItems.forEach((item) => {
    item.classList.toggle('active', item.dataset.bsLanguageCode === storedLocale);
    item.removeEventListener('click', handleDropdownItemClick);
    item.addEventListener('click', handleDropdownItemClick);
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
    localStorage.setItem('languageCode', languageCode);
    updateUrlWithLanguage(languageCode);
  } else {
    console.error('Language code is not set for this item.');
  }
}

function checkUserLanguage(defaultLocale) {
  if (
    !localStorage.getItem('languageCode') ||
    document.documentElement.getAttribute('data-language') != defaultLocale
  ) {
    localStorage.setItem('languageCode', defaultLocale);
    updateUrlWithLanguage(defaultLocale);
  }
}

function initLanguageSettings() {
  document.addEventListener('DOMContentLoaded', function () {
    setLanguageForDropdown('.lang_dropdown-item');

    const defaultLocale = getStoredOrDefaultLocale();
    checkUserLanguage(defaultLocale);

    const dropdownItems = document.querySelectorAll('.lang_dropdown-item');
    dropdownItems.forEach((item) => {
      item.classList.toggle('active', item.dataset.bsLanguageCode === defaultLocale);
    });
  });
}

function sortLanguageDropdown() {
  document.addEventListener('DOMContentLoaded', function () {
    const dropdownMenu = document.getElementById('languageSelection');
    if (dropdownMenu) {
      const items = Array.from(dropdownMenu.children).filter((child) => child.querySelector('a'));
      items
        .sort((wrapperA, wrapperB) => {
          const a = wrapperA.querySelector('a');
          const b = wrapperB.querySelector('a');
          return a.dataset.bsLanguageCode.localeCompare(b.dataset.bsLanguageCode);
        })
        .forEach((node) => dropdownMenu.appendChild(node));
    }
  });
}

sortLanguageDropdown();
