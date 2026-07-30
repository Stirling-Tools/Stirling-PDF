package stirling.software.saas.payg.test;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.lang.reflect.Method;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.web.multipart.MultipartFile;

import io.swagger.v3.oas.annotations.Hidden;

import stirling.software.common.annotations.AutoJobPostMapping;

/**
 * Tests for the cucumber-only force-500 stub {@link PaygCucumberThrowController}. The endpoint must
 * always throw so the PAYG refund path is exercised end-to-end; both the null-file and present-file
 * logging branches are driven, and the mapping metadata is locked down.
 */
class PaygCucumberThrowControllerTest {

    private final PaygCucumberThrowController controller = new PaygCucumberThrowController();

    @Test
    @DisplayName("always throws IllegalStateException when given a file")
    void throws_withFile() {
        MultipartFile file =
                new MockMultipartFile("fileInput", "in.pdf", "application/pdf", new byte[] {1, 2});
        assertThatThrownBy(() -> controller.throw500(file))
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("PAYG cucumber forced 500");
    }

    @Test
    @DisplayName("always throws IllegalStateException when the file is null")
    void throws_withNullFile() {
        assertThatThrownBy(() -> controller.throw500(null))
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("PAYG cucumber forced 500");
    }

    @Test
    @DisplayName("declares ResponseEntity<Void> so the advice's 500 reaches the wire")
    void returnTypeIsResponseEntity() throws NoSuchMethodException {
        Method m = PaygCucumberThrowController.class.getMethod("throw500", MultipartFile.class);
        assertThat(m.getReturnType()).isEqualTo(ResponseEntity.class);
    }

    @Test
    @DisplayName("is @Hidden and uses AutoJobPostMapping consuming multipart/form-data")
    void mappingMetadata() throws NoSuchMethodException {
        assertThat(PaygCucumberThrowController.class.isAnnotationPresent(Hidden.class)).isTrue();

        Method m = PaygCucumberThrowController.class.getMethod("throw500", MultipartFile.class);
        AutoJobPostMapping mapping = m.getAnnotation(AutoJobPostMapping.class);
        assertThat(mapping).isNotNull();
        assertThat(mapping.value()).containsExactly("/throw-500");
        assertThat(mapping.consumes()).contains(MediaType.MULTIPART_FORM_DATA_VALUE);
    }
}
