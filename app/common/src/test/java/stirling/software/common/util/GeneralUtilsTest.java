package stirling.software.common.util;

import static org.junit.jupiter.api.Assertions.assertEquals;

import java.util.List;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;

@DisplayName("GeneralUtils Page Parsing Tests")
public class GeneralUtilsTest {

    @Nested
    @DisplayName("All and Basic N Keyword Tests")
    class AllAndBasicNTests {

        @Test
        @DisplayName("Parsing 'all' returns all pages zero-based when zeroBased=false")
        void testParsePageListWithAll() {
            List<Integer> result = GeneralUtils.parsePageList(new String[] {"all"}, 5, false);
            assertEquals(List.of(0, 1, 2, 3, 4), result, "'All' keyword should return all pages zero-based");
        }

        @Test
        @DisplayName("Parsing 'all' returns all pages one-based when zeroBased=true")
        void testParsePageListWithAllOneBased() {
            List<Integer> result = GeneralUtils.parsePageList(new String[] {"all"}, 5, true);
            assertEquals(List.of(1, 2, 3, 4, 5), result, "'All' keyword should return all pages one-based");
        }

        @Test
        @DisplayName("Parsing 'n' returns all pages one-based")
        void nFunc() {
            List<Integer> result = GeneralUtils.parsePageList(new String[] {"n"}, 5, true);
            assertEquals(List.of(1, 2, 3, 4, 5), result, "'n' keyword should return all pages one-based");
        }
    }

    @Nested
    @DisplayName("Advanced N Function Tests")
    class AdvancedNFunctionTests {

        @Test
        @DisplayName("Parsing '4n' returns multiples of 4 one-based")
        void nFuncAdvanced() {
            List<Integer> result = GeneralUtils.parsePageList(new String[] {"4n"}, 9, true);
            assertEquals(List.of(4, 8), result, "'4n' should select multiples of 4 one-based");
        }

        @Test
        @DisplayName("Parsing '4n' returns multiples of 4 zero-based")
        void nFuncAdvancedZero() {
            List<Integer> result = GeneralUtils.parsePageList(new String[] {"4n"}, 9, false);
            assertEquals(List.of(3, 7), result, "'4n' should select multiples of 4 zero-based");
        }

        @Test
        @DisplayName("Parsing '4n-1' returns specified pages one-based")
        void nFuncAdvanced2() {
            List<Integer> result = GeneralUtils.parsePageList(new String[] {"4n-1"}, 9, true);
            assertEquals(List.of(3, 7), result, "'4n-1' should select (4n minus 1) pages one-based");
        }

        @Test
        @DisplayName("Parsing '4n+1' returns specified pages one-based")
        void nFuncAdvanced3() {
            List<Integer> result = GeneralUtils.parsePageList(new String[] {"4n+1"}, 9, true);
            assertEquals(List.of(5, 9), result, "'4n+1' should select (4n plus 1) pages one-based");
        }

        @Test
        @DisplayName("Parsing 'n + 1' with spaces returns adjusted pages one-based")
        void nFunc_spaces() {
            List<Integer> result = GeneralUtils.parsePageList(new String[] {"n + 1"}, 9, true);
            assertEquals(List.of(2, 3, 4, 5, 6, 7, 8, 9), result, "'n + 1' with spaces should return adjusted pages one-based");
        }

        @Test
        @DisplayName("Parsing consecutive 'nnn' returns pages at intervals one-based")
        void nFunc_consecutive_Ns_nnn() {
            List<Integer> result = GeneralUtils.parsePageList(new String[] {"nnn"}, 9, true);
            assertEquals(List.of(1, 8), result, "'nnn' should return pages at specified intervals one-based");
        }

        @Test
        @DisplayName("Parsing consecutive 'nn' returns pages at intervals one-based")
        void nFunc_consecutive_Ns_nn() {
            List<Integer> result = GeneralUtils.parsePageList(new String[] {"nn"}, 9, true);
            assertEquals(List.of(1, 4, 9), result, "'nn' should return pages at specified intervals one-based");
        }

        @Test
        @DisplayName("Parsing '(n-1)(n-2)' returns combined adjusted pages one-based")
        void nFunc_opening_closing_round_brackets() {
            List<Integer> result = GeneralUtils.parsePageList(new String[] {"(n-1)(n-2)"}, 9, true);
            assertEquals(List.of(2, 6), result, "'(n-1)(n-2)' should return combined adjusted pages one-based");
        }

        @Test
        @DisplayName("Parsing '2(n-1)' returns multiples of 2 adjusted one-based")
        void nFunc_opening_round_brackets() {
            List<Integer> result = GeneralUtils.parsePageList(new String[] {"2(n-1)"}, 9, true);
            assertEquals(List.of(2, 4, 6, 8), result, "'2(n-1)' should return multiples of 2 adjusted one-based");
        }

