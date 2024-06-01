import { Request, Response, NextFunction } from "express";

export function isAuthorized(req: Request, res: Response, next: NextFunction) {
    if(import.meta.env.VITE_AUTH_ENABLED === "False" || req.user) {
        return next();
    }
    return res.status(403).json({"Error": "Authentication failed."});
}

export function whenAuthIsEnabled(req: Request, res: Response, next: NextFunction) {
    if(import.meta.env.VITE_AUTH_ENABLED === "True") {
        return next();
    }
    return res.status(403).json({"Error": "Authentication is not enabled."});
}