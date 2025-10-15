package stirling.software.common.util;

import java.util.concurrent.ConcurrentHashMap;
import java.util.regex.Pattern;
import java.util.regex.PatternSyntaxException;

import lombok.extern.slf4j.Slf4j;

@Slf4j
public final class RegexPatternUtils {

    private static final RegexPatternUtils INSTANCE = new RegexPatternUtils();
    private final ConcurrentHashMap<PatternKey, Pattern> patternCache = new ConcurrentHashMap<>();

    private static final String WHITESPACE_REGEX = "\\s++";
    private static final String EXTENSION_REGEX = "\\.(?:[^.]*+)?$";

    private RegexPatternUtils() {
        super();
        // Initialize with commonly used patterns for immediate availability
        precompileCommonPatterns();
    }

    /**
     * Get the singleton instance of the pattern cache.
     *
     * @return the singleton RegexPatternCache instance
     */
    public static RegexPatternUtils getInstance() {
        return INSTANCE;
    }

    /**
     * Get a compiled pattern from cache, compiling and caching if not present.
     *
     * <p>This method is thread-safe and uses lazy initialization. Multiple threads calling with the
     * same regex will result in only one compilation, with all threads receiving the same cached
     * Pattern instance.
     *
     * <p>Performance: first call compiles and caches (expensive), subsequent calls return cached
     * pattern (fast O(1) lookup).
     *
     * @param regex the regular expression string to compile
     * @return compiled Pattern object, never null
     * @throws PatternSyntaxException if the regex syntax is invalid
     * @throws IllegalArgumentException if regex is null
     */
    public Pattern getPattern(String regex) {
        if (regex == null) {
            throw new IllegalArgumentException("Regex pattern cannot be null");
        }

        return patternCache.computeIfAbsent(new PatternKey(regex, 0), this::compilePattern);
    }

    /**
     * Get a compiled pattern with flags.
     *
     * <p>Patterns with different flags are cached separately using a composite key. Common flags
     * include:
     *
     * <ul>
     *   <li>{@link Pattern#CASE_INSENSITIVE} - ignore case differences
     *   <li>{@link Pattern#MULTILINE} - ^ and $ match line boundaries
     *   <li>{@link Pattern#DOTALL} - . matches any character including newlines
     * </ul>
     *
     * @param regex the regular expression string
     * @param flags pattern flags (e.g., Pattern.CASE_INSENSITIVE)
     * @return compiled Pattern object with specified flags
     * @throws PatternSyntaxException if the regex syntax is invalid
     * @throws IllegalArgumentException if regex is null
     */
    public Pattern getPattern(String regex, int flags) {
        if (regex == null) {
            throw new IllegalArgumentException("Regex pattern cannot be null");
        }

        return patternCache.computeIfAbsent(new PatternKey(regex, flags), this::compilePattern);
    }

    /**
     * Check if a pattern is already cached.
     *
     * @param regex the regular expression string
     * @return true if pattern is cached, false otherwise
     */
    public boolean isCached(String regex) {
        return isCached(regex, 0);
    }

    /**
     * Check if a pattern with flags is already cached.
     *
     * @param regex the regular expression string
     * @param flags pattern flags
     * @return true if pattern is cached, false otherwise
     */
    public boolean isCached(String regex, int flags) {
        return regex != null && patternCache.containsKey(new PatternKey(regex, flags));
    }

    /**
     * Get current cache size (number of cached patterns). Useful for monitoring and debugging.
     *
     * @return number of patterns currently cached
     */
    public int getCacheSize() {
        return patternCache.size();
    }

    /**
     * Clear all cached patterns. Use sparingly as it forces recompilation of all patterns. Mainly
     * useful for testing or memory cleanup in long-running applications.
     */
    public void clearCache() {
        patternCache.clear();
        log.debug("Regex pattern cache cleared");
    }

    /**
     * Remove a specific pattern from cache.
     *
     * @param regex the regular expression string to remove
     * @return true if pattern was cached and removed, false otherwise
     */
    public boolean removeFromCache(String regex) {
        return removeFromCache(regex, 0);
    }

    /**
     * Remove a specific pattern with flags from cache.
     *
     * @param regex the regular expression string to remove
     * @param flags pattern flags
     * @return true if pattern was cached and removed, false otherwise
     */
    public boolean removeFromCache(String regex, int flags) {
        if (regex == null) {
            return false;
        }
        PatternKey key = new PatternKey(regex, flags);
        boolean removed = patternCache.remove(key) != null;
        if (removed) {
            log.debug("Removed regex pattern from cache: {} (flags: {})", regex, flags);
        }
        return removed;
    }

