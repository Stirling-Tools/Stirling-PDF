import express, { Request, Response } from "express";
const router = express.Router();

router.post('/logout', function(req, res, next) {
    req.logout(function(err) {
      if (err) { return next(err); }
      res.redirect('/');
    });
});

export default router;