package stirling.software.common.util;

import static org.junit.jupiter.api.Assertions.*;

import java.util.regex.Pattern;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

public class RegexPatternUtilsTest {

    private RegexPatternUtils utils;

    @BeforeEach
    void setUp() {
        utils = RegexPatternUtils.getInstance();
        utils.clearCache(); // Start with clean cache for each test
    }

    @Test
    void testPatternCaching() {
        String regex = "test\\d+";

        Pattern pattern1 = utils.getPattern(regex);
        assertNotNull(pattern1);
        assertTrue(utils.isCached(regex));
        assertEquals(
                1, utils.getCacheSize()); // Should have at least 1 pattern (plus precompiled ones
        // are cleared)

        Pattern pattern2 = utils.getPattern(regex);
        assertSame(pattern1, pattern2); // Should be the exact same object
    }

    @Test
    void testPatternWithFlags() {
        String regex = "test";
        int flags = Pattern.CASE_INSENSITIVE;

        Pattern pattern1 = utils.getPattern(regex, flags);
        Pattern pattern2 = utils.getPattern(regex); // No flags

        assertNotSame(pattern1, pattern2); // Different flags = different cached patterns
        assertTrue(utils.isCached(regex, flags));
        assertTrue(utils.isCached(regex, 0));
    }

    @Test
    void testCacheEviction() {
        String regex = "evict\\d+";

        utils.getPattern(regex);
        assertTrue(utils.isCached(regex));

        boolean removed = utils.removeFromCache(regex);
        assertTrue(removed);
        assertFalse(utils.isCached(regex));

        boolean removedAgain = utils.removeFromCache(regex);
        assertFalse(removedAgain);
    }

    @Test
    void testNullRegexHandling() {
        assertThrows(
                IllegalArgumentException.class,
                () -> {
                    utils.getPattern(null);
                });

        assertThrows(
                IllegalArgumentException.class,
                () -> {
                    utils.getPattern(null, Pattern.CASE_INSENSITIVE);
                });

        assertFalse(utils.isCached(null));
        assertFalse(utils.removeFromCache(null));
    }

    @Test
    void testCommonPatterns() {
        Pattern whitespace = utils.getWhitespacePattern();
        assertTrue(whitespace.matcher("  \t  ").matches());

        Pattern trailing = utils.getTrailingSlashesPattern();
        assertTrue(trailing.matcher("/path/to/dir///").find());

        Pattern filename = utils.getSafeFilenamePattern();
        assertTrue(filename.matcher("bad<file>name").find());
    }

    @Test
    void testCreateSearchPattern() {
        String regex = "Hello";

        Pattern caseSensitive = utils.createSearchPattern(regex, false);
        Pattern caseInsensitive = utils.createSearchPattern(regex, true);

        assertTrue(caseSensitive.matcher("Hello").matches());
        assertFalse(caseSensitive.matcher("hello").matches());

        assertTrue(caseInsensitive.matcher("Hello").matches());
        assertTrue(caseInsensitive.matcher("hello").matches());
        assertTrue(caseInsensitive.matcher("HELLO").matches());
    }

    @Test
    void testSingletonBehavior() {
        RegexPatternUtils instance1 = RegexPatternUtils.getInstance();
        RegexPatternUtils instance2 = RegexPatternUtils.getInstance();

        assertSame(instance1, instance2);
    }
}
