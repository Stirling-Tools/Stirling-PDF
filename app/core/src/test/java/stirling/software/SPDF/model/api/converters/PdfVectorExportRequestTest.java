package stirling.software.SPDF.model.api.converters;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.Set;

import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Test;

import jakarta.validation.ConstraintViolation;
import jakarta.validation.Validation;
import jakarta.validation.Validator;
import jakarta.validation.ValidatorFactory;

public class PdfVectorExportRequestTest {

    private static Validator validator;

    @BeforeAll
    static void setUpValidator() {
        try (ValidatorFactory factory = Validation.buildDefaultValidatorFactory()) {
            validator = factory.getValidator();
        }
    }

    @Test
    void whenOutputFormatValid_thenNoViolations() {
        PdfVectorExportRequest request = new PdfVectorExportRequest();
        request.setOutputFormat("EPS");

        Set<ConstraintViolation<PdfVectorExportRequest>> violations = validator.validate(request);

        assertThat(violations).isEmpty();
    }

    @Test
    void whenOutputFormatInvalid_thenConstraintViolation() {
        PdfVectorExportRequest request = new PdfVectorExportRequest();
        request.setOutputFormat("svg");

        Set<ConstraintViolation<PdfVectorExportRequest>> violations = validator.validate(request);

        assertThat(violations).hasSize(1);
        assertThat(violations.iterator().next().getPropertyPath().toString())
                .isEqualTo("outputFormat");
    }
}
