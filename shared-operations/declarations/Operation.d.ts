export interface Operation {
    protected values: any;
    type: string;
    operations?: Operation[];
}

export interface WaitOperation extends Operation {
    values: { id: number }
}