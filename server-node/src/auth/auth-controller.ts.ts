import passport from "passport";
import session from "express-session";
import { initialize } from "./passport-config";
import auth from "../routes/auth/auth-controller";
import { Express } from "express";

export function connect(app: Express) {
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
}