import './cookieconsent.umd.js';
import 'https://cdn.jsdelivr.net/gh/orestbida/cookieconsent@3.1.0/dist/cookieconsent.umd.js';

// Enable dark mode
document.documentElement.classList.add('cc--darkmode');

CookieConsent.run({
    guiOptions: {
        consentModal: {
            layout: "box",
            position: "bottom left",
            equalWeightButtons: true,
            flipButtons: false
        },
        preferencesModal: {
            layout: "box",
            position: "right",
            equalWeightButtons: true,
            flipButtons: false
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
                    title: cookieBannerPopUpTitle,
                    description: cookieBannerPopUpDescription,
                    acceptAllBtn: cookieBannerPopUpAcceptAllBtn,
                    acceptNecessaryBtn: cookieBannerPopUpAcceptNecessaryBtn,
                    showPreferencesBtn: cookieBannerPopUpShowPreferencesBtn,
                },
                preferencesModal: {
                    title: cookieBannerPreferencesModalTitle,
                    acceptAllBtn: cookieBannerPreferencesModalAcceptAllBtn,
                    acceptNecessaryBtn: cookieBannerPreferencesModalAcceptNecessaryBtn,
                    savePreferencesBtn: cookieBannerPreferencesModalSavePreferencesBtn,
                    closeIconLabel: cookieBannerPreferencesModalCloseIconLabel,
                    serviceCounterLabel: cookieBannerPreferencesModalServiceCounterLabel,
                    sections: [
                        {
                            title: cookieBannerPreferencesModalSubtitle,
                            description: cookieBannerPreferencesModalDescription
                        },
                        {
                            title:cookieBannerPreferencesModalNecessaryTitle,
                            description: cookieBannerPreferencesModalNecessaryDescription,
                            linkedCategory: "necessary"
                        },
                        {
                            title: cookieBannerPreferencesModalAnalyticsTitle,
                            description: cookieBannerPreferencesModalAnalyticsDescription,
                            linkedCategory: "analytics"
                        }
                    ]
                }
            }
        }
    }
});