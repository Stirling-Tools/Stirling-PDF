package stirling.software.SPDF.config;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.springdoc.core.customizers.OpenApiCustomizer;

import io.swagger.v3.oas.models.Components;
import io.swagger.v3.oas.models.OpenAPI;
import io.swagger.v3.oas.models.media.ComposedSchema;
import io.swagger.v3.oas.models.media.Schema;

import stirling.software.common.model.ApplicationProperties;

@DisplayName("OpenApiConfig")
class OpenApiConfigTest {

    private ApplicationProperties applicationProperties;
    private OpenApiConfig config;

    @BeforeEach
    void setUp() {
        applicationProperties = new ApplicationProperties();
        config = new OpenApiConfig(applicationProperties);
    }

    @Nested
    @DisplayName("customOpenAPI")
    class CustomOpenAPI {

        @Test
        @DisplayName("builds OpenAPI with title, version and 3.0.3 spec")
        void buildsBaseOpenApi() {
            OpenAPI openAPI = config.customOpenAPI();

            assertThat(openAPI).isNotNull();
            assertThat(openAPI.getOpenapi()).isEqualTo("3.0.3");
            assertThat(openAPI.getInfo()).isNotNull();
            assertThat(openAPI.getInfo().getTitle()).isEqualTo("Stirling PDF API");
            // Version falls back to 1.0.0 when no implementation version on the package.
            assertThat(openAPI.getInfo().getVersion()).isNotBlank();
        }

        @Test
        @DisplayName("sets license, contact and terms of service")
        void setsLicenseAndContact() {
            OpenAPI openAPI = config.customOpenAPI();

            assertThat(openAPI.getInfo().getLicense()).isNotNull();
            assertThat(openAPI.getInfo().getLicense().getName()).contains("MIT");
            assertThat(openAPI.getInfo().getTermsOfService())
                    .isEqualTo("https://www.stirlingpdf.com/terms");
            assertThat(openAPI.getInfo().getContact()).isNotNull();
            assertThat(openAPI.getInfo().getContact().getEmail())
                    .isEqualTo("contact@stirlingpdf.com");
        }

        @Test
        @DisplayName("registers the global AI tag")
        void registersAiTag() {
            OpenAPI openAPI = config.customOpenAPI();

            assertThat(openAPI.getTags()).isNotNull();
            assertThat(openAPI.getTags())
                    .anySatisfy(tag -> assertThat(tag.getName()).isEqualTo("AI"));
        }

        @Test
        @DisplayName("adds a server item and an ErrorResponse schema")
        void addsServerAndErrorSchema() {
            OpenAPI openAPI = config.customOpenAPI();

            assertThat(openAPI.getServers()).isNotEmpty();
            assertThat(openAPI.getServers().get(0).getUrl()).isNotBlank();

            Components components = openAPI.getComponents();
            assertThat(components).isNotNull();
            assertThat(components.getSchemas()).containsKey("ErrorResponse");
            Schema<?> errorSchema = components.getSchemas().get("ErrorResponse");
            assertThat(errorSchema.getProperties())
                    .containsKeys("timestamp", "status", "error", "message", "path");
        }

        @Test
        @DisplayName("uses relative server URL when SWAGGER_SERVER_URL env var is absent")
        void usesRelativeServerWhenEnvAbsent() {
            // The test JVM does not set SWAGGER_SERVER_URL so the relative branch runs.
            if (System.getenv("SWAGGER_SERVER_URL") == null) {
                OpenAPI openAPI = config.customOpenAPI();
                assertThat(openAPI.getServers().get(0).getUrl()).isEqualTo("/");
                assertThat(openAPI.getServers().get(0).getDescription())
                        .isEqualTo("Current Server");
            }
        }

        @Test
        @DisplayName("omits API-key security scheme when login is disabled")
        void noSecuritySchemeWhenLoginDisabled() {
            applicationProperties.getSecurity().setEnableLogin(false);

            OpenAPI openAPI = config.customOpenAPI();

            assertThat(openAPI.getComponents().getSecuritySchemes()).isNullOrEmpty();
            assertThat(openAPI.getSecurity()).isNullOrEmpty();
        }

        @Test
        @DisplayName("adds API-key security scheme when login is enabled")
        void addsSecuritySchemeWhenLoginEnabled() {
            applicationProperties.getSecurity().setEnableLogin(true);

            OpenAPI openAPI = config.customOpenAPI();

            assertThat(openAPI.getComponents().getSecuritySchemes()).containsKey("apiKey");
            assertThat(openAPI.getSecurity()).isNotEmpty();
            assertThat(openAPI.getSecurity().get(0)).containsKey("apiKey");
        }
    }

    @Nested
    @DisplayName("pdfFileOneOfCustomizer")
    class PdfFileOneOfCustomizer {

        @Test
        @DisplayName("replaces PDFFile schema with a oneOf and registers upload/ref shapes")
        void replacesPdfFileSchema() {
            OpenApiCustomizer customizer = config.pdfFileOneOfCustomizer();
            assertThat(customizer).isNotNull();

            // Seed an OpenAPI with an existing PDFFile schema to be replaced.
            OpenAPI openApi = new OpenAPI().components(new Components());
            openApi.getComponents().addSchemas("PDFFile", new Schema<>().type("string"));

            customizer.customise(openApi);

            var schemas = openApi.getComponents().getSchemas();
            assertThat(schemas).containsKeys("PDFFileUpload", "PDFFileRef", "PDFFile");
            assertThat(schemas.get("PDFFile")).isInstanceOf(ComposedSchema.class);

            ComposedSchema oneOf = (ComposedSchema) schemas.get("PDFFile");
            assertThat(oneOf.getOneOf()).hasSize(2);
            assertThat(schemas.get("PDFFileUpload").getRequired()).contains("fileInput");
            assertThat(schemas.get("PDFFileRef").getRequired()).contains("fileId");
        }
    }
}
