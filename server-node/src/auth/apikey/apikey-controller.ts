import { Error as SequelizeError } from "sequelize";
import { APIKey } from "./apikey-model";
import { User } from "../user/user-model";

export function findOne(params: {apikey?: string}, cb: (err: Error | null, apikey?: APIKey | undefined, info?: Object | undefined) => void): undefined {
    const query: any = params;

    for (let key in query) {
        if (query[key] === undefined) {
            delete query[key];
        }
    }

    if(Object.keys(query).length == 0) {
        cb(new Error("You need to provide at least one argument."), undefined)
    }

    APIKey.findOne({
        where: query
    }).then(apikey => {
        if(apikey)
            cb(null, apikey);
        else
            cb(null, undefined, { message: "The requested apikey was not found."});
    }).catch(e => 
        cb(e, undefined)
    );
}

export async function createAPIKey(user: User | undefined): Promise<APIKey> {
    const apikey = crypto.randomUUID(); // TODO: Is this secure enough?
    const apikeyEntry = await APIKey.create({ apikey: apikey })
    await user?.addAPIKey(apikeyEntry);
    return apikeyEntry;
}