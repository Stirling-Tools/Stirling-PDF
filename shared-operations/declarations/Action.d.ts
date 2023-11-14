export interface Action {
    protected values: any;
    type: string;
    actions?: Action[];
}

export interface WaitAction extends Action {
    values: { id: number }
}