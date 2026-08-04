export interface InsertBlankPagesParameters {
  position: number;
  count: number;
  pageSize: string;
}

export const defaultInsertBlankPagesParameters: InsertBlankPagesParameters = {
  position: 0,
  count: 1,
  pageSize: "A4",
};
