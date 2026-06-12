package stirling.software.SPDF.config;

import java.util.List;
import java.util.Map;

import org.eclipse.microprofile.openapi.OASFactory;
import org.eclipse.microprofile.openapi.OASFilter;
import org.eclipse.microprofile.openapi.models.Components;
import org.eclipse.microprofile.openapi.models.OpenAPI;
import org.eclipse.microprofile.openapi.models.info.Contact;
import org.eclipse.microprofile.openapi.models.info.Info;
import org.eclipse.microprofile.openapi.models.info.License;
import org.eclipse.microprofile.openapi.models.media.Schema;
import org.eclipse.microprofile.openapi.models.security.SecurityRequirement;
import org.eclipse.microprofile.openapi.models.security.SecurityScheme;
import org.eclipse.microprofile.openapi.models.servers.Server;
import org.eclipse.microprofile.openapi.models.tags.Tag;

import jakarta.enterprise.inject.spi.CDI;

import stirling.software.common.model.ApplicationProperties;

/**
 * Quarkus replacement for the former SpringDoc {@code OpenApiConfig}.
 *
 * <p>Under quarkus-smallrye-openapi the per-controller {@code @Tag}/{@code @Operation} annotations
 * are read automatically, so this class is now an {@link OASFilter} (registered via
 * {@code mp.openapi.filter} in application.properties) that reproduces the old programmatic
 * customizations:
 *
 * <ul>
 *   <li>API {@link Info} (title, version, license, contact, terms of service, description);
 *   <li>the global "AI" {@link Tag};
 *   <li>the {@link Server} entry (optionally from {@code SWAGGER_SERVER_URL});
 *   <li>the {@code ErrorResponse} component schema;
 *   <li>the {@code apiKey} security scheme + requirement when login is enabled;
 *   <li>the {@code PDFFile} {@code oneOf} (upload vs. server-side file id) schema.
 * </ul>
 *
 * <p>TODO: Migration required - register this filter by setting {@code mp.openapi.filter=
 * stirling.software.SPDF.config.OpenApiConfig} in application.properties (collaborator edit; not
 * the assigned file). Without that key smallrye-openapi will not invoke this filter.
 */
public class OpenApiConfig implements OASFilter {

    private static final String DEFAULT_TITLE = "Stirling PDF API";
    private static final String DEFAULT_DESCRIPTION =
            "API documentation for all Server-Side processing.\n"
                    + "Please note some functionality might be UI only and missing from here.";

    @Override
    public OpenAPI filterOpenAPI(OpenAPI openAPI) {
        customizeOpenAPI(openAPI);
        applyPdfFileOneOf(openAPI);
        return openAPI;
    }

