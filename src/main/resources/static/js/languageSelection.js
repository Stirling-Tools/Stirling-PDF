function getDetailedLanguageCode() {
  const supportedLanguages = [
      "bg_BG", "ar_AR", "ca_CA", "zh_CN", "zh_TW", "da_DK", "de_DE",
      "en_GB", "en_US", "eu_ES", "es_ES", "fr_FR", "id_ID", "ga_IE",
      "it_IT", "nl_NL", "pl_PL", "pt_BR", "pt_PT", "ro_RO", "sk_SK",
      "sv_SE", "tr_TR", "ru_RU", "ko_KR", "ja_JP", "el_GR", "hu_HU",
      "hi_IN", "sr_LATN_RS", "uk_UA", "cs_CZ", "hr_HR", "no_NB", "th_TH",
      "vi_VN"
  ];

  const userLanguages = navigator.languages ? navigator.languages : [navigator.language];
  for (let lang of userLanguages) {
      let matchedLang = supportedLanguages.find(supportedLang => supportedLang.startsWith(lang.replace('-', '_')));
      if (matchedLang) {
          return matchedLang;
      }
  }
  // Fallback
  return "en_GB";
}

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
