import i18next from "i18next";
import resourcesToBackend from "i18next-resources-to-backend";

i18next
    .use(resourcesToBackend((language: string, namespace: string) => import(`../public/locales/${namespace}/${language}.json`, {
        assert: { type: "json" },
    })))
    .init({
        // debug: true,
        ns: ["common"], // Preload this namespace, no need to add the others, they will load once their module is loaded
        defaultNS: "common",
        fallbackLng: "en",
        interpolation: {
            escapeValue: false,
        }
    });