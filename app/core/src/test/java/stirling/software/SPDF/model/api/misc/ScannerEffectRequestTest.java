package stirling.software.SPDF.model.api.misc;

import static org.junit.jupiter.api.Assertions.*;

import java.util.Set;

import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockMultipartFile;

import jakarta.validation.ConstraintViolation;
import jakarta.validation.Validation;
import jakarta.validation.Validator;
import jakarta.validation.ValidatorFactory;

class ScannerEffectRequestTest {

    private static Validator validator;

    @BeforeAll
    static void setUpValidator() {
        ValidatorFactory factory = Validation.buildDefaultValidatorFactory();
        validator = factory.getValidator();
    }

    @Test
    void defaults_are_set_correctly() {
        ScannerEffectRequest req = new ScannerEffectRequest();

        assertNull(req.getFileInput());
        assertEquals(ScannerEffectRequest.Quality.high, req.getQuality());
        assertEquals(ScannerEffectRequest.Rotation.slight, req.getRotation());
        assertEquals(ScannerEffectRequest.Colorspace.grayscale, req.getColorspace());

        assertEquals(20, req.getBorder());
        assertEquals(0, req.getRotate());
        assertEquals(2, req.getRotateVariance());

        assertEquals(1.0f, req.getBrightness(), 0.0001);
        assertEquals(1.0f, req.getContrast(), 0.0001);
        assertEquals(1.0f, req.getBlur(), 0.0001);
        assertEquals(8.0f, req.getNoise(), 0.0001);

        assertFalse(req.isYellowish());
        assertEquals(300, req.getResolution());
        assertFalse(req.isAdvancedEnabled());
    }

    @Test
    void bean_validation_detects_missing_required_fields() {
        ScannerEffectRequest req = new ScannerEffectRequest();
        // Defaults: fileInput=null, quality != null, rotation != null
        Set<ConstraintViolation<ScannerEffectRequest>> violations = validator.validate(req);
        assertTrue(
                violations.stream().anyMatch(v -> "File input is required".equals(v.getMessage())),
                "Expected violation for missing fileInput");

        // Make also quality and rotation invalid
        req.setQuality(null);
        req.setRotation(null);
        violations = validator.validate(req);

        assertTrue(
                violations.stream().anyMatch(v -> "File input is required".equals(v.getMessage())));
        assertTrue(violations.stream().anyMatch(v -> "Quality is required".equals(v.getMessage())));
        assertTrue(
                violations.stream().anyMatch(v -> "Rotation is required".equals(v.getMessage())));
    }

    @Test
    void quality_value_mapping_is_correct() {
        ScannerEffectRequest req = new ScannerEffectRequest();

        req.setQuality(ScannerEffectRequest.Quality.low);
        assertEquals(30, req.getQuality());

        req.setQuality(ScannerEffectRequest.Quality.medium);
        assertEquals(60, req.getQuality());

        req.setQuality(ScannerEffectRequest.Quality.high);
        assertEquals(100, req.getQuality());
    }

    @Test
    void rotation_value_mapping_is_correct() {
        ScannerEffectRequest req = new ScannerEffectRequest();

        req.setRotation(ScannerEffectRequest.Rotation.none);
        assertEquals(0, req.getRotationValue());

        req.setRotation(ScannerEffectRequest.Rotation.slight);
        assertEquals(2, req.getRotationValue());

        req.setRotation(ScannerEffectRequest.Rotation.moderate);
        assertEquals(5, req.getRotationValue());

        req.setRotation(ScannerEffectRequest.Rotation.severe);
        assertEquals(8, req.getRotationValue());
    }

    @Test
    void high_quality_preset_applies_expected_values() {
        ScannerEffectRequest req = new ScannerEffectRequest();
        req.applyHighQualityPreset();

        assertEquals(0.1f, req.getBlur(), 0.0001);
        assertEquals(1.0f, req.getNoise(), 0.0001);
        assertEquals(1.02f, req.getBrightness(), 0.0001);
        assertEquals(1.05f, req.getContrast(), 0.0001);
        assertEquals(600, req.getResolution());
    }

    @Test
    void medium_quality_preset_applies_expected_values() {
        ScannerEffectRequest req = new ScannerEffectRequest();
        req.applyMediumQualityPreset();

        assertEquals(0.5f, req.getBlur(), 0.0001);
        assertEquals(3.0f, req.getNoise(), 0.0001);
        assertEquals(1.05f, req.getBrightness(), 0.0001);
        assertEquals(1.1f, req.getContrast(), 0.0001);
        assertEquals(300, req.getResolution());
    }

    @Test
    void low_quality_preset_applies_expected_values() {
        ScannerEffectRequest req = new ScannerEffectRequest();
        req.applyLowQualityPreset();

        assertEquals(1.0f, req.getBlur(), 0.0001);
        assertEquals(5.0f, req.getNoise(), 0.0001);
        assertEquals(1.1f, req.getBrightness(), 0.0001);
        assertEquals(1.2f, req.getContrast(), 0.0001);
        assertEquals(150, req.getResolution());
    }

    @Test
    void equals_and_hashCode_consider_fileInput() {
        ScannerEffectRequest a = new ScannerEffectRequest();
        ScannerEffectRequest b = new ScannerEffectRequest();

        // same defaults -> equal
        assertEquals(a, b);
        assertEquals(a.hashCode(), b.hashCode());

        // set file only on one -> not equal
        MockMultipartFile file =
                new MockMultipartFile(
                        "fileInput", "x.pdf", "application/pdf", new byte[] {1, 2, 3});
        a.setFileInput(file);

        assertNotEquals(a, b);
        assertNotEquals(a.hashCode(), b.hashCode());
    }

    @Test
    void advancedEnabled_flag_roundtrip() {
        ScannerEffectRequest req = new ScannerEffectRequest();
        assertFalse(req.isAdvancedEnabled());
        req.setAdvancedEnabled(true);
        assertTrue(req.isAdvancedEnabled());
    }

    @Test
    void colorspace_roundtrip() {
        ScannerEffectRequest req = new ScannerEffectRequest();
        req.setColorspace(ScannerEffectRequest.Colorspace.color);
        assertEquals(ScannerEffectRequest.Colorspace.color, req.getColorspace());
    }
}
