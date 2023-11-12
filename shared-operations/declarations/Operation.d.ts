export interface Operation {
    values: {id:any};
    type: string;
    operations?: Operation[];
}