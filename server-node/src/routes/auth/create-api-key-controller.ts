import { checkAuthorized } from "../../auth/checkAuthorizedMiddleware";
import { APIKey } from "../../auth/user/user-model";
import express, { Request, Response } from "express";
const router = express.Router();

router.post('/create-api-key', checkAuthorized, async function(req: Request, res: Response) {
    const apikey: APIKey | undefined = await req.user?.createAPIKey({apikey: "test"}); //TODO: Replace with random string
    res.json({apikey: apikey});
});

export default router;