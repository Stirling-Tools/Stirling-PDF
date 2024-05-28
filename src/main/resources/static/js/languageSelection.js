document.addEventListener("DOMContentLoaded", function () {
  setLanguageForDropdown(".lang_dropdown-item");

  // Detect the browser's preferred language
  let browserLang = navigator.language || navigator.userLanguage;
  // Convert to a format consistent with your language codes (e.g., en-GB, fr-FR)
  browserLang = browserLang.replace("-", "_");

  // Check if the dropdown contains the browser's language
  const dropdownLangExists = document.querySelector(`.lang_dropdown-item[data-language-code="${browserLang}"]`);

  // Set the default language to browser's language or 'en_GB' if not found in the dropdown
  const defaultLocale = dropdownLangExists ? browserLang : "en_GB";
  const storedLocale = localStorage.getItem("languageCode") || defaultLocale;

  const dropdownItems = document.querySelectorAll(".lang_dropdown-item");

  for (let i = 0; i < dropdownItems.length; i++) {
    const item = dropdownItems[i];
    item.classList.remove("active");
    if (item.dataset.languageCode === storedLocale) {
      item.classList.add("active");
    }
    item.addEventListener("click", handleDropdownItemClick);
  }
});

function setLanguageForDropdown(dropdownClass) {
  const defaultLocale = document.documentElement.getAttribute("data-language") || "en_GB";
  const storedLocale = localStorage.getItem("languageCode") || defaultLocale;
  const dropdownItems = document.querySelectorAll(dropdownClass);

  for (let i = 0; i < dropdownItems.length; i++) {
    const item = dropdownItems[i];
    item.classList.remove("active");
    if (item.dataset.languageCode === storedLocale) {
      item.classList.add("active");
    }
    item.addEventListener("click", handleDropdownItemClick);
  }
}

function handleDropdownItemClick(event) {
  event.preventDefault();
  const languageCode = event.currentTarget.dataset.bsLanguageCode; // change this to event.currentTarget
  if (languageCode) {
    localStorage.setItem("languageCode", languageCode);

    const currentUrl = window.location.href;
    if (currentUrl.indexOf("?lang=") === -1 && currentUrl.indexOf("&lang=") === -1) {
      window.location.href = currentUrl + "?lang=" + languageCode;
    } else if (currentUrl.indexOf("&lang=") !== -1 && currentUrl.indexOf("?lang=") === -1) {
      window.location.href = currentUrl.replace(/&lang=\w{2,}/, "&lang=" + languageCode);
    } else {
      window.location.href = currentUrl.replace(/\?lang=\w{2,}/, "?lang=" + languageCode);
    }
  } else {
    console.error("Language code is not set for this item."); // for debugging
  }
}

document.addEventListener("DOMContentLoaded", function () {

  document.querySelectorAll(".col-lg-2.col-sm-6").forEach((element) => {
      const dropdownItems = element.querySelectorAll(".dropdown-item");
      const items = Array.from(dropdownItems).filter(item => !item.querySelector("hr.dropdown-divider"));

      if (items.length <= 2) {
          if (
              element.previousElementSibling &&
              element.previousElementSibling.classList.contains("col-lg-2") &&
              element.previousElementSibling.classList.contains("nav-item-separator")
          ) {
              element.previousElementSibling.remove();
          }
          element.remove();
      }
  });

  //Sort languages by alphabet
  const list = Array.from(document.querySelector('.dropdown-menu[aria-labelledby="languageDropdown"]').children).filter(
    (child) => child.matches("a"),
  );
  list
    .sort(function (a, b) {
      return a.textContent.toUpperCase().localeCompare(b.textContent.toUpperCase());
    })
    .forEach((node) => document.querySelector('.dropdown-menu[aria-labelledby="languageDropdown"]').appendChild(node));
});
