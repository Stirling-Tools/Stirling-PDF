package stirling.software.SPDF.config;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import java.lang.reflect.Field;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;

import jakarta.servlet.MultipartConfigElement;

import stirling.software.SPDF.controller.web.UploadLimitService;

class MultipartConfigurationTest {

    private UploadLimitService uploadLimitService;
    private MultipartConfiguration configuration;

    @BeforeEach
    void setUp() throws Exception {
        // Manually constructed config with a mocked service, so Spring env overrides do not apply.
        uploadLimitService = mock(UploadLimitService.class);
        configuration = new MultipartConfiguration();
        Field field = MultipartConfiguration.class.getDeclaredField("uploadLimitService");
        field.setAccessible(true);
        field.set(configuration, uploadLimitService);
    }

    @Nested
    @DisplayName("multipartConfigElement")
    class ConfigElement {

        @Test
        @DisplayName("uses the configured upload limit when positive")
        void usesConfiguredLimit() {
            long limit = 50L * 1024 * 1024;
            when(uploadLimitService.getUploadLimit()).thenReturn(limit);
            when(uploadLimitService.getReadableUploadLimit()).thenReturn("50.0 MB");

            MultipartConfigElement element = configuration.multipartConfigElement();

            assertThat(element.getMaxFileSize()).isEqualTo(limit);
            assertThat(element.getMaxRequestSize()).isEqualTo(limit);
        }

        @Test
        @DisplayName("falls back to 2000MB default when no limit configured")
        void usesDefaultWhenZero() {
            when(uploadLimitService.getUploadLimit()).thenReturn(0L);

            MultipartConfigElement element = configuration.multipartConfigElement();

            long expectedDefault = 2000L * 1024 * 1024;
            assertThat(element.getMaxFileSize()).isEqualTo(expectedDefault);
            assertThat(element.getMaxRequestSize()).isEqualTo(expectedDefault);
        }
    }
}
