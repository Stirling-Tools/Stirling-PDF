import express from 'express';
import workflow from './workflow.js';

const router = express.Router();

router.get("/", function (req, res, next) {
    res.status(501).json({"Error": "Unfinished Endpoint"});
});

router.use("/workflow", workflow);

export default router;