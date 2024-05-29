import { Error as SequelizeError, Op } from "sequelize";
import { Password, User } from "./user-model";

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

export async function verifyPassword(user: User, password: string): Promise<boolean> {
    const passwordRecord = await user.getPassword();
    if(!passwordRecord) {
        throw new Error("This user does not have a password set!");
    }
    return passwordRecord.password == password; // TODO: Replace with web-crypto
}

export function createUser(params: { username: string, password: string }, cb: (err: SequelizeError | null, user: User | null) => void ) {
    User.create({ username: params.username, authenticationMethod: "password" }).then(async user => {
        user.setPassword(await Password.create({
            password: params.password, // TODO: Replace with web-crypto
        })).then(password => {
            cb(null, user as any as User)
        }).catch(e => 
            cb(e, null)
        );
    }).catch(e => 
        cb(e, null)
    );
}

export function createAPIKey(user: User, apikey?: string) {

}