        @Test
        @DisplayName("Parsing 'n(n-1)' returns combined pages one-based")
        void nFunc_opening_round_brackets_n() {
            List<Integer> result = GeneralUtils.parsePageList(new String[] {"n(n-1)"}, 9, true);
            assertEquals(List.of(2, 6), result, "'n(n-1)' should return combined pages one-based");
        }

        @Test
        @DisplayName("Parsing '(n-1)2' returns multiples of 2 adjusted one-based")
        void nFunc_closing_round_brackets() {
            List<Integer> result = GeneralUtils.parsePageList(new String[] {"(n-1)2"}, 9, true);
            assertEquals(List.of(2, 4, 6, 8), result, "'(n-1)2' should return multiples of 2 adjusted one-based");
        }

        @Test
        @DisplayName("Parsing '(n-1)n' returns combined pages one-based")
        void nFunc_closing_round_brackets_n() {
            List<Integer> result = GeneralUtils.parsePageList(new String[] {"(n-1)n"}, 9, true);
            assertEquals(List.of(2, 6), result, "'(n-1)n' should return combined pages one-based");
        }

        @Test
        @DisplayName("Parsing '(n-1)' returns pages adjusted one-based")
        void nFunc_function_surrounded_with_brackets() {
            List<Integer> result = GeneralUtils.parsePageList(new String[] {"(n-1)"}, 9, true);
            assertEquals(List.of(1, 2, 3, 4, 5, 6, 7, 8), result, "'(n-1)' should return adjusted pages one-based");
        }

        @Test
        @DisplayName("Parsing '3+2n' returns specified pages with addition one-based")
        void nFuncAdvanced4() {
            List<Integer> result = GeneralUtils.parsePageList(new String[] {"3+2n"}, 9, true);
            assertEquals(List.of(5, 7, 9), result, "'3+2n' should return specified pages one-based");
        }

        @Test
        @DisplayName("Parsing '4n' zero-based returns correct pages")
        void nFuncAdvancedZerobased() {
            List<Integer> result = GeneralUtils.parsePageList(new String[] {"4n"}, 9, false);
            assertEquals(List.of(3, 7), result, "'4n' zero-based should return correct pages");
        }

        @Test
        @DisplayName("Parsing '4n-1' zero-based returns correct pages")
        void nFuncAdvanced2Zerobased() {
            List<Integer> result = GeneralUtils.parsePageList(new String[] {"4n-1"}, 9, false);
            assertEquals(List.of(2, 6), result, "'4n-1' zero-based should return correct pages");
        }
    }

    @Nested
    @DisplayName("Range Parsing Tests")
    class RangeParsingTests {

        @Test
        @DisplayName("Parsing range '1-3' one-based returns correct pages")
        void testParsePageListWithRangeOneBasedOutput() {
            List<Integer> result = GeneralUtils.parsePageList(new String[] {"1-3"}, 5, true);
            assertEquals(List.of(1, 2, 3), result, "'1-3' one-based should return correct pages");
        }

        @Test
        @DisplayName("Parsing range '1-3' zero-based returns correct pages")
        void testParsePageListWithRangeZeroBaseOutput() {
            List<Integer> result = GeneralUtils.parsePageList(new String[] {"1-3"}, 5, false);
            assertEquals(List.of(0, 1, 2), result, "'1-3' zero-based should return correct pages");
        }

        @Test
        @DisplayName("Parsing mixed pages and ranges one-based returns correct pages")
        void testParsePageListWithRangeOneBasedOutputFull() {
            List<Integer> result = GeneralUtils.parsePageList(new String[] {"1,3,7-8"}, 8, true);
            assertEquals(List.of(1, 3, 7, 8), result, "'1,3,7-8' one-based should return correct pages");
        }

        @Test
        @DisplayName("Parsing mixed pages and ranges with out-of-range one-based inputs returns only valid pages")
        void testParsePageListWithRangeOneBasedOutputFullOutOfRange() {
            List<Integer> result = GeneralUtils.parsePageList(new String[] {"1,3,7-8"}, 5, true);
            assertEquals(List.of(1, 3), result, "'1,3,7-8' with out-of-range should return only valid pages one-based");
        }

        @Test
        @DisplayName("Parsing mixed pages and ranges zero-based returns correct pages")
        void testParsePageListWithRangeZeroBaseOutputFull() {
            List<Integer> result = GeneralUtils.parsePageList(new String[] {"1,3,7-8"}, 8, false);
            assertEquals(List.of(0, 2, 6, 7), result, "'1,3,7-8' zero-based should return correct pages");
        }
    }
}
