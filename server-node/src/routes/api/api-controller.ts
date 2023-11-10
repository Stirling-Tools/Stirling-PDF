import express, { Request, Response } from 'express';
import fileUpload from 'express-fileupload';

import workflow from './workflow-controller';

const router = express.Router();
router.use(fileUpload());

router.get("/", (req: Request, res: Response) => {
    // TODO: Implement root api endpoint
    res.status(501).json({"Error": "Unfinished Endpoint. This sould probably send some api docs?"});
});

router.use("/workflow", workflow);

export default router;