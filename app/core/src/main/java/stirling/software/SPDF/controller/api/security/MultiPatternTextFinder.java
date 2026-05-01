package stirling.software.SPDF.controller.api.security;

import java.io.IOException;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

import org.apache.pdfbox.pdmodel.PDPage;
import org.apache.pdfbox.text.PDFTextStripper;
import org.apache.pdfbox.text.TextPosition;

import lombok.extern.slf4j.Slf4j;

import stirling.software.SPDF.model.PDFText;

/**
 * Scans a PDF document once and matches all provided patterns in a single pass, collecting
 * bounding-box positions for every match. Use in place of creating one {@code TextFinder} per
 * search term to avoid O(n) full-document scans.
 */
@Slf4j
final class MultiPatternTextFinder extends PDFTextStripper {

    private final List<Pattern> patterns;
    private final Map<Integer, List<PDFText>> foundTextsByPage = new HashMap<>();

    private final List<TextPosition> pageTextPositions = new ArrayList<>();
    private final StringBuilder pageTextBuilder = new StringBuilder();

    MultiPatternTextFinder(List<Pattern> patterns) throws IOException {
        this.patterns = patterns;
        this.setWordSeparator(" ");
        this.setLineSeparator("\n");
    }

    Map<Integer, List<PDFText>> getFoundTextsByPage() {
        return foundTextsByPage;
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
        pageTextPositions.add(null);
    }

    @Override
    protected void writeLineSeparator() {
        pageTextBuilder.append(getLineSeparator());
        pageTextPositions.add(null);
    }

    @Override
    protected void endPage(PDPage page) throws IOException {
        String text = pageTextBuilder.toString();
        if (!text.isEmpty()) {
            int pageIndex = getCurrentPageNo() - 1;
            for (Pattern pattern : patterns) {
                Matcher matcher = pattern.matcher(text);
                while (matcher.find()) {
                    PDFText pdfText = resolveMatchPosition(matcher, pageIndex);
                    if (pdfText != null) {
                        foundTextsByPage
                                .computeIfAbsent(pageIndex, k -> new ArrayList<>())
                                .add(pdfText);
                    }
                }
            }
        }
        super.endPage(page);
    }

    private PDFText resolveMatchPosition(Matcher matcher, int pageIndex) {
        int matchStart = matcher.start();
        int matchEnd = matcher.end();

        float minX = Float.MAX_VALUE;
        float minY = Float.MAX_VALUE;
        float maxX = Float.MIN_VALUE;
        float maxY = Float.MIN_VALUE;
        boolean foundPosition = false;

        for (int i = matchStart; i < matchEnd; i++) {
            if (i >= pageTextPositions.size()) break;
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

        if (!foundPosition) {
            log.warn(
                    "Found text match '{}' but no valid position data at {}-{}",
                    matcher.group(),
                    matchStart,
                    matchEnd);
            return null;
        }

        return new PDFText(pageIndex, minX, minY, maxX, maxY, matcher.group());
    }
}
