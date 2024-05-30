import * as User from "./user/user-controller";

import { Strategy as LocalStrategy} from "passport-local";
import { HeaderAPIKeyStrategy as HeaderAPIKeyStrategy } from "passport-headerapikey";

export function initialize(passport: typeof import("passport")) {
    passport.use("local", new LocalStrategy(
        function(username, password, done) {
            User.findOne({ username: username }, function (err, user) {
                if (err) { 
                    return done(err, false); 
                }
                if (!user) { 
                    return done(null, false); 
                }

                User.verifyPassword(user, password, (error, success) => {
                    if(error) return done(error, false);

                    if(!success) return done(null, false);

                    return done(null, user)
                });
            });
        }
    ));

    passport.use(new HeaderAPIKeyStrategy(
        { header: 'Authorization', prefix: 'Bearer ' },
        false,
        function(apikey, done) {
            User.findOne({ apikey: apikey }, function (err, user) {
                if (err) { 
                    return done(err); 
                }
                if (!user) { 
                    return done(null, false);
                }
                return done(null, user);
            });
        }
    ));

    passport.serializeUser((user, done) => {
        done(null, user.id)
    });
    
    passport.deserializeUser((id: number, done) => {
        User.findOne({id: id}, function (err, user) {
            done(err, user);
        });
    });
}

