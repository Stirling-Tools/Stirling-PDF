package stirling.software.common.util;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;

import org.apache.pdfbox.pdmodel.PDPage;
import org.apache.pdfbox.pdmodel.common.PDRectangle;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;

class PageBoxUtilsTest {

    private static void assertRectEquals(PDRectangle expected, PDRectangle actual) {
        assertEquals(expected.getLowerLeftX(), actual.getLowerLeftX(), 0.01);
        assertEquals(expected.getLowerLeftY(), actual.getLowerLeftY(), 0.01);
        assertEquals(expected.getUpperRightX(), actual.getUpperRightX(), 0.01);
        assertEquals(expected.getUpperRightY(), actual.getUpperRightY(), 0.01);
    }

    private PDPage pageWithTrimBox() {
        PDPage page = new PDPage(PDRectangle.A4);
        page.setTrimBox(new PDRectangle(20, 20, 400, 600));
        return page;
    }

    @Test
    @DisplayName("Null or blank pageBox resolves to MediaBox")
    void blankResolvesMediaBox() {
        PDPage page = pageWithTrimBox();
        assertRectEquals(PDRectangle.A4, PageBoxUtils.resolvePageBox(page, null));
        assertRectEquals(PDRectangle.A4, PageBoxUtils.resolvePageBox(page, "  "));
    }

    @Test
    @DisplayName("Named box resolves to its own rectangle")
    void namedBoxResolves() {
        PDPage page = pageWithTrimBox();
        PDRectangle trim = PageBoxUtils.resolvePageBox(page, "TRIM_BOX");
        assertEquals(20, trim.getLowerLeftX(), 0.01);
        assertEquals(400, trim.getWidth(), 0.01);
        assertEquals(600, trim.getHeight(), 0.01);
    }

    @ParameterizedTest
    @ValueSource(strings = {"trim_box", "Trim_Box"})
    @DisplayName("Resolution is case-insensitive")
    void caseInsensitive(String value) {
        PDPage page = pageWithTrimBox();
        assertEquals(400, PageBoxUtils.resolvePageBox(page, value).getWidth(), 0.01);
    }

    @Test
    @DisplayName("Missing named box falls back to MediaBox")
    void missingBoxFallsBackToMediaBox() {
        PDPage page = new PDPage(PDRectangle.A4);
        assertRectEquals(PDRectangle.A4, PageBoxUtils.resolvePageBox(page, PageBoxUtils.BLEED_BOX));
        assertRectEquals(PDRectangle.A4, PageBoxUtils.resolvePageBox(page, PageBoxUtils.ART_BOX));
    }

    @Test
    @DisplayName("Invalid pageBox value throws")
    void invalidValueThrows() {
        PDPage page = new PDPage(PDRectangle.A4);
        assertThrows(
                IllegalArgumentException.class,
                () -> PageBoxUtils.resolvePageBox(page, "NOT_A_BOX"));
    }
}
