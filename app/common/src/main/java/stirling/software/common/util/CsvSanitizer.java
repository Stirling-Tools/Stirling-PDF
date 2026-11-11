package stirling.software.common.util;

import java.util.ArrayList;
import java.util.List;
import java.util.regex.Pattern;

import lombok.experimental.UtilityClass;

/**
 * Keeps CSV cell values literal when the file is opened in a spreadsheet application.
 *
 * <p>CSV quoting protects the record structure only. Excel, LibreOffice Calc and Google Sheets
 * strip the surrounding quotes on import and evaluate a cell that starts with {@code =}, {@code +},
 * {@code -} or {@code @} as a formula. Cell values taken from a document a user supplied are
 * therefore prefixed with a single quote, which spreadsheets read as "the rest of this cell is
 * text". Leading whitespace, including the tab and carriage return that spreadsheets discard before
 * evaluating, is skipped when looking for the trigger character.
 *
 * <p>Values that are a number with optional sign, group separators and decimal point stay
 * untouched: they cannot reference a cell or call a function, and prefixing them would turn the
 * numeric columns of an extracted table into text.
 */
@UtilityClass
public class CsvSanitizer {

    private static final String FORMULA_TRIGGERS = "=+-@";

    private static final String TEXT_PREFIX = "'";

    private static final Pattern PLAIN_NUMBER = Pattern.compile("[-+]?[0-9]+(?:[.,][0-9]+)*");

    /**
     * Prefixes a cell value with a single quote when a spreadsheet would otherwise read it as a
     * formula.
     *
     * @param value the cell value, may be null
     * @return the value as literal text, null and empty input returned unchanged
     */
    public String sanitizeCell(String value) {
        if (value == null || value.isEmpty()) {
            return value;
        }
        String candidate = value.stripLeading();
        if (candidate.isEmpty() || FORMULA_TRIGGERS.indexOf(candidate.charAt(0)) < 0) {
            return value;
        }
        if (PLAIN_NUMBER.matcher(candidate).matches()) {
            return value;
        }
        return TEXT_PREFIX + value;
    }

    /**
     * Applies {@link #sanitizeCell(String)} to every cell of a record.
     *
     * @param row the record, may be null
     * @return a new list holding the sanitized cells, null input returned unchanged
     */
    public List<String> sanitizeRow(List<String> row) {
        if (row == null) {
            return row;
        }
        List<String> sanitized = new ArrayList<>(row.size());
        for (String cell : row) {
            sanitized.add(sanitizeCell(cell));
        }
        return sanitized;
    }
}
