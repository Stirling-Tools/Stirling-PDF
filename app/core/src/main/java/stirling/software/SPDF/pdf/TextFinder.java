package stirling.software.SPDF.pdf;

import java.io.IOException;
import java.text.Normalizer;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

import org.apache.pdfbox.pdmodel.PDPage;
import org.apache.pdfbox.text.PDFTextStripper;
import org.apache.pdfbox.text.TextPosition;

import lombok.Getter;
import lombok.extern.slf4j.Slf4j;

import stirling.software.SPDF.model.PDFText;

@Slf4j
public class TextFinder extends PDFTextStripper {

    private static String removeDiacritics(String input) {
        if (input == null || input.isEmpty()) return input;
        String nfd = Normalizer.normalize(input, Normalizer.Form.NFD);
        // remove combining diacritical marks
        String stripped = nfd.replaceAll("\\p{M}+", "");
        return Normalizer.normalize(stripped, Normalizer.Form.NFC);
    }

    private static NormalizedMap buildNormalizedMap(String original) {
        if (original == null) return new NormalizedMap("", new int[0]);
        StringBuilder sb = new StringBuilder(original.length());
        // Worst case map size equals original length
        int[] tempMap = new int[original.length() * 2];
        int normIdx = 0;
        for (int i = 0; i < original.length(); i++) {
            char ch = original.charAt(i);
            // Normalize this single char; handle precomposed accents common in PDF text
            String nfd = Normalizer.normalize(String.valueOf(ch), Normalizer.Form.NFD);
            String base = nfd.replaceAll("\\p{M}+", "");
            // Append each resulting char and map back to original index i
            for (int j = 0; j < base.length(); j++) {
                char b = base.charAt(j);
                sb.append(b);
                if (normIdx >= tempMap.length) {
                    // expand temp map
                    int[] newMap = new int[tempMap.length * 2];
                    System.arraycopy(tempMap, 0, newMap, 0, tempMap.length);
                    tempMap = newMap;
                }
                tempMap[normIdx++] = i;
            }
        }
        int[] map = new int[normIdx];
        System.arraycopy(tempMap, 0, map, 0, normIdx);
        return new NormalizedMap(sb.toString(), map);
    }

