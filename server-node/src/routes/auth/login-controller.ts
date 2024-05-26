import express from "express";
const router = express.Router();

import passport from "passport";

router.post("/login", passport.authenticate(['local'], {
    successRedirect: '/auth/status',
    failureRedirect: '/auth/login/failure'
}));

router.post('/login/password', passport.authenticate('local', {
    successRedirect: '/auth/status',
    failureRedirect: '/auth/login/failure'
}));

export default router;