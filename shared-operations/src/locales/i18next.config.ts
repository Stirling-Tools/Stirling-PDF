import i18next from "i18next";
import resourcesToBackend from "i18next-resources-to-backend";

i18next
    .use(resourcesToBackend((language, namespace) => import(`./${namespace}/${language}.json`)))
    .init({
        // debug: true,
        ns: ["common"], // Preload this namespace, no need to add the others
        defaultNS: "common",
        fallbackLng: "en",
        interpolation: {
            escapeValue: false,
        }
    });