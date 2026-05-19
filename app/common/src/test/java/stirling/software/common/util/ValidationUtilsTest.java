package stirling.software.common.util;

import static org.junit.jupiter.api.Assertions.*;

import java.util.ArrayList;
import java.util.Collections;
import java.util.List;

import org.junit.jupiter.api.Test;

class ValidationUtilsTest {

    @Test
    void testIsStringEmpty_null() {
        assertTrue(ValidationUtils.isStringEmpty(null));
    }

    @Test
    void testIsStringEmpty_emptyString() {
        assertTrue(ValidationUtils.isStringEmpty(""));
    }

    @Test
    void testIsStringEmpty_blankString() {
        assertTrue(ValidationUtils.isStringEmpty("   "));
        assertTrue(ValidationUtils.isStringEmpty("\t\n"));
    }

    @Test
    void testIsStringEmpty_nonEmptyString() {
        assertFalse(ValidationUtils.isStringEmpty("hello"));
        assertFalse(ValidationUtils.isStringEmpty(" a "));
    }

    @Test
    void testIsCollectionEmpty_null() {
        assertTrue(ValidationUtils.isCollectionEmpty(null));
    }

    @Test
    void testIsCollectionEmpty_emptyCollection() {
        assertTrue(ValidationUtils.isCollectionEmpty(Collections.emptyList()));
        assertTrue(ValidationUtils.isCollectionEmpty(new ArrayList<>()));
    }

    @Test
    void testIsCollectionEmpty_nonEmptyCollection() {
        assertFalse(ValidationUtils.isCollectionEmpty(List.of("a")));
        assertFalse(ValidationUtils.isCollectionEmpty(List.of("a", "b", "c")));
    }
}
