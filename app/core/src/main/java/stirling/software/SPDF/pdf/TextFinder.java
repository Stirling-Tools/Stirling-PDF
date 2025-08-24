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

import stirling.software.SPDF.model.PDFText;

public class TextFinder extends PDFTextStripper {

    private final String searchTerm;
    private final boolean useRegex;
    private final boolean wholeWordSearch;
    @Getter private final List<PDFText> foundTexts = new ArrayList<>();

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
        for (TextPosition tp : textPositions) {
            if (tp == null) continue;
            String u = tp.getUnicode();
            if (u == null) continue;
            for (int i = 0; i < u.length(); ) {
                int cp = u.codePointAt(i);
                pageTextBuilder.append(Character.toChars(cp));
                // Add one position per code unit appended (1-2 chars depending on surrogate)
                int codeUnits = Character.charCount(cp);
                for (int k = 0; k < codeUnits; k++) {
                    pageTextPositions.add(tp);
                }
                i += codeUnits;
            }
        }
    }

    @Override
    protected void writeWordSeparator() {
        String sep = getWordSeparator();
        pageTextBuilder.append(sep);
        for (int i = 0; i < sep.length(); i++) {
            pageTextPositions.add(null);
        }
    }

    @Override
    protected void writeLineSeparator() {
        String sep = getLineSeparator();
        pageTextBuilder.append(sep);
        for (int i = 0; i < sep.length(); i++) {
            pageTextPositions.add(null);
        }
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

        String regex = this.useRegex ? processedSearchTerm : "\\Q" + processedSearchTerm + "\\E";
        if (this.wholeWordSearch) {
            if (processedSearchTerm.length() == 1
                    && Character.isDigit(processedSearchTerm.charAt(0))) {
                regex = "(?<![\\w])(?<!\\d[\\.,])" + regex + "(?![\\w])(?![\\.,]\\d)";
            } else if (processedSearchTerm.length() == 1) {
                regex = "(?<![\\w])" + regex + "(?![\\w])";
            } else {
                regex = "\\b" + regex + "\\b";
            }
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
                if (i >= pageTextPositions.size()) continue;
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

            if (foundPosition) {
                foundTexts.add(
                        new PDFText(
                                this.getCurrentPageNo() - 1,
                                minX,
                                minY,
                                maxX,
                                maxY,
                                matcher.group()));
            } else {
                // no position info
            }
        }

        super.endPage(page);
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
