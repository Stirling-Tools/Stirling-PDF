package stirling.software.SPDF.pdf;

import java.io.IOException;
import java.util.ArrayList;
import java.util.List;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.text.PDFTextStripper;
import org.apache.pdfbox.text.TextPosition;

import stirling.software.SPDF.model.PDFText;

public class TextFinder extends PDFTextStripper {

    private final String searchText;
    private final SearchStrategy searchStrategy;
    private final List<PDFText> textOccurrences;

    public TextFinder(String searchText, boolean useRegex, boolean wholeWordSearch)
            throws IOException {
        this.searchText = searchText.toLowerCase();
        this.searchStrategy =
                useRegex
                        ? new RegexSearchStrategy(wholeWordSearch)
                        : new TextSearchStrategy(wholeWordSearch);
        this.textOccurrences = new ArrayList<>();
        setSortByPosition(true);
    }

    @Override
    protected void writeString(String text, List<TextPosition> textPositions) {
        searchStrategy.search(text, textPositions, searchText, textOccurrences, getCurrentPageNo());
    }

    public List<PDFText> getTextLocations(PDDocument document) throws Exception {
        this.getText(document);
        System.out.println(
                "Found "
                        + textOccurrences.size()
                        + " occurrences of '"
                        + searchText
                        + "' in the document.");

        return textOccurrences;
    }
}

interface SearchStrategy {
    void search(
            String text,
            List<TextPosition> textPositions,
            String searchText,
            List<PDFText> textOccurrences,
            int currentPageNo);
}

class RegexSearchStrategy implements SearchStrategy {
    private final boolean wholeWordSearch;

    public RegexSearchStrategy(boolean wholeWordSearch) {
        this.wholeWordSearch = wholeWordSearch;
    }

    @Override
    public void search(
            String text,
            List<TextPosition> textPositions,
            String searchText,
            List<PDFText> textOccurrences,
            int currentPageNo) {
        Pattern pattern =
                wholeWordSearch
                        ? Pattern.compile("\\b" + searchText + "\\b")
                        : Pattern.compile(searchText);
        Matcher matcher = pattern.matcher(text.toLowerCase());
        while (matcher.find()) {
            int startIndex = matcher.start();
            int matchLength = matcher.end() - matcher.start();
            if (startIndex + matchLength <= textPositions.size()) {
                float minX = Float.MAX_VALUE,
                        minY = Float.MAX_VALUE,
                        maxX = Float.MIN_VALUE,
                        maxY = Float.MIN_VALUE;
                for (int i = startIndex; i < startIndex + matchLength; i++) {
                    TextPosition position = textPositions.get(i);
                    minX = Math.min(minX, position.getX());
                    minY = Math.min(minY, position.getY());
                    maxX = Math.max(maxX, position.getX() + position.getWidth());
                    maxY = Math.max(maxY, position.getY() + position.getHeight());
                }
                textOccurrences.add(new PDFText(currentPageNo - 1, minX, minY, maxX, maxY, text));
            }
        }
    }
}

class TextSearchStrategy implements SearchStrategy {
    private final boolean wholeWordSearch;

    public TextSearchStrategy(boolean wholeWordSearch) {
        this.wholeWordSearch = wholeWordSearch;
    }

    @Override
    public void search(
            String text,
            List<TextPosition> textPositions,
            String searchText,
            List<PDFText> textOccurrences,
            int currentPageNo) {
        Pattern pattern =
                wholeWordSearch
                        ? Pattern.compile("\\b" + Pattern.quote(searchText) + "\\b")
                        : Pattern.compile(Pattern.quote(searchText));
        Matcher matcher = pattern.matcher(text);
        while (matcher.find()) {
            int startIndex = matcher.start();
            int matchLength = matcher.end() - matcher.start();
            if (startIndex + matchLength <= textPositions.size()) {
                float minX = Float.MAX_VALUE,
                        minY = Float.MAX_VALUE,
                        maxX = Float.MIN_VALUE,
                        maxY = Float.MIN_VALUE;
                for (int i = startIndex; i < startIndex + matchLength; i++) {
                    TextPosition position = textPositions.get(i);
                    minX = Math.min(minX, position.getX());
                    minY = Math.min(minY, position.getY());
                    maxX = Math.max(maxX, position.getX() + position.getWidth());
                    maxY = Math.max(maxY, position.getY() + position.getHeight());
                }
                textOccurrences.add(new PDFText(currentPageNo - 1, minX, minY, maxX, maxY, text));
            }
        }
    }
}
