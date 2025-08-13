package stirling.software.SPDF.utils.text;

import java.util.ArrayList;
import java.util.List;
import java.util.Set;
import java.util.regex.Pattern;

import org.apache.pdfbox.pdmodel.PDPage;
import org.apache.pdfbox.pdmodel.PDResources;

import lombok.extern.slf4j.Slf4j;

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

                Pattern pattern =
                        Pattern.compile(
                                patternString, Pattern.CASE_INSENSITIVE | Pattern.UNICODE_CASE);
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
}
