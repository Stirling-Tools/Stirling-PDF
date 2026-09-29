import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import { BASE_PATH } from "@app/constants/app";
import { getSystemTheme } from "@app/constants/theme";
import { useAppConfig, type AppConfig } from "@app/contexts/AppConfigContext";
import {
  Z_INDEX_COOKIE_CONSENT_BANNER,
  Z_INDEX_COOKIE_PREFERENCES_MODAL,
} from "@app/styles/zIndex";
import { TOUR_STATE_EVENT, type TourStatePayload } from "@app/constants/events";
import { getCookieConsentOverrides } from "@app/extensions/cookieConsentConfig";

// The library owns document-level DOM. Its promise and assets must outlive either
// app's provider stack, including a navigation while the script is still loading.
let initialization: Promise<void> | null = null;

function initializeCookieConsent(
  config: Record<string, unknown>,
): Promise<void> {
  if (initialization) return initialization;
  initialization = (async () => {
    for (const name of [
      "cookieconsent.css",
      "cookieconsentCustomisation.css",
    ]) {
      const href = `${BASE_PATH}/css/${name}`;
      if (!document.querySelector(`link[data-cookie-consent="${name}"]`)) {
        const link = document.createElement("link");
        link.rel = "stylesheet";
        link.href = href;
        link.dataset.cookieConsent = name;
        document.head.appendChild(link);
      }
    }
    if (!window.CookieConsent) {
      await new Promise<void>((resolve, reject) => {
        const script = document.createElement("script");
        script.src = `${BASE_PATH}/js/thirdParty/cookieconsent.umd.js`;
        script.onload = () => resolve();
        script.onerror = () => {
          script.remove();
          reject(new Error("Failed to load cookie consent library"));
        };
        document.head.appendChild(script);
      });
    }
    if (!window.CookieConsent) throw new Error("CookieConsent is unavailable");
    await window.CookieConsent.run(config);
  })().catch((error: unknown) => {
    initialization = null;
    throw error;
  });
  return initialization;
}

function createCookieConsentConfig(
  config: AppConfig | null,
  t: TFunction,
): Record<string, unknown> {
  const overrides = getCookieConsentOverrides();
  return {
    autoShow: false,
    hideFromBots: false,
    ...overrides,
    guiOptions: {
      consentModal: {
        layout: "bar",
        position: "bottom",
        equalWeightButtons: true,
        flipButtons: true,
      },
      preferencesModal: {
        layout: "box",
        position: "right",
        equalWeightButtons: true,
        flipButtons: true,
      },
    },
    categories: {
      necessary: {
        readOnly: true,
      },
      analytics: {
        services: {
          ...(config?.enablePosthog !== false && {
            posthog: {
              label: t("cookieBanner.services.posthog", "PostHog Analytics"),
            },
          }),
          ...(config?.enableScarf !== false && {
            scarf: {
              label: t("cookieBanner.services.scarf", "Scarf Pixel"),
            },
          }),
        },
      },
    },
    language: {
      default: "en",
      translations: {
        en: {
          consentModal: {
            title: t("cookieBanner.popUp.title", "How we use Cookies"),
            description:
              t(
                "cookieBanner.popUp.description.1",
                "We use cookies and other technologies to make Stirling PDF work better for you—helping us improve our tools and keep building features you'll love.",
              ) +
              "<br>" +
              t(
                "cookieBanner.popUp.description.2",
                "If you'd rather not, clicking 'No Thanks' will only enable the essential cookies needed to keep things running smoothly.",
              ),
            acceptAllBtn: t("cookieBanner.popUp.acceptAllBtn", "Okay"),
            acceptNecessaryBtn: t(
              "cookieBanner.popUp.acceptNecessaryBtn",
              "No Thanks",
            ),
            showPreferencesBtn: t(
              "cookieBanner.popUp.showPreferencesBtn",
              "Manage preferences",
            ),
          },
          preferencesModal: {
            title: t(
              "cookieBanner.preferencesModal.title",
              "Consent Preferences Center",
            ),
            acceptAllBtn: t(
              "cookieBanner.preferencesModal.acceptAllBtn",
              "Accept all",
            ),
            acceptNecessaryBtn: t(
              "cookieBanner.preferencesModal.acceptNecessaryBtn",
              "Reject all",
            ),
            savePreferencesBtn: t(
              "cookieBanner.preferencesModal.savePreferencesBtn",
              "Save preferences",
            ),
            closeIconLabel: t(
              "cookieBanner.preferencesModal.closeIconLabel",
              "Close modal",
            ),
            serviceCounterLabel: t(
              "cookieBanner.preferencesModal.serviceCounterLabel",
              "Service|Services",
            ),
            sections: [
              {
                title: t(
                  "cookieBanner.preferencesModal.subtitle",
                  "Cookie Usage",
                ),
                description:
                  t(
                    "cookieBanner.preferencesModal.description.1",
                    "Stirling PDF uses cookies and similar technologies to enhance your experience and understand how our tools are used. This helps us improve performance, develop the features you care about, and provide ongoing support to our users.",
                  ) +
                  "<br><br>" +
                  t(
                    "cookieBanner.preferencesModal.description.2",
                    "Stirling PDF cannot—and will never—track or access the content of the documents you use.",
                  ) +
                  "<b> " +
                  t(
                    "cookieBanner.preferencesModal.description.3",
                    "Your privacy and trust are at the core of what we do.",
                  ) +
                  "</b>",
              },
              {
                title:
                  t(
                    "cookieBanner.preferencesModal.necessary.title.1",
                    "Strictly Necessary Cookies",
                  ) +
                  '<span class="pm__badge">' +
                  t(
                    "cookieBanner.preferencesModal.necessary.title.2",
                    "Always Enabled",
                  ) +
                  "</span>",
                description: t(
                  "cookieBanner.preferencesModal.necessary.description",
                  "These cookies are essential for the website to function properly. They enable core features like setting your privacy preferences, logging in, and filling out forms—which is why they can't be turned off.",
                ),
                linkedCategory: "necessary",
              },
              {
                title: t(
                  "cookieBanner.preferencesModal.analytics.title",
                  "Analytics",
                ),
                description: t(
                  "cookieBanner.preferencesModal.analytics.description",
                  "These cookies help us understand how our tools are being used, so we can focus on building the features our community values most. Rest assured—Stirling PDF cannot and will never track the content of the documents you work with.",
                ),
                linkedCategory: "analytics",
              },
            ],
          },
        },
      },
    },
  };
}

