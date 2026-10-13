package stirling.software.common.util;

import static org.junit.jupiter.api.Assertions.assertDoesNotThrow;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;

import java.util.List;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;

class GeneralUtilsPageSelectionTest {

    @ParameterizedTest
    @ValueSource(strings = {"100n", "n+100", ",,", "99", "100n,99"})
    void rejectsSelectionsThatResolveToNoPages(String selection) {
        assertThrows(
                IllegalArgumentException.class,
                () -> GeneralUtils.requireValidPageSelection(selection, 5));
    }

    @ParameterizedTest
    @ValueSource(strings = {"1 2", "a ll", "0", "-1", "3-1", "n+"})
    void rejectsMalformedTokensInsteadOfRemovingInternalWhitespace(String selection) {
        assertThrows(
                IllegalArgumentException.class,
                () -> GeneralUtils.requireValidPageSelection(selection, 15));
    }

    @ParameterizedTest
    @ValueSource(strings = {"1,99", "1,100n", "1,n+100"})
    void acceptsSelectionsThatMatchSomePagesInASmallerBatchDocument(String selection) {
        assertDoesNotThrow(() -> GeneralUtils.requireValidPageSelection(selection, 5));
        assertEquals(List.of(1), GeneralUtils.parsePageList(selection, 5, true));
    }

    @ParameterizedTest
    @ValueSource(strings = {" 1 - 3 ", "1-3", "1 - "})
    void acceptsRangeWhitespaceSupportedByTheParser(String selection) {
        assertDoesNotThrow(() -> GeneralUtils.requireValidPageSelection(selection, 3));
        assertEquals(List.of(1, 2, 3), GeneralUtils.parsePageList(selection, 3, true));
    }

    @Test
    void acceptsNFunctionsThatActuallyMatch() {
        GeneralUtils.requireValidPageSelection("2n+1", 5);
        assertEquals(List.of(3, 5), GeneralUtils.parsePageList("2n+1", 5, true));
    }
}
