import { User } from "./user-model";

export function findOne(params: {id?: number, username?: string, apikey?: string}, cb: (err: Error | null, user: User) => void): undefined {
    //TODO: replace with db connection.
    cb(null, {
        id: 1,
        username: "test",
        mail: "test@test.com",
        accessControlList: []
    });
}

export function verifyPassword(user: User, password: string) {
    //TODO: replace with db connection.
    return password == "test";
}