package stirling.software.SPDF.model.api.misc;

import static org.junit.jupiter.api.Assertions.*;

import java.util.Set;
import java.util.stream.Collectors;

import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockMultipartFile;

import jakarta.validation.ConstraintViolation;
import jakarta.validation.Validation;
import jakarta.validation.Validator;
import jakarta.validation.ValidatorFactory;

class ScannerEffectRequestTest {

    private static Validator validator;

    @BeforeAll
    static void setupValidator() {
        ValidatorFactory factory = Validation.buildDefaultValidatorFactory();
        validator = factory.getValidator();
    }

    @Test
    @DisplayName("fileInput is @NotNull -> violation when missing")
    void fileInput_missing_triggersViolation() {
        ScannerEffectRequest req = new ScannerEffectRequest();

        Set<ConstraintViolation<ScannerEffectRequest>> violations = validator.validate(req);
        boolean hasFileInputViolation =
                violations.stream()
                        .anyMatch(v -> "fileInput".contentEquals(v.getPropertyPath().toString()));

        assertTrue(
                hasFileInputViolation,
                () ->
                        "Expected a validation violation on 'fileInput', but got: "
                                + violations.stream()
                                        .map(v -> v.getPropertyPath() + " -> " + v.getMessage())
                                        .collect(Collectors.joining(", ")));
    }

    @Test
    @DisplayName("fileInput present -> no violation for fileInput")
    void fileInput_present_noViolationForThatField() {
        ScannerEffectRequest req = new ScannerEffectRequest();
        req.setFileInput(
                new MockMultipartFile(
                        "fileInput", "test.pdf", "application/pdf", new byte[] {1, 2, 3}));

        Set<ConstraintViolation<ScannerEffectRequest>> violations = validator.validate(req);

        boolean hasFileInputViolation =
                violations.stream()
                        .anyMatch(v -> "fileInput".contentEquals(v.getPropertyPath().toString()));

        assertFalse(
                hasFileInputViolation,
                () ->
                        "Did not expect a validation violation on 'fileInput', but got: "
                                + violations.stream()
                                        .map(v -> v.getPropertyPath() + " -> " + v.getMessage())
                                        .collect(Collectors.joining(", ")));
    }

    @Test
    @DisplayName("Roundtrip: basic numeric properties")
    void roundtrip_basicNumericProperties() {
        ScannerEffectRequest req = new ScannerEffectRequest();

        req.setRotate(3);
        req.setRotateVariance(2);
        req.setBrightness(1.11f);
        req.setContrast(0.95f);
        req.setBlur(1.25f);
        req.setNoise(0.75f);
        req.setResolution(110);

        assertEquals(3, req.getRotate());
        assertEquals(2, req.getRotateVariance());
        assertEquals(1.11f, req.getBrightness(), 0.0001f);
        assertEquals(0.95f, req.getContrast(), 0.0001f);
        assertEquals(1.25f, req.getBlur(), 0.0001f);
        assertEquals(0.75f, req.getNoise(), 0.0001f);
        assertEquals(110, req.getResolution());
    }

    @Test
    @DisplayName("advancedEnabled default is false and can be toggled")
    void advancedEnabled_flag_roundtrip() {
        ScannerEffectRequest req = new ScannerEffectRequest();
        // Erwartung: default false (falls das Modell das so definiert)
        assertFalse(req.isAdvancedEnabled(), "advancedEnabled should default to false");
        req.setAdvancedEnabled(true);
        assertTrue(req.isAdvancedEnabled());
        req.setAdvancedEnabled(false);
        assertFalse(req.isAdvancedEnabled());
    }

    @Test
    @DisplayName("Colorspace roundtrip")
    void colorspace_roundtrip() {
        ScannerEffectRequest req = new ScannerEffectRequest();
        // Erwartung: Colorspace enum enthält mindestens 'color'
        req.setColorspace(ScannerEffectRequest.Colorspace.color);
        assertEquals(ScannerEffectRequest.Colorspace.color, req.getColorspace());
    }

    @Test
    @DisplayName("applyHighQualityPreset sets documented values")
    void preset_highQuality() {
        ScannerEffectRequest req = new ScannerEffectRequest();
        req.applyHighQualityPreset();

        assertEquals(0.1f, req.getBlur(), 0.0001f);
        assertEquals(1.0f, req.getNoise(), 0.0001f);
        assertEquals(1.03f, req.getBrightness(), 0.0001f);
        assertEquals(1.06f, req.getContrast(), 0.0001f);
        assertEquals(150, req.getResolution());
    }

    @Test
    @DisplayName("applyMediumQualityPreset sets documented values")
    void preset_mediumQuality() {
        ScannerEffectRequest req = new ScannerEffectRequest();
        req.applyMediumQualityPreset();

        assertEquals(0.1f, req.getBlur(), 0.0001f);
        assertEquals(1.0f, req.getNoise(), 0.0001f);
        assertEquals(1.06f, req.getBrightness(), 0.0001f);
        assertEquals(1.12f, req.getContrast(), 0.0001f);
        assertEquals(100, req.getResolution());
    }

    @Test
    @DisplayName("applyLowQualityPreset sets documented values")
    void preset_lowQuality() {
        ScannerEffectRequest req = new ScannerEffectRequest();
        req.applyLowQualityPreset();

        assertEquals(0.9f, req.getBlur(), 0.0001f);
        assertEquals(2.5f, req.getNoise(), 0.0001f);
        assertEquals(1.08f, req.getBrightness(), 0.0001f);
        assertEquals(1.15f, req.getContrast(), 0.0001f);
        assertEquals(75, req.getResolution());
    }
}
