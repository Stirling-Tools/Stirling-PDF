package stirling.software.SPDF.model.api.security;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import jakarta.validation.Validation;
import jakarta.validation.Validator;

@DisplayName("AddWatermarkRequest")
class AddWatermarkRequestTest {

    private static Validator validator;

    @BeforeAll
    static void setupValidator() {
        validator = Validation.buildDefaultValidatorFactory().getValidator();
    }

    @Test
    @DisplayName("defaults match what the web UI sends")
    void defaultsMatchUi() {
        AddWatermarkRequest req = new AddWatermarkRequest();
        assertThat(req.getWatermarkType()).isNull();
        assertThat(req.getAlphabet()).isEqualTo("roman");
        assertThat(req.getFontSize()).isEqualTo(12f);
        assertThat(req.getRotation()).isEqualTo(0f);
        assertThat(req.getOpacity()).isEqualTo(0.5f);
        assertThat(req.getWidthSpacer()).isEqualTo(50);
        assertThat(req.getHeightSpacer()).isEqualTo(50);
        assertThat(req.getCustomColor()).isEqualTo("#d3d3d3");
        assertThat(req.getConvertPDFToImage()).isFalse();
    }

    @Test
    @DisplayName("a request with only watermarkText passes bean validation")
    void textOnlyRequestIsValid() {
        AddWatermarkRequest req = new AddWatermarkRequest();
        req.setFileId("file-1");
        req.setWatermarkText("TEST");
        assertThat(validator.validate(req)).isEmpty();
    }
}
