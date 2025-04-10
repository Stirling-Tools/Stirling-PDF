import './cookieconsent.umd.js';

// Enable dark mode
document.documentElement.classList.add('cc--darkmode');

CookieConsent.run({
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
                    title: cookieBannerPopUpTitle,
                    description: cookieBannerPopUpDescription1 + "<br>" + cookieBannerPopUpDescription2,
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
                            description: cookieBannerPreferencesModalDescription1 + "<br><br>" + cookieBannerPreferencesModalDescription2 + "<b> " + cookieBannerPreferencesModalDescription3 + "</b>"
                        },
                        {
                            title:cookieBannerPreferencesModalNecessaryTitle1 + "<span class=\"pm__badge\">" + cookieBannerPreferencesModalNecessaryTitle2 +  "</span>",
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
