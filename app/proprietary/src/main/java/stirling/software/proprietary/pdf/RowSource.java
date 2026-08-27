package stirling.software.proprietary.pdf;

/**
 * How much of a block's row structure the page itself drew; the stronger the evidence, the weaker
 * the false-positive guards need to be.
 */
enum RowSource {
    /** Rows inferred from word geometry alone; nothing on the page confirms a table. */
    WORDS,
    /** Rows sit inside a region fenced by drawn rules, but the rules do not delimit them. */
    RULE_BOUNDED,
    /** Every row boundary is a drawn rule running the table's own width. */
    LATTICE;

    boolean ruleConfirmed() {
        return this != WORDS;
    }
}