/** Initializes consent once per document and limits its UI to the active app entry. */
export function useCookieConsentInitialization() {
  const { config } = useAppConfig();
  const { t } = useTranslation();
  const analyticsEnabled = config?.enableAnalytics === true;
  const [initialized, setInitialized] = useState(false);
  const [tourOpen, setTourOpen] = useState(false);

  useEffect(() => {
    if (!analyticsEnabled) return;
    let active = true;
    document.documentElement.style.setProperty(
      "--z-index-cookie-consent",
      String(Z_INDEX_COOKIE_CONSENT_BANNER),
    );
    document.documentElement.style.setProperty(
      "--z-index-cookie-preferences",
      String(Z_INDEX_COOKIE_PREFERENCES_MODAL),
    );
    void initializeCookieConsent(createCookieConsentConfig(config, t))
      .then(() => {
        if (active) setInitialized(true);
      })
      .catch((error: unknown) => {
        console.error("Error initializing CookieConsent:", error);
      });
    return () => {
      active = false;
    };
  }, [analyticsEnabled, config?.enablePosthog, config?.enableScarf, t]);

  useEffect(() => {
    const onTourState = (event: Event) => {
      setTourOpen(
        Boolean((event as CustomEvent<TourStatePayload>).detail?.isOpen),
      );
    };
    window.addEventListener(TOUR_STATE_EVENT, onTourState);
    return () => window.removeEventListener(TOUR_STATE_EVENT, onTourState);
  }, []);

  useEffect(() => {
    if (!analyticsEnabled || tourOpen) {
      window.CookieConsent?.hide();
      window.CookieConsent?.hidePreferences();
    } else if (initialized) {
      const cookie = window.CookieConsent?.getCookie();
      if (!cookie || Object.keys(cookie).length === 0)
        window.CookieConsent?.show();
    }
    return () => {
      window.CookieConsent?.hide();
      window.CookieConsent?.hidePreferences();
    };
  }, [analyticsEnabled, initialized, tourOpen]);

  useEffect(() => {
    if (!initialized) return;
    const detectTheme = () => {
      const scheme = document.documentElement.getAttribute(
        "data-mantine-color-scheme",
      );
      const dark = scheme ? scheme === "dark" : getSystemTheme() === "dark";
      document.documentElement.classList.toggle("cc--darkmode", dark);
    };
    detectTheme();
    const observer = new MutationObserver(detectTheme);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-mantine-color-scheme"],
    });
    return () => observer.disconnect();
  }, [initialized]);
}
