/*<![CDATA[*/

document.addEventListener('DOMContentLoaded', function () {
  if (window.analyticsPromptBoolean) {
    const analyticsModal = new bootstrap.Modal(document.getElementById('analyticsModal'));
    analyticsModal.show();

    let retryCount = 0;
function hideCookieBanner() {
  const cookieBanner = document.querySelector('#cc-main');
  if (cookieBanner && cookieBanner.offsetHeight > 0) {
    cookieBanner.style.display = "none";
  } else if (retryCount < 20) {
    retryCount++;
    setTimeout(hideCookieBanner, 100);
  }
}
hideCookieBanner();
  }
});
/*]]>*/function setAnalytics(enabled) {
  fetchWithCsrf('api/v1/settings/update-enable-analytics', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(enabled),
  })
    .then((response) => {
      if (response.status === 200) {
        console.log('Analytics setting updated successfully');
        bootstrap.Modal.getInstance(document.getElementById('analyticsModal')).hide();

        if (typeof CookieConsent !== "undefined") {
          if (enabled) {
            CookieConsent.acceptCategory(['analytics']);
          } else {
            CookieConsent.acceptCategory([]);
          }
        }

      } else if (response.status === 208) {
        console.log('Analytics setting has already been set. Please edit /config/settings.yml to change it.', response);
        alert('Analytics setting has already been set. Please edit /config/settings.yml to change it.');
      } else {
        throw new Error('Unexpected response status: ' + response.status);
      }
    })
    .catch((error) => {
      console.error('Error updating analytics setting:', error);
      alert('An error occurred while updating the analytics setting. Please try again.');
    });
}

updateFavoriteIcons();
const contentPath = /*[[${@contextPath}]]*/ '';


document.addEventListener('DOMContentLoaded', function () {
  const surveyVersion = '3.0';
  const modal = new bootstrap.Modal(document.getElementById('surveyModal'));
  const dontShowAgain = document.getElementById('dontShowAgain');
  const takeSurveyButton = document.getElementById('takeSurvey');

  const viewThresholds = [5, 10, 15, 22, 30, 50, 75, 100, 150, 200];

  // Check if survey version changed and reset page views if it did
  const storedVersion = localStorage.getItem('surveyVersion');
  if (storedVersion && storedVersion !== surveyVersion) {
    localStorage.setItem('pageViews', '0');
    localStorage.setItem('surveyVersion', surveyVersion);
  }

  let pageViews = parseInt(localStorage.getItem('pageViews') || '0');

  pageViews++;
  localStorage.setItem('pageViews', pageViews.toString());

  function shouldShowSurvey() {
    if(!window.showSurvey) {
      return false;
    }

    if (localStorage.getItem('dontShowSurvey') === 'true' || localStorage.getItem('surveyTaken') === 'true') {
      return false;
    }

    // If survey version changed and we hit a threshold, show the survey
    if (localStorage.getItem('surveyVersion') !== surveyVersion && viewThresholds.includes(pageViews)) {
      return true;
    }

    return viewThresholds.includes(pageViews);
  }

  if (shouldShowSurvey()) {
    modal.show();
  }

  dontShowAgain.addEventListener('change', function () {
    if (this.checked) {
      localStorage.setItem('dontShowSurvey', 'true');
      localStorage.setItem('surveyVersion', surveyVersion);
    } else {
      localStorage.removeItem('dontShowSurvey');
      localStorage.removeItem('surveyVersion');
    }
  });
if (takeSurveyButton) {
  takeSurveyButton.addEventListener('click', function () {
    localStorage.setItem('surveyTaken', 'true');
    localStorage.setItem('surveyVersion', surveyVersion);
    modal.hide();
  });
}
  if (localStorage.getItem('dontShowSurvey')) {
    modal.hide();
  }

  if (window.location.pathname === '/') {
    const navItem = document.getElementById('navItemToHide');
    if (navItem) {
      navItem.style.display = 'none';
    }
  }
  updateFavoritesDropdown();
});
function setAsDefault(value) {
  localStorage.setItem('defaultView', value);
  console.log(`Default view set to: ${value}`);
}

function adjustVisibleElements() {
  const container = document.querySelector('.recent-features');
  if(!container) return;
  const subElements = Array.from(container.children);

  let totalWidth = 0;

  subElements.forEach((element) => {
    totalWidth += 12 * parseFloat(getComputedStyle(document.documentElement).fontSize);

    if (totalWidth > window.innerWidth) {
      element.style.display = 'none';
    } else {
      element.style.display = 'block';
    }
  });
}

function adjustContainerAlignment() {
  document.querySelectorAll('.features-container').forEach((parent) => {
    parent.querySelectorAll('.feature-rows').forEach((container) => {
      const containerWidth = parent.offsetWidth;
      if (containerWidth < 32 * parseFloat(getComputedStyle(document.documentElement).fontSize)) {
        container.classList.add('single-column');
      } else {
        container.classList.remove('single-column');
      }
    });
  });
}
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
      document.querySelectorAll('#convertGroup').forEach((element) => element.remove());
      document.querySelectorAll('#groupConvertTo').forEach((element) => (element.style.display = 'flex'));
      document.querySelectorAll('#groupConvertFrom').forEach((element) => (element.style.display = 'flex'));
    } else {
      document.querySelectorAll('#convertGroup').forEach((element) => (element.style.display = 'flex'));
      document.querySelectorAll('#groupConvertTo').forEach((element) => element.remove());
      document.querySelectorAll('#groupConvertFrom').forEach((element) => element.remove());
    }
  }
}
document.addEventListener('DOMContentLoaded', function () {
  toolsManager();
});

window.addEventListener('load', () => {
  adjustContainerAlignment();
  adjustVisibleElements();
});
window.addEventListener('resize', () => {
  adjustContainerAlignment();
  adjustVisibleElements();
});
