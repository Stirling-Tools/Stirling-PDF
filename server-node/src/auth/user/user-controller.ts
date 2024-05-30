import { Error as SequelizeError, Op } from "sequelize";
import { APIKey, Password, User } from "./user-model";
import crypto from "crypto";

type PickOne<T, F extends keyof T> = Pick<T, F> & { [K in keyof Omit<T, F>]?: never };

export function findOne(params: {id?: number, username?: string, apikey?: string}, cb: (err: Error | null, user: User | null) => void): undefined {
    const query: any = params;

    for (let key in query) {
        if (query[key] === undefined) {
            delete query[key];
        }
    }

    if(Object.keys(query).length == 0) {
        cb(new Error("You need to provide at least one argument."), null)
    }

    User.findOne({
        where: query
    }).then(user => {
        if(user)
            cb(null, user);
        else
            cb(new Error("The requested user was not found."), null);
    }).catch(e => 
        cb(e, null)
    );
}

// TODO: Allow other authentication methods
export function createUser(params: { username: string, password: string }, cb: (err: SequelizeError | null, user: User | null) => void ) {
    User.create({ username: params.username }).then(async (user) => {
        const salt = crypto.randomBytes(16).toString('hex');

        hashPassword(params.password, salt, async (err, derivedKey) => {
            if(err || !derivedKey) {
                return cb(err, null);
            }

            user.setPassword(await Password.create({
                password: derivedKey,
                salt: salt
            })).then(password => {
                cb(null, user as any as User);
            }).catch(e => {
                cb(e, null);
            });
        })
    }).catch(e => 
        cb(e, null)
    );
}

export async function verifyPassword(user: User, password: string, cb: (error: Error | null, success: boolean | null) => void) {
    const passwordRecord = await user.getPassword();
    if(!passwordRecord) {
        return cb(new Error("This user does not have a password set!"), null);
    }

    hashPassword(password, passwordRecord.salt, (err, derivedKey) => {
        if(err) return cb(err, null);
        return cb(null, passwordRecord.password == derivedKey);
    });
}

function hashPassword(password: string, salt: string, cb: (err: Error | null, derivedKey: string | null) => void) {
    crypto.pbkdf2(password, salt, 100000, 64, 'sha512', (err, derivedKey) => {
        if (err) return cb(err, null);
        cb(null, derivedKey.toString('hex'));
    });
}

export function createAPIKey(user: User, cb: (err: SequelizeError | null, apikey: APIKey | null) => void ) {
    user.addAPIKey()
}