import express, { Request, Response } from "express";

import login from "./login-controller";
import logout from "./logout-controller";
import register from "./register-controller";
import status from "./status-controller";
import createAPIKey from "./create-api-key-controller"

const router = express.Router();

router.use("/", [createAPIKey, login, logout, register, status]);

export default router;