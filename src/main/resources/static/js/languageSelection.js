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
  if (currentURL.searchParams.get('lang') !== languageCode) {
    currentURL.searchParams.set('lang', languageCode);
    window.location.href = currentURL.toString();
  }
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
  const currentLanguageInDOM = document.documentElement.getAttribute('data-language');
  const currentURL = new URL(window.location.href);
  const langParam = currentURL.searchParams.get('lang');

  if (
    !localStorage.getItem('languageCode') ||
    currentLanguageInDOM !== defaultLocale ||
    langParam !== defaultLocale
  ) {
    localStorage.setItem('languageCode', defaultLocale);

    if (langParam !== defaultLocale) {
      currentURL.searchParams.set('lang', defaultLocale);
      window.location.href = currentURL.toString();
    }
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
