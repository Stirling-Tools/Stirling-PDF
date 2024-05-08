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
    private final boolean useRegex;
    private final boolean wholeWordSearch;
    private final List<PDFText> textOccurrences = new ArrayList<>();

    private class MatchInfo {
        int startIndex;
        int matchLength;

        MatchInfo(int startIndex, int matchLength) {
            this.startIndex = startIndex;
            this.matchLength = matchLength;
        }
    }

    public TextFinder(String searchText, boolean useRegex, boolean wholeWordSearch)
            throws IOException {
        this.searchText = searchText.toLowerCase();
        this.useRegex = useRegex;
        this.wholeWordSearch = wholeWordSearch;
        setSortByPosition(true);
    }

    private List<MatchInfo> findOccurrencesInText(String searchText, String content) {
        List<MatchInfo> matches = new ArrayList<>();

        Pattern pattern;

        if (useRegex) {
            // Use regex-based search
            pattern =
                    wholeWordSearch
                            ? Pattern.compile("\\b" + searchText + "\\b")
                            : Pattern.compile(searchText);
        } else {
            // Use normal text search
            pattern =
                    wholeWordSearch
                            ? Pattern.compile("\\b" + Pattern.quote(searchText) + "\\b")
                            : Pattern.compile(Pattern.quote(searchText));
        }

        Matcher matcher = pattern.matcher(content);
        while (matcher.find()) {
            matches.add(new MatchInfo(matcher.start(), matcher.end() - matcher.start()));
        }
        return matches;
    }

    @Override
    protected void writeString(String text, List<TextPosition> textPositions) {
        for (MatchInfo match : findOccurrencesInText(searchText, text.toLowerCase())) {
            int index = match.startIndex;
            if (index + match.matchLength <= textPositions.size()) {
                // Initial values based on the first character
                TextPosition first = textPositions.get(index);
                float minX = first.getX();
                float minY = first.getY();
                float maxX = first.getX() + first.getWidth();
                float maxY = first.getY() + first.getHeight();

                // Loop over the rest of the characters and adjust bounding box values
                for (int i = index; i < index + match.matchLength; i++) {
                    TextPosition position = textPositions.get(i);
                    minX = Math.min(minX, position.getX());
                    minY = Math.min(minY, position.getY());
                    maxX = Math.max(maxX, position.getX() + position.getWidth());
                    maxY = Math.max(maxY, position.getY() + position.getHeight());
                }

                textOccurrences.add(
                        new PDFText(getCurrentPageNo() - 1, minX, minY, maxX, maxY, text));
            }
        }
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
