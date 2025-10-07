package stirling.software.SPDF.utils.text;

import java.util.ArrayList;
import java.util.List;
import java.util.Set;
import java.util.regex.Pattern;

import org.apache.pdfbox.pdmodel.PDPage;
import org.apache.pdfbox.pdmodel.PDResources;

import lombok.extern.slf4j.Slf4j;

import stirling.software.common.util.RegexPatternUtils;

@Slf4j
public class TextFinderUtils {

    public static boolean validateFontReliability(org.apache.pdfbox.pdmodel.font.PDFont font) {
        if (font == null) {
            return false;
        }

        if (font.isDamaged()) {
            log.debug(
                    "Font {} is marked as damaged - using TextEncodingHelper validation",
                    font.getName());
        }

        if (TextEncodingHelper.canCalculateBasicWidths(font)) {
            log.debug(
                    "Font {} passed basic width calculations - considering reliable",
                    font.getName());
            return true;
        }

        String[] basicTests = {"1", "2", "3", "a", "A", "e", "E", " "};

        int workingChars = 0;
        for (String testChar : basicTests) {
            if (TextEncodingHelper.canEncodeCharacters(font, testChar)) {
                workingChars++;
            }
        }

        if (workingChars > 0) {
            log.debug(
                    "Font {} can process {}/{} basic characters - considering reliable",
                    font.getName(),
                    workingChars,
                    basicTests.length);
            return true;
        }

        log.debug("Font {} failed all basic tests - considering unreliable", font.getName());
        return false;
    }

    public static List<Pattern> createOptimizedSearchPatterns(
            Set<String> searchTerms, boolean useRegex, boolean wholeWordSearch) {
        List<Pattern> patterns = new ArrayList<>();

        for (String term : searchTerms) {
            if (term == null || term.trim().isEmpty()) {
                continue;
            }

            try {
                String patternString = useRegex ? term.trim() : Pattern.quote(term.trim());

                if (wholeWordSearch) {
                    patternString = applyWordBoundaries(term.trim(), patternString);
                }

                // Use PatternFactory for better performance with cached compilation
                Pattern pattern =
                        RegexPatternUtils.getInstance().createSearchPattern(patternString, true);
                patterns.add(pattern);

                log.debug("Created search pattern: '{}' -> '{}'", term.trim(), patternString);

            } catch (Exception e) {
                log.warn("Failed to create pattern for term '{}': {}", term, e.getMessage());
            }
        }

        return patterns;
    }

    private static String applyWordBoundaries(String originalTerm, String patternString) {
        if (originalTerm.length() == 1 && Character.isDigit(originalTerm.charAt(0))) {
            return "(?<![\\w])" + patternString + "(?![\\w])";
        } else if (originalTerm.length() == 1) {
            return "(?<![\\w])" + patternString + "(?![\\w])";
        } else {
            return "\\b" + patternString + "\\b";
        }
    }

    public static boolean hasProblematicFonts(PDPage page) {
        if (page == null) {
            return false;
        }

        try {
            PDResources resources = page.getResources();
            if (resources == null) {
                return false;
            }

            int totalFonts = 0;
            int completelyUnusableFonts = 0;

            for (org.apache.pdfbox.cos.COSName fontName : resources.getFontNames()) {
                try {
                    org.apache.pdfbox.pdmodel.font.PDFont font = resources.getFont(fontName);
                    if (font != null) {
                        totalFonts++;
                        if (!validateFontReliability(font)) {
                            completelyUnusableFonts++;
                        }
                    }
                } catch (Exception e) {
                    log.debug("Font loading failed for {}: {}", fontName.getName(), e.getMessage());
                    totalFonts++;
                }
            }

            boolean hasProblems = totalFonts > 0 && (completelyUnusableFonts * 2 > totalFonts);
            log.debug(
                    "Page font analysis: {}/{} fonts are completely unusable - page {} problematic",
                    completelyUnusableFonts,
                    totalFonts,
                    hasProblems ? "IS" : "is NOT");

            return hasProblems;

        } catch (Exception e) {
            log.warn("Font analysis failed for page: {}", e.getMessage());
            return false; // Be permissive if analysis fails
        }
    }
    // import lombok.extern.slf4j.Slf4j;

    // @Slf4j
    // public class TextFinderUtils {

