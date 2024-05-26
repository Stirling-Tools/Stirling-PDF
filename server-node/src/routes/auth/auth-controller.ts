import express, { Request, Response } from "express";

import login from "./login-controller";
import logout from "./logout-controller";
import register from "./register-controller";
import status from "./status-controller";

const router = express.Router();

router.use("/", [login, logout, register, status]);

export default router;