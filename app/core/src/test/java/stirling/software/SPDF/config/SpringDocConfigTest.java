package stirling.software.SPDF.config;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.springdoc.core.customizers.OpenApiCustomizer;
import org.springdoc.core.models.GroupedOpenApi;

import io.swagger.v3.oas.models.OpenAPI;
import io.swagger.v3.oas.models.info.Info;

@DisplayName("SpringDocConfig")
class SpringDocConfigTest {

    private SpringDocConfig config;

    @BeforeEach
    void setUp() {
        config = new SpringDocConfig();
    }

    // Applies every registered customizer against a fresh OpenAPI carrying an Info instance.
    private OpenAPI applyCustomizers(GroupedOpenApi api) {
        OpenAPI openApi = new OpenAPI().info(new Info());
        for (OpenApiCustomizer customizer : api.getOpenApiCustomizers()) {
            customizer.customise(openApi);
        }
        return openApi;
    }

    @Nested
    @DisplayName("pdfProcessingApi")
    class PdfProcessingApi {

        @Test
        @DisplayName("builds the file-processing group with match and exclude paths")
        void buildsGroup() {
            OpenApiCustomizer pdfFileOneOfCustomizer = openApi -> {};

            GroupedOpenApi api = config.pdfProcessingApi(pdfFileOneOfCustomizer);

            assertThat(api).isNotNull();
            assertThat(api.getGroup()).isEqualTo("file-processing");
            assertThat(api.getDisplayName()).isEqualTo("File Processing");
            assertThat(api.getPathsToMatch()).contains("/api/v1/**");
            assertThat(api.getPathsToExclude()).contains("/api/v1/admin/**", "/api/v1/auth/**");
            // The injected oneOf customizer plus the inline info customizer are both registered.
            assertThat(api.getOpenApiCustomizers()).hasSizeGreaterThanOrEqualTo(2);
        }

        @Test
        @DisplayName("info customizer sets the processing title and description")
        void infoCustomizerSetsTitle() {
            GroupedOpenApi api = config.pdfProcessingApi(openApi -> {});

            OpenAPI openApi = applyCustomizers(api);

            assertThat(openApi.getInfo().getTitle()).isEqualTo("Stirling PDF - Processing API");
            assertThat(openApi.getInfo().getDescription()).contains("PDF");
        }
    }

    @Nested
    @DisplayName("adminApi")
    class AdminApi {

        @Test
        @DisplayName("builds the management group with admin/user/auth paths")
        void buildsGroup() {
            GroupedOpenApi api = config.adminApi();

            assertThat(api.getGroup()).isEqualTo("management");
            assertThat(api.getDisplayName()).isEqualTo("Management");
            assertThat(api.getPathsToMatch())
                    .contains("/api/v1/admin/**", "/api/v1/user/**", "/api/v1/auth/**");
        }

        @Test
        @DisplayName("info customizer sets the management title")
        void infoCustomizerSetsTitle() {
            GroupedOpenApi api = config.adminApi();

            OpenAPI openApi = applyCustomizers(api);

            assertThat(openApi.getInfo().getTitle()).isEqualTo("Stirling PDF - Management API");
            assertThat(openApi.getInfo().getDescription()).isNotBlank();
        }
    }

    @Nested
    @DisplayName("systemApi")
    class SystemApi {

        @Test
        @DisplayName("builds the system group with ui-data/info paths")
        void buildsGroup() {
            GroupedOpenApi api = config.systemApi();

            assertThat(api.getGroup()).isEqualTo("system");
            assertThat(api.getDisplayName()).isEqualTo("System & UI API");
            assertThat(api.getPathsToMatch())
                    .contains("/api/v1/ui-data/**", "/api/v1/info/**", "/api/v1/general/job/**");
        }

        @Test
        @DisplayName("info customizer sets the system title")
        void infoCustomizerSetsTitle() {
            GroupedOpenApi api = config.systemApi();

            OpenAPI openApi = applyCustomizers(api);

            assertThat(openApi.getInfo().getTitle()).isEqualTo("Stirling PDF - System API");
            assertThat(openApi.getInfo().getDescription()).isNotBlank();
        }
    }
}
