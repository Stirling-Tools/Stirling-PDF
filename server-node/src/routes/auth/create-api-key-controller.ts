import * as APIKey from "../../auth/apikey/apikey-controller";
import { whenAuthIsEnabled, isAuthorized } from "../../auth/authenticationMiddleware";
import express, { Request, Response } from "express";
const router = express.Router();

router.post('/create-api-key', whenAuthIsEnabled, isAuthorized, async function(req: Request, res: Response) {
    res.json({apikey: await APIKey.createAPIKey(req.user)});
});

export default router;