    /**
     * Internal method to compile a pattern and handle errors consistently.
     *
     * @return compiled Pattern
     * @throws PatternSyntaxException if regex is invalid
     */
    private Pattern compilePattern(PatternKey key) {
        String regex = key.regex;
        int flags = key.flags;

        try {
            Pattern pattern = Pattern.compile(regex, flags);
            log.trace("Compiled and cached regex pattern with flags {}: {}", flags, regex);
            return pattern;
        } catch (PatternSyntaxException e) {
            log.error(
                    "Invalid regex pattern: '{}' with flags {} - {}", regex, flags, e.getMessage());
            throw e;
        }
    }

    public static String getWhitespaceRegex() {
        return WHITESPACE_REGEX;
    }

    /** Creates a case-insensitive pattern for text searching */
    public Pattern createSearchPattern(String regex, boolean caseInsensitive) {
        int flags = caseInsensitive ? (Pattern.CASE_INSENSITIVE | Pattern.UNICODE_CASE) : 0;
        return getPattern(regex, flags);
    }

    /** Pattern for matching trailing slashes (e.g., "/path/to/dir///") */
    public Pattern getTrailingSlashesPattern() {
        return getPattern("/+$");
    }

    /** Pattern for removing drive letters from paths */
    public Pattern getDriveLetterPattern() {
        return getPattern("^[a-zA-Z]:[\\\\/]+");
    }

    /** Pattern for removing leading slashes from paths */
    public Pattern getLeadingSlashesPattern() {
        return getPattern("^[\\\\/]+");
    }

    /** Pattern for matching backslashes */
    public Pattern getBackslashPattern() {
        return getPattern("\\\\");
    }

    /** Pattern for sanitizing filenames by removing problematic characters */
    public Pattern getSafeFilenamePattern() {
        return getPattern("[/\\\\?%*:|\"<>]");
    }

    /** Pattern for sanitizing filenames (keeps only alphanumeric) */
    public Pattern getFilenameSafePattern() {
        return getPattern("[^a-zA-Z0-9]");
    }

    /**
     * Pattern for replacing non-alphanumeric characters with underscore (explicit underscore
     * variant)
     */
    public Pattern getNonAlnumUnderscorePattern() {
        return getPattern("[^A-Za-z0-9_]");
    }

    /** Pattern for collapsing multiple underscores */
    public Pattern getMultipleUnderscoresPattern() {
        return getPattern("_+");
    }

    /** Pattern for trimming leading underscores */
    public Pattern getLeadingUnderscoresPattern() {
        return getPattern("^_+");
    }

    /** Pattern for trimming trailing underscores */
    public Pattern getTrailingUnderscoresPattern() {
        return getPattern("_+$");
    }

    /** Pattern for matching upload/download paths (case insensitive) */
    public Pattern getUploadDownloadPathPattern() {
        return getPattern("(?i).*/(upload|download)/.*");
    }

    /** Pattern for matching one or more whitespace characters */
    public Pattern getWhitespacePattern() {
        return getPattern("\\s+");
    }

    /** Pattern for matching newlines (Windows and Unix style) */
    public Pattern getNewlinesPattern() {
        return getPattern("\\r?\\n");
    }

    /** Pattern for splitting on newlines (Windows and Unix style) */
    public Pattern getNewlineSplitPattern() {
        return getPattern("\\r?\\n");
    }

    /** Pattern for splitting text into words */
    public Pattern getWordSplitPattern() {
        return getPattern("\\s+");
    }

    /** Pattern for removing carriage returns */
    public Pattern getCarriageReturnPattern() {
        return getPattern("\\r");
    }

    /** Pattern for matching newline characters */
    public Pattern getNewlineCharsPattern() {
        return getPattern("[\n\r]");
    }

    /** Pattern for multi-format newline splitting (Windows, Mac, Unix) */
    public Pattern getMultiFormatNewlinePattern() {
        return getPattern("\r\n|\r|\n");
    }

    /** Pattern for encoded payload newline removal */
    public Pattern getEncodedPayloadNewlinePattern() {
        return getPattern("\\r?\\n");
    }

    /** Pattern for escaped newlines in watermark text */
    public Pattern getEscapedNewlinePattern() {
        return getPattern("\\\\n");
    }

    /** Pattern for input sanitization (allows only alphanumeric and spaces) */
    public Pattern getInputSanitizePattern() {
        return getPattern("[^a-zA-Z0-9 ]");
    }

    /** Pattern for removing angle brackets */
    public Pattern getAngleBracketsPattern() {
        return getPattern("[<>]");
    }

