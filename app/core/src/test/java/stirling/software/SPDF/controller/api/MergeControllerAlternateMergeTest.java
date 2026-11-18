package stirling.software.SPDF.controller.api;

import static org.junit.jupiter.api.Assertions.assertEquals;

import java.io.IOException;

import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDPage;
import org.apache.pdfbox.pdmodel.common.PDRectangle;
import org.junit.jupiter.api.Test;

class MergeControllerAlternateMergeTest {

    private static PDDocument documentWithPages(float pageHeight, int count) {
        PDDocument doc = new PDDocument();
        for (int i = 0; i < count; i++) {
            PDPage page = new PDPage();
            page.setMediaBox(new PDRectangle(612, pageHeight));
            doc.addPage(page);
        }
        return doc;
    }

    private static float[] pageHeights(PDDocument doc) {
        float[] heights = new float[doc.getNumberOfPages()];
        for (int i = 0; i < heights.length; i++) {
            heights[i] = doc.getPage(i).getMediaBox().getHeight();
        }
        return heights;
    }

    private static void assertArrayEquals(float[] expected, float[] actual) {
        assertEquals(expected.length, actual.length);
        for (int i = 0; i < expected.length; i++) {
            assertEquals(expected[i], actual[i], 0.001f, "page " + i);
        }
    }

    @Test
    void interleavesPagesFromBothDocuments() throws IOException {
        try (PDDocument first = documentWithPages(200f, 3);
                PDDocument second = documentWithPages(400f, 3)) {
            PDDocument merged =
                    MergeController.mergeDocumentsAlternate(
                            java.util.List.of(first, second), false);
            assertArrayEquals(new float[] {200f, 400f, 200f, 400f, 200f, 400f}, pageHeights(merged));
            merged.close();
        }
    }

    @Test
    void reverseSecondDocumentTakesPagesFromTheEnd() throws IOException {
        try (PDDocument first = documentWithPages(200f, 2);
                PDDocument second = documentWithPages(400f, 3)) {
            PDDocument merged =
                    MergeController.mergeDocumentsAlternate(
                            java.util.List.of(first, second), true);
            // front1, back3, front2, back2, back1
            assertArrayEquals(
                    new float[] {200f, 400f, 200f, 400f, 400f}, pageHeights(merged));
            merged.close();
        }
    }

    @Test
    void appendsRemainingPagesWhenFirstDocumentIsLonger() throws IOException {
        try (PDDocument first = documentWithPages(200f, 4);
                PDDocument second = documentWithPages(400f, 1)) {
            PDDocument merged =
                    MergeController.mergeDocumentsAlternate(
                            java.util.List.of(first, second), false);
            assertArrayEquals(
                    new float[] {200f, 400f, 200f, 200f, 200f}, pageHeights(merged));
            merged.close();
        }
    }

    @Test
    void appendsRemainingPagesWhenSecondDocumentIsLonger() throws IOException {
        try (PDDocument first = documentWithPages(200f, 1);
                PDDocument second = documentWithPages(400f, 3)) {
            PDDocument merged =
                    MergeController.mergeDocumentsAlternate(
                            java.util.List.of(first, second), false);
            assertArrayEquals(
                    new float[] {200f, 400f, 400f, 400f}, pageHeights(merged));
            merged.close();
        }
    }
}
