import { checkAuthorized } from "../../auth/checkAuthorizedMiddleware";
import express, { Request, Response } from "express";
const router = express.Router();

router.get('/status', checkAuthorized, async function(req: Request, res: Response) {
    res.json({user: req.user});
});

export default router;