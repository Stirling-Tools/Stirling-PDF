package stirling.software.SPDF.utils.text;

import java.util.ArrayList;
import java.util.List;
import java.util.Set;
import java.util.regex.Pattern;

import lombok.experimental.UtilityClass;
import lombok.extern.slf4j.Slf4j;

@Slf4j
@UtilityClass
public class TextFinderUtils {

    public List<Pattern> createOptimizedSearchPatterns(
            Set<String> searchTerms, boolean useRegex, boolean wholeWordSearch) {
        List<Pattern> patterns = new ArrayList<>();

        if (searchTerms == null) {
            return patterns;
        }

        for (String term : searchTerms) {
            if (term == null) {
                continue;
            }

            String trimmedTerm = term.trim();
            if (trimmedTerm.isEmpty()) {
                continue;
            }

            try {
                String patternString;
                if (useRegex) {
                    patternString = trimmedTerm;
                    try {
                        Pattern.compile(patternString);
                    } catch (Exception e) {
                        patternString = Pattern.quote(trimmedTerm);
                    }
                } else {
                    patternString = Pattern.quote(trimmedTerm);
                }

                if (wholeWordSearch) {
                    patternString = applyWordBoundaries(trimmedTerm, patternString, useRegex);
                }

                int flags = Pattern.CASE_INSENSITIVE | Pattern.UNICODE_CASE | Pattern.DOTALL;
                try {
                    flags |= Pattern.CANON_EQ;
                } catch (Exception e) {
                }

                Pattern pattern = Pattern.compile(patternString, flags);
                patterns.add(pattern);

            } catch (Exception e) {
                try {
                    String quotedTerm = Pattern.quote(trimmedTerm);
                    if (wholeWordSearch) {
                        quotedTerm = applyWordBoundaries(trimmedTerm, quotedTerm, false);
                    }
                    Pattern fallbackPattern =
                            Pattern.compile(
                                    quotedTerm, Pattern.CASE_INSENSITIVE | Pattern.UNICODE_CASE);
                    patterns.add(fallbackPattern);
                } catch (Exception e2) {
                    try {
                        Pattern simplestPattern = Pattern.compile(Pattern.quote(trimmedTerm));
                        patterns.add(simplestPattern);
                    } catch (Exception e3) {
                    }
                }
            }
        }

        return patterns;
    }

    private String applyWordBoundaries(String originalTerm, String patternString, boolean isRegex) {
        if (originalTerm == null || originalTerm.isEmpty()) {
            return patternString;
        }

        try {
            if (originalTerm.length() == 1) {
                char c = originalTerm.charAt(0);
                if (Character.isDigit(c)) {
                    // Single digit as a strict standalone token:
                    // - Not adjacent to letters or digits
                    // - Not part of a decimal number (e.g., 1.0 or 2,50)
                    //   by excluding cases where a digit is immediately followed by [.,]\d
                    //   or immediately preceded by \d[.,]
                    String leftBoundary = "(?<![\\p{L}\\p{N}])(?<!\\d\\.)(?<!\\d,)";
                    String rightBoundary = "(?![\\p{L}\\p{N}])(?![.,]\\d)";
                    return leftBoundary + patternString + rightBoundary;
                } else if (Character.isLetter(c)) {
                    return "(?<![\\p{L}\\p{N}])" + patternString + "(?![\\p{L}\\p{N}])";
                } else {
                    return "(?<!\\S)" + patternString + "(?!\\S)";
                }
            }

            boolean startsWithWordChar = Character.isLetterOrDigit(originalTerm.charAt(0));
            boolean endsWithWordChar =
                    Character.isLetterOrDigit(originalTerm.charAt(originalTerm.length() - 1));

            String result = patternString;

            if (startsWithWordChar) {
                result = "(?<![\\p{L}\\p{N}])" + result;
            } else {
                result = "(?<!\\S)" + result;
            }

            if (endsWithWordChar) {
                result = result + "(?![\\p{L}\\p{N}])";
            } else {
                result = result + "(?!\\S)";
            }

            return result;

        } catch (Exception e) {
            try {
                return "\\b" + patternString + "\\b";
            } catch (Exception e2) {
                return patternString;
            }
        }
    }
}
