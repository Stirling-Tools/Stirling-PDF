import { isAuthorized } from "../../auth/authenticationMiddleware";
import express, { Request, Response } from "express";
const router = express.Router();

router.get('/status', isAuthorized, async function(req: Request, res: Response) {
    res.json({user: req.user});
});

export default router;