    @Override
    protected void endPage(PDPage page) throws IOException {
        String text = pageTextBuilder.toString();
        if (text.isEmpty() || this.searchTerm == null || this.searchTerm.isEmpty()) {
            super.endPage(page);
            return;
        }

        String processedSearchTerm = this.searchTerm.trim();
        if (processedSearchTerm.isEmpty()) {
            super.endPage(page);
            return;
        }
        // Build patterns using unified utility for consistency
        List<java.util.regex.Pattern> patterns =
                stirling.software.SPDF.utils.text.TextFinderUtils.createOptimizedSearchPatterns(
                        java.util.Collections.singleton(processedSearchTerm),
                        this.useRegex,
                        this.wholeWordSearch);
        java.util.regex.Matcher matcher = null;
        java.util.regex.Pattern activePattern = null;
        for (java.util.regex.Pattern p : patterns) {
            matcher = p.matcher(text);
            if (matcher
                    .find()) { // prime by checking has at least one match; we will re-iterate below
                activePattern = p;
                break;
            }
        }
        if (activePattern == null) {
            if (!this.useRegex) {
                NormalizedMap nm = buildNormalizedMap(text);
                String normText = nm.normalized();
                String normTerm = removeDiacritics(processedSearchTerm);
                List<Pattern> normPatterns =
                        stirling.software.SPDF.utils.text.TextFinderUtils
                                .createOptimizedSearchPatterns(
                                        Collections.singleton(normTerm),
                                        false,
                                        this.wholeWordSearch);
                Matcher nMatcher = null;
                Pattern nActive = null;
                for (Pattern p : normPatterns) {
                    nMatcher = p.matcher(normText);
                    if (nMatcher.find()) {
                        nActive = p;
                        break;
                    }
                }
                if (nActive != null) {
                    nMatcher = nActive.matcher(normText);
                    int matchCount = 0;
                    while (nMatcher.find()) {
                        matchCount++;
                        int nStart = nMatcher.start();
                        int nEnd = nMatcher.end();
                        int origStart = nm.indexMap()[nStart];
                        int origEnd = nm.indexMap()[nEnd - 1] + 1;

                        float minX = Float.MAX_VALUE;
                        float minY = Float.MAX_VALUE;
                        float maxX = Float.MIN_VALUE;
                        float maxY = Float.MIN_VALUE;
                        boolean foundPosition = false;

                        for (int i = origStart; i < origEnd; i++) {
                            if (i >= pageTextPositions.size()) continue;
                            org.apache.pdfbox.text.TextPosition pos = pageTextPositions.get(i);
                            if (pos != null) {
                                foundPosition = true;
                                minX = Math.min(minX, pos.getX());
                                maxX = Math.max(maxX, pos.getX() + pos.getWidth());
                                minY = Math.min(minY, pos.getY() - pos.getHeight());
                                maxY = Math.max(maxY, pos.getY());
                            }
                        }
                        if (foundPosition) {
                            String matchedOriginal =
                                    text.substring(
                                            Math.max(0, origStart),
                                            Math.min(text.length(), origEnd));
                            foundTexts.add(
                                    new PDFText(
                                            this.getCurrentPageNo() - 1,
                                            minX,
                                            minY,
                                            maxX,
                                            maxY,
                                            matchedOriginal));
                        }
                    }
                    super.endPage(page);
                    return;
                }
            }
            super.endPage(page);
            return;
        }
        matcher = activePattern.matcher(text);

        log.debug(
                "Searching for '{}' in page {} with pattern '{}' (wholeWord: {}, useRegex: {})",
                processedSearchTerm,
                getCurrentPageNo(),
                activePattern,
                wholeWordSearch,
                useRegex);

        int matchCount = 0;
        while (matcher.find()) {
            matchCount++;
            int matchStart = matcher.start();
            int matchEnd = matcher.end();

            if (this.wholeWordSearch
                    && processedSearchTerm.length() == 1
                    && Character.isDigit(processedSearchTerm.charAt(0))) {
                char left = matchStart > 0 ? text.charAt(matchStart - 1) : '\0';
                char right = matchEnd < text.length() ? text.charAt(matchEnd) : '\0';
                if (Character.isLetterOrDigit(left) || Character.isLetterOrDigit(right)) {
                    continue; // skip
                }
                if ((right == '.' || right == ',')
                        && (matchEnd + 1 < text.length()
                                && Character.isDigit(text.charAt(matchEnd + 1)))) {
                    continue; // skip
                }
                if ((left == '.' || left == ',')
                        && (matchStart - 2 >= 0
                                && Character.isDigit(text.charAt(matchStart - 2)))) {
                    continue; // skip
                }
            }

            log.debug(
                    "Found match #{} at positions {}-{}: '{}'",
                    matchCount,
                    matchStart,
                    matchEnd,
                    matcher.group());

            float minX = Float.MAX_VALUE;
            float minY = Float.MAX_VALUE;
            float maxX = Float.MIN_VALUE;
            float maxY = Float.MIN_VALUE;
            boolean foundPosition = false;

            for (int i = matchStart; i < matchEnd; i++) {
                if (i >= pageTextPositions.size()) {
                    log.debug(
                            "Position index {} exceeds available positions ({})",
                            i,
                            pageTextPositions.size());
                    continue;
                }
                TextPosition pos = pageTextPositions.get(i);
                if (pos != null) {
                    foundPosition = true;
                    minX = Math.min(minX, pos.getX());
                    maxX = Math.max(maxX, pos.getX() + pos.getWidth());
                    minY = Math.min(minY, pos.getY() - pos.getHeight());
                    maxY = Math.max(maxY, pos.getY());
                }
            }

            if (!foundPosition && matchStart < pageTextPositions.size()) {
                log.debug(
                        "Attempting to find nearby positions for match at {}-{}",
                        matchStart,
                        matchEnd);

                for (int i = Math.max(0, matchStart - 5);
                        i < Math.min(pageTextPositions.size(), matchEnd + 5);
                        i++) {
                    TextPosition pos = pageTextPositions.get(i);
                    if (pos != null) {
                        foundPosition = true;
                        minX = Math.min(minX, pos.getX());
                        maxX = Math.max(maxX, pos.getX() + pos.getWidth());
                        minY = Math.min(minY, pos.getY() - pos.getHeight());
                        maxY = Math.max(maxY, pos.getY());
                        break;
                    }
                }
            }

            if (foundPosition) {
                foundTexts.add(
                        new PDFText(
                                this.getCurrentPageNo() - 1,
                                minX,
                                minY,
                                maxX,
                                maxY,
                                matcher.group()));
                log.debug(
                        "Added PDFText for match: page={}, bounds=({},{},{},{}), text='{}'",
                        getCurrentPageNo() - 1,
                        minX,
                        minY,
                        maxX,
                        maxY,
                        matcher.group());
            } else {
                log.warn(
                        "Found text match '{}' but no valid position data at {}-{}",
                        matcher.group(),
                        matchStart,
                        matchEnd);
            }
        }

        log.debug(
                "Page {} search complete: found {} matches for '{}'",
                getCurrentPageNo(),
                matchCount,
                processedSearchTerm);

        super.endPage(page);
    }

