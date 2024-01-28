import { Suspense } from "react";

import { Routes, Route, Outlet } from "react-router-dom";
import Home from "./pages/Home";
import About from "./pages/About";
import Dashboard from "./pages/Dashboard";
import Dynamic from "./pages/Dynamic";
import ToPdf from "./pages/convert/ToPdf";
import Impose from "./pages/page-operations/Impose";
import NoMatch from "./pages/NoMatch";
import NavBar from "./components/NavBar";

import "bootstrap/dist/css/bootstrap.min.css";
import { Container } from "react-bootstrap";

import { useTranslation, initReactI18next } from "react-i18next";
import LanguageDetector from "i18next-browser-languagedetector";

import i18next from "i18next";
import resourcesToBackend from "i18next-resources-to-backend";

i18next.use(LanguageDetector).use(initReactI18next).use(resourcesToBackend((language: string, namespace: string) => import(`../../shared-operations/public/locales/${namespace}/${language}.json`)))
.init({
    debug: true,
    ns: ["common"], // Preload this namespace, no need to add the others, they will load once their module is loaded
    defaultNS: "common",
    fallbackLng: "en",
    interpolation: {
        escapeValue: false,
    },
    initImmediate: true // Makes loading blocking but sync
}); // TODO: use i18next.config.ts instead

import "./general.css";

export default function App() {

    return (
        <Suspense fallback="loading">
            {/* Routes nest inside one another. Nested route paths build upon
            parent route paths, and nested route elements render inside
            parent route elements. See the note about <Outlet> below. */}
            <Routes>
                <Route path="/" element={<Layout />}>
                    <Route index element={<Home />} />
                    <Route path="about" element={<About />} />
                    <Route path="dashboard" element={<Dashboard />} />
                    <Route path="dynamic" element={<Dynamic />} />

                    {/* Using path="*"" means "match anything", so this route
                acts like a catch-all for URLs that we don't have explicit
                routes for. */}
                    <Route path="*" element={<NoMatch />} />
                </Route>
                <Route path="/convert" element={<Layout />}>
                    <Route path="file-to-pdf" element={<ToPdf />} />
                    <Route path="*" element={<NoMatch />} />
                </Route>
                <Route path="/page-operations" element={<Layout />}>
                    <Route path="impose" element={<Impose />} />
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
            <Container fluid="sm" className="">
                <div className="row justify-content-center">
                    <div className="col-md-6">
                        <Outlet/>
                    </div>
                </div>
            </Container>
        </div>
    );
}
