import LocalStrategy from "passport-local";
import * as User from "./user/user-controller";

export function initialize(passport: typeof import("passport")) {
    passport.use("local", new LocalStrategy.Strategy(
        function(username, password, done) {
            User.findOne({ username: username }, function (err, user) {
                if (err) { 
                    return done(err); 
                }
                if (!user) { 
                    return done(null, false); 
                }
                if (!User.verifyPassword(user, password)) { 
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