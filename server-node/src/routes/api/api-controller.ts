import express, { Request, Response } from 'express';

import workflow from './workflow-controller';
// import operations from './operations-controller';
// import conversions from './conversions-controller';

const router = express.Router();

router.get("/", (req: Request, res: Response) => {
    // TODO: Implement root api endpoint
    res.status(501).json({"Error": "Unfinished Endpoint. This sould probably send some api docs?"});
});

// router.use("/operations", operations);
// router.use("/conversions", conversions);
router.use("/workflow", workflow);

export default router;