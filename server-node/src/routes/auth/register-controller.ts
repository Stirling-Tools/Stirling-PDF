import { error } from "pdf-lib";
import * as User from "../../auth/user/user-controller";
import express, { Request, Response } from "express";
const router = express.Router();

router.post('/register', async function(req: Request, res: Response) {
    //TODO: Register new user
    
});

router.post('/register/password', async function(req: Request, res: Response) {
    if(req.query) {
        if(!req.query.username) {
            res.status(400).json({error: "no username was provided"});
            return;
        }
        if(!req.query.password) {
            res.status(400).json({error: "no password was provided"});
            return;
        }

        User.createUser({username: req.query.username as string, password: req.query.password as string}, async (err, user) => {
            if(err) {
                res.status(500).json(err);
                return;
            }
            res.json(user);
        });
    }
    else {
        res.status(400).json({error: "no params were provided"})
    }
});

export default router;