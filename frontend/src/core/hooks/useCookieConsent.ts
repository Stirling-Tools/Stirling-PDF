import { useEffect, useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { BASE_PATH } from '@app/constants/app';
import { useAppConfig } from '@app/contexts/AppConfigContext';
import { TOUR_STATE_EVENT, type TourStatePayload } from '@app/constants/events';
import { getCookieConsentOverrides } from '@app/extensions/cookieConsentConfig';

declare global {
  interface Window {
    CookieConsent?: {
      run: (config: any) => void;
      show: (show?: boolean) => void;
      hide: () => void;
      getCookie: (name?: string) => any;
      acceptedCategory: (category: string) => boolean;
      acceptedService: (serviceName: string, category: string) => boolean;
    };
  }
}

interface CookieConsentConfig {
  analyticsEnabled?: boolean;
  forceLightMode?: boolean;
}

export const useCookieConsent = ({
  analyticsEnabled = false,
  forceLightMode = false
}: CookieConsentConfig = {}) => {
  const { t } = useTranslation();
  const { config } = useAppConfig();
  const [isInitialized, setIsInitialized] = useState(false);

  useEffect(() => {
    if (!analyticsEnabled) return;

    const mainCSS = document.createElement('link');
    mainCSS.rel = 'stylesheet';
    mainCSS.href = `${BASE_PATH}css/cookieconsent.css`;
    if (!document.querySelector(`link[href="${mainCSS.href}"]`)) {
      document.head.appendChild(mainCSS);
    }

    const customCSS = document.createElement('link');
    customCSS.rel = 'stylesheet';
    customCSS.href = `${BASE_PATH}css/cookieconsentCustomisation.css`;
    if (!document.querySelector(`link[href="${customCSS.href}"]`)) {
      document.head.appendChild(customCSS);
    }

    if (window.CookieConsent) {
      if (forceLightMode) {
        document.documentElement.classList.remove('cc--darkmode');
      }
      setIsInitialized(true);
      return;
    }

    const script = document.createElement('script');
    script.src = `${BASE_PATH}js/thirdParty/cookieconsent.umd.js`;
    script.onload = () => {
      setTimeout(() => {
        const detectTheme = () => {
          if (forceLightMode) {
            document.documentElement.classList.remove('cc--darkmode');
            return false;
          }

          const mantineScheme = document.documentElement.getAttribute('data-mantine-color-scheme');
          const hasLightClass = document.documentElement.classList.contains('light');
          const hasDarkClass = document.documentElement.classList.contains('dark');
          const systemPrefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;

          let isDarkMode: boolean;
          if (mantineScheme) {
            isDarkMode = mantineScheme === 'dark';
          } else if (hasLightClass) {
            isDarkMode = false;
          } else if (hasDarkClass) {
            isDarkMode = true;
          } else {
            isDarkMode = systemPrefersDark;
          }

          document.documentElement.classList.toggle('cc--darkmode', isDarkMode);
          return isDarkMode;
        };

        setTimeout(() => detectTheme(), 50);

        if (!window.CookieConsent) {
          console.error('CookieConsent is not available on window object');
          return;
        }

        if (!forceLightMode) {
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
        }

        try {
          const overrides = getCookieConsentOverrides();
          window.CookieConsent.run({
            autoShow: true,
            hideFromBots: false,
            ...overrides,
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
              analytics: {
                services: {
                  ...(config?.enablePosthog !== false && {
                    posthog: {
                      label: t('cookieBanner.services.posthog', 'PostHog Analytics'),
                    }
                  }),
                  ...(config?.enableScarf !== false && {
                    scarf: {
                      label: t('cookieBanner.services.scarf', 'Scarf Pixel'),
                    }
                  })
                }
              }
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

        } catch (error) {
          console.error('Error initializing CookieConsent:', error);
        }
        setIsInitialized(true);
      }, 100);
    };

    script.onerror = () => {
      console.error('Failed to load cookie consent library');
    };

    document.head.appendChild(script);

    return () => {
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
  }, [analyticsEnabled, config?.enablePosthog, config?.enableScarf, t, forceLightMode]);

  useEffect(() => {
    if (!isInitialized) return;

    const detectTheme = () => {
      if (forceLightMode) {
        document.documentElement.classList.remove('cc--darkmode');
        return false;
      }

      const mantineScheme = document.documentElement.getAttribute('data-mantine-color-scheme');
      const hasLightClass = document.documentElement.classList.contains('light');
      const hasDarkClass = document.documentElement.classList.contains('dark');
      const systemPrefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;

      let isDarkMode: boolean;
      if (mantineScheme) {
        isDarkMode = mantineScheme === 'dark';
      } else if (hasLightClass) {
        isDarkMode = false;
      } else if (hasDarkClass) {
        isDarkMode = true;
      } else {
        isDarkMode = systemPrefersDark;
      }

      document.documentElement.classList.toggle('cc--darkmode', isDarkMode);
      return isDarkMode;
    };

    detectTheme();

    let themeObserver: MutationObserver | null = null;
    if (!forceLightMode) {
      themeObserver = new MutationObserver((mutations) => {
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
    }

    return () => {
      if (themeObserver) {
        themeObserver.disconnect();
      }
    };
  }, [forceLightMode, isInitialized]);

  useEffect(() => {
    if (!isInitialized || !window.CookieConsent) return;

    const handleTourState = (event: Event) => {
      const { detail } = event as CustomEvent<TourStatePayload>;
      if (detail?.isOpen) {
        window.CookieConsent?.hide();
      } else {
        const consentCookie = window.CookieConsent?.getCookie?.();
        const hasConsented = consentCookie && Object.keys(consentCookie).length > 0;
        if (!hasConsented) window.CookieConsent?.show();
      }
    };

    window.addEventListener(TOUR_STATE_EVENT, handleTourState);
    return () => window.removeEventListener(TOUR_STATE_EVENT, handleTourState);
  }, [isInitialized]);

  const showCookieConsent = useCallback(() => {
    if (isInitialized && window.CookieConsent) {
      window.CookieConsent?.show();
    }
  }, [isInitialized]);

  const showCookiePreferences = useCallback(() => {
    if (isInitialized && window.CookieConsent) {
      window.CookieConsent?.show(true);
    }
  }, [isInitialized]);

  const isServiceAccepted = useCallback((service: string, category: string): boolean => {
    if (typeof window === 'undefined' || !window.CookieConsent) {
      return false;
    }
    return window.CookieConsent.acceptedService(service, category);
  }, []);

  return {
    showCookieConsent,
    showCookiePreferences,
    isServiceAccepted,
    isInitialized,
  };
};