    private final String searchTerm;
    private final boolean useRegex;
    private final boolean wholeWordSearch;
    private final List<PDFText> foundTexts = new ArrayList<>();

    private final List<TextPosition> pageTextPositions = new ArrayList<>();
    private final StringBuilder pageTextBuilder = new StringBuilder();

    public TextFinder(String searchTerm, boolean useRegex, boolean wholeWordSearch)
            throws IOException {
        this.searchTerm = searchTerm;
        this.useRegex = useRegex;
        this.wholeWordSearch = wholeWordSearch;
        this.setWordSeparator(" ");
    }

    @Override
    protected void startPage(PDPage page) throws IOException {
        super.startPage(page);
        pageTextPositions.clear();
        pageTextBuilder.setLength(0);
    }

    @Override
    protected void writeString(String text, List<TextPosition> textPositions) {
        pageTextBuilder.append(text);
        pageTextPositions.addAll(textPositions);
    }

    @Override
    protected void writeWordSeparator() {
        pageTextBuilder.append(getWordSeparator());
        pageTextPositions.add(null); // Placeholder for separator
    }

    @Override
    protected void writeLineSeparator() {
        pageTextBuilder.append(getLineSeparator());
        pageTextPositions.add(null); // Placeholder for separator
    }

    private static class NormalizedMap {
        private final String normalized;
        private final int[] indexMap;

        NormalizedMap(String normalized, int[] indexMap) {
            this.normalized = normalized;
            this.indexMap = indexMap;
        }

        public String normalized() {
            return normalized;
        }

        public int[] indexMap() {
            return indexMap;
        }
    }

    public List<PDFText> getFoundTexts() {
        return foundTexts;
    }

    public String getDebugInfo() {
        StringBuilder debug = new StringBuilder();
        debug.append("Extracted text length: ").append(pageTextBuilder.length()).append("\n");
        debug.append("Position count: ").append(pageTextPositions.size()).append("\n");
        debug.append("Text content: '")
                .append(pageTextBuilder.toString().replace("\n", "\\n").replace("\r", "\\r"))
                .append("'\n");

        String text = pageTextBuilder.toString();
        for (int i = 0; i < Math.min(text.length(), 50); i++) {
            char c = text.charAt(i);
            TextPosition pos = i < pageTextPositions.size() ? pageTextPositions.get(i) : null;
            debug.append(
                    String.format(
                            "  [%d] '%c' (0x%02X) -> %s\n",
                            i,
                            c,
                            (int) c,
                            pos != null
                                    ? String.format("(%.1f,%.1f)", pos.getX(), pos.getY())
                                    : "null"));
        }

        return debug.toString();
    }
}
