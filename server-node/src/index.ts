/*
 * translation
*/

import i18next from "i18next";
import resourcesToBackend from "i18next-resources-to-backend";

i18next.use(resourcesToBackend((language: string, namespace: string) => import(`../../shared-operations/public/locales/${namespace}/${language}.json`)))
    .init({
        debug: false,
        ns: ["common"], // Preload this namespace, no need to add the others, they will load once their module is loaded
        defaultNS: "common",
        fallbackLng: "en",
        interpolation: {
            escapeValue: false,
        },
        initImmediate: false // Makes loading blocking but sync
    });

// list available modules
import { listOperatorNames } from "@stirling-pdf/shared-operations/src/workflow/operatorAccessor";
console.log("Available Modules: ", listOperatorNames());

/*
 * jobs
*/

import "./jobs/jobs-controller";

/**
 * database
 */

import "./data/sequelize-relations";

/*
 * EXPRESS
*/

import express from "express";
const app = express();
const PORT = 8000;

/*
 * auth
*/

import passport from "passport";
import session from "express-session";
import { initialize } from "./auth/passport-config";
import auth from "./routes/auth/auth-controller";

app.use(session({
    secret: process.env.SESSION_SECRET || "default-secret",
    resave: false,
    saveUninitialized: false
}));

app.use(passport.initialize());
app.use(passport.authenticate(['headerapikey', 'session'], { 
    session: false, // Only set a session on the login request.
}));

initialize(passport);

app.use("/auth", auth);

/*
 * api
*/

import api from "./routes/api/api-controller";
app.use("/api", api);

// viteNode
if (import.meta.env.PROD) {
    app.listen(PORT, () => {
        console.log(`http://localhost:${PORT}`);
    });
}

process.on('unhandledRejection', (reason, promise) => {
    console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

export const viteNodeApp = app;