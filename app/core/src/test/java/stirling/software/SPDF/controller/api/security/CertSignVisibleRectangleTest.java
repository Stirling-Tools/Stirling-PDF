package stirling.software.SPDF.controller.api.security;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import org.apache.pdfbox.pdmodel.PDPage;
import org.apache.pdfbox.pdmodel.common.PDRectangle;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

@DisplayName("CertSignController.resolveVisibleSignatureRectangle")
class CertSignVisibleRectangleTest {

    private static final float PAGE_W = 600f;
    private static final float PAGE_H = 800f;

    private static PDPage page() {
        return new PDPage(new PDRectangle(PAGE_W, PAGE_H));
    }

    @Test
    @DisplayName("omitted rects use the legacy 200×50 corner widget")
    void legacyDefaultWhenAllNull() {
        PDRectangle rect =
                CertSignController.resolveVisibleSignatureRectangle(page(), null, null, null, null);
        assertThat(rect.getLowerLeftX()).isEqualTo(0f);
        assertThat(rect.getLowerLeftY()).isEqualTo(0f);
        assertThat(rect.getWidth()).isEqualTo(200f);
        assertThat(rect.getHeight()).isEqualTo(50f);
    }

    @Test
    @DisplayName("partial rect input is rejected")
    void rejectsPartialRect() {
        assertThatThrownBy(
                        () ->
                                CertSignController.resolveVisibleSignatureRectangle(
                                        page(), 0.1, null, 0.2, 0.05))
                .isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    @DisplayName("top-left fractions convert to PDF user-space width/height")
    void convertsTopLeftFractions() {
        // x=0.1, y=0.2, w=0.3, h=0.1 on a 600×800 page
        PDRectangle rect =
                CertSignController.resolveVisibleSignatureRectangle(page(), 0.1, 0.2, 0.3, 0.1);

        float expectedW = 0.3f * PAGE_W;
        float expectedH = 0.1f * PAGE_H;
        float expectedLlx = 0.1f * PAGE_W;
        float expectedLly = PAGE_H - (0.2f * PAGE_H) - expectedH;

        assertThat(rect.getLowerLeftX()).isEqualTo(expectedLlx);
        assertThat(rect.getLowerLeftY()).isEqualTo(expectedLly);
        assertThat(rect.getWidth()).isEqualTo(expectedW);
        assertThat(rect.getHeight()).isEqualTo(expectedH);
    }
}
