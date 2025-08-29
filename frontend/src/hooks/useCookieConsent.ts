import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

declare global {
  interface Window {
    CookieConsent: {
      run: (config: any) => void;
      show: (show?: boolean) => void;
    };
  }
}

interface CookieConsentConfig {
  analyticsEnabled?: boolean;
}

export const useCookieConsent = ({ analyticsEnabled = false }: CookieConsentConfig = {}) => {
  const { t } = useTranslation();
  const [isInitialized, setIsInitialized] = useState(false);

  useEffect(() => {
    if (!analyticsEnabled) {
      console.log('Cookie consent not enabled - analyticsEnabled is false');
      return;
    }

    // Prevent double initialization
    if (window.CookieConsent) {
      setIsInitialized(true);
      // Force show the modal if it exists but isn't visible
      setTimeout(() => {
        window.CookieConsent.show();
      }, 100);
      return;
    }

    // Load the cookie consent CSS files first
    const mainCSS = document.createElement('link');
    mainCSS.rel = 'stylesheet';
    mainCSS.href = '/css/cookieconsent.css';
    document.head.appendChild(mainCSS);

    const customCSS = document.createElement('link');
    customCSS.rel = 'stylesheet';
    customCSS.href = '/css/cookieconsentCustomisation.css';
    document.head.appendChild(customCSS);

    // Load the cookie consent library
    const script = document.createElement('script');
    script.src = '/js/thirdParty/cookieconsent.umd.js';
    script.onload = () => {
      // Small delay to ensure DOM is ready
      setTimeout(() => {

        // Detect current theme and set appropriate mode
        const detectTheme = () => {
          const mantineScheme = document.documentElement.getAttribute('data-mantine-color-scheme');
          const hasLightClass = document.documentElement.classList.contains('light');
          const hasDarkClass = document.documentElement.classList.contains('dark');
          const systemPrefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;

          // Priority: Mantine attribute > CSS classes > system preference
          let isDarkMode = false;

          if (mantineScheme) {
            isDarkMode = mantineScheme === 'dark';
          } else if (hasLightClass) {
            isDarkMode = false;
          } else if (hasDarkClass) {
            isDarkMode = true;
          } else {
            isDarkMode = systemPrefersDark;
          }

          // Always explicitly set or remove the class
          document.documentElement.classList.toggle('cc--darkmode', isDarkMode);

          return isDarkMode;
        };

        // Initial theme detection with slight delay to ensure DOM is ready
        setTimeout(() => {
          detectTheme();
        }, 50);

        // Check if CookieConsent is available
        if (!window.CookieConsent) {
          console.error('CookieConsent is not available on window object');
          return;
        }

        // Listen for theme changes
        const themeObserver = new MutationObserver((mutations) => {
          mutations.forEach((mutation) => {
            if (mutation.type === 'attributes' &&
                (mutation.attributeName === 'data-mantine-color-scheme' ||
                 mutation.attributeName === 'class')) {
              detectTheme();
            }
          });
        });

        themeObserver.observe(document.documentElement, {
          attributes: true,
          attributeFilter: ['data-mantine-color-scheme', 'class']
        });


        // Initialize cookie consent with full configuration
        try {
          window.CookieConsent.run({
            autoShow: true,
            hideFromBots: false,
            guiOptions: {
              consentModal: {
                layout: "bar",
                position: "bottom",
                equalWeightButtons: true,
                flipButtons: true
              },
              preferencesModal: {
                layout: "box",
                position: "right",
                equalWeightButtons: true,
                flipButtons: true
              }
            },
            categories: {
              necessary: {
                readOnly: true
              },
              analytics: {}
            },
            language: {
              default: "en",
              translations: {
                en: {
                  consentModal: {
                    title: t('cookieBanner.popUp.title', 'How we use Cookies'),
                    description: t('cookieBanner.popUp.description.1', 'We use cookies and other technologies to make Stirling PDF work better for you—helping us improve our tools and keep building features you\'ll love.') +
                               "<br>" +
                               t('cookieBanner.popUp.description.2', 'If you\'d rather not, clicking \'No Thanks\' will only enable the essential cookies needed to keep things running smoothly.'),
                    acceptAllBtn: t('cookieBanner.popUp.acceptAllBtn', 'Okay'),
                    acceptNecessaryBtn: t('cookieBanner.popUp.acceptNecessaryBtn', 'No Thanks'),
                    showPreferencesBtn: t('cookieBanner.popUp.showPreferencesBtn', 'Manage preferences'),
                  },
                  preferencesModal: {
                    title: t('cookieBanner.preferencesModal.title', 'Consent Preferences Center'),
                    acceptAllBtn: t('cookieBanner.preferencesModal.acceptAllBtn', 'Accept all'),
                    acceptNecessaryBtn: t('cookieBanner.preferencesModal.acceptNecessaryBtn', 'Reject all'),
                    savePreferencesBtn: t('cookieBanner.preferencesModal.savePreferencesBtn', 'Save preferences'),
                    closeIconLabel: t('cookieBanner.preferencesModal.closeIconLabel', 'Close modal'),
                    serviceCounterLabel: t('cookieBanner.preferencesModal.serviceCounterLabel', 'Service|Services'),
                    sections: [
                      {
                        title: t('cookieBanner.preferencesModal.subtitle', 'Cookie Usage'),
                        description: t('cookieBanner.preferencesModal.description.1', 'Stirling PDF uses cookies and similar technologies to enhance your experience and understand how our tools are used. This helps us improve performance, develop the features you care about, and provide ongoing support to our users.') +
                                   "<br><br>" +
                                   t('cookieBanner.preferencesModal.description.2', 'Stirling PDF cannot—and will never—track or access the content of the documents you use.') +
                                   "<b> " +
                                   t('cookieBanner.preferencesModal.description.3', 'Your privacy and trust are at the core of what we do.') +
                                   "</b>"
                      },
                      {
                        title: t('cookieBanner.preferencesModal.necessary.title.1', 'Strictly Necessary Cookies') +
                               "<span class=\"pm__badge\">" +
                               t('cookieBanner.preferencesModal.necessary.title.2', 'Always Enabled') +
                               "</span>",
                        description: t('cookieBanner.preferencesModal.necessary.description', 'These cookies are essential for the website to function properly. They enable core features like setting your privacy preferences, logging in, and filling out forms—which is why they can\'t be turned off.'),
                        linkedCategory: "necessary"
                      },
                      {
                        title: t('cookieBanner.preferencesModal.analytics.title', 'Analytics'),
                        description: t('cookieBanner.preferencesModal.analytics.description', 'These cookies help us understand how our tools are being used, so we can focus on building the features our community values most. Rest assured—Stirling PDF cannot and will never track the content of the documents you work with.'),
                        linkedCategory: "analytics"
                      }
                    ]
                  }
                }
              }
            }
          });

          // Force show after initialization
          setTimeout(() => {
            window.CookieConsent.show();

            // Debug: Check if modal elements exist
            const ccMain = document.getElementById('cc-main');
            const consentModal = document.querySelector('.cm-wrapper');

          }, 200);

        } catch (error) {
          console.error('Error initializing CookieConsent:', error);
        }
      setIsInitialized(true);
      }, 100); // Small delay to ensure DOM is ready
    };

    script.onerror = () => {
      console.error('Failed to load cookie consent library');
    };

    document.head.appendChild(script);

    return () => {
      // Cleanup script and CSS when component unmounts
      if (document.head.contains(script)) {
        document.head.removeChild(script);
      }
      if (document.head.contains(mainCSS)) {
        document.head.removeChild(mainCSS);
      }
      if (document.head.contains(customCSS)) {
        document.head.removeChild(customCSS);
      }
    };
  }, [analyticsEnabled, t]);

  const showCookiePreferences = () => {
    if (isInitialized && window.CookieConsent) {
      window.CookieConsent.show(true);
    }
  };

  return {
    showCookiePreferences
  };
};
