package stirling.software.SPDF.pdf;

import java.io.IOException;
import java.util.ArrayList;
import java.util.List;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

import org.apache.pdfbox.pdmodel.PDPage;
import org.apache.pdfbox.text.PDFTextStripper;
import org.apache.pdfbox.text.TextPosition;

import lombok.Getter;
import lombok.extern.slf4j.Slf4j;

import stirling.software.SPDF.model.PDFText;
import stirling.software.common.util.RegexPatternUtils;

@Slf4j
public class TextFinder extends PDFTextStripper {

    private final String searchTerm;
    private final boolean useRegex;
    private final boolean wholeWordSearch;
    @Getter private final List<PDFText> foundTexts = new ArrayList<>();

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
        PatternContext patternContext = buildSearchPattern(processedSearchTerm);
        if (patternContext == null) {
            super.endPage(page);
            return;
        }

        Matcher matcher = patternContext.pattern.matcher(text);

        log.debug(
                "Searching for '{}' in page {} with regex '{}' (wholeWord: {}, useRegex: {})",
                processedSearchTerm,
                getCurrentPageNo(),
                patternContext.regex,
                wholeWordSearch,
                useRegex);

        int matchCount = 0;
        while (matcher.find()) {
            matchCount++;
            int matchStart = matcher.start();
            int matchEnd = matcher.end();

            log.debug(
                    "Found match #{} at positions {}-{}: '{}'",
                    matchCount,
                    matchStart,
                    matchEnd,
                    matcher.group());

            Bounds bounds = computeBounds(matchStart, matchEnd);
            if (bounds != null) {
                addFoundText(bounds, matcher.group());
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

    private PatternContext buildSearchPattern(String processedSearchTerm) {
        if (processedSearchTerm == null || processedSearchTerm.isEmpty()) {
            return null;
        }

        String regex = useRegex ? processedSearchTerm : Pattern.quote(processedSearchTerm);
        if (wholeWordSearch) {
            regex = applyWordBoundaries(processedSearchTerm, regex);
        }

        Pattern pattern = RegexPatternUtils.getInstance().createSearchPattern(regex, true);
        return new PatternContext(pattern, regex);
    }

    private String applyWordBoundaries(String term, String regex) {
        if (term.length() == 1 && Character.isDigit(term.charAt(0))) {
            return "(?<![\\w])(?<!\\d[\\.,])" + regex + "(?![\\w])(?![\\.,]\\d)";
        } else if (term.length() == 1) {
            return "(?<![\\w])" + regex + "(?![\\w])";
        }
        return "\\b" + regex + "\\b";
    }

    private Bounds computeBounds(int matchStart, int matchEnd) {
        BoundsAccumulator accumulator = new BoundsAccumulator();
        collectBounds(matchStart, matchEnd, accumulator);

        if (!accumulator.hasData()) {
            log.debug(
                    "Attempting to find nearby positions for match at {}-{}", matchStart, matchEnd);
            int fallbackStart = Math.max(0, matchStart - 5);
            int fallbackEnd = Math.min(pageTextPositions.size(), matchEnd + 5);
            collectBounds(fallbackStart, fallbackEnd, accumulator);
        }

        return accumulator.hasData() ? accumulator.toBounds() : null;
    }

    private void collectBounds(int start, int end, BoundsAccumulator accumulator) {
        int safeEnd = Math.min(end, pageTextPositions.size());
        for (int i = Math.max(0, start); i < safeEnd; i++) {
            TextPosition pos = pageTextPositions.get(i);
            if (pos != null) {
                accumulator.include(pos);
            }
        }
    }

    private void addFoundText(Bounds bounds, String text) {
        int pageIndex = this.getCurrentPageNo() - 1;
        float width = bounds.maxX - bounds.minX;
        float height = bounds.maxY - bounds.minY;

        foundTexts.add(
                new PDFText(
                        pageIndex,
                        bounds.minX,
                        bounds.minY,
                        bounds.maxX,
                        bounds.maxY,
                        text,
                        bounds.maxFontSize));

        log.debug(
                "TextFinder found match on page {}: text='{}' | Bounds: minX={}, minY={}, maxX={}, maxY={} | Dimensions: width={}, height={} | FontSize={}",
                pageIndex + 1,
                text,
                bounds.minX,
                bounds.minY,
                bounds.maxX,
                bounds.maxY,
                width,
                height,
                bounds.maxFontSize);
    }

    private record PatternContext(Pattern pattern, String regex) {}

    private static final class Bounds {
        private final float minX;
        private final float minY;
        private final float maxX;
        private final float maxY;
        private final float maxFontSize;

        private Bounds(float minX, float minY, float maxX, float maxY, float maxFontSize) {
            this.minX = minX;
            this.minY = minY;
            this.maxX = maxX;
            this.maxY = maxY;
            this.maxFontSize = maxFontSize;
        }
    }

    private static final class BoundsAccumulator {
        private float minX = Float.POSITIVE_INFINITY;
        private float minY = Float.POSITIVE_INFINITY;
        private float maxX = Float.NEGATIVE_INFINITY;
        private float maxY = Float.NEGATIVE_INFINITY;
        private int posCount = 0;
        private float totalHeight = 0;
        private float totalWidth = 0;
        private float totalFontSize = 0;
        private float maxFontSize = 0;

        void include(TextPosition pos) {
            posCount++;
            float posX = pos.getX();
            float posY = pos.getY();
            float posWidth = pos.getWidth();
            float posHeight = pos.getHeight();
            float fontSize = pos.getFontSize();
            float fontSizeInPt = pos.getFontSizeInPt();
            float xScale = pos.getXScale();
            float yScale = pos.getYScale();

            // Track statistics for debugging
            totalHeight += posHeight;
            totalWidth += posWidth;
            totalFontSize += fontSize;
            maxFontSize = Math.max(maxFontSize, fontSize);

            // Calculate the actual bottom position
            float calculatedBottom = posY - posHeight;
            float calculatedTop = posY;

            minX = Math.min(minX, posX);
            maxX = Math.max(maxX, posX + posWidth);
            minY = Math.min(minY, calculatedBottom);
            maxY = Math.max(maxY, calculatedTop);

            log.debug(
                    "TextPosition[{}]: char='{}' | Position: x={}, y={} (baseline) | Dimensions: width={}, height={} | Font: size={}, sizePt={}, scale=({},{}) font={} | Calculated bounds: bottom={}, top={} | Running bounds: minY={}, maxY={}",
                    posCount,
                    pos.getUnicode(),
                    posX,
                    posY,
                    posWidth,
                    posHeight,
                    fontSize,
                    fontSizeInPt,
                    xScale,
                    yScale,
                    pos.getFont() != null ? pos.getFont().getName() : "null",
                    calculatedBottom,
                    calculatedTop,
                    minY,
                    maxY);
        }

        boolean hasData() {
            return minX != Float.POSITIVE_INFINITY;
        }

        Bounds toBounds() {
            if (posCount > 0) {
                float avgHeight = totalHeight / posCount;
                float avgWidth = totalWidth / posCount;
                float avgFontSize = totalFontSize / posCount;
                log.debug(
                        "BoundsAccumulator summary: {} positions analyzed | Avg: height={}, width={}, fontSize={} | MaxFontSize={} | Final bounds: ({},{}) to ({},{}) | Dimensions: {}x{}",
                        posCount,
                        avgHeight,
                        avgWidth,
                        avgFontSize,
                        maxFontSize,
                        minX,
                        minY,
                        maxX,
                        maxY,
                        maxX - minX,
                        maxY - minY);
            }
            return new Bounds(minX, minY, maxX, maxY, maxFontSize);
        }
    }
}
