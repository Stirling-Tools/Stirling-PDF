package stirling.software.common.util;

import static org.junit.jupiter.api.Assertions.*;

import java.util.Arrays;
import java.util.List;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;

class CsvUtilsTest {

    @ParameterizedTest
    @ValueSource(
            strings = {
                "=cmd|'/c calc'!A1",
                "=1+1",
                "@SUM(A1)",
                "+cmd|'/c calc'!A1",
                "-2+3+cmd|'/c calc'!A1",
                "\t=1+1",
                "\r=1+1",
                "\tSUM(A1)",
                "=HYPERLINK(\"http://evil\",\"click\")",
                "@",
                "="
            })
    void testNeutraliseFormula_dangerousValuesArePrefixed(String value) {
        assertEquals("'" + value, CsvUtils.neutraliseFormula(value));
    }

    @ParameterizedTest
    @ValueSource(
            strings = {
                "-12.50",
                "+3",
                "-1,234.00",
                "-12%",
                "-$4",
                "1e-5",
                "-1e-5",
                "-0",
                "-.5",
                "+1,000",
                "-1234567",
                "-12.50 ",
                "-£4.99",
                "-4€"
            })
    void testNeutraliseFormula_numbersAreUnchanged(String value) {
        assertEquals(value, CsvUtils.neutraliseFormula(value));
    }

    @ParameterizedTest
    @ValueSource(strings = {"-", "--", "---"})
    void testNeutraliseFormula_dashPlaceholdersAreUnchanged(String value) {
        assertEquals(value, CsvUtils.neutraliseFormula(value));
    }

    @ParameterizedTest
    @ValueSource(strings = {"Alice", "30", "hello=world", " =1+1", "a-b", "1-2", "(1,234.00)"})
    void testNeutraliseFormula_harmlessValuesAreUnchanged(String value) {
        assertEquals(value, CsvUtils.neutraliseFormula(value));
    }

    @Test
    void testNeutraliseFormula_nullAndEmpty() {
        assertNull(CsvUtils.neutraliseFormula(null));
        assertEquals("", CsvUtils.neutraliseFormula(""));
    }

    @Test
    void testNeutraliseFormula_isNotIdempotentOnAlreadyPrefixedValue() {
        // A prefixed value no longer starts with a trigger, so apostrophes cannot stack
        String once = CsvUtils.neutraliseFormula("=1+1");
        assertEquals("'=1+1", once);
        assertEquals(once, CsvUtils.neutraliseFormula(once));
    }

    @Test
    void testNeutraliseRow_prefixesOnlyDangerousCells() {
        List<String> row = Arrays.asList("Total", "-1,234.00", "=1+1", null);

        List<String> result = CsvUtils.neutraliseRow(row);

        assertEquals(Arrays.asList("Total", "-1,234.00", "'=1+1", null), result);
    }

    @Test
    void testNeutraliseRow_nullRow() {
        assertNull(CsvUtils.neutraliseRow(null));
    }
}
