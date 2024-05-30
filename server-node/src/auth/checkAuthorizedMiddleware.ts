import { Request, Response, NextFunction } from "express";

export function checkAuthorized(req: Request, res: Response, next: NextFunction) {
    if(import.meta.env.VITE_AUTH_ENABLED === "False" || req.user) {
        return next();
    }
    return res.status(403).json({"Error": "Authentication failed."});
}