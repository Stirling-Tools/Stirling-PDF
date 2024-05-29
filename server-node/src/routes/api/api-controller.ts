import express, { Request, Response } from "express";

import workflow from "./workflow-controller";
import dynamicOperations from "./dynamic-operations-controller";

const router = express.Router();

router.use((req, res, next) => {
    console.log(import.meta.env.VITE_AUTH_ENABLED);
    if(import.meta.env.VITE_AUTH_ENABLED === "False" || req.user) {
        next();
        return;
    }
    res.status(403).json({"Error": "Authentication failed."});
});

router.get("/", (req: Request, res: Response) => {
    // TODO: Implement root api endpoint
    res.status(501).json({"Error": "Unfinished Endpoint. This sould probably send some api docs?"});
});

router.use("/workflow", workflow);
router.use("/", dynamicOperations);

export default router;