export interface Action {
    values: any;
    type: "wait" | "done" | "impose" | string;
    actions?: Action[];
}

export interface WaitAction extends Action {
    values: { id: number }
}

export interface ExtractAction extends Action {
    values: { indexes: string | number[] }
}

export interface ImposeAction extends Action {
    values: { nup: number, format: string }
}

export interface WaitAction extends Action {
    values: { id: number }
}