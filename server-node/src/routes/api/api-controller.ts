import express, { Request, Response } from 'express';

import workflow from './workflow-controller';
import dynamicOperations from './dynamic-operations-controller';

const router = express.Router();

router.get("/", (req: Request, res: Response) => {
    // TODO: Implement root api endpoint
    res.status(501).json({"Error": "Unfinished Endpoint. This sould probably send some api docs?"});
});

router.use("/workflow", workflow);
router.use("/", dynamicOperations);

export default router;