    // public static boolean validateFontReliability(org.apache.pdfbox.pdmodel.font.PDFont font) {
    //     if (font == null) {
    //         return false;
    //     }

    //     if (font.isDamaged()) {
    //         log.debug(
    //                 "Font {} is marked as damaged - using TextEncodingHelper validation",
    //                 font.getName());
    //     }

    //     if (TextEncodingHelper.canCalculateBasicWidths(font)) {
    //         log.debug(
    //                 "Font {} passed basic width calculations - considering reliable",
    //                 font.getName());
    //         return true;
    //     }

    //     String[] basicTests = {"1", "2", "3", "a", "A", "e", "E", " "};

    //     int workingChars = 0;
    //     for (String testChar : basicTests) {
    //         if (TextEncodingHelper.canEncodeCharacters(font, testChar)) {
    //             workingChars++;
    //         }
    //     }

    //     if (workingChars > 0) {
    //         log.debug(
    //                 "Font {} can process {}/{} basic characters - considering reliable",
    //                 font.getName(),
    //                 workingChars,
    //                 basicTests.length);
    //         return true;
    //     }

    //     log.debug("Font {} failed all basic tests - considering unreliable", font.getName());
    //     return false;
    // }

    // public static List<Pattern> createOptimizedSearchPatterns(
    //         Set<String> searchTerms, boolean useRegex, boolean wholeWordSearch) {
    //     List<Pattern> patterns = new ArrayList<>();

    //     for (String term : searchTerms) {
    //         if (term == null || term.trim().isEmpty()) {
    //             continue;
    //         }

    //         try {
    //             String patternString = useRegex ? term.trim() : Pattern.quote(term.trim());

    //             if (wholeWordSearch) {
    //                 patternString = applyWordBoundaries(term.trim(), patternString);
    //             }

    //             Pattern pattern =
    //                     Pattern.compile(
    //                             patternString, Pattern.CASE_INSENSITIVE | Pattern.UNICODE_CASE);
    //             patterns.add(pattern);

    //             log.debug("Created search pattern: '{}' -> '{}'", term.trim(), patternString);

    //         } catch (Exception e) {
    //             log.warn("Failed to create pattern for term '{}': {}", term, e.getMessage());
    //         }
    //     }

    //     return patterns;
    // }

    // private static String applyWordBoundaries(String originalTerm, String patternString) {
    //     if (originalTerm.length() == 1 && Character.isDigit(originalTerm.charAt(0))) {
    //         return "(?<![\\w])" + patternString + "(?![\\w])";
    //     } else if (originalTerm.length() == 1) {
    //         return "(?<![\\w])" + patternString + "(?![\\w])";
    //     } else {
    //         return "\\b" + patternString + "\\b";
    //     }
    // }

    // public static boolean hasProblematicFonts(PDPage page) {
    //     if (page == null) {
    //         return false;
    //     }

    //     try {
    //         PDResources resources = page.getResources();
    //         if (resources == null) {
    //             return false;
    //         }

    //         int totalFonts = 0;
    //         int completelyUnusableFonts = 0;

    //         for (org.apache.pdfbox.cos.COSName fontName : resources.getFontNames()) {
    //             try {
    //                 org.apache.pdfbox.pdmodel.font.PDFont font = resources.getFont(fontName);
    //                 if (font != null) {
    //                     totalFonts++;
    //                     if (!validateFontReliability(font)) {
    //                         completelyUnusableFonts++;
    //                     }
    //                 }
    //             } catch (Exception e) {
    //                 log.debug("Font loading failed for {}: {}", fontName.getName(),
    // e.getMessage());
    //                 totalFonts++;
    //             }
    //         }

    //         boolean hasProblems = totalFonts > 0 && (completelyUnusableFonts * 2 > totalFonts);
    //         log.debug(
    //                 "Page font analysis: {}/{} fonts are completely unusable - page {}
    // problematic",
    //                 completelyUnusableFonts,
    //                 totalFonts,
    //                 hasProblems ? "IS" : "is NOT");

    //         return hasProblems;