    /** Pattern for removing leading and trailing quotes */
    public Pattern getQuotesRemovalPattern() {
        return getPattern("^\"|\"$");
    }

    /** Pattern for plus signs (URL encoding replacement) */
    public Pattern getPlusSignPattern() {
        return getPattern("\\+");
    }

    /** Pattern for username validation */
    public Pattern getUsernameValidationPattern() {
        return getPattern("^[a-zA-Z0-9](?!.*[-@._+]{2,})[a-zA-Z0-9@._+-]{1,48}[a-zA-Z0-9]$");
    }

    public static String getExtensionRegex() {
        return EXTENSION_REGEX;
    }

    /** Pattern for extracting non-numeric characters */
    public Pattern getNumericExtractionPattern() {
        return getPattern("\\D");
    }

    /** Pattern for removing non-digit/dot characters (for timeout parsing) */
    public Pattern getNonDigitDotPattern() {
        return getPattern("[^\\d.]");
    }

    /** Pattern for matching digit/dot characters (for timeout parsing) */
    public Pattern getDigitDotPattern() {
        return getPattern("[\\d.]");
    }

    /** Pattern for detecting strings containing digits */
    public Pattern getContainsDigitsPattern() {
        return getPattern(".*\\d+.*");
    }

    /** Pattern for matching 1-3 digit numbers */
    public Pattern getNumberRangePattern() {
        return getPattern("[1-9][0-9]{0,2}");
    }

    /** Pattern for validating mathematical expressions */
    public Pattern getMathExpressionPattern() {
        return getPattern("[0-9n+\\-*/() ]+");
    }

    /** Pattern for adding multiplication between numbers and 'n' */
    public Pattern getNumberBeforeNPattern() {
        return getPattern("(\\d)n");
    }

    /** Pattern for detecting consecutive 'n' characters */
    public Pattern getConsecutiveNPattern() {
        return getPattern(".*n{2,}.*");
    }

    /** Pattern for replacing consecutive 'n' characters */
    public Pattern getConsecutiveNReplacementPattern() {
        return getPattern("(?<!n)n{2}");
    }

    /** Pattern for validating HTTP/HTTPS URLs */
    public Pattern getHttpUrlPattern() {
        return getPattern("^https?://.*");
    }

    /** Pattern for matching URLs in text for link creation */
    public Pattern getUrlLinkPattern() {
        return getPattern("(https?://[\\w\\-._~:/?#\\[\\]@!$&'()*+,;=%]+)");
    }

    /** Pattern for matching email addresses in text for link creation */
    public Pattern getEmailLinkPattern() {
        return getPattern("([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\\.[a-zA-Z]{2,63})");
    }

    /** Pattern for removing script tags from HTML */
    public Pattern getScriptTagPattern() {
        return getPattern("(?i)<script[^>]*>.*?</script>");
    }

    /** Pattern for removing style tags from HTML */
    public Pattern getStyleTagPattern() {
        return getPattern("(?i)<style[^>]*>.*?</style>");
    }

    /** Pattern for removing fixed position CSS */
    public Pattern getFixedPositionCssPattern() {
        return getPattern("(?i)\\s*position\\s*:\\s*fixed[^;]*;?");
    }

    /** Pattern for removing absolute position CSS */
    public Pattern getAbsolutePositionCssPattern() {
        return getPattern("(?i)\\s*position\\s*:\\s*absolute[^;]*;?");
    }

    /** Pattern for matching size unit suffixes (KB, MB, GB, etc.) */
    public Pattern getSizeUnitPattern() {
        return getPattern("[KMGkmg][Bb]");
    }

    /** Pattern for system temp file type 1 */
    public Pattern getSystemTempFile1Pattern() {
        return getPattern("lu\\d+[a-z0-9]*\\.tmp");
    }

    /** Pattern for system temp file type 2 (OCR processes) */
    public Pattern getSystemTempFile2Pattern() {
        return getPattern("ocr_process\\d+");
    }

    /** Pattern for splitting on whitespace and parentheses */
    public Pattern getWhitespaceParenthesesSplitPattern() {
        return getPattern("[\\s\\(\\)]+");
    }

    /** Pattern for MIME header whitespace cleanup before encoded sequences */
    public Pattern getMimeHeaderWhitespacePattern() {
        return getPattern("\\s+(?==\\?)");
    }

    /** Pattern for font name validation (6 uppercase letters + plus + rest) */
    public Pattern getFontNamePattern() {
        return getPattern("^[A-Z]{6}\\+.*");
    }

