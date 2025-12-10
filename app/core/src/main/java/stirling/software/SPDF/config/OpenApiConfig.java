package stirling.software.SPDF.config;

import java.util.List;

import org.springdoc.core.customizers.OpenApiCustomizer;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

import io.swagger.v3.oas.models.Components;
import io.swagger.v3.oas.models.OpenAPI;
import io.swagger.v3.oas.models.info.Contact;
import io.swagger.v3.oas.models.info.Info;
import io.swagger.v3.oas.models.info.License;
import io.swagger.v3.oas.models.media.ComposedSchema;
import io.swagger.v3.oas.models.media.ObjectSchema;
import io.swagger.v3.oas.models.media.Schema;
import io.swagger.v3.oas.models.media.StringSchema;
import io.swagger.v3.oas.models.security.SecurityRequirement;
import io.swagger.v3.oas.models.security.SecurityScheme;
import io.swagger.v3.oas.models.servers.Server;

import lombok.RequiredArgsConstructor;

import stirling.software.common.model.ApplicationProperties;

@Configuration
@RequiredArgsConstructor
public class OpenApiConfig {

    private final ApplicationProperties applicationProperties;

    private static final String DEFAULT_TITLE = "Stirling PDF API";
    private static final String DEFAULT_DESCRIPTION =
            "API documentation for all Server-Side processing.\n"
                    + "Please note some functionality might be UI only and missing from here.";

    @Bean
    public OpenAPI customOpenAPI() {
        String version = getClass().getPackage().getImplementationVersion();
        if (version == null) {
            // default version if all else fails
            version = "1.0.0";
        }
        Info info =
                new Info()
                        .title(DEFAULT_TITLE)
                        .version(version)
                        .license(
                                new License()
                                        .name("MIT")
                                        .url(
                                                "https://raw.githubusercontent.com/Stirling-Tools/Stirling-PDF/refs/heads/main/LICENSE"))
                        .termsOfService("https://www.stirlingpdf.com/terms")
                        .contact(
                                new Contact()
                                        .name("Stirling Software")
                                        .url("https://www.stirlingpdf.com")
                                        .email("contact@stirlingpdf.com"))
                        .description(DEFAULT_DESCRIPTION);

        OpenAPI openAPI = new OpenAPI().info(info).openapi("3.0.3");

        // Add server configuration from environment variable
        String swaggerServerUrl = System.getenv("SWAGGER_SERVER_URL");
        Server server;
        if (swaggerServerUrl != null && !swaggerServerUrl.trim().isEmpty()) {
            server = new Server().url(swaggerServerUrl).description("API Server");
        } else {
            // Use relative path so Swagger uses the current browser origin to avoid CORS issues when accessing via different ports
            server = new Server().url("/").description("Current Server");
        }
        openAPI.addServersItem(server);

        // Add ErrorResponse schema to components
        Schema<?> errorResponseSchema =
                new Schema<>()
                        .type("object")
                        .addProperty(
                                "timestamp",
                                new Schema<>()
                                        .type("string")
                                        .format("date-time")
                                        .description("Error timestamp"))
                        .addProperty(
                                "status",
                                new Schema<>().type("integer").description("HTTP status code"))
                        .addProperty(
                                "error", new Schema<>().type("string").description("Error type"))
                        .addProperty(
                                "message",
                                new Schema<>().type("string").description("Error message"))
                        .addProperty(
                                "path", new Schema<>().type("string").description("Request path"))
                        .description("Standard error response format");

        Components components = new Components().addSchemas("ErrorResponse", errorResponseSchema);

        if (!applicationProperties.getSecurity().getEnableLogin()) {
            return openAPI.components(components);
        } else {
            SecurityScheme apiKeyScheme =
                    new SecurityScheme()
                            .type(SecurityScheme.Type.APIKEY)
                            .in(SecurityScheme.In.HEADER)
                            .name("X-API-KEY");
            components.addSecuritySchemes("apiKey", apiKeyScheme);
            return openAPI.components(components)
                    .addSecurityItem(new SecurityRequirement().addList("apiKey"));
        }
    }

    @Bean
    OpenApiCustomizer pdfFileOneOfCustomizer() {
        return openApi -> {
            var components = openApi.getComponents();
            var schemas = components.getSchemas();

            // Define the two shapes
            var upload =
                    new ObjectSchema()
                            .name("PDFFileUpload")
                            .description("Upload a PDF file")
                            .addProperty("fileInput", new StringSchema().format("binary"))
                            .addRequiredItem("fileInput");

            var ref =
                    new ObjectSchema()
                            .name("PDFFileRef")
                            .description("Reference a server-side file")
                            .addProperty(
                                    "fileId",
                                    new StringSchema()
                                            .example("a1b2c3d4-5678-90ab-cdef-ghijklmnopqr"))
                            .addRequiredItem("fileId");

            schemas.put("PDFFileUpload", upload);
            schemas.put("PDFFileRef", ref);

            // Create the oneOf schema
            var pdfFileOneOf =
                    new ComposedSchema()
                            .oneOf(
                                    List.of(
                                            new Schema<>()
                                                    .$ref("#/components/schemas/PDFFileUpload"),
                                            new Schema<>().$ref("#/components/schemas/PDFFileRef")))
                            .description("Either upload a file or provide a server-side file ID");

            // Replace PDFFile schema
            schemas.put("PDFFile", pdfFileOneOf);
        };
    }
}