    //     } catch (Exception e) {
    //         log.warn("Font analysis failed for page: {}", e.getMessage());
    //         return false; // Be permissive if analysis fails
    //     }
    // }
    // /* =========================
    // Security/Resource Defaults
    // ========================= */
    // private static final int DEFAULT_MAX_TERMS = 100;
    // private static final int DEFAULT_MAX_TERM_LEN = 200;
    // private static final int DEFAULT_MAX_PATTERN_LEN = 1000;
    // private static final int DEFAULT_MAX_FONTS_PER_PAGE = 64;
    // private static final Duration DEFAULT_OPERATION_TIMEOUT = Duration.ofSeconds(5);

    // /* =========================
    // Public Options (configurable)
    // ========================= */
    // @Value
    // @Builder
    // public static class Options {
    //     @Builder.Default boolean allowRegex = true;

    //     @Builder.Default
    //     BehaviorOnUnsafeRegex behaviorOnUnsafeRegex = BehaviorOnUnsafeRegex.ESCAPE_TO_LITERAL;

    //     @Builder.Default int maxTerms = DEFAULT_MAX_TERMS;
    //     @Builder.Default int maxTermLength = DEFAULT_MAX_TERM_LEN;
    //     @Builder.Default int maxPatternLength = DEFAULT_MAX_PATTERN_LEN;
    //     @Builder.Default int maxFontsPerPage = DEFAULT_MAX_FONTS_PER_PAGE;
    //     @Builder.Default boolean countFontLoadFailuresAsUnusable = true;

    //     @Builder.Default
    //     Duration operationTimeout = DEFAULT_OPERATION_TIMEOUT; // harte Obergrenze je Aufruf
    // }

    // public enum BehaviorOnUnsafeRegex {
    //     REJECT, // unsichere Regex verwerfen
    //     ESCAPE_TO_LITERAL // unsichere Regex als Literal-Suche behandeln
    // }

    // /* =========================
    // Public API (beibehaltende Signaturen + Overloads)
    // ========================= */

    // public static boolean validateFontReliability(org.apache.pdfbox.pdmodel.font.PDFont font) {
    //     return validateFontReliability(font, Instant.now(), DEFAULT_OPERATION_TIMEOUT);
    // }

    // public static List<Pattern> createOptimizedSearchPatterns(
    //         Set<String> searchTerms, boolean useRegex, boolean wholeWordSearch) {
    //     return createOptimizedSearchPatterns(
    //             searchTerms, useRegex, wholeWordSearch, Options.builder().build());
    // }

    // public static boolean hasProblematicFonts(PDPage page) {
    //     return hasProblematicFonts(page, Options.builder().build());
    // }

    // /* =========================
    // Hardened Implementierungen
    // ========================= */

    // public static boolean validateFontReliability(
    //         org.apache.pdfbox.pdmodel.font.PDFont font, Instant start, Duration timeout) {
    //     if (font == null) return false;

    //     if (timedOut(start, timeout)) {
    //         log.warn("Font validation aborted due to timeout");
    //         return false;
    //     }

    //     if (font.isDamaged()) {
    //         log.debug(
    //                 "Font {} is marked as damaged - using TextEncodingHelper validation",
    //                 safe(font.getName(), 200));
    //     }

    //     if (TextEncodingHelper.canCalculateBasicWidths(font)) {
    //         log.debug(
    //                 "Font {} passed basic width calculations - considering reliable",
    //                 safe(font.getName(), 200));
    //         return true;
    //     }

    //     String[] basicTests = {"1", "2", "3", "a", "A", "e", "E", " "};
    //     int workingChars = 0;
    //     for (String testChar : basicTests) {
    //         if (timedOut(start, timeout)) {
    //             log.warn("Font validation aborted due to timeout");
    //             return false;
    //         }
    //         if (TextEncodingHelper.canEncodeCharacters(font, testChar)) {
    //             workingChars++;
    //         }
    //     }

    //     if (workingChars > 0) {
    //         log.debug(
    //                 "Font {} can process {}/{} basic characters - considering reliable",
    //                 safe(font.getName(), 200),
    //                 workingChars,
    //                 basicTests.length);
    //         return true;
    //     }

    //     log.debug(
    //             "Font {} failed all basic tests - considering unreliable",
    //             safe(font.getName(), 200));
    //     return false;
    // }

    // public static List<Pattern> createOptimizedSearchPatterns(
    //         Set<String> searchTerms, boolean useRegex, boolean wholeWordSearch, Options options)
    // {

