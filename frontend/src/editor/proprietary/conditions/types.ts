/** Source variants distinguish current document facts from values requiring execution state. */
export type ConditionInput = { source: "document"; field: string };

/** The operator owns its operand types; string membership accepts several candidate values. */
export interface MatchesAnyCondition {
  input: ConditionInput;
  operator: "matches-any";
  values: string[];
}

/** Mirrors the backend Condition union, independently of the action taken on a match. */
export type Condition = MatchesAnyCondition;
