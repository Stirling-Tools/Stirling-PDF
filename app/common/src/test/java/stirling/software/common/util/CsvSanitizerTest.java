package stirling.software.common.util;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;

import java.util.Arrays;
import java.util.List;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;

class CsvSanitizerTest {

    @ParameterizedTest
    @ValueSource(
            strings = {
                "=SUM(A1:A2)",
                "+HYPERLINK(\"http://example.com\")",
                "-WEBSERVICE(\"http://example.com\")",
                "@SUM(1+1)",
                " =SUM(A1:A2)",
                "\t=SUM(A1:A2)",
                "\r@SUM(1+1)"
            })
    void prefixesValuesASpreadsheetWouldEvaluate(String value) {
        assertEquals("'" + value, CsvSanitizer.sanitizeCell(value));
    }

    @ParameterizedTest
    @ValueSource(
            strings = {
                "Alice",
                "1234",
                "-42",
                "-1,234.56",
                "+0.5",
                " -42",
                "total = 12",
                "a=b",
                "   "
            })
    void leavesPlainTextAndNumbersUnchanged(String value) {
        assertEquals(value, CsvSanitizer.sanitizeCell(value));
    }

    @Test
    void handlesNullAndEmptyValues() {
        assertNull(CsvSanitizer.sanitizeCell(null));
        assertEquals("", CsvSanitizer.sanitizeCell(""));
        assertNull(CsvSanitizer.sanitizeRow(null));
    }

    @Test
    void sanitizesEveryCellOfARecord() {
        List<String> row = Arrays.asList("=SUM(A1:A2)", "Alice", null, "-42");

        assertEquals(
                Arrays.asList("'=SUM(A1:A2)", "Alice", null, "-42"), CsvSanitizer.sanitizeRow(row));
    }
}
