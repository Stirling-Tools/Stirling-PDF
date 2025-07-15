package stirling.software.SPDF.pdf;

import java.io.IOException;
import java.util.ArrayList;
import java.util.List;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

import org.apache.pdfbox.pdmodel.PDPage;
import org.apache.pdfbox.text.PDFTextStripper;
import org.apache.pdfbox.text.TextPosition;

import stirling.software.SPDF.model.PDFText;

public class TextFinder extends PDFTextStripper {

    private final String searchTerm;
    private final boolean useRegex;
    private final boolean wholeWordSearch;
    private final List<PDFText> foundTexts = new ArrayList<>();

    private final List<TextPosition> pageTextPositions = new ArrayList<>();
    private final StringBuilder pageTextBuilder = new StringBuilder();

    public TextFinder(String searchTerm, boolean useRegex, boolean wholeWordSearch)
            throws IOException {
        super();
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
        String regex = this.useRegex ? processedSearchTerm : "\\Q" + processedSearchTerm + "\\E";
        if (this.wholeWordSearch) {
            regex = "\\b" + regex + "\\b";
        }

        Pattern pattern = Pattern.compile(regex, Pattern.CASE_INSENSITIVE | Pattern.UNICODE_CASE);
        Matcher matcher = pattern.matcher(text);

        while (matcher.find()) {
            int matchStart = matcher.start();
            int matchEnd = matcher.end();

            float minX = Float.MAX_VALUE;
            float minY = Float.MAX_VALUE;
            float maxX = Float.MIN_VALUE;
            float maxY = Float.MIN_VALUE;
            boolean foundPosition = false;

            for (int i = matchStart; i < matchEnd; i++) {
                if (i >= pageTextPositions.size()) {
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

            if (foundPosition) {
                foundTexts.add(
                        new PDFText(
                                this.getCurrentPageNo() - 1,
                                minX,
                                minY,
                                maxX,
                                maxY,
                                matcher.group()));
            }
        }

        super.endPage(page);
    }

    public List<PDFText> getFoundTexts() {
        return foundTexts;
    }
}
