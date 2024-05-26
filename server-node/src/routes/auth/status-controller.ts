import express, { Request, Response } from "express";
const router = express.Router();

router.get('/status', async function(req: Request, res: Response) {
    res.json({user: req.user})
});

export default router;