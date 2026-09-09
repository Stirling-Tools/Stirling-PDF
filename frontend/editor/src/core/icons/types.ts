/** One drawable svg element: [tag, attributes, children?]. */
export type IconNode = readonly [
  tag: string,
  attrs: Readonly<Record<string, string>>,
  children?: readonly IconNode[],
];

export interface IconEntry {
  readonly viewBox: string;
  /** True for stroke icons following currentColor, false for brand marks carrying their own fills. */
  readonly mono: boolean;
  readonly nodes: readonly IconNode[];
}
