import express from 'express';
import workflow from './workflow.js';
import fileUpload from 'express-fileupload';

const router = express.Router();
router.use(fileUpload());

router.get("/", function (req, res, next) {
    res.status(501).json({"Error": "Unfinished Endpoint"});
});

router.use("/workflow", workflow);

export default router;