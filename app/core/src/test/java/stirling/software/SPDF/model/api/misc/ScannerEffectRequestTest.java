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

    @Test
    @DisplayName("getRotationValue() maps enum values to expected degrees")
    void rotationValue_mapping() {
        ScannerEffectRequest req = new ScannerEffectRequest();

        // none -> 0
        req.setRotation(ScannerEffectRequest.Rotation.none);
        assertEquals(0, req.getRotationValue(), "Rotation 'none' should map to 0°");

        // slight -> 2
        req.setRotation(ScannerEffectRequest.Rotation.slight);
        assertEquals(2, req.getRotationValue(), "Rotation 'slight' should map to 2°");

        // moderate -> 5
        req.setRotation(ScannerEffectRequest.Rotation.moderate);
        assertEquals(5, req.getRotationValue(), "Rotation 'moderate' should map to 5°");

        // severe -> 8
        req.setRotation(ScannerEffectRequest.Rotation.severe);
        assertEquals(8, req.getRotationValue(), "Rotation 'severe' should map to 8°");
    }
}