    /** Pattern for matching access="readOnly" attribute in XFA XML (with optional whitespace) */
    public Pattern getAccessReadOnlyPattern() {
        return getPattern("access\\s*=\\s*\"readOnly\"");
    }

    /** Pattern for matching MIME encoded-word headers (RFC 2047) Example: =?charset?B?encoded?= */
    public Pattern getMimeEncodedWordPattern() {
        return getPattern("=\\?([^?]+)\\?([BbQq])\\?([^?]*)\\?=");
    }

    /** Pattern for matching inline CID images in HTML (case-insensitive) */
    public Pattern getInlineCidImagePattern() {
        return getPattern(
                "(?i)<img[^>]*\\ssrc\\s*=\\s*['\"]cid:([^'\"]+)['\"][^>]*>",
                Pattern.CASE_INSENSITIVE);
    }

    /** Pattern for matching image file extensions (case-insensitive) */
    public Pattern getImageFilePattern() {
        return getPattern(".*\\.(jpg|jpeg|png|gif|bmp|webp)$", Pattern.CASE_INSENSITIVE);
    }

    /** Pattern for matching attachment section headers (case-insensitive) */
    public Pattern getAttachmentSectionPattern() {
        return getPattern("attachments\\s*\\(\\d+\\)", Pattern.CASE_INSENSITIVE);
    }

    /** Pattern for matching filenames in attachment markers */
    public Pattern getAttachmentFilenamePattern() {
        return getPattern("@\\s*([^\\s\\(]+(?:\\.[a-zA-Z0-9]+)?)");
    }

    /** Pattern for matching pdfaid:part attribute in XMP metadata */
    public Pattern getPdfAidPartPattern() {
        return getPattern("pdfaid:part[\"\\s]*=[\"\\s]*([0-9]+)");
    }

    /** Pattern for matching pdfaid:conformance attribute in XMP metadata */
    public Pattern getPdfAidConformancePattern() {
        return getPattern("pdfaid:conformance[\"\\s]*=[\"\\s]*([A-Za-z]+)");
    }

    /** Pattern for matching slash in page mode description */
    public Pattern getPageModePattern() {
        return getPattern("/");
    }

    /**
     * Pre-compile commonly used patterns for immediate availability. This eliminates first-call
     * compilation overhead for frequent patterns.
     */
    private void precompileCommonPatterns() {
        getPattern("\\.(?:[^.]*+)?$"); // Extension removal - possessive, optional, anchored
        getPattern("\\.[^.]+$"); // Simple extension match - anchored

        getPattern("\\s+"); // One or more whitespace
        getPattern("\\s*"); // Zero or more whitespace

        getPattern("/+$"); // Trailing slashes
        getPattern("\\D"); // Non-numeric characters
        getPattern("[/\\\\?%*:|\"<>]"); // Unsafe filename characters
        getPattern("[^a-zA-Z0-9 ]"); // Input sanitization
        getPattern("[^a-zA-Z0-9]"); // Filename sanitization
        // API doc patterns
        getPattern("Output:(\\w+)"); // precompiled single-escaped for runtime regex \w
        getPattern("Input:(\\w+)");
        getPattern("Type:(\\w+)");
        log.debug("Pre-compiled {} common regex patterns", patternCache.size());
    }

    /** Pattern for email validation */
    public Pattern getEmailValidationPattern() {
        return getPattern(
                "^(?=.{1,320}$)(?=.{1,64}@)[A-Za-z0-9](?:[A-Za-z0-9_.+-]*[A-Za-z0-9])?@[^-][A-Za-z0-9-]+(?:\\.[A-Za-z0-9-]+)*(?:\\.[A-Za-z]{2,})$");
    }

    /* Pattern for matching Output:<TYPE> in API descriptions */
    public Pattern getApiDocOutputTypePattern() {
        return getPattern("Output:(\\w+)");
    }

    /* Pattern for matching Input:<TYPE> in API descriptions */
    public Pattern getApiDocInputTypePattern() {
        return getPattern("Input:(\\w+)");
    }

    /**
     * Pattern for matching Type:<CODE> in API descriptions
     */
    public Pattern getApiDocTypePattern() {
        return getPattern("Type:(\\w+)");
    }

    /* Pattern for validating file extensions (2-4 alphanumeric, case-insensitive) */
    public Pattern getFileExtensionValidationPattern() {
        return getPattern("^[a-zA-Z0-9]{2,4}$", Pattern.CASE_INSENSITIVE);
    }

    private record PatternKey(String regex, int flags) {
        // Record automatically provides equals, hashCode, and toString
    }
}
