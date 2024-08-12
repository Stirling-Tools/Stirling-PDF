import { Suspense } from "react";

import { Routes, Route, Outlet } from "react-router-dom";
import Home from "./pages/Home";
import Operators from "./pages/Operators";
import NoMatch from "./pages/NoMatch";
import NavBar from "./components/NavBar";

import { useTranslation, initReactI18next } from "react-i18next";
import LanguageDetector from "i18next-browser-languagedetector";

import i18next from "i18next";
import resourcesToBackend from "i18next-resources-to-backend";
import { listOperatorNames } from "@stirling-pdf/shared-operations/src/workflow/operatorAccessor";

i18next.use(LanguageDetector).use(initReactI18next).use(resourcesToBackend((language: string, namespace: string) => import(`../../shared-operations/public/locales/${namespace}/${language}.json`)))
.init({
    debug: false,
    ns: ["common"], // Preload this namespace, no need to add the others, they will load once their module is loaded
    defaultNS: "common",
    fallbackLng: "en",
    interpolation: {
        escapeValue: false,
    },
    initImmediate: false // Makes loading blocking but sync
}); // TODO: use i18next.config.ts instead

export default function App() {

    return (
        <Suspense fallback="loading">
            {/* Routes nest inside one another. Nested route paths build upon
            parent route paths, and nested route elements render inside
            parent route elements. See the note about <Outlet> below. */}
            <Routes>
                <Route path="/" element={<Layout />}>
                    <Route index element={<Home />} />

                    {/* Using path="*"" means "match anything", so this route
                acts like a catch-all for URLs that we don't have explicit
                routes for. */}
                    <Route path="*" element={<NoMatch />} />
                </Route>

                <Route path="/operators" element={<Layout />}>
                    <Route index element={<NoMatch />} />
                    {listOperatorNames().map((name) => {
                        return <Route key={name} path={name} element={<Operators/>} />;
                    })}
                    <Route path="*" element={<NoMatch />} />
                </Route>

                <Route path="/convert" element={<Layout />}>
                    {/* <Route path="file-to-pdf" element={<ToPdf />} /> */}
                    <Route path="*" element={<NoMatch />} />
                </Route>
                <Route path="/page-operations" element={<Layout />}>
                    {/* <Route path="impose" element={<Impose />} /> */}
                    <Route path="*" element={<NoMatch />} />
                </Route>
            </Routes>
        </Suspense>
    );
}

function Layout() {
    const { t } = useTranslation();
    console.log(t("inputs.pdffile.name"));
    return (
        <div lang-direction={t("language.direction")}>
            <NavBar/>

            {/* An <Outlet> renders whatever child route is currently active,
          so you can think about this <Outlet> as a placeholder for
          the child routes we defined above. */}
            <Outlet/>
        </div>
    );
}