    private void customizeOpenAPI(OpenAPI openAPI) {
        String version = getClass().getPackage().getImplementationVersion();
        if (version == null) {
            // default version if all else fails
            version = "1.0.0";
        }
        Info info =
                OASFactory.createInfo()
                        .title(DEFAULT_TITLE)
                        .version(version)
                        .license(
                                OASFactory.createLicense()
                                        .name("Open-Core - MIT Licensed")
                                        .url(
                                                "https://raw.githubusercontent.com/Stirling-Tools/Stirling-PDF/refs/heads/main/LICENSE"))
                        .termsOfService("https://www.stirlingpdf.com/terms")
                        .contact(
                                OASFactory.createContact()
                                        .name("Stirling Software")
                                        .url("https://www.stirlingpdf.com")
                                        .email("contact@stirlingpdf.com"))
                        .description(DEFAULT_DESCRIPTION);
        openAPI.setInfo(info);
        openAPI.setOpenapi("3.0.3");

        // Register a single global "AI" tag so every AI endpoint groups under it in the docs.
        // The AI controllers are currently @Hidden, so they don't emit this tag themselves yet;
        // defining it here keeps the grouping ready for when those endpoints are unhidden.
        openAPI.addTag(
                OASFactory.createTag()
                        .name("AI")
                        .description(
                                "AI-powered document creation, editing, and assistant endpoints."));

        // Add server configuration from environment variable
        String swaggerServerUrl = System.getenv("SWAGGER_SERVER_URL");
        Server server;
        if (swaggerServerUrl != null && !swaggerServerUrl.trim().isEmpty()) {
            server = OASFactory.createServer().url(swaggerServerUrl).description("API Server");
        } else {
            // Use relative path so Swagger uses the current browser origin to avoid CORS issues
            // when accessing via different ports
            server = OASFactory.createServer().url("/").description("Current Server");
        }
        openAPI.addServer(server);

        // Add ErrorResponse schema to components
        Schema errorResponseSchema =
                OASFactory.createSchema()
                        .type(List.of(Schema.SchemaType.OBJECT))
                        .addProperty(
                                "timestamp",
                                OASFactory.createSchema()
                                        .type(List.of(Schema.SchemaType.STRING))
                                        .format("date-time")
                                        .description("Error timestamp"))
                        .addProperty(
                                "status",
                                OASFactory.createSchema()
                                        .type(List.of(Schema.SchemaType.INTEGER))
                                        .description("HTTP status code"))
                        .addProperty(
                                "error",
                                OASFactory.createSchema()
                                        .type(List.of(Schema.SchemaType.STRING))
                                        .description("Error type"))
                        .addProperty(
                                "message",
                                OASFactory.createSchema()
                                        .type(List.of(Schema.SchemaType.STRING))
                                        .description("Error message"))
                        .addProperty(
                                "path",
                                OASFactory.createSchema()
                                        .type(List.of(Schema.SchemaType.STRING))
                                        .description("Request path"))
                        .description("Standard error response format");

        Components components = openAPI.getComponents();
        if (components == null) {
            components = OASFactory.createComponents();
            openAPI.setComponents(components);
        }
        components.addSchema("ErrorResponse", errorResponseSchema);

        if (isEnableLogin()) {
            SecurityScheme apiKeyScheme =
                    OASFactory.createSecurityScheme()
                            .type(SecurityScheme.Type.APIKEY)
                            .in(SecurityScheme.In.HEADER)
                            .name("X-API-KEY");
            components.addSecurityScheme("apiKey", apiKeyScheme);
            SecurityRequirement requirement =
                    OASFactory.createSecurityRequirement().addScheme("apiKey");
            openAPI.addSecurityRequirement(requirement);
        }
    }

    private boolean isEnableLogin() {
        // OASFilter instances are created by smallrye-openapi, not by CDI, so resolve the
        // ApplicationProperties bean programmatically rather than via constructor injection.
        try {
            ApplicationProperties applicationProperties =
                    CDI.current().select(ApplicationProperties.class).get();
            return applicationProperties.getSecurity().isEnableLogin();
        } catch (RuntimeException e) {
            // If the CDI container is not available at OpenAPI-build time, fall back to the
            // login-disabled shape (no apiKey scheme), matching the original default behaviour.
            return false;
        }
    }

    private void applyPdfFileOneOf(OpenAPI openAPI) {
        Components components = openAPI.getComponents();
        if (components == null) {
            components = OASFactory.createComponents();
            openAPI.setComponents(components);
        }
        Map<String, Schema> schemas = components.getSchemas();
        if (schemas == null) {
            return;
        }

        // Define the two shapes
        Schema upload =
                OASFactory.createSchema()
                        .type(List.of(Schema.SchemaType.OBJECT))
                        .description("Upload a PDF file")
                        .addProperty(
                                "fileInput",
                                OASFactory.createSchema()
                                        .type(List.of(Schema.SchemaType.STRING))
                                        .format("binary"))
                        .addRequired("fileInput");

        Schema ref =
                OASFactory.createSchema()
                        .type(List.of(Schema.SchemaType.OBJECT))
                        .description("Reference a server-side file")
                        .addProperty(
                                "fileId",
                                OASFactory.createSchema()
                                        .type(List.of(Schema.SchemaType.STRING))
                                        .example("a1b2c3d4-5678-90ab-cdef-ghijklmnopqr"))
                        .addRequired("fileId");

        components.addSchema("PDFFileUpload", upload);
        components.addSchema("PDFFileRef", ref);

        // Create the oneOf schema
        Schema pdfFileOneOf =
                OASFactory.createSchema()
                        .oneOf(
                                List.of(
                                        OASFactory.createSchema()
                                                .ref("#/components/schemas/PDFFileUpload"),
                                        OASFactory.createSchema()
                                                .ref("#/components/schemas/PDFFileRef")))
                        .description("Either upload a file or provide a server-side file ID");

        // Replace PDFFile schema
        components.addSchema("PDFFile", pdfFileOneOf);
    }
}
