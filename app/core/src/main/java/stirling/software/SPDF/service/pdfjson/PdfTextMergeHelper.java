package stirling.software.SPDF.service.pdfjson;

import java.util.ArrayList;
import java.util.List;
import java.util.Objects;

import stirling.software.SPDF.model.json.PdfJsonTextElement;

public final class PdfTextMergeHelper {
    private PdfTextMergeHelper() {}

    public static MergedText mergeText(List<PdfJsonTextElement> elements) {
        StringBuilder builder = new StringBuilder();
        List<Integer> combinedCodes = new ArrayList<>();
        for (PdfJsonTextElement element : elements) {
            builder.append(Objects.toString(element.getText(), ""));
            int[] codes = element.getCharCodes();
            if (codes != null && codes.length > 0) {
                for (int code : codes) {
                    combinedCodes.add(code);
                }
            }
        }
        return new MergedText(builder.toString(), combinedCodes.isEmpty() ? null : combinedCodes);
    }

    public static record MergedText(String text, List<Integer> charCodes) {}
}