    //     Instant start = Instant.now();

    //     if (searchTerms == null || searchTerms.isEmpty()) {
    //         return List.of();
    //     }

    //     List<Pattern> patterns = new ArrayList<>();
    //     int count = 0;

    //     for (String raw : searchTerms) {
    //         if (timedOut(start, options.getOperationTimeout())) {
    //             log.warn("Pattern creation aborted due to timeout");
    //             break;
    //         }

    //         if (raw == null) continue;
    //         String term = raw.trim();
    //         if (term.isEmpty()) continue;

    //         if (term.length() > options.getMaxTermLength()) {
    //             log.warn(
    //                     "Search term too long ({} > {}), skipping: {}",
    //                     term.length(),
    //                     options.getMaxTermLength(),
    //                     safe(term, 120));
    //             continue;
    //         }

    //         if (++count > options.getMaxTerms()) {
    //             log.warn("Too many search terms (> {}), remaining skipped",
    // options.getMaxTerms());
    //             break;
    //         }

    //         try {
    //             String patternString;

    //             if (useRegex && options.isAllowRegex()) {
    //                 if (!isRegexSafe(term)) {
    //                     if (options.getBehaviorOnUnsafeRegex() == BehaviorOnUnsafeRegex.REJECT) {
    //                         log.warn("Unsafe regex rejected: {}", safe(term, 120));
    //                         continue;
    //                     } else {
    //                         log.warn("Unsafe regex downgraded to literal: {}", safe(term, 120));
    //                         patternString = Pattern.quote(term);
    //                     }
    //                 } else {
    //                     patternString = term;
    //                 }
    //             } else {
    //                 patternString = Pattern.quote(term);
    //             }

    //             if (wholeWordSearch) {
    //                 patternString = applyWordBoundaries(term, patternString);
    //             }

    //             if (patternString.length() > options.getMaxPatternLength()) {
    //                 log.warn(
    //                         "Compiled pattern too long ({} > {}), skipping",
    //                         patternString.length(),
    //                         options.getMaxPatternLength());
    //                 continue;
    //             }

    //             // Unicode-aware Flags ergänzen
    //             Pattern pattern =
    //                     Pattern.compile(
    //                             patternString,
    //                             Pattern.CASE_INSENSITIVE
    //                                     | Pattern.UNICODE_CASE
    //                                     | Pattern.UNICODE_CHARACTER_CLASS);

    //             patterns.add(pattern);
    //             log.debug(
    //                     "Created search pattern: '{}' -> '{}'",
    //                     safe(term, 120),
    //                     safe(patternString, 200));

    //         } catch (Exception e) {
    //             log.warn(
    //                     "Failed to create pattern for term '{}': {}",
    //                     safe(term, 120),
    //                     e.getMessage());
    //         }
    //     }

    //     return patterns;
    // }

    // private static String applyWordBoundaries(String originalTerm, String patternString) {
    //     // Einheitliche Behandlung für 1-Zeichen-Fälle; Unicode-aware Wortgrenzen.
    //     if (originalTerm.length() == 1) {
    //         return "(?<![\\p{Alnum}_])" + patternString + "(?![\\p{Alnum}_])";
    //     } else {
    //         // \b ist mit UNICODE_CHARACTER_CLASS in Java weitgehend unicode-aware.
    //         return "\\b" + patternString + "\\b";
    //     }
    // }

    // public static boolean hasProblematicFonts(PDPage page, Options options) {
    //     if (page == null) return false;

    //     Instant start = Instant.now();

    //     try {
    //         PDResources resources = page.getResources();
    //         if (resources == null) return false;

    //         int totalFonts = 0;
    //         int completelyUnusableFonts = 0;

    //         int inspected = 0;

    //         for (COSName fontName : resources.getFontNames()) {
    //             if (timedOut(start, options.getOperationTimeout())) {
    //                 log.warn("Font analysis aborted due to timeout");
    //                 break;
    //             }
    //             if (++inspected > options.getMaxFontsPerPage()) {
    //                 log.warn(
    //                         "Font analysis stopped after {} fonts (limit reached)",
    //                         options.getMaxFontsPerPage());
    //                 break;
    //             }

