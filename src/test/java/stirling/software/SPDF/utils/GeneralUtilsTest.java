package stirling.software.SPDF.utils;

import static org.junit.jupiter.api.Assertions.*;
import org.junit.jupiter.api.Test;
import java.util.List;


public class GeneralUtilsTest {

	 

	    @Test
	    void testParsePageListWithAll() {
	        List<Integer> result = GeneralUtils.parsePageList(new String[]{"all"}, 5, false);
	        assertEquals(List.of(0, 1, 2, 3, 4), result, "'All' keyword should return all pages.");
	    }
	    
	    @Test
	    void testParsePageListWithAllOneBased() {
	        List<Integer> result = GeneralUtils.parsePageList(new String[]{"all"}, 5, true);
	        assertEquals(List.of(1, 2, 3, 4, 5), result, "'All' keyword should return all pages.");
	    }
	    
	    @Test
	    void nFunc() {
	        List<Integer> result = GeneralUtils.parsePageList(new String[]{"n"}, 5, true);
	        assertEquals(List.of(1, 2, 3, 4, 5), result, "'n' keyword should return all pages.");
	    }
	    
	    @Test
	    void nFuncAdvanced() {
	        List<Integer> result = GeneralUtils.parsePageList(new String[]{"4n"}, 9, true);
	        //skip 0 as not valid
	        assertEquals(List.of(4,8), result, "'All' keyword should return all pages.");
	    }

	    @Test
	    void nFuncAdvancedZero() {
	        List<Integer> result = GeneralUtils.parsePageList(new String[]{"4n"}, 9, false);
	        //skip 0 as not valid
	        assertEquals(List.of(3,7), result, "'All' keyword should return all pages.");
	    }
	    
	    @Test
	    void nFuncAdvanced2() {
	        List<Integer> result = GeneralUtils.parsePageList(new String[]{"4n-1"}, 9, true);
	        // skip -1 as not valid
	        assertEquals(List.of(3,7), result, "4n-1 should do (0-1), (4-1), (8-1)");
	    }
	    
	    @Test
	    void nFuncAdvanced3() {
	        List<Integer> result = GeneralUtils.parsePageList(new String[]{"4n+1"}, 9, true);
	        assertEquals(List.of(1,5,9), result, "'All' keyword should return all pages.");
	    }
	    
	    
	    @Test
	    void nFuncAdvanced4() {
	        List<Integer> result = GeneralUtils.parsePageList(new String[]{"3+2n"}, 9, true);
	        assertEquals(List.of(3,5,7,9), result, "'All' keyword should return all pages.");
	    }
	    
	    @Test
	    void nFuncAdvancedZerobased() {
	        List<Integer> result = GeneralUtils.parsePageList(new String[]{"4n"}, 9, false);
	        assertEquals(List.of(3,7), result, "'All' keyword should return all pages.");
	    }

	    @Test
	    void nFuncAdvanced2Zerobased() {
	        List<Integer> result = GeneralUtils.parsePageList(new String[]{"4n-1"}, 9, false);
	        assertEquals(List.of(2,6), result, "'All' keyword should return all pages.");
	    }
	    @Test
	    void testParsePageListWithRangeOneBasedOutput() {
	        List<Integer> result = GeneralUtils.parsePageList(new String[]{"1-3"}, 5, true);
	        assertEquals(List.of(1, 2, 3), result, "Range should be parsed correctly.");
	    }

	    
	    @Test
	    void testParsePageListWithRangeZeroBaseOutput() {
	        List<Integer> result = GeneralUtils.parsePageList(new String[]{"1-3"}, 5, false);
	        assertEquals(List.of(0, 1, 2), result, "Range should be parsed correctly.");
	    }
	    
	    
	    @Test
	    void testParsePageListWithRangeOneBasedOutputFull() {
	        List<Integer> result = GeneralUtils.parsePageList(new String[]{"1,3,7-8"}, 8, true);
	        assertEquals(List.of(1, 3, 7,8), result, "Range should be parsed correctly.");
	    }

	    @Test
	    void testParsePageListWithRangeOneBasedOutputFullOutOfRange() {
	        List<Integer> result = GeneralUtils.parsePageList(new String[]{"1,3,7-8"}, 5, true);
	        assertEquals(List.of(1, 3), result, "Range should be parsed correctly.");
	    }
	    @Test
	    void testParsePageListWithRangeZeroBaseOutputFull() {
	        List<Integer> result = GeneralUtils.parsePageList(new String[]{"1,3,7-8"}, 8, false);
	        assertEquals(List.of(0, 2, 6,7), result, "Range should be parsed correctly.");
	    }
}
