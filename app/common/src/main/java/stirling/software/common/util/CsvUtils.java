package stirling.software.common.util;

import java.util.ArrayList;
import java.util.List;
import java.util.regex.Pattern;

/**
 * Neutralises CSV formula injection (CWE-1236) so spreadsheets treat untrusted cells as text.
 *
 * <p>Apply at CSV write time only; applying it on read would add a fresh apostrophe every round
 * trip.
 */
public final class CsvUtils {

    // Leading characters a spreadsheet may read as the start of a formula.
    private static final String FORMULA_TRIGGERS = "=+-@\t\r";

    // Real numbers must pass through untouched or extracted tables stop summing.
    private static final Pattern NUMERIC_PATTERN =
            Pattern.compile(
                    "^[+-]?[$£¥€₹]?"
                            + "(?:(?:\\d+|\\d{1,3}(?:,\\d{3})+)(?:\\.\\d+)?|\\.\\d+)"
                            + "(?:[eE][+-]?\\d+)?"
                            + "[%‰]?[$£¥€₹]?\\s*$");

    // A run of hyphens is a common "no value" placeholder and cannot be a formula.
    private static final Pattern DASH_PLACEHOLDER_PATTERN = Pattern.compile("^-+\\s*$");

    private CsvUtils() {}

    /**
     * Prefix a single apostrophe when the value starts with a formula trigger character.
     *
     * @param value the cell value about to be written, may be null
     * @return the value, prefixed only when a spreadsheet could evaluate it as a formula
     */
    public static String neutraliseFormula(String value) {
        if (value == null || value.isEmpty()) {
            return value;
        }
        if (FORMULA_TRIGGERS.indexOf(value.charAt(0)) < 0) {
            return value;
        }
        if (NUMERIC_PATTERN.matcher(value).matches()
                || DASH_PLACEHOLDER_PATTERN.matcher(value).matches()) {
            return value;
        }
        return "'" + value;
    }

    /**
     * Apply {@link #neutraliseFormula(String)} to every cell of a row about to be written.
     *
     * @param row the row of cell values, may be null
     * @return a new list with each cell neutralised, or null when the row is null
     */
    public static List<String> neutraliseRow(List<String> row) {
        if (row == null) {
            return null;
        }
        List<String> neutralised = new ArrayList<>(row.size());
        for (String cell : row) {
            neutralised.add(neutraliseFormula(cell));
        }
        return neutralised;
    }
}