    //             try {
    //                 org.apache.pdfbox.pdmodel.font.PDFont font = resources.getFont(fontName);
    //                 totalFonts++;
    //                 if (font == null
    //                         || !validateFontReliability(
    //                                 font, start, options.getOperationTimeout())) {
    //                     completelyUnusableFonts++;
    //                 }
    //             } catch (Exception e) {
    //                 log.debug(
    //                         "Font loading failed for {}: {}",
    //                         safe(fontName.getName(), 120),
    //                         e.getMessage());
    //                 totalFonts++;
    //                 if (options.isCountFontLoadFailuresAsUnusable()) {
    //                     completelyUnusableFonts++;
    //                 }
    //             }

    //             // Early-exit Heuristik: wenn selbst bei perfekten restlichen Fonts
    //             // bereits >50% unbrauchbar sind, kann das Endergebnis nicht mehr „gut“ werden.
    //             int remainingBudget = Math.max(0, options.getMaxFontsPerPage() - inspected);
    //             if ((completelyUnusableFonts) * 2 > (totalFonts + remainingBudget)) {
    //                 log.debug(
    //                         "Early exit: too many unusable fonts already: {}/{} (budget left:
    // {})",
    //                         completelyUnusableFonts,
    //                         totalFonts,
    //                         remainingBudget);
    //                 break;
    //             }
    //         }

    //         boolean hasProblems = totalFonts > 0 && (completelyUnusableFonts * 2 > totalFonts);
    //         log.debug(
    //                 "Page font analysis: {}/{} fonts are completely unusable - page {}
    // problematic",
    //                 completelyUnusableFonts,
    //                 totalFonts,
    //                 hasProblems ? "IS" : "is NOT");

    //         return hasProblems;

    //     } catch (Exception e) {
    //         log.warn("Font analysis failed for page: {}", e.getMessage());
    //         return false; // bewusst permissiv bei Analysefehlern
    //     }
    // }

    // /* =========================
    // Helpers
    // ========================= */

    // // sehr konservative Heuristik gegen katastrophisches Backtracking
    // // (erkennt typische „gefährliche“ Muster; kein formaler Beweis)
    // static boolean isRegexSafe(String regex) {
    //     String s = regex;

    //     // Backreferences können Backtracking verstärken
    //     if (s.matches(".*\\\\[1-9].*")) return false;

    //     // verschachtelte Quantifizierer: (.+)+, (.*)+, (.+){m,}, (a|aa)+, (.{0,}.*)+ etc.
    //     String[] dangerous = {
    //         "(\\(.*[+*}{].*\\)[+*}{])", // Gruppe mit Quantifizierer und außen nochmal
    //         // Quantifizierer
    //         "(\\.[*+]){2,}", // mehrere .* oder .+ hintereinander
    //         "([+*])\\s*\\)", // gierige Gruppe direkt vor Klammerende
    //         "\\(\\?:?[^)]*\\|[^)]*\\)\\+" // große Alternation gefolgt von +
    //     };
    //     for (String pat : dangerous) {
    //         if (Pattern.compile(pat).matcher(s).find()) return false;
    //     }

    //     // ungebundene Lookbehinds (Java braucht i. d. R. feste Länge, aber zur Sicherheit)
    //     if (s.contains("(?<=") || s.contains("(?<!")) {
    //         // aggressiv ablehnen; optional könnte man feste-Länge erkennen
    //         return false;
    //     }

    //     // Extrem lange Quantorenbereiche
    //     if (s.matches(".*\\{\\s*\\d+\\s*,\\s*\\}. *")) return false;

    //     return true;
    // }

    // private static boolean timedOut(Instant start, Duration timeout) {
    //     return timeout != null && !timeout.isZero() &&
    // Instant.now().isAfter(start.plus(timeout));
    //     // Hinweis: Das begrenzt nur die „eigene“ Schleifenzeit; Regex-Matching selbst
    //     // sollte in der aufrufenden Schicht mit Future/Timeout ausgeführt werden.
    // }

    // private static String safe(String input, int maxLen) {
    //     if (input == null) return "null";
    //     String s = input.replaceAll("[\\r\\n\\t]", " ");
    //     if (s.length() > maxLen) {
    //         return s.substring(0, maxLen) + "…";
    //     }
    //     return s;
    // }
}
