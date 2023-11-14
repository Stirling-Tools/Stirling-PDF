export interface Action {
    values: any;
    type: string;
    actions?: Action[];
}