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

    public TextFinder(String searchText, boolean useRegex, boolean wholeWordSearch)
            throws IOException {
        this.searchText = searchText.toLowerCase();
        this.useRegex = useRegex;
        this.wholeWordSearch = wholeWordSearch;
        setSortByPosition(true);
    }

    private List<Integer> findOccurrencesInText(String searchText, String content) {
        List<Integer> indexes = new ArrayList<>();
        Pattern pattern;

        if (useRegex) {
            // Use regex-based search
            pattern =
                    wholeWordSearch
                            ? Pattern.compile("(\\b|_|\\.)" + searchText + "(\\b|_|\\.)")
                            : Pattern.compile(searchText);
        } else {
            // Use normal text search
            pattern =
                    wholeWordSearch
                            ? Pattern.compile(
                                    "(\\b|_|\\.)" + Pattern.quote(searchText) + "(\\b|_|\\.)")
                            : Pattern.compile(Pattern.quote(searchText));
        }

        Matcher matcher = pattern.matcher(content);
        while (matcher.find()) {
            indexes.add(matcher.start());
        }
        return indexes;
    }

    @Override
    protected void writeString(String text, List<TextPosition> textPositions) {
        for (Integer index : findOccurrencesInText(searchText, text.toLowerCase())) {
            if (index + searchText.length() <= textPositions.size()) {
                // Initial values based on the first character
                TextPosition first = textPositions.get(index);
                float minX = first.getX();
                float minY = first.getY();
                float maxX = first.getX() + first.getWidth();
                float maxY = first.getY() + first.getHeight();

                // Loop over the rest of the characters and adjust bounding box values
                for (int i = index; i < index + searchText.length(); i++) {
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
