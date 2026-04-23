package stirling.software.proprietary.workflow.dto;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import org.junit.jupiter.api.Test;

class WetSignatureMetadataTest {

    private static WetSignatureMetadata canvas(double x, double y, double w, double h) {
        return new WetSignatureMetadata("canvas", "data:image/png;base64,abc==", 0, x, y, w, h);
    }

    // -------------------------------------------------------------------------
    // validate() — image data prefix
    // -------------------------------------------------------------------------

    @Test
    void validate_canvas_withDataImagePrefix_passes() {
        assertThatCode(() -> canvas(0.0, 0.0, 0.5, 0.5).validate()).doesNotThrowAnyException();
    }

    @Test
    void validate_image_withDataImagePrefix_passes() {
        WetSignatureMetadata sig =
                new WetSignatureMetadata(
                        "image", "data:image/jpeg;base64,xyz==", 0, 0.1, 0.1, 0.3, 0.3);
        assertThatCode(sig::validate).doesNotThrowAnyException();
    }

    @Test
    void validate_canvas_withoutDataImagePrefix_throws() {
        WetSignatureMetadata sig =
                new WetSignatureMetadata(
                        "canvas", "raw-base64-without-prefix", 0, 0.0, 0.0, 0.5, 0.5);
        assertThatThrownBy(sig::validate)
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("data:image/");
    }

    @Test
    void validate_text_doesNotRequireDataImagePrefix() {
        WetSignatureMetadata sig =
                new WetSignatureMetadata("text", "John Doe", 0, 0.1, 0.1, 0.3, 0.2);
        assertThatCode(sig::validate).doesNotThrowAnyException();
    }

    // -------------------------------------------------------------------------
    // validate() — cross-field boundary checks (x + width, y + height)
    // -------------------------------------------------------------------------

    @Test
    void validate_xPlusWidthExactlyOne_passes() {
        assertThatCode(() -> canvas(0.5, 0.0, 0.5, 0.5).validate()).doesNotThrowAnyException();
    }

    @Test
    void validate_xPlusWidthExceedsOne_throws() {
        assertThatThrownBy(() -> canvas(0.6, 0.0, 0.5, 0.5).validate())
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("right edge");
    }

    @Test
    void validate_yPlusHeightExactlyOne_passes() {
        assertThatCode(() -> canvas(0.0, 0.5, 0.5, 0.5).validate()).doesNotThrowAnyException();
    }

    @Test
    void validate_yPlusHeightExceedsOne_throws() {
        assertThatThrownBy(() -> canvas(0.0, 0.6, 0.5, 0.5).validate())
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("bottom edge");
    }

    @Test
    void validate_originWithFullPageSize_passes() {
        assertThatCode(() -> canvas(0.0, 0.0, 1.0, 1.0).validate()).doesNotThrowAnyException();
    }

    // -------------------------------------------------------------------------
    // MAX_SIGNATURES_PER_PARTICIPANT constant
    // -------------------------------------------------------------------------

    @Test
    void maxSignaturesConstant_isPositive() {
        assertThat(WetSignatureMetadata.MAX_SIGNATURES_PER_PARTICIPANT).isGreaterThan(0);
    }

    // -------------------------------------------------------------------------
    // extractBase64Data()
    // -------------------------------------------------------------------------

    @Test
    void extractBase64Data_stripsDataUrlPrefix() {
        WetSignatureMetadata sig = canvas(0.0, 0.0, 0.5, 0.5);
        sig.setData("data:image/png;base64,iVBORw0KGgo=");
        assertThat(sig.extractBase64Data()).isEqualTo("iVBORw0KGgo=");
    }

    @Test
    void extractBase64Data_noComma_returnsDataUnchanged() {
        WetSignatureMetadata sig = canvas(0.0, 0.0, 0.5, 0.5);
        sig.setData("plainbase64withoutcomma");
        assertThat(sig.extractBase64Data()).isEqualTo("plainbase64withoutcomma");
    }

    @Test
    void extractBase64Data_null_returnsNull() {
        WetSignatureMetadata sig = canvas(0.0, 0.0, 0.5, 0.5);
        sig.setData(null);
        assertThat(sig.extractBase64Data()).isNull();
    